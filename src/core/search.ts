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

export const SEARCH_AREAS = ['dumps', 'drafts', 'corpus'] as const;
export type SearchArea = (typeof SEARCH_AREAS)[number];

export interface SearchHit {
  concept: Concept;
  /** Relevance after the trust-tier boost — what results are ordered by. */
  score: number;
  area: SearchArea;
  tier: TrustTier;
  /** The query terms this document actually matched on. */
  terms: string[];
  /** A line of body text around the first match, or null when only frontmatter matched. */
  snippet: string | null;
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
  /** Keep only these areas. Empty or absent means every area. */
  areas?: SearchArea[];
  /** Keep only these trust tiers. Empty or absent means every tier. */
  tiers?: TrustTier[];
  /** Keep only these `type` values, compared case-insensitively. */
  types?: string[];
  /** Keep only concepts carrying every one of these tags. */
  tags?: string[];
  /**
   * `all` (the default) is a lookup: it wants documents carrying every term, and
   * only widens when that finds nothing. `any` is a similarity question — "what
   * reads like this" — where partial overlap is the answer rather than a
   * fallback, so it skips the narrowing cascade entirely.
   */
  match?: 'all' | 'any';
}

/**
 * Words carried by the question rather than the subject. A natural-language
 * query ("why does the harbor image pull fail") otherwise OR-matches on `why`
 * and `does` across the whole corpus, and the tail of near-irrelevant hits is
 * what makes a search expensive to read.
 */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'did', 'do', 'does',
  'for', 'from', 'had', 'has', 'have', 'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me',
  'my', 'no', 'not', 'of', 'on', 'or', 'our', 's', 'so', 'that', 'the', 'their', 'then',
  'there', 'these', 'they', 'this', 'to', 'up', 'was', 'we', 'were', 'what', 'when',
  'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
]);

/**
 * Drop stopwords, but never everything: a query that is only stopwords is still
 * a query, and answering it with silence would be worse than answering it badly.
 */
function meaningful(query: string): string {
  const kept = query.split(/\s+/).filter((word) => word && !STOPWORDS.has(word.toLowerCase()));
  return kept.length > 0 ? kept.join(' ') : query;
}

function tagsOf(concept: Concept): string[] {
  const raw = concept.data.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.toLowerCase());
}

/**
 * A line of body prose containing one of the matched terms, trimmed to something
 * a caller can read in a list. Without it every result has to be opened before
 * anyone can tell whether it is relevant, which is the expensive step in recall.
 */
function snippetFor(body: string, terms: string[], width = 160): string | null {
  if (terms.length === 0) return null;
  const pattern = new RegExp(terms.map(escapeRegExp).join('|'), 'i');

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    // Headings, fences and frontmatter-ish lines make poor one-line context.
    if (!line || line.startsWith('#') || line.startsWith('```') || line.startsWith('---')) continue;
    const found = pattern.exec(line);
    if (!found) continue;

    if (line.length <= width) return line;
    // Centre the window on the match rather than always taking the first bytes.
    const start = Math.max(0, found.index - Math.floor((width - found[0].length) / 2));
    const end = Math.min(line.length, start + width);
    return `${start > 0 ? '…' : ''}${line.slice(start, end).trim()}${end < line.length ? '…' : ''}`;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const base = { boost: { ...BOOST }, prefix: true } as const;
  const subject = meaningful(trimmed);

  // Precise first, loose only when precise finds nothing. Fuzzy matching is what
  // makes a typo survivable, but it also expands every term into its neighbours —
  // so `fuzzy` combined with `AND` is barely narrower than `OR`, and a four-word
  // question comes back matching most of the corpus. Trying exact-AND first means
  // a caller who knows the words gets a short, precise answer, and a caller who
  // half-remembers them still gets one.
  const attempts = options.match === 'any'
    ? [{ ...base, combineWith: 'OR' as const, fuzzy: 0.2 }]
    : [
      { ...base, combineWith: 'AND' as const },
      { ...base, combineWith: 'AND' as const, fuzzy: 0.2 },
      { ...base, combineWith: 'OR' as const, fuzzy: 0.2 },
    ];

  const wanted = {
    areas: new Set(options.areas ?? []),
    tiers: new Set(options.tiers ?? []),
    types: new Set((options.types ?? []).map((type) => type.toLowerCase())),
    tags: (options.tags ?? []).map((tag) => tag.toLowerCase()),
  };

  /**
   * Whether a concept survives the caller's filters. Applied *inside* the
   * cascade rather than to whatever the cascade settled on: filtering
   * afterwards let an ineligible document end an attempt, so a narrowed search
   * could come back empty while a document that both matched a looser attempt
   * and passed the filters sat right there. `--tier human-reviewed` has to
   * narrow the search, not truncate its results.
   */
  const eligible = (concept: Concept, tier: TrustTier, where: SearchArea): boolean => {
    if (wanted.areas.size > 0 && !wanted.areas.has(where)) return false;
    if (wanted.tiers.size > 0 && !wanted.tiers.has(tier)) return false;
    if (wanted.types.size > 0) {
      const type = typeof concept.data.type === 'string' ? concept.data.type.toLowerCase() : '';
      if (!wanted.types.has(type)) return false;
    }
    if (wanted.tags.length > 0) {
      const carried = new Set(tagsOf(concept));
      if (!wanted.tags.every((tag) => carried.has(tag))) return false;
    }
    return true;
  };

  let hits: SearchHit[] = [];
  let partial = false;
  for (const [attempt, params] of attempts.entries()) {
    hits = index.search(subject, params).flatMap((result): SearchHit[] => {
      const concept = byId.get(String(result.id));
      if (!concept) return [];

      const tier = health(concept, today).tier;
      const where = area(concept.id, dumpsDir, draftsDir);
      if (!eligible(concept, tier, where)) return [];

      const terms = result.terms ?? [];
      return [{
        concept,
        score: result.score * TRUST_BOOST[tier],
        area: where,
        tier,
        terms,
        snippet: snippetFor(concept.body, terms),
      }];
    });
    if (hits.length > 0) {
      // Only the lookup cascade's last resort is a partial answer. An `any`
      // search asked for partial overlap and gets it whole.
      partial = options.match !== 'any' && attempt === attempts.length - 1;
      break;
    }
  }

  // On the last resort, keep only the best partial matches. Plain OR answers
  // "harbor image pull fail" — where nothing carries all four words — with every
  // document mentioning any one of them, which is most of an ops corpus and is
  // worse than a short honest answer. A document matching three of four terms is
  // a real near-miss; one matching only "harbor" is noise wearing its clothes.
  if (partial) {
    const best = Math.max(...hits.map((hit) => hit.terms.length));
    hits = hits.filter((hit) => hit.terms.length >= best);
  }

  // MiniSearch returns results ordered by its own score; the trust boost can
  // reorder near-ties, so re-sort on the boosted score rather than trust the
  // pre-boost order.
  return hits.sort((a, b) => b.score - a.score);
}
