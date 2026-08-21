import { findConcept, loadBundle } from '../core/bundle.ts';
import { commit } from '../core/commit.ts';
import { sentence } from '../core/log.ts';
import { appendEvent, conceptTitle, serializeConcept, setField } from '../core/concept.ts';
import { checkConcept } from '../core/check.ts';
import { ACTOR_FORMS, conceptStatus, isValidActor, resolveStaleIn } from '../core/lifecycle.ts';
import { dim, green, red, yellow } from '../core/term.ts';

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

export function runPromote(ref: string, options: PromoteOptions): number {
  const bundle = loadBundle(options.bundle);
  const concept = findConcept(bundle, ref);

  const blocking = checkConcept(concept, { root: bundle.root }).filter((entry) => entry.level === 'error');
  if (blocking.length > 0 && !options.force) {
    console.error(red(`refusing to promote ${concept.id}: conformance errors`));
    for (const entry of blocking) console.error(`  ${entry.message} ${dim('[' + entry.rule + ']')}`);
    console.error(dim('fix them, or pass --force'));
    return 1;
  }

  if (!isValidActor(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    console.error(dim(ACTOR_FORMS));
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

  return commit({
    root: bundle.root,
    file: concept.file,
    contents: serializeConcept(concept),
    logEntry: entry,
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

  if (options.by && !isValidActor(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    return 1;
  }

  const before = conceptStatus(concept.data);
  if (before === 'deprecated' && !options.force) {
    console.error(yellow(`${concept.id} is already deprecated`));
    return 1;
  }

  setField(concept, 'status', 'deprecated');

  const reason = options.reason ? ` Reason: ${sentence(options.reason)}` : '';
  const actor = options.by ? ` by ${options.by}` : '';
  const entry = `**Deprecation**: [${conceptTitle(concept)}](/${concept.id}.md) deprecated${actor}.${reason}`;

  return commit({
    root: bundle.root,
    file: concept.file,
    contents: serializeConcept(concept),
    logEntry: entry,
    headline: `${concept.id}  ${dim(before)} -> ${yellow('deprecated')}`,
    details: [options.reason ? `reason: ${options.reason}` : null],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}
