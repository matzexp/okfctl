import MiniSearch from 'minisearch';
import type { Bundle } from './bundle.ts';
import { conceptTitle, type Concept } from './concept.ts';

/**
 * Full-text search over a bundle, indexed fresh on every call.
 *
 * The index is never persisted. A cached index is a second copy of the truth,
 * and okfctl's whole design treats the Markdown as the only source (SPEC §11) —
 * a stale index is the same class of problem `okfctl index --check` exists to
 * catch. At the corpus sizes this tool targets, rebuilding costs less than
 * reasoning about invalidation would.
 */

export interface SearchHit {
  concept: Concept;
  score: number;
}

/**
 * `title` and `description` outrank `body` and `tags`: the spec requires a title
 * match to sort above a match found only in body text. Boosting is MiniSearch
 * configuration rather than ranking logic of our own.
 */
const BOOST = { title: 4, description: 2, tags: 2, id: 2 } as const;

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

export function search(bundle: Bundle, query: string): SearchHit[] {
  // Nothing to index, and MiniSearch has no useful answer for an empty corpus.
  if (bundle.concepts.length === 0) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];

  const index = new MiniSearch<IndexedConcept>({
    fields: [...FIELDS],
    idField: 'id',
  });
  index.addAll(bundle.concepts.map(indexable));

  const byId = new Map(bundle.concepts.map((concept) => [concept.id, concept]));

  // `prefix` finds "cardinal" from "cardinality"; `fuzzy` tolerates a typo in a
  // longer term. Both matter when the caller is guessing at what a bundle calls
  // something, which is the whole point of searching rather than listing.
  return index
    .search(trimmed, { boost: { ...BOOST }, prefix: true, fuzzy: 0.2 })
    .flatMap((result) => {
      const concept = byId.get(String(result.id));
      return concept ? [{ concept, score: result.score }] : [];
    });
}
