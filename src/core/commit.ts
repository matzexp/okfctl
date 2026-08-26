import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isoDay } from './lifecycle.ts';
import { appendLogEntry, displayPath, nearestLog } from './log.ts';
import { bold, cyan, dim, red } from './term.ts';

export interface CommitRequest {
  /** Bundle root, used to resolve the nearest `log.md`. */
  root: string;
  /** Absolute path of the file being written. Need not exist yet. */
  file: string;
  /** Full contents to write. */
  contents: string;
  /** The bullet appended to the log, unless `noLog`. */
  logEntry: string;
  /** One-line summary of the change, printed first. */
  headline: string;
  /** Supporting lines; nulls are dropped so callers can inline conditionals. */
  details?: (string | null)[];
  dryRun?: boolean;
  noLog?: boolean;
}

/**
 * The write half every mutating verb shares: report what is changing, resolve
 * the nearest log, and then either write both or, under `--dry-run`, neither.
 *
 * The conformance gate deliberately lives in the callers rather than here.
 * `promote` blocks on errors, `deprecate` must be able to retire a concept
 * that is already broken, and `new` has no file to check yet.
 */
export function commit(request: CommitRequest): number {
  const logFile = nearestLog(request.root, request.file);

  console.log(bold(request.headline));
  for (const detail of request.details ?? []) if (detail) console.log(`  ${dim(detail)}`);
  if (!request.noLog) console.log(`  ${dim(`log: ${displayPath(request.root, logFile)}`)}`);

  if (request.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  // Both writes or neither. A concept written with no log entry loses the record
  // of why it changed; a log entry with no concept asserts a change that did not
  // happen. `refine` and `move` already stage their writes this way.
  const existed = existsSync(request.file);
  const previous = existed ? readFileSync(request.file, 'utf8') : null;
  const logExisted = existsSync(logFile);
  const previousLog = logExisted ? readFileSync(logFile, 'utf8') : null;

  try {
    mkdirSync(dirname(request.file), { recursive: true });
    writeFileSync(request.file, request.contents);
    if (!request.noLog) appendLogEntry(logFile, request.logEntry, isoDay());
  } catch (error) {
    restore(request.file, previous);
    if (!request.noLog) restore(logFile, previousLog);
    console.error(red(`write failed: ${(error as Error).message}`));
    console.error(dim('the bundle was restored to its previous state'));
    return 1;
  }
  return 0;
}

/** Put a file back the way it was, or remove it when it was not there at all. */
function restore(file: string, previous: string | null): void {
  try {
    if (previous === null) rmSync(file, { force: true });
    else writeFileSync(file, previous);
  } catch {
    // Best effort: the caller's error message is what the user acts on.
  }
}
