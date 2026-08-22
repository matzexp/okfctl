import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The skills shipped with okfctl, read from the package rather than generated.
 *
 * They are real files under `.claude/` in the repository, which is what makes
 * them editable, reviewable in a diff, and loaded when working on okfctl itself.
 * Generating a second copy inside the installer would give the suite two sources
 * that drift apart.
 */

/** Capture works from any repository, so it installs at user scope. */
export const CAPTURE_SKILL = 'okf-capture';

/**
 * Curation happens in the knowledge base, so these install into the bundle. You
 * empty an inbox where the knowledge lives, not in whatever repository happened
 * to produce it.
 */
export const LIFECYCLE_SKILLS = [
  'okf-triage',
  'okf-ingest',
  'okf-promote',
  'okf-review',
  'okf-deprecate',
] as const;

/** `src/core/agents/` and `dist/core/agents/` sit at the same depth. */
export function packageRoot(): string {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

function sourceDir(): string {
  return join(packageRoot(), '.claude');
}

export function readSkill(name: string): string {
  const file = join(sourceDir(), 'skills', name, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`packaged skill "${name}" is missing at ${file}`);
  return readFileSync(file, 'utf8');
}

export function readCommand(name: string): string {
  const stem = name.replace(/^okf-/, '');
  const file = join(sourceDir(), 'commands', 'okf', `${stem}.md`);
  if (!existsSync(file)) throw new Error(`packaged command "${stem}" is missing at ${file}`);
  return readFileSync(file, 'utf8');
}

/** The command file's stem, which is also its slash name after the `okf:` prefix. */
export function commandStem(skill: string): string {
  return skill.replace(/^okf-/, '');
}
