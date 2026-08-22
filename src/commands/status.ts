import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { inDrafts, resolveDraftsDir } from '../core/drafts.ts';
import { generatedAt, health, type Health, type Status, type TrustTier } from '../core/lifecycle.ts';
import { bold, cyan, dim, green, red, table, yellow } from '../core/term.ts';

export interface StatusOptions {
  bundle: string;
  draftsDir?: string;
  stale?: boolean;
  drifted?: boolean;
  draft?: boolean;
  unverified?: boolean;
  drafts?: boolean;
  all?: boolean;
  json?: boolean;
}

interface Row extends Health {
  id: string;
  title: string;
  type: string;
  flags: string[];
  /** In the drafts area: reported through the inbox rather than the attention list. */
  inDrafts: boolean;
  /** `generated.at`, used to age the inbox. */
  captured: string | null;
}

export function runStatus(options: StatusOptions): number {
  const bundle = loadBundle(options.bundle);
  const today = new Date();

  let draftsDir: string;
  try {
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const rows: Row[] = bundle.concepts.map((concept) => {
    const state = health(concept, today);
    const flags: string[] = [];
    if (state.stale) flags.push(`stale (${state.staleAfter})`);
    if (state.drifted) flags.push('drifted');
    if (state.status === 'draft') flags.push('draft');
    if (state.tier === 'unverified') flags.push('unverified');
    const at = generatedAt(concept.data);
    return {
      ...state,
      id: concept.id,
      title: conceptTitle(concept),
      type: typeof concept.data.type === 'string' ? concept.data.type : '(none)',
      flags,
      inDrafts: inDrafts(concept.id, draftsDir),
      captured: at ? at.toISOString() : null,
    };
  });

  const filtered = applyFilters(rows, options);

  if (options.json) {
    console.log(JSON.stringify({ root: bundle.root, draftsDir, concepts: filtered }, null, 2));
    return 0;
  }

  console.log(`${bold(bundle.root)}  ${dim(`${rows.length} concepts`)}\n`);

  if (!hasFilter(options)) {
    printSummary(rows);
    printInbox(rows, draftsDir);

    // Every captured dump is draft and unverified on arrival, so leaving them in
    // the attention list would bury whatever is actually rotting. The inbox line
    // above always names them, so nothing is hidden — only moved.
    const attention = rows.filter(
      (row) => row.flags.length > 0 && (options.all === true || !row.inDrafts),
    );
    if (attention.length === 0) {
      console.log(green('\nNothing needs attention.'));
      return 0;
    }
    console.log(bold(`\nNeeds attention (${attention.length})`));
    printRows(attention);
    return 0;
  }

  if (filtered.length === 0) {
    console.log(dim('No concepts match those filters.'));
    return 0;
  }
  printRows(filtered);
  return 0;
}

function hasFilter(options: StatusOptions): boolean {
  return Boolean(
    options.stale || options.drifted || options.draft || options.unverified || options.drafts,
  );
}

function applyFilters(rows: Row[], options: StatusOptions): Row[] {
  if (!hasFilter(options)) return rows;
  return rows.filter((row) =>
    (options.stale === true && row.stale) ||
    (options.drifted === true && row.drifted) ||
    (options.draft === true && row.status === 'draft') ||
    (options.unverified === true && row.tier === 'unverified') ||
    (options.drafts === true && row.inDrafts),
  );
}

/**
 * The inbox line. An inbox that is never emptied is worse than no inbox, because
 * it launders "we wrote it down" into "we know it" — so the count and the age of
 * the oldest capture are printed on every unfiltered run, and cannot be missed.
 */
function printInbox(rows: Row[], draftsDir: string, today = new Date()): void {
  const drafts = rows.filter((row) => row.inDrafts);
  if (drafts.length === 0) return;

  const times = drafts
    .map((row) => (row.captured ? Date.parse(row.captured) : Number.NaN))
    .filter((time) => !Number.isNaN(time));
  const oldest = times.length > 0 ? Math.min(...times) : null;
  const age = oldest === null
    ? 'age unknown'
    : `oldest ${Math.floor((today.getTime() - oldest) / 86_400_000)}d`;

  console.log(table([[
    dim('Inbox'),
    `${draftsDir}/ ${drafts.length} captured   ${dim(age)}`,
  ]]));
}

function printSummary(rows: Row[]): void {
  const tiers: TrustTier[] = ['human-reviewed', 'machine-confirmed', 'unverified'];
  const statuses: Status[] = ['draft', 'stable', 'deprecated'];

  const trust = tiers
    .map((tier) => `${tierColor(tier)(tier)} ${rows.filter((row) => row.tier === tier).length}`)
    .join('   ');
  const lifecycle = statuses
    .map((status) => `${status} ${rows.filter((row) => row.status === status).length}`)
    .join('   ');
  const stale = rows.filter((row) => row.stale).length;
  const drifted = rows.filter((row) => row.drifted).length;

  console.log(table([
    [dim('Trust'), trust],
    [dim('Lifecycle'), lifecycle],
    [dim('Freshness'), `${stale > 0 ? red(`stale ${stale}`) : `stale ${stale}`}   ${drifted > 0 ? yellow(`drifted ${drifted}`) : `drifted ${drifted}`}`],
  ]));
}

function printRows(rows: Row[]): void {
  const body = rows.map((row) => [
    cyan(row.id),
    row.status,
    tierColor(row.tier)(row.tier),
    row.flags.filter((flag) => flag !== 'draft' && flag !== 'unverified').join(', '),
  ]);
  console.log(table([[dim('ID'), dim('STATUS'), dim('TRUST'), dim('FLAGS')], ...body]));
}

function tierColor(tier: TrustTier): (text: string) => string {
  if (tier === 'human-reviewed') return green;
  if (tier === 'machine-confirmed') return yellow;
  return dim;
}
