import { findConcept, loadBundle } from '../core/bundle.ts';
import { commit } from '../core/commit.ts';
import { sentence } from '../core/log.ts';
import { appendEvent, conceptTitle, serializeConcept, setField } from '../core/concept.ts';
import {
  ACTOR_FORMS,
  conceptStatus,
  isValidActor,
  isoDay,
  resolveStaleIn,
} from '../core/lifecycle.ts';
import { dim, green, red, yellow } from '../core/term.ts';

export interface ReviewOptions {
  bundle: string;
  by?: string;
  confirm?: boolean;
  outdated?: boolean;
  reason?: string;
  staleAfter?: string;
  staleIn?: string;
  dryRun?: boolean;
  noLog?: boolean;
}

/**
 * Reviewing a concept has exactly two outcomes, and they write different
 * things. Confirming appends a `verified` entry and leaves `status` alone —
 * saying the content is still accurate is not a claim about its lifecycle
 * state, which is what `promote` is for. Finding it outdated writes only
 * `stale_after`, set to today, so SPEC §5.5 reports the concept stale from
 * this moment; nothing is appended to `verified`, because §5.3 derives the
 * trust tier from that list and a review that found the concept wrong must
 * not raise it.
 */
export function runReview(ref: string, options: ReviewOptions): number {
  if (options.confirm && options.outdated) {
    console.error(red('--confirm and --outdated are the two possible outcomes; pass one'));
    return 1;
  }
  if (!options.confirm && !options.outdated) {
    console.error(red('a review needs an outcome: --confirm or --outdated'));
    return 1;
  }

  const bundle = loadBundle(options.bundle);
  let concept;
  try {
    concept = findConcept(bundle, ref);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (options.by !== undefined && !isValidActor(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    console.error(dim(ACTOR_FORMS));
    return 1;
  }

  return options.confirm
    ? confirm(bundle.root, concept, options)
    : outdated(bundle.root, concept, options);
}

type Loaded = ReturnType<typeof findConcept>;

function confirm(root: string, concept: Loaded, options: ReviewOptions): number {
  // A `verified` entry cannot be written without a `by` (SPEC §5.2).
  if (!options.by) {
    console.error(red('--by is required to confirm a review'));
    console.error(dim(ACTOR_FORMS));
    return 1;
  }

  let staleAfter: string | null = null;
  if (options.staleAfter) staleAfter = options.staleAfter;
  else if (options.staleIn) {
    try {
      staleAfter = resolveStaleIn(options.staleIn);
    } catch (error) {
      console.error(red((error as Error).message));
      return 1;
    }
  }

  const at = new Date().toISOString();
  appendEvent(concept, 'verified', { by: options.by, at });
  if (staleAfter) setField(concept, 'stale_after', staleAfter);

  const status = conceptStatus(concept.data);
  const reason = options.reason ? ` ${sentence(options.reason)}` : '';
  const entry = `**Review**: [${conceptTitle(concept)}](/${concept.id}.md) confirmed still accurate by ${options.by}.${reason}`;

  return commit({
    root,
    file: concept.file,
    contents: serializeConcept(concept),
    logEntry: entry,
    headline: `${concept.id}  ${green('confirmed')} ${dim(`(status unchanged: ${status})`)}`,
    details: [
      `verified += { by: ${options.by}, at: ${at} }`,
      staleAfter ? `stale_after = ${staleAfter}` : dim('stale_after unchanged; pass --stale-in to move it'),
    ],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}

function outdated(root: string, concept: Loaded, options: ReviewOptions): number {
  const today = isoDay();
  setField(concept, 'stale_after', today);

  const status = conceptStatus(concept.data);
  const actor = options.by ? ` by ${options.by}` : '';
  const reason = options.reason ? ` Reason: ${sentence(options.reason)}` : '';
  const entry = `**Review**: [${conceptTitle(concept)}](/${concept.id}.md) found outdated${actor}; marked stale as of ${today}.${reason}`;

  return commit({
    root,
    file: concept.file,
    contents: serializeConcept(concept),
    logEntry: entry,
    headline: `${concept.id}  ${yellow('outdated')} ${dim(`(status unchanged: ${status})`)}`,
    details: [
      `stale_after = ${today}`,
      'verified unchanged; a review that found the concept wrong claims no verification',
      options.reason ? `reason: ${options.reason}` : null,
      dim('next: rewrite the concept, or okfctl deprecate it'),
    ],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}
