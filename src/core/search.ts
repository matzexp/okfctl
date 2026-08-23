import MiniSearch from 'minisearch';
import type { Bundle } from './bundle.ts';
import { conceptTitle, type Concept } from './concept.ts';
import { DEFAULT_DRAFTS_DIR, inDrafts } from './drafts.ts';
import { DEFAULT_DUMPS_DIR, inDumps } from './dumps.ts';
import { health, type TrustTier } from './lifecycle.ts';

/**
 * Full-text search over a bundle, indexed fresh on every call.
 *
 * The index is never persisted. A cached index is a second copy of the truth,
 * and okfctl's whole design treats the Markdown as the only source (SPEC §11) —
 * a stale index is the same class of problem `okfctl index --check` exists to
 * catch. At the corpus sizes this tool targets, rebuilding costs less than
 * reasoning about invalidation would.
 */

export type SearchArea = 'dumps' | 'drafts' | 'corpus';

export interface SearchHit {
  concept: Concept;
  /** Relevance after the trust-tier boost — what results are ordered by. */
  score: number;
  area: SearchArea;
  tier: TrustTier;
}

/**
 * `title` and `description` outrank `body` and `tags`: the spec requires a title
 * match to sort above a match found only in body text. Boosting is MiniSearch
 * configuration rather than ranking logic of our own.
 */
const BOOST = { title: 4, description: 2, tags: 2, id: 2 } as const;

/**
 * A soft boost on top of relevance, not a hard sort key (SPEC bundle-search,
 * "Query Search" — trust tier breaks a near-tie, never overrides a clearly
 * stronger relevance match). Deliberately modest and tunable independently of
 * `BOOST` above: these numbers are an implementation detail, not a spec-level
 * contract, which only requires the direction (higher trust ranks higher, all
 * else equal).
 */
const TRUST_BOOST: Record<TrustTier, number> = {
  'human-reviewed': 1.5,
  'machine-confirmed': 1.2,
  unverified: 1,
};

const FIELDS = ['title', 'description', 'tags', 'body', 'id'] as const;

interface IndexedConcept {
  id: string;
  title: string;
  description: string;
  tags: string;
  body: string;
}

/** Frontmatter carries whatever YAML the author wrote; only strings are indexable. */
function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' ');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function indexable(concept: Concept): IndexedConcept {
  return {
    id: concept.id,
    // The same fallback `bundle-catalog` uses, so a titleless concept is still findable.
    title: conceptTitle(concept),
    description: text(concept.data.description),
    tags: text(concept.data.tags),
    body: concept.body,
  };
}

function area(id: string, dumpsDir: string, draftsDir: string): SearchArea {
  if (inDumps(id, dumpsDir)) return 'dumps';
  if (inDrafts(id, draftsDir)) return 'drafts';
  return 'corpus';
}

export interface SearchOptions {
  /** Resolved dumps-area directory; defaults to `dumps`. */
  dumpsDir?: string;
  /** Resolved drafts-area directory; defaults to `drafts`. */
  draftsDir?: string;
}

export function search(bundle: Bundle, query: string, options: SearchOptions = {}): SearchHit[] {
  // Nothing to index, and MiniSearch has no useful answer for an empty corpus.
  if (bundle.concepts.length === 0) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  const dumpsDir = options.dumpsDir ?? DEFAULT_DUMPS_DIR;
  const draftsDir = options.draftsDir ?? DEFAULT_DRAFTS_DIR;

  const index = new MiniSearch<IndexedConcept>({
    fields: [...FIELDS],
    idField: 'id',
  });
  index.addAll(bundle.concepts.map(indexable));

  const byId = new Map(bundle.concepts.map((concept) => [concept.id, concept]));
  const today = new Date();

  // `prefix` finds "cardinal" from "cardinality"; `fuzzy` tolerates a typo in a
  // longer term. Both matter when the caller is guessing at what a bundle calls
  // something, which is the whole point of searching rather than listing.
  const hits = index
    .search(trimmed, { boost: { ...BOOST }, prefix: true, fuzzy: 0.2 })
    .flatMap((result) => {
      const concept = byId.get(String(result.id));
      if (!concept) return [];
      const tier = health(concept, today).tier;
      const boosted = result.score * TRUST_BOOST[tier];
      return [{ concept, score: boosted, area: area(concept.id, dumpsDir, draftsDir), tier }];
    });

  // MiniSearch returns results ordered by its own score; the trust boost can
  // reorder near-ties, so re-sort on the boosted score rather than trust the
  // pre-boost order.
  return hits.sort((a, b) => b.score - a.score);
}
