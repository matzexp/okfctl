import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export interface Origin {
  /** Working directory the capture was made from. */
  cwd: string;
  /** `origin` remote URL, when the directory is a git repository with one. */
  remote: string | null;
  /** Short commit the working tree was at, when there is one. */
  commit: string | null;
}

function git(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    });
    const value = out.trim();
    return value || null;
  } catch {
    // Not a repository, no remote, no commits yet, or no git at all. All of
    // these mean the same thing here: there is nothing true to record.
    return null;
  }
}

/**
 * Where a capture came from. A bundle collecting knowledge out of a dozen
 * repositories loses the context a reader most needs without this, and
 * `sources[]` (SPEC §5.1) is where a claim's provenance already goes.
 *
 * Nothing is invented: outside a repository the remote and commit are null and
 * are omitted rather than guessed.
 */
export function readOrigin(cwd: string): Origin {
  const inside = git(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true';
  if (!inside) return { cwd, remote: null, commit: null };
  return {
    cwd,
    remote: git(cwd, ['remote', 'get-url', 'origin']),
    commit: git(cwd, ['rev-parse', '--short', 'HEAD']),
  };
}

/**
 * The `sources[]` entry form. Always carries a `resource`: SPEC §5.1 requires one
 * within an entry, and `okfctl check` warns when it is missing — so omitting it
 * outside a git repository made every such capture arrive already flagged by the
 * tool that wrote it. The working directory is a real, resolvable location, so it
 * is recorded as a `file://` URI rather than left off.
 */
export function originSource(origin: Origin): Record<string, string> {
  const resource = origin.remote
    ? `${origin.remote}${origin.commit ? `@${origin.commit}` : ''}`
    : pathToFileURL(origin.cwd).href;
  return { id: 'origin', title: origin.cwd, resource };
}
