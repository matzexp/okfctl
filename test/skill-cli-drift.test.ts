import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The skills tell an agent which commands to run, and nothing else connects the
 * two: a flag renamed in `cli.ts` leaves every skill still instructing agents to
 * pass the old one, and the suite stays green because it only ever checked that
 * the skill files were installed. This reads the commands out of the skills' own
 * fenced examples and asserts the CLI still defines them.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

/** Command name to the long flags it accepts, including the global ones. */
function cliSurface(): Map<string, Set<string>> {
  const source = readFileSync(`${root}/src/cli.ts`, 'utf8');

  // Everything before the first `.command(` is the root program: its options
  // apply everywhere, because they are read with `optsWithGlobals()`.
  const sections = source.split(/\n(?=program\s*\n\s*\.command\()/);
  const globals = new Set(
    [...sections[0].matchAll(/\.option\(\s*'(?:-\w, )?(--[a-z-]+)/g)].map((m) => m[1]),
  );

  const surface = new Map<string, Set<string>>();
  for (const section of sections.slice(1)) {
    const name = /\.command\(\s*'([a-z-]+)/.exec(section)?.[1];
    if (!name) continue;
    const flags = new Set(globals);
    for (const match of section.matchAll(/\.(?:required)?[oO]ption\(\s*'(?:-\w, )?(--[a-z-]+)/g)) {
      flags.add(match[1]);
      // `--no-x` also accepts `--x`; skills use whichever reads better.
      if (match[1].startsWith('--no-')) flags.add(`--${match[1].slice(5)}`);
    }
    surface.set(name, flags);
  }
  return surface;
}

/** Every `okfctl …` invocation in a skill's fenced bash blocks. */
function documentedCommands(): { where: string; verb: string; flags: string[] }[] {
  const found: { where: string; verb: string; flags: string[] }[] = [];
  for (const skill of readdirSync(`${root}/skills`)) {
    for (const file of readdirSync(`${root}/skills/${skill}`).filter((f) => f.endsWith('.md'))) {
      const where = `skills/${skill}/${file}`;
      const text = readFileSync(`${root}/${where}`, 'utf8');
      for (const block of text.matchAll(/```bash\n([\s\S]*?)```/g)) {
        for (const line of block[1].split('\n')) {
          const rest = /^\s*okfctl\s+(.*)$/.exec(line)?.[1];
          if (!rest) continue;
          const tokens = rest.split(/\s+/);
          const verb = tokens.find((t) => /^[a-z]/.test(t) && !t.startsWith('-'));
          if (!verb) continue;
          found.push({ where, verb, flags: tokens.filter((t) => /^--[a-z-]+$/.test(t)) });
        }
      }
    }
  }
  return found;
}

test('every command a skill tells an agent to run is one the CLI defines', () => {
  const surface = cliSurface();
  const documented = documentedCommands();

  assert.ok(documented.length > 10, 'the extraction found the skills\' example commands');

  for (const { where, verb, flags } of documented) {
    const flagsFor = surface.get(verb);
    assert.ok(flagsFor, `${where}: documents \`okfctl ${verb}\`, which the CLI does not define`);
    for (const flag of flags) {
      assert.ok(flagsFor.has(flag), `${where}: documents \`${verb} ${flag}\`, which that command does not accept`);
    }
  }
});

test('the workflows still reach the CLI surface each one depends on', () => {
  // Named individually because these are the couplings a spec asserts, and a
  // skill quietly losing one reads as a working workflow that no longer does
  // the thing its requirement says it does.
  const capture = readFileSync(`${root}/skills/okf-capture/SKILL.md`, 'utf8');
  assert.match(capture, /okfctl search /,
    'capture searches before writing, so a duplicate never becomes permanent backlog');

  const recall = readFileSync(`${root}/skills/okf-recall/SKILL.md`, 'utf8');
  assert.match(recall, /--match any/,
    'recall retries loosely before reporting the bundle silent');
});
