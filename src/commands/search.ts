import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { resolveDraftsDir } from '../core/drafts.ts';
import { resolveDumpsDir } from '../core/dumps.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { search, SEARCH_AREAS, type SearchArea, type SearchHit } from '../core/search.ts';
import { TRUST_TIERS, type TrustTier } from '../core/lifecycle.ts';
import { pluralize } from '../core/render.ts';
import { cyan, dim } from '../core/term.ts';

export interface SearchOptions {
  bundle: string;
  query: string;
  dumpsDir?: string;
  draftsDir?: string;
  limit?: number;
  area?: string[];
  tier?: string[];
  type?: string[];
  tag?: string[];
  snippet?: boolean;
  match?: string;
  format?: string;
  json?: boolean;
}

/** How a multi-word query is combined. See `SearchOptions.match` in core/search. */
export const MATCH_MODES = ['all', 'any'] as const;

/** Enough to choose from without burying the caller in near-misses. */
export const DEFAULT_LIMIT = 10;

/** Reject an unknown filter value rather than silently matching nothing. */
function validated<T extends string>(
  values: string[] | undefined,
  allowed: readonly T[],
  flag: string,
): T[] {
  const given = values ?? [];
  for (const value of given) {
    if (!(allowed as readonly string[]).includes(value)) {
      throw new Error(`invalid --${flag} "${value}"; expected ${allowed.join(', ')}`);
    }
  }
  return given as T[];
}

export function runSearch(options: SearchOptions): number {
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    console.error(`--limit must be a whole number, at least 1 (got ${options.limit})`);
    return 1;
  }

  let format;
  let areas: SearchArea[];
  let tiers: TrustTier[];
  let match: 'all' | 'any';
  try {
    format = resolveFormat(options);
    areas = validated(options.area, SEARCH_AREAS, 'area');
    tiers = validated(options.tier, TRUST_TIERS, 'tier');
    match = validated(options.match ? [options.match] : [], MATCH_MODES, 'match')[0] ?? 'all';
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

  const hits = search(bundle, options.query, {
    dumpsDir,
    draftsDir,
    areas,
    tiers,
    types: options.type,
    tags: options.tag,
    match,
  });
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
    // A lookup that found nothing is exactly where the loose mode earns its
    // keep: the caller's phrasing may simply not be the bundle's. Naming it
    // here is what makes it reachable by someone who did not read --help.
    if (match === 'all') {
      console.log(dim('try `--match any` — it ranks by overlap, for a query phrased differently than the bundle'));
    }
    return 0;
  }

  // With snippets each hit is a block rather than a row, so the aligned-column
  // layout that reads well for one-liners is dropped rather than half-kept.
  if (options.snippet) {
    for (const hit of shown) {
      console.log(`${cyan(hit.concept.id)}  ${conceptTitle(hit.concept)}  ${dim(`[${hit.area}, ${hit.tier}]`)}`);
      if (hit.snippet) console.log(`  ${dim(hit.snippet)}`);
    }
  } else {
    const width = Math.max(...shown.map((hit) => hit.concept.id.length));
    for (const hit of shown) {
      console.log(
        `${cyan(hit.concept.id.padEnd(width))}  ${conceptTitle(hit.concept)}` +
        `  ${dim(`[${hit.area}, ${hit.tier}]`)}`,
      );
    }
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
    terms: hit.terms,
    snippet: hit.snippet,
  };
}
