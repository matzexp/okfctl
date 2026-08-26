import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { inDrafts, resolveDraftsDir } from '../core/drafts.ts';
import { inDumps, resolveDumpsDir } from '../core/dumps.ts';
import { generatedAt, health, type Health, type Status, type TrustTier } from '../core/lifecycle.ts';
import { readLinkSpans } from '../core/refs.ts';
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
  orphan?: boolean;
  all?: boolean;
  format?: string;
  json?: boolean;
}

/**
 * How long an entry may sit in a holding area before the inbox line says so.
 * Not a lifecycle state and not stored anywhere — an entry nobody has refined in
 * this long is not usually one more cycle away from being refined, it is one
 * nobody is going to refine, and that is a decision worth surfacing rather than
 * a number worth growing.
 */
export const INBOX_NEGLECTED_DAYS = 30;

/**
 * How many unplaced entries there have to be before the backlog line speaks.
 *
 * The ratio alone is true of every bundle on its first day — `init`, one capture,
 * and the corpus is empty by construction — and a signal that fires on a bundle
 * doing exactly the right thing is one nobody reads by the time it matters.
 * Below this, a single refine session clears the whole holding area, which is
 * not the failure this is watching for.
 */
export const BACKLOG_FLOOR = 10;

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
  /** Nothing in the bundle links here: reachable only by search (ours, not a spec term). */
  orphan: boolean;
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

  // Every concept some other concept links to. A document nothing points at is
  // reachable only by search — findable, but outside the structure a reader
  // navigates by. Not a spec signal; the holding areas are exempt, since an
  // unplaced entry is expected to have no inbound links yet.
  const linked = new Set<string>();
  for (const concept of bundle.concepts) {
    for (const span of readLinkSpans(concept, { root: bundle.root })) {
      if (span.resolvesTo) linked.add(span.resolvesTo.replace(/\.md$/, ''));
    }
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
      orphan: !linked.has(concept.id)
        && !inDumps(concept.id, dumpsDir)
        && !inDrafts(concept.id, draftsDir),
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
    printBacklog(rows);

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
    options.dumps || options.drafts || options.orphan,
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
    (options.drafts === true && row.inDrafts) ||
    (options.orphan === true && row.orphan),
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

  // An inbox nobody works does not stay neutral: it dilutes every search and
  // launders "we wrote it down" into "we know it". The count and the age of the
  // oldest entry are always printed; past a point, so is the fact that entries
  // are sitting long enough to be worth a decision — refine them, or drop them.
  const stalest = oldest === null
    ? 0
    : Math.floor((today.getTime() - oldest) / 86_400_000);
  const neglected = members.filter((row) => {
    const at = row.captured ? Date.parse(row.captured) : Number.NaN;
    return !Number.isNaN(at) && (today.getTime() - at) / 86_400_000 >= INBOX_NEGLECTED_DAYS;
  }).length;

  const line = `${dir}/ ${members.length} ${verb}   ${dim(age)}`;
  const note = neglected > 0 && stalest >= INBOX_NEGLECTED_DAYS
    ? `   ${yellow(`${neglected} over ${INBOX_NEGLECTED_DAYS}d`)}`
    : '';
  console.log(table([[
    dim(key === 'inDumps' ? 'Dumps' : 'Drafts'),
    `${line}${note}`,
  ]]));
}

/**
 * Say so when intake has outrun curation — when the two holding areas together
 * hold more than the corpus does.
 *
 * The inbox lines above report each backlog's size honestly and still let this
 * go unnoticed, because a bundle where capture is automatic and every step after
 * it is a person invoking a workflow does not fail loudly: it fills up. And a
 * bundle that is mostly unplaced is one `okf-recall` is bound to read as leads
 * rather than knowledge, whatever the quality of what is in it — so the counts
 * being individually fine is exactly how the ratio goes unremarked.
 *
 * It stays quiet until the ratio actually inverts, for the same reason `check`
 * keeps its advisory tier narrow: a line that always prints is a line nobody
 * reads. Not an error, not part of the attention list — a fact about the shape
 * of the bundle, printed once, naming the verb that changes it.
 */
function printBacklog(rows: Row[]): void {
  const unplaced = rows.filter((row) => row.inDumps || row.inDrafts).length;
  const placed = rows.filter((row) => !row.inDumps && !row.inDrafts).length;
  if (unplaced < BACKLOG_FLOOR || unplaced <= placed) return;

  const share = Math.round((unplaced / rows.length) * 100);
  console.log(table([[
    dim('Backlog'),
    `${yellow(`${unplaced} unplaced`)} ${dim(`of ${rows.length} (${share}%), against ${placed} placed`)}`,
  ]]));
  console.log(`  ${dim('capture is automatic and every step after it is not; `okfctl refine` empties the dumps inbox, `okfctl move` the drafts one')}`);
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
  // Counted, not flagged. An orphan is not rotting, so putting it in the
  // attention list would bury what is — the same reason the inboxes sit apart.
  // `--orphan` lists them when someone wants to work on the link structure.
  const orphans = rows.filter((row) => row.orphan).length;
  const corpus = rows.filter((row) => !row.inDumps && !row.inDrafts).length;

  const summary: [string, string][] = [
    [dim('Trust'), trust],
    [dim('Lifecycle'), lifecycle],
    [dim('Freshness'), `${stale > 0 ? red(`stale ${stale}`) : `stale ${stale}`}   ${drifted > 0 ? yellow(`drifted ${drifted}`) : `drifted ${drifted}`}`],
  ];
  if (corpus > 0) {
    summary.push([dim('Reach'), `${orphans > 0 ? yellow(`orphans ${orphans}`) : `orphans ${orphans}`} ${dim(`of ${corpus} placed`)}`]);
  }
  console.log(table(summary));
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
