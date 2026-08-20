import { loadBundle } from '../core/bundle.ts';
import { conceptTitle } from '../core/concept.ts';
import { health, type Health, type Status, type TrustTier } from '../core/lifecycle.ts';
import { bold, cyan, dim, green, red, table, yellow } from '../core/term.ts';

export interface StatusOptions {
  bundle: string;
  stale?: boolean;
  drifted?: boolean;
  draft?: boolean;
  unverified?: boolean;
  json?: boolean;
}

interface Row extends Health {
  id: string;
  title: string;
  type: string;
  flags: string[];
}

export function runStatus(options: StatusOptions): number {
  const bundle = loadBundle(options.bundle);
  const today = new Date();

  const rows: Row[] = bundle.concepts.map((concept) => {
    const state = health(concept, today);
    const flags: string[] = [];
    if (state.stale) flags.push(`stale (${state.staleAfter})`);
    if (state.drifted) flags.push('drifted');
    if (state.status === 'draft') flags.push('draft');
    if (state.tier === 'unverified') flags.push('unverified');
    return {
      ...state,
      id: concept.id,
      title: conceptTitle(concept),
      type: typeof concept.data.type === 'string' ? concept.data.type : '(none)',
      flags,
    };
  });

  const filtered = applyFilters(rows, options);

  if (options.json) {
    console.log(JSON.stringify({ root: bundle.root, concepts: filtered }, null, 2));
    return 0;
  }

  console.log(`${bold(bundle.root)}  ${dim(`${rows.length} concepts`)}\n`);

  if (!hasFilter(options)) {
    printSummary(rows);
    const attention = rows.filter((row) => row.flags.length > 0);
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
  return Boolean(options.stale || options.drifted || options.draft || options.unverified);
}

function applyFilters(rows: Row[], options: StatusOptions): Row[] {
  if (!hasFilter(options)) return rows;
  return rows.filter((row) =>
    (options.stale === true && row.stale) ||
    (options.drifted === true && row.drifted) ||
    (options.draft === true && row.status === 'draft') ||
    (options.unverified === true && row.tier === 'unverified'),
  );
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
