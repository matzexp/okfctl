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
  /**
   * Whether an `okfctl` install is already present for this host, checked
   * against an artifact only an install creates — never a config file's mere
   * existence, which frequently predates and has nothing to do with `okfctl`.
   */
  isInstalled(context: InstallContext): boolean;
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
 * Marker text is parameterized by a section id so one file can carry more
 * than one independently-managed section — `'capture'`'s marker text is
 * unchanged from before this was parameterized, so an install made when
 * there was only ever one section still upserts and removes correctly.
 */
export function sectionMarkers(id: string): { start: string; end: string } {
  return { start: `<!-- okfctl:${id} -->`, end: `<!-- /okfctl:${id} -->` };
}

export function upsertSection(existing: string | null, id: string, section: string): string {
  const { start, end } = sectionMarkers(id);
  const block = `${start}\n${section.trim()}\n${end}`;
  if (existing === null || existing.trim() === '') return `${block}\n`;

  const startIdx = existing.indexOf(start);
  const endIdx = existing.indexOf(end);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return existing.slice(0, startIdx) + block + existing.slice(endIdx + end.length);
  }
  return `${existing.replace(/\n+$/, '')}\n\n${block}\n`;
}

export function removeSection(existing: string | null, id: string): string | null {
  if (existing === null) return null;
  const { start, end } = sectionMarkers(id);
  const startIdx = existing.indexOf(start);
  const endIdx = existing.indexOf(end);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return existing;
  const stripped = existing.slice(0, startIdx) + existing.slice(endIdx + end.length);
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
    'and placement alone unless you are sure — the capture lands in the dumps area exactly',
    'so a human can decide later.',
    '',
    'If nothing durable came out of the session, write nothing. An inbox of noise is worse',
    'than an empty one.',
  ].join('\n');
}

/** The instructions every host receives, in the host's own file. */
export function recallInstructions(command: string): string {
  return [
    '## Finding existing knowledge in OKF',
    '',
    'Before starting non-trivial investigation, or when asked whether something is already',
    'known, check the knowledge base first — it may already answer the question:',
    '',
    '```bash',
    `${command} search "<query>"`,
    '```',
    '',
    'Read each result\'s area and trust tier before acting on it. A `corpus` hit with',
    '`status: stable` and `trust: human-reviewed` is citable as established fact. A hit in',
    '`dumps` or `drafts`, or carrying `trust: unverified`, is a lead worth checking, not a',
    'fact to repeat without saying it is unverified.',
    '',
    'Searching writes nothing. If nothing relevant turns up, proceed with the investigation',
    'normally.',
  ].join('\n');
}
