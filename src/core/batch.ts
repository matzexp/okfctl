import { bold, dim, green, red } from './term.ts';

/**
 * Run one single-concept verb over several concepts.
 *
 * The curation skills all describe batch work — `okf-review` builds a backlog
 * and previews it, `okf-promote` and `okf-deprecate` confirm a list before the
 * first write — while the CLI took one concept per invocation, so an agent had
 * to loop and stitch the results together itself. Doing it here means one report
 * and one exit status for the whole batch.
 *
 * A failure does not stop the rest. These verbs are independent per concept, and
 * abandoning a confirmed batch halfway because its third entry had a conformance
 * error leaves the caller worse off than finishing and naming what failed. The
 * exit status is non-zero when anything failed, so CI still notices.
 */
export function runBatch(
  refs: string[],
  run: (ref: string) => number,
): number {
  if (refs.length === 0) {
    console.error(red('at least one concept is required'));
    return 1;
  }
  if (refs.length === 1) return run(refs[0]);

  const failed: string[] = [];
  for (const [index, ref] of refs.entries()) {
    if (index > 0) console.log('');
    let code: number;
    try {
      code = run(ref);
    } catch (error) {
      // A verb that throws on an unresolvable reference must not take the rest
      // of the batch down with it.
      console.error(red((error as Error).message));
      code = 1;
    }
    if (code !== 0) failed.push(ref);
  }

  const done = refs.length - failed.length;
  console.log(bold(`\n${done}/${refs.length} succeeded`));
  if (failed.length > 0) {
    console.log(red(`failed: ${failed.join(', ')}`));
    return 1;
  }
  console.log(dim(green('every concept in the batch was written')));
  return 0;
}
