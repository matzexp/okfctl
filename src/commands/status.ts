import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { inDrafts, resolveDraftsDir } from '../core/drafts.ts';
import { inDumps, resolveDumpsDir } from '../core/dumps.ts';
import { generatedAt, health, type Health, type Status, type TrustTier } from '../core/lifecycle.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { bold, cyan, dim, green, red, table, yellow } from '../core/term.ts';

export interface StatusOptions {
  bundle: string;
  dumpsDir?: string;
  draftsDir?: string;
  stale?: boolean;
  drifted?: boolean;
  draft?: boolean;
  unverified?: boolean;
  dumps?: boolean;
  drafts?: boolean;
  all?: boolean;
  format?: string;
  json?: boolean;
}

interface Row extends Health {
  id: string;
  title: string;
  type: string;
  flags: string[];
  /** In the dumps area: reported through the dumps inbox rather than the attention list. */
  inDumps: boolean;
  /** In the drafts area: reported through the drafts inbox rather than the attention list. */
  inDrafts: boolean;
  /** `generated.at`, used to age either inbox. */
  captured: string | null;
}

export function runStatus(options: StatusOptions): number {
  const bundle = loadBundle(options.bundle);
  const today = new Date();

  let dumpsDir: string;
  let draftsDir: string;
  try {
    dumpsDir = resolveDumpsDir(bundle.root, options.dumpsDir);
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
      inDumps: inDumps(concept.id, dumpsDir),
      inDrafts: inDrafts(concept.id, draftsDir),
      captured: at ? at.toISOString() : null,
    };
  });

  const filtered = applyFilters(rows, options);

  let format;
  try {
    format = resolveFormat(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (format !== 'table') {
    console.log(renderOutput({ root: bundle.root, dumpsDir, draftsDir, concepts: filtered }, format));
    return 0;
  }

  console.log(`${bold(bundle.root)}  ${dim(`${rows.length} concepts`)}\n`);

  if (!hasFilter(options)) {
    printSummary(rows);
    printInbox(rows, 'inDumps', dumpsDir);
    printInbox(rows, 'inDrafts', draftsDir);

    // Every concept in either inbox is draft and unverified on arrival, so
    // leaving them in the attention list would bury whatever is actually
    // rotting. The inbox lines above always name them, so nothing is hidden —
    // only moved.
    const attention = rows.filter(
      (row) => row.flags.length > 0 && (options.all === true || (!row.inDumps && !row.inDrafts)),
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
  // A dumps- or drafts-area concept's id is generated or title-derived rather
  // than meaningful on its own, so either inbox listing carries the title.
  printRows(filtered, options.dumps === true || options.drafts === true);
  return 0;
}

function hasFilter(options: StatusOptions): boolean {
  return Boolean(
    options.stale || options.drifted || options.draft || options.unverified ||
    options.dumps || options.drafts,
  );
}

function applyFilters(rows: Row[], options: StatusOptions): Row[] {
  if (!hasFilter(options)) return rows;
  return rows.filter((row) =>
    (options.stale === true && row.stale) ||
    (options.drifted === true && row.drifted) ||
    (options.draft === true && row.status === 'draft') ||
    (options.unverified === true && row.tier === 'unverified') ||
    (options.dumps === true && row.inDumps) ||
    (options.drafts === true && row.inDrafts),
  );
}

/**
 * An inbox line, for either the dumps area or the drafts area. An inbox that is
 * never emptied is worse than no inbox, because it launders "we wrote it down"
 * into "we know it" — so the count and the age of the oldest entry are printed
 * on every unfiltered run, and cannot be missed. The two inboxes are always
 * reported on separate lines, never merged: they are different backlogs.
 */
function printInbox(rows: Row[], key: 'inDumps' | 'inDrafts', dir: string, today = new Date()): void {
  const members = rows.filter((row) => row[key]);
  if (members.length === 0) return;

  const times = members
    .map((row) => (row.captured ? Date.parse(row.captured) : Number.NaN))
    .filter((time) => !Number.isNaN(time));
  const oldest = times.length > 0 ? Math.min(...times) : null;
  const age = oldest === null
    ? 'age unknown'
    : `oldest ${Math.floor((today.getTime() - oldest) / 86_400_000)}d`;

  const verb = key === 'inDumps' ? 'captured' : 'refined';
  console.log(table([[
    dim(key === 'inDumps' ? 'Dumps' : 'Drafts'),
    `${dir}/ ${members.length} ${verb}   ${dim(age)}`,
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

/**
 * The attention list keeps its four columns: a corpus concept's id is meaningful
 * by construction and often says more than its title would. The title is added
 * only where ids are generated or title-derived, which is either inbox.
 */
function printRows(rows: Row[], withTitle = false): void {
  if (!withTitle) {
    const body = rows.map((row) => [
      cyan(row.id),
      row.status,
      tierColor(row.tier)(row.tier),
      row.flags.filter((flag) => flag !== 'draft' && flag !== 'unverified').join(', '),
    ]);
    console.log(table([[dim('ID'), dim('STATUS'), dim('TRUST'), dim('FLAGS')], ...body]));
    return;
  }

  const body = rows.map((row) => [
    cyan(row.id),
    row.captured ? row.captured.slice(0, 10) : dim('—'),
    row.title,
  ]);
  console.log(table([[dim('ID'), dim('CAPTURED'), dim('TITLE')], ...body]));
}

function tierColor(tier: TrustTier): (text: string) => string {
  if (tier === 'human-reviewed') return green;
  if (tier === 'machine-confirmed') return yellow;
  return dim;
}
