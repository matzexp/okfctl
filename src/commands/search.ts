import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { resolveDraftsDir } from '../core/drafts.ts';
import { resolveDumpsDir } from '../core/dumps.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { search, type SearchHit } from '../core/search.ts';
import { pluralize } from '../core/render.ts';
import { cyan, dim } from '../core/term.ts';

export interface SearchOptions {
  bundle: string;
  query: string;
  dumpsDir?: string;
  draftsDir?: string;
  limit?: number;
  format?: string;
  json?: boolean;
}

/** Enough to choose from without burying the caller in near-misses. */
export const DEFAULT_LIMIT = 10;

export function runSearch(options: SearchOptions): number {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit must be a whole number, at least 1 (got ${options.limit})`);
    return 1;
  }

  let format;
  try {
    format = resolveFormat(options);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const bundle = loadBundle(options.bundle);

  let dumpsDir: string;
  let draftsDir: string;
  try {
    dumpsDir = resolveDumpsDir(bundle.root, options.dumpsDir);
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  const hits = search(bundle, options.query, { dumpsDir, draftsDir });
  const shown = hits.slice(0, limit);

  if (format !== 'table') {
    console.log(renderOutput({
      query: options.query,
      total: hits.length,
      results: shown.map(jsonHit),
    }, format));
    return 0;
  }

  // An empty result is an answer, not a failure: the caller asked what the
  // bundle knows and the honest reply is "nothing about that".
  if (hits.length === 0) {
    console.log(dim('no matches'));
    return 0;
  }

  const width = Math.max(...shown.map((hit) => hit.concept.id.length));
  for (const hit of shown) {
    console.log(
      `${cyan(hit.concept.id.padEnd(width))}  ${conceptTitle(hit.concept)}` +
      `  ${dim(`[${hit.area}, ${hit.tier}]`)}`,
    );
  }

  const hidden = hits.length - shown.length;
  if (hidden > 0) {
    console.log(dim(`\n${hidden} more ${hidden === 1 ? 'match' : pluralize('match')} not shown`));
  }
  return 0;
}

function jsonHit(hit: SearchHit) {
  return {
    id: hit.concept.id,
    title: conceptTitle(hit.concept),
    area: hit.area,
    tier: hit.tier,
    score: hit.score,
  };
}
