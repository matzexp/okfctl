import { loadBundle } from '../core/bundle.ts';
import { conceptRefs, type ConceptRefs, type Join } from '../core/refs.ts';
import { bold, cyan, dim, green, red, table, yellow } from '../core/term.ts';

export interface RefsOptions {
  bundle: string;
  broken?: boolean;
  strict?: boolean;
  json?: boolean;
}

/**
 * Report the footnote to `sources[].id` join across a bundle. Broken joins are
 * advisory by default — SPEC §11 forbids failing a bundle over links — so the
 * non-zero exit is behind `--strict`, for callers that want it in CI.
 */
export function runRefs(options: RefsOptions): number {
  const bundle = loadBundle(options.bundle);
  const reports = bundle.concepts.map(conceptRefs);

  const counts = {
    joined: 0,
    unjoined: 0,
    uncited: 0,
    plain: 0,
    undefined: 0,
  };
  for (const report of reports) {
    for (const join of report.joins) counts[join.state] += 1;
    counts.undefined += report.undefined.length;
  }
  const broken = counts.unjoined + counts.undefined;

  if (options.json) {
    console.log(JSON.stringify({ root: bundle.root, counts, concepts: reports }, null, 2));
    return exitCode(broken, options);
  }

  console.log(`${bold(bundle.root)}  ${dim(`${bundle.concepts.length} concepts`)}\n`);

  const shown = reports.filter((report) => (options.broken ? isBroken(report) : hasRefs(report)));
  for (const report of shown) {
    const rows = lines(report, options.broken === true);
    if (rows.length === 0) continue;
    console.log(bold(report.where));
    console.log(table(rows));
    console.log('');
  }

  if (shown.length === 0) {
    console.log(dim(options.broken ? 'No broken citations.' : 'No footnote citations in this bundle.'));
  }

  const summary = [
    counts.joined > 0 ? green(`${counts.joined} joined`) : dim('0 joined'),
    broken > 0 ? red(`${broken} broken`) : green('0 broken'),
    counts.uncited > 0 ? yellow(`${counts.uncited} uncited source${counts.uncited === 1 ? '' : 's'}`) : dim('0 uncited sources'),
  ];
  console.log(summary.join('  |  '));

  return exitCode(broken, options);
}

function exitCode(broken: number, options: RefsOptions): number {
  return options.strict && broken > 0 ? 1 : 0;
}

function hasRefs(report: ConceptRefs): boolean {
  return report.footnotes.length > 0 || report.sources.length > 0;
}

function isBroken(report: ConceptRefs): boolean {
  return report.undefined.length > 0 || report.joins.some((join) => join.state === 'unjoined');
}

function lines(report: ConceptRefs, brokenOnly: boolean): string[][] {
  const rows: string[][] = [];

  for (const label of report.undefined) {
    rows.push([red('undefined'), cyan(`[^${label}]`), 'used in the body but never defined']);
  }

  for (const join of report.joins) {
    if (brokenOnly && join.state !== 'unjoined') continue;
    if (join.footnote?.definedAt === null) continue; // already reported as undefined
    rows.push(row(join));
  }

  return rows;
}

function row(join: Join): string[] {
  const label = cyan(`[^${join.label}]`);
  if (join.state === 'joined') {
    const source = join.source!;
    return [green('joined'), label, dim(`sources[${source.index}]`) + ' ' + describe(source.title, source.resource)];
  }
  if (join.state === 'unjoined') {
    return [red('unjoined'), label, 'no sources[].id matches this footnote'];
  }
  if (join.state === 'plain') {
    return [dim('plain'), label, dim('footnote only; this document declares no sources[]')];
  }
  const source = join.source!;
  return [
    yellow('uncited'),
    dim(`sources[${source.index}].id`) + ' ' + join.label,
    describe(source.title, source.resource),
  ];
}

function describe(title: string | null, resource: string | null): string {
  return title ?? resource ?? dim('(no title)');
}
