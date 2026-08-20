import { writeFileSync } from 'node:fs';
import { findConcept, loadBundle } from '../core/bundle.ts';
import { appendEvent, conceptTitle, serializeConcept, setField } from '../core/concept.ts';
import { checkConcept } from '../core/check.ts';
import { appendLogEntry, displayPath, nearestLog } from '../core/log.ts';
import { conceptStatus, isoDay, resolveStaleIn } from '../core/lifecycle.ts';
import { bold, cyan, dim, green, red, yellow } from '../core/term.ts';

export interface PromoteOptions {
  bundle: string;
  by: string;
  staleAfter?: string;
  staleIn?: string;
  dryRun?: boolean;
  force?: boolean;
  noLog?: boolean;
}

export interface DeprecateOptions {
  bundle: string;
  by?: string;
  reason?: string;
  dryRun?: boolean;
  force?: boolean;
  noLog?: boolean;
}

/** SPEC 7: `<producer>/<version>`, `human:<id>`, or `process:<id>`. */
const ACTOR = /^(human:[^\s]+|process:[^\s]+|[^\s:]+\/[^\s]+)$/;

export function runPromote(ref: string, options: PromoteOptions): number {
  const bundle = loadBundle(options.bundle);
  const concept = findConcept(bundle, ref);

  const blocking = checkConcept(concept).filter((entry) => entry.level === 'error');
  if (blocking.length > 0 && !options.force) {
    console.error(red(`refusing to promote ${concept.id}: conformance errors`));
    for (const entry of blocking) console.error(`  ${entry.message} ${dim('[' + entry.rule + ']')}`);
    console.error(dim('fix them, or pass --force'));
    return 1;
  }

  if (!ACTOR.test(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    console.error(dim('expected human:<id>, process:<id>, or <producer>/<version> (SPEC 7)'));
    return 1;
  }

  const before = conceptStatus(concept.data);
  const at = new Date().toISOString();

  appendEvent(concept, 'verified', { by: options.by, at });
  setField(concept, 'status', 'stable');

  let staleAfter: string | null = null;
  if (options.staleAfter) staleAfter = options.staleAfter;
  else if (options.staleIn) staleAfter = resolveStaleIn(options.staleIn);
  if (staleAfter) setField(concept, 'stale_after', staleAfter);

  const verb = before === 'stable' ? 'Verification' : 'Promotion';
  const action = before === 'stable' ? 're-verified' : `promoted ${before} -> stable`;
  const entry = `**${verb}**: [${conceptTitle(concept)}](/${concept.id}.md) ${action} by ${options.by}.`;

  return commit(bundle.root, concept.file, serializeConcept(concept), entry, {
    id: concept.id,
    headline: `${concept.id}  ${dim(before)} -> ${green('stable')}`,
    details: [
      `verified += { by: ${options.by}, at: ${at} }`,
      staleAfter ? `stale_after = ${staleAfter}` : null,
    ],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}

export function runDeprecate(ref: string, options: DeprecateOptions): number {
  const bundle = loadBundle(options.bundle);
  const concept = findConcept(bundle, ref);

  if (options.by && !ACTOR.test(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    return 1;
  }

  const before = conceptStatus(concept.data);
  if (before === 'deprecated' && !options.force) {
    console.error(yellow(`${concept.id} is already deprecated`));
    return 1;
  }

  setField(concept, 'status', 'deprecated');

  const reason = options.reason ? ` Reason: ${options.reason}.` : '';
  const actor = options.by ? ` by ${options.by}` : '';
  const entry = `**Deprecation**: [${conceptTitle(concept)}](/${concept.id}.md) deprecated${actor}.${reason}`;

  return commit(bundle.root, concept.file, serializeConcept(concept), entry, {
    id: concept.id,
    headline: `${concept.id}  ${dim(before)} -> ${yellow('deprecated')}`,
    details: [options.reason ? `reason: ${options.reason}` : null],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}

interface CommitInfo {
  id: string;
  headline: string;
  details: (string | null)[];
  dryRun: boolean;
  noLog: boolean;
}

function commit(
  root: string,
  file: string,
  contents: string,
  logEntry: string,
  info: CommitInfo,
): number {
  const logFile = nearestLog(root, file);

  console.log(bold(info.headline));
  for (const detail of info.details) if (detail) console.log(`  ${dim(detail)}`);
  if (!info.noLog) console.log(`  ${dim(`log: ${displayPath(root, logFile)}`)}`);

  if (info.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  writeFileSync(file, contents);
  if (!info.noLog) appendLogEntry(logFile, logEntry, isoDay());
  return 0;
}
