import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The skills shipped with okfctl, read from the package rather than generated.
 *
 * They are real files in the repository, which is what makes them editable and
 * reviewable in a diff. Generating a second copy inside the installer would give
 * the suite two sources that drift apart.
 *
 * They live under host-neutral `skills/` and `commands/`, not under any host's
 * own directory. One `SKILL.md` is written once and placed per host by
 * `SkillLayout`, so the canonical copy belongs somewhere no host reads: a source
 * kept in a directory a host also loads from is one nobody can tell is the
 * source. The cost is that okfctl's own sessions do not auto-load the curation
 * skills, which is right — curation happens in a bundle, not in this repo.
 */

/** Capture works from any repository, so it installs at user scope. */
export const CAPTURE_SKILL = 'okf-capture';

/** Recall pairs with capture — reads instead of writes — and installs at the same scope. */
export const RECALL_SKILL = 'okf-recall';

/** Every skill installed at user scope, so it works from any repository. */
export const USER_SCOPE_SKILLS = [CAPTURE_SKILL, RECALL_SKILL] as const;

/**
 * Curation happens in the knowledge base, so these install into the bundle. You
 * empty an inbox where the knowledge lives, not in whatever repository happened
 * to produce it.
 */
export const LIFECYCLE_SKILLS = [
  'okf-triage',
  'okf-refine',
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
  return packageRoot();
}

export function readSkill(name: string): string {
  const file = join(sourceDir(), 'skills', name, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`packaged skill "${name}" is missing at ${file}`);
  return readFileSync(file, 'utf8');
}

/**
 * A skill's resource files: every file in its directory other than `SKILL.md`
 * itself, read by convention rather than declared in a manifest — adding a
 * resource file to the repository is the entire authoring step. Non-recursive;
 * no skill in this package ships a nested resource directory yet.
 */
export function readSkillResources(name: string): { relPath: string; contents: string }[] {
  const dir = join(sourceDir(), 'skills', name);
  return readdirSync(dir)
    .filter((entry) => entry !== 'SKILL.md')
    .map((relPath) => ({ relPath, contents: readFileSync(join(dir, relPath), 'utf8') }));
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
