import { loadBundle } from '../core/bundle.ts';
import { conceptRefs, type ConceptRefs, type Join, type Link } from '../core/refs.ts';
import { renderOutput, resolveFormat } from '../core/render.ts';
import { bold, cyan, dim, green, red, table, yellow } from '../core/term.ts';

export interface RefsOptions {
  bundle: string;
  broken?: boolean;
  strict?: boolean;
  anchors?: boolean;
  format?: string;
  json?: boolean;
}

/**
 * Report both reference joins across a bundle: footnote to `sources[].id`, and
 * internal link to bundle file. Broken references are advisory by default — SPEC
 * §11 forbids failing a bundle over links — so the non-zero exit is behind
 * `--strict`, for callers that want it in CI.
 *
 * `--strict` also switches anchor verification on. It widens what is checked, not
 * only the exit code: a caller gating CI has asked for the stricter reading.
 */
export function runRefs(options: RefsOptions): number {
  const bundle = loadBundle(options.bundle);
  const anchors = options.anchors === true || options.strict === true;
  const reports = bundle.concepts.map((concept) =>
    conceptRefs(concept, { root: bundle.root, anchors }),
  );

  const counts = {
    joined: 0,
    unjoined: 0,
    uncited: 0,
    plain: 0,
    undefined: 0,
    resolved: 0,
    unresolved: 0,
    'anchor-missing': 0,
  };
  for (const report of reports) {
    for (const join of report.joins) counts[join.state] += 1;
    for (const link of report.links) counts[link.state] += 1;
    counts.undefined += report.undefined.length;
  }
  const broken =
    counts.unjoined + counts.undefined + counts.unresolved + counts['anchor-missing'];

  let format;
  try {
    format = resolveFormat(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (format !== 'table') {
    console.log(renderOutput({ root: bundle.root, counts, concepts: reports }, format));
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
    console.log(dim(options.broken ? 'No broken references.' : 'No citations or links in this bundle.'));
  }

  const citations = [
    counts.joined > 0 ? green(`${counts.joined} joined`) : dim('0 joined'),
    counts.unjoined + counts.undefined > 0
      ? red(`${counts.unjoined + counts.undefined} broken`)
      : green('0 broken'),
    counts.uncited > 0
      ? yellow(`${counts.uncited} uncited source${counts.uncited === 1 ? '' : 's'}`)
      : dim('0 uncited sources'),
  ];
  const links = [
    counts.resolved > 0 ? green(`${counts.resolved} resolved`) : dim('0 resolved'),
    counts.unresolved > 0 ? red(`${counts.unresolved} unresolved`) : green('0 unresolved'),
    anchors
      ? counts['anchor-missing'] > 0
        ? red(`${counts['anchor-missing']} missing anchor${counts['anchor-missing'] === 1 ? '' : 's'}`)
        : green('0 missing anchors')
      : dim('anchors unchecked'),
  ];
  console.log(table([
    [dim('citations'), citations.join('  |  ')],
    [dim('links'), links.join('  |  ')],
  ]));

  return exitCode(broken, options);
}

function exitCode(broken: number, options: RefsOptions): number {
  return options.strict && broken > 0 ? 1 : 0;
}

function hasRefs(report: ConceptRefs): boolean {
  return report.footnotes.length > 0 || report.sources.length > 0 || report.links.length > 0;
}

function isBrokenLink(link: Link): boolean {
  return link.state === 'unresolved' || link.state === 'anchor-missing';
}

function isBroken(report: ConceptRefs): boolean {
  return (
    report.undefined.length > 0 ||
    report.joins.some((join) => join.state === 'unjoined') ||
    report.links.some(isBrokenLink)
  );
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

  for (const link of report.links) {
    if (brokenOnly && !isBrokenLink(link)) continue;
    rows.push(linkRow(link));
  }

  return rows;
}

function linkRow(link: Link): string[] {
  const target = cyan(link.target);
  if (link.state === 'resolved') {
    return [green('resolved'), target, dim(`-> ${link.resolvesTo}`)];
  }
  if (link.state === 'anchor-missing') {
    return [red('anchor'), target, `no heading in ${link.resolvesTo} matches #${link.fragment}`];
  }
  return [red('unresolved'), target, 'nothing in this bundle at that path'];
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
