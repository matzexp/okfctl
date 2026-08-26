import { findConcept, loadBundle } from '../core/bundle.ts';
import { conceptTitle, type Concept } from '../core/concept.ts';
import { resolveDraftsDir, inDrafts } from '../core/drafts.ts';
import { resolveDumpsDir, inDumps } from '../core/dumps.ts';
import { health } from '../core/lifecycle.ts';
import { readLinkSpans } from '../core/refs.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { search, type SearchArea } from '../core/search.ts';
import { bold, cyan, dim, red } from '../core/term.ts';

export interface RelatedOptions {
  bundle: string;
  concept: string;
  dumpsDir?: string;
  draftsDir?: string;
  limit?: number;
  format?: string;
  json?: boolean;
}

/** Enough neighbours to see the shape of a subject without printing the corpus. */
export const DEFAULT_LIMIT = 10;

/** Why a concept turned up. Ordered strongest first, which is also print order. */
type Relation = 'links-out' | 'links-in' | 'shared-tags' | 'similar';

const RELATION_LABEL: Record<Relation, string> = {
  'links-out': 'links to',
  'links-in': 'linked from',
  'shared-tags': 'shares tags',
  similar: 'similar text',
};

interface Neighbour {
  concept: Concept;
  relation: Relation;
  /** Tags in common, for `shared-tags`. */
  shared: string[];
}

function tagsOf(concept: Concept): string[] {
  const raw = concept.data.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((tag): tag is string => typeof tag === 'string');
}

function areaOf(id: string, dumpsDir: string, draftsDir: string): SearchArea {
  if (inDumps(id, dumpsDir)) return 'dumps';
  if (inDrafts(id, draftsDir)) return 'drafts';
  return 'corpus';
}

/**
 * The neighbourhood of one concept: what it links to, what links back, what
 * shares its tags, and what merely reads like it.
 *
 * `search` answers "what mentions these words". This answers "what else should I
 * be reading", which is the question with a knowledge base open. The two are not
 * the same: a corpus with a real link structure is navigable, and nothing else in
 * `okfctl` surfaces that structure — `refs` verifies links that exist, and an
 * index lists a directory. The relations are ranked by how deliberate they are:
 * a link someone wrote outranks a tag they reused, which outranks a coincidence
 * of vocabulary.
 */
export function runRelated(options: RelatedOptions): number {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(red(`--limit must be a whole number, at least 1 (got ${options.limit})`));
    return 1;
  }

  let format;
  try {
    format = resolveFormat(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const bundle = loadBundle(options.bundle);

  let dumpsDir: string;
  let draftsDir: string;
  try {
    dumpsDir = resolveDumpsDir(bundle.root, options.dumpsDir);
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  let subject: Concept;
  try {
    subject = findConcept(bundle, options.concept);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const byId = new Map(bundle.concepts.map((concept) => [concept.id, concept]));
  // First relation found wins, and relations are collected strongest first, so a
  // concept that both links out and shares a tag is reported as the link.
  const seen = new Map<string, Neighbour>();
  const add = (concept: Concept, relation: Relation, shared: string[] = []) => {
    if (concept.id === subject.id || seen.has(concept.id)) return;
    seen.set(concept.id, { concept, relation, shared });
  };

  for (const span of readLinkSpans(subject, { root: bundle.root })) {
    if (!span.resolvesTo) continue;
    const target = byId.get(span.resolvesTo.replace(/\.md$/, ''));
    if (target) add(target, 'links-out');
  }

  const subjectPath = `${subject.id}.md`;
  for (const concept of bundle.concepts) {
    if (concept.id === subject.id) continue;
    for (const span of readLinkSpans(concept, { root: bundle.root })) {
      if (span.resolvesTo === subjectPath) add(concept, 'links-in');
    }
  }

  const subjectTags = new Set(tagsOf(subject).map((tag) => tag.toLowerCase()));
  if (subjectTags.size > 0) {
    for (const concept of bundle.concepts) {
      const shared = tagsOf(concept).filter((tag) => subjectTags.has(tag.toLowerCase()));
      if (shared.length > 0) add(concept, 'shared-tags', shared);
    }
  }

  // Vocabulary overlap, as a last resort: the title and tags are what a reader
  // would have typed looking for this subject in the first place.
  const query = [conceptTitle(subject), ...tagsOf(subject)].join(' ');
  for (const hit of search(bundle, query, { dumpsDir, draftsDir, match: 'any' })) {
    add(hit.concept, 'similar');
  }

  const order: Relation[] = ['links-out', 'links-in', 'shared-tags', 'similar'];
  const neighbours = [...seen.values()].sort((a, b) =>
    order.indexOf(a.relation) - order.indexOf(b.relation)
    || a.concept.id.localeCompare(b.concept.id));
  const shown = neighbours.slice(0, limit);
  const today = new Date();

  const record = (neighbour: Neighbour) => {
    const { tier, status } = health(neighbour.concept, today);
    return {
      id: neighbour.concept.id,
      title: conceptTitle(neighbour.concept),
      relation: neighbour.relation,
      sharedTags: neighbour.shared,
      area: areaOf(neighbour.concept.id, dumpsDir, draftsDir),
      tier,
      status,
    };
  };

  if (format !== 'table') {
    console.log(renderOutput({
      concept: subject.id,
      total: neighbours.length,
      related: shown.map(record),
    }, format));
    return 0;
  }

  console.log(bold(`${cyan(`${subject.id}.md`)}  ${conceptTitle(subject)}`));
  if (neighbours.length === 0) {
    console.log(dim('\nnothing related; this concept stands alone in the bundle'));
    return 0;
  }

  let current: Relation | null = null;
  for (const neighbour of shown) {
    if (neighbour.relation !== current) {
      current = neighbour.relation;
      console.log(`\n${dim(RELATION_LABEL[current])}`);
    }
    const { tier } = health(neighbour.concept, today);
    const area = areaOf(neighbour.concept.id, dumpsDir, draftsDir);
    const tags = neighbour.shared.length > 0 ? `  ${dim(`(${neighbour.shared.join(', ')})`)}` : '';
    console.log(`  ${cyan(neighbour.concept.id)}  ${conceptTitle(neighbour.concept)}  ${dim(`[${area}, ${tier}]`)}${tags}`);
  }

  const hidden = neighbours.length - shown.length;
  if (hidden > 0) console.log(dim(`\n${hidden} more not shown`));
  return 0;
}
