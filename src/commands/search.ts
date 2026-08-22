import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { search } from '../core/search.ts';
import { pluralize } from '../core/render.ts';
import { cyan, dim } from '../core/term.ts';

export interface SearchOptions {
  bundle: string;
  query: string;
  limit?: number;
}

/** Enough to choose from without burying the caller in near-misses. */
export const DEFAULT_LIMIT = 10;

export function runSearch(options: SearchOptions): number {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit must be a whole number, at least 1 (got ${options.limit})`);
    return 1;
  }

  const bundle = loadBundle(options.bundle);
  const hits = search(bundle, options.query);

  // An empty result is an answer, not a failure: the caller asked what the
  // bundle knows and the honest reply is "nothing about that".
  if (hits.length === 0) {
    console.log(dim('no matches'));
    return 0;
  }

  const shown = hits.slice(0, limit);
  const width = Math.max(...shown.map((hit) => hit.concept.id.length));
  for (const hit of shown) {
    console.log(`${cyan(hit.concept.id.padEnd(width))}  ${conceptTitle(hit.concept)}`);
  }

  const hidden = hits.length - shown.length;
  if (hidden > 0) {
    console.log(dim(`\n${hidden} more ${hidden === 1 ? 'match' : pluralize('match')} not shown`));
  }
  return 0;
}
