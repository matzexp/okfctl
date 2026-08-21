import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isoDay } from './lifecycle.ts';
import { appendLogEntry, displayPath, nearestLog } from './log.ts';
import { bold, cyan, dim } from './term.ts';

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

  mkdirSync(dirname(request.file), { recursive: true });
  writeFileSync(request.file, request.contents);
  if (!request.noLog) appendLogEntry(logFile, request.logEntry, isoDay());
  return 0;
}
