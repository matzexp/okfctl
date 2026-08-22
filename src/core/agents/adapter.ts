import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Claude Code and Codex converged on the same hook design: the same event names,
 * the same `event -> matcher group -> hooks[]` config shape, one JSON object on
 * stdin, and exit 2 to block. So this is not two implementations of a hook. It is
 * one hook program and one config writer per host, and an adapter's whole job is
 * to say where its host keeps configuration and in what form.
 */

export interface Edit {
  /** Absolute path being created or edited. */
  path: string;
  /** What the file will contain, or null when the edit removes the file. */
  contents: string | null;
  /** Whether the path exists already, decided when the plan is built. */
  existed: boolean;
  /** One line describing the edit, for the preview and the report. */
  describe: string;
}

export interface Plan {
  host: string;
  edits: Edit[];
  /** Capabilities this host does not have. Reported, never glossed over. */
  unsupported: string[];
  /** True when the host would receive an event hook. */
  hook: boolean;
}

export interface InstallContext {
  /** Absolute path to the `okfctl` binary the installed hook should invoke. */
  command: string;
  /** Prompt on every nth completed turn. */
  every: number;
  /** Home directory to install under. Overridable so tests never touch a real one. */
  home: string;
  /**
   * The bundle being wired. Curation skills install here rather than at user
   * scope: you empty an inbox where the knowledge lives, not in whatever
   * repository happened to produce it.
   */
  bundle: string;
}

export interface Adapter {
  name: string;
  /** Whether this host receives an event hook at all. */
  hook: boolean;
  plan(context: InstallContext): Plan;
  planRemoval(context: InstallContext): Plan;
}

/** Apply a plan. Callers preview first; this only writes. */
export function applyPlan(plan: Plan): string[] {
  const written: string[] = [];
  for (const edit of plan.edits) {
    if (edit.contents === null) continue;
    mkdirSync(dirname(edit.path), { recursive: true });
    writeFileSync(edit.path, edit.contents);
    written.push(edit.path);
  }
  return written;
}

export function readIfPresent(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

/**
 * Add a section to a Markdown instructions file without disturbing what is
 * already there. Delimited so removal can take back exactly what was added.
 */
export const MARK_START = '<!-- okfctl:capture -->';
export const MARK_END = '<!-- /okfctl:capture -->';

export function upsertSection(existing: string | null, section: string): string {
  const block = `${MARK_START}\n${section.trim()}\n${MARK_END}`;
  if (existing === null || existing.trim() === '') return `${block}\n`;

  const start = existing.indexOf(MARK_START);
  const end = existing.indexOf(MARK_END);
  if (start !== -1 && end !== -1 && end > start) {
    return existing.slice(0, start) + block + existing.slice(end + MARK_END.length);
  }
  return `${existing.replace(/\n+$/, '')}\n\n${block}\n`;
}

export function removeSection(existing: string | null): string | null {
  if (existing === null) return null;
  const start = existing.indexOf(MARK_START);
  const end = existing.indexOf(MARK_END);
  if (start === -1 || end === -1 || end < start) return existing;
  const stripped = existing.slice(0, start) + existing.slice(end + MARK_END.length);
  return stripped.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');
}

/** The instructions every host receives, in the host's own file. */
export function captureInstructions(command: string): string {
  return [
    '## Capturing knowledge into OKF',
    '',
    'When a session establishes something worth keeping — a decision and why, an incident',
    'and its cause, a constraint that was not obvious — write it into the knowledge base:',
    '',
    '```bash',
    `${command} capture --title "<what was established>" --by "<your producer id>" --stdin`,
    '```',
    '',
    'Summarize so a reader who was not in the session can act on it; do not paste the',
    'transcript. Record yourself as the producer, never the user (SPEC §7). Leave the type',
    'and placement alone unless you are sure — the capture lands in the drafts area exactly',
    'so a human can decide later.',
    '',
    'If nothing durable came out of the session, write nothing. An inbox of noise is worse',
    'than an empty one.',
  ].join('\n');
}
