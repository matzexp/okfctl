import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.ts';
import { ADAPTERS, findAdapter } from '../src/core/agents/hosts.ts';
import { CAPTURE_SKILL, LIFECYCLE_SKILLS, readCommand, readSkill } from '../src/core/agents/sources.ts';
import { loadBundle } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';

function isolate(): { home: string; bundle: string } {
  const base = mkdtempSync(join(tmpdir(), 'okfctl-agents-'));
  process.env.OKFCTL_CONFIG_HOME = join(base, 'config');
  process.env.OKFCTL_STATE_HOME = join(base, 'state');
  const home = join(base, 'home');
  mkdirSync(home, { recursive: true });
  return { home, bundle: mkdtempSync(join(tmpdir(), 'okfctl-agentkb-')) };
}

function quiet<T>(run: () => T): T {
  const log = console.log;
  const error = console.error;
  console.log = () => {};
  console.error = () => {};
  try {
    return run();
  } finally {
    console.log = log;
    console.error = error;
  }
}

function install(home: string, bundle: string, agent: string[], extra = {}): number {
  return quiet(() => runInit(bundle, { agent, home, command: '/usr/bin/okfctl', ...extra }));
}

const settings = (home: string) => join(home, '.claude', 'settings.json');
const codexHooks = (home: string) => join(home, '.codex', 'hooks.json');

test('claude-code installs a Stop hook, an arming hook, a skill and a command', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['claude-code']), 0);

  const config = JSON.parse(readFileSync(settings(home), 'utf8'));
  assert.ok(config.hooks.Stop, 'Stop carries the prompt');
  assert.ok(config.hooks.UserPromptSubmit, 'UserPromptSubmit arms the session');
  assert.equal(config.hooks.SessionEnd, undefined, 'SessionEnd output cannot reach the model');
  assert.match(config.hooks.Stop[0].hooks[0].command, /okfctl hook claude-code --every 1/);

  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'capture.md')));
});

test('codex installs a Stop hook and AGENTS.md guidance, and needs no arming hook', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['codex']), 0);

  const config = JSON.parse(readFileSync(codexHooks(home), 'utf8'));
  assert.ok(config.hooks.Stop);
  assert.equal(config.hooks.UserPromptSubmit, undefined, 'stop_hook_active is its own guard');
  assert.match(config.hooks.Stop[0].hooks[0].command, /okfctl hook codex --every 1/);
  assert.match(readFileSync(join(home, '.codex', 'AGENTS.md'), 'utf8'), /okfctl capture/);
});

test('both hook-capable hosts invoke the same hook program', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code', 'codex']);
  const claude = JSON.parse(readFileSync(settings(home), 'utf8')).hooks.Stop[0].hooks[0].command;
  const codex = JSON.parse(readFileSync(codexHooks(home), 'utf8')).hooks.Stop[0].hooks[0].command;
  assert.equal(claude.split(' hook ')[0], codex.split(' hook ')[0]);
});

test('the interval is recorded in the installed configuration', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code'], { captureEvery: 5 });
  assert.match(
    JSON.parse(readFileSync(settings(home), 'utf8')).hooks.Stop[0].hooks[0].command,
    /--every 5/,
  );
});

test('reinstalling with a new interval replaces rather than duplicates', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code'], { captureEvery: 2 });
  install(home, bundle, ['claude-code'], { captureEvery: 7 });

  const stop = JSON.parse(readFileSync(settings(home), 'utf8')).hooks.Stop;
  const ours = stop.flatMap((g: { hooks: { command: string }[] }) => g.hooks)
    .filter((h: { command: string }) => h.command.includes('okfctl hook'));
  assert.equal(ours.length, 1, 'exactly one of our entries');
  assert.match(ours[0].command, /--every 7/);
});

test('an invalid interval is refused and nothing is written', () => {
  const { home, bundle } = isolate();
  for (const captureEvery of [0, -3, 1.5, Number.NaN]) {
    assert.equal(install(home, bundle, ['claude-code'], { captureEvery }), 1);
  }
  assert.equal(existsSync(settings(home)), false);
});

test('unrelated settings and other hooks on the same event survive', () => {
  const { home, bundle } = isolate();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), JSON.stringify({
    theme: 'dark',
    permissions: { allow: ['Bash(ls:*)'] },
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'someone-elses-hook' }] }] },
  }, null, 2));

  install(home, bundle, ['claude-code']);
  const config = JSON.parse(readFileSync(settings(home), 'utf8'));
  assert.equal(config.theme, 'dark');
  assert.deepEqual(config.permissions.allow, ['Bash(ls:*)']);

  const commands = config.hooks.Stop.flatMap((g: { hooks: { command: string }[] }) => g.hooks)
    .map((h: { command: string }) => h.command);
  assert.ok(commands.includes('someone-elses-hook'), 'a pre-existing hook stays registered');
  assert.ok(commands.some((c: string) => c.includes('okfctl hook')));
});

test('an unparseable config is refused, not rewritten', () => {
  const { home, bundle } = isolate();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), '{ this is not json');

  assert.equal(install(home, bundle, ['claude-code']), 1);
  assert.equal(readFileSync(settings(home), 'utf8'), '{ this is not json');
});

test('an unknown host is refused and nothing is written', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['emacs']), 1);
  assert.equal(existsSync(join(home, '.claude')), false);
});

test('instruction-only hosts install no hook and say so', () => {
  const { home, bundle } = isolate();
  for (const name of ['copilot', 'agents-md']) {
    const adapter = findAdapter(name);
    assert.equal(adapter.hook, false);
    const plan = adapter.plan({ command: 'okfctl', every: 1, home, bundle });
    assert.equal(plan.hook, false);
    assert.ok(plan.unsupported.length > 0, 'the gap is named, never glossed over');
    assert.match(plan.unsupported[0], /no equivalent mechanism/);
  }

  install(home, bundle, ['copilot', 'agents-md']);
  assert.match(readFileSync(join(home, '.github', 'copilot-instructions.md'), 'utf8'), /okfctl capture/);
  assert.match(readFileSync(join(home, 'AGENTS.md'), 'utf8'), /okfctl capture/);
});

test('an instruction file keeps content that was already in it', () => {
  const { home, bundle } = isolate();
  writeFileSync(join(home, 'AGENTS.md'), '# House rules\n\nAlways run the tests.\n');
  install(home, bundle, ['agents-md']);

  const raw = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.match(raw, /# House rules/);
  assert.match(raw, /Always run the tests\./);
  assert.match(raw, /okfctl capture/);
});

test('reinstalling an instruction file adds no second section', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['agents-md']);
  install(home, bundle, ['agents-md']);
  const raw = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.equal(raw.split('## Capturing knowledge into OKF').length - 1, 1);
});

test('removal takes back exactly what was installed', () => {
  const { home, bundle } = isolate();
  writeFileSync(join(home, 'AGENTS.md'), '# House rules\n\nAlways run the tests.\n');
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), JSON.stringify({
    theme: 'dark',
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'someone-elses-hook' }] }] },
  }, null, 2));

  install(home, bundle, ['claude-code', 'agents-md']);
  assert.equal(install(home, bundle, ['claude-code', 'agents-md'], { remove: true }), 0);

  const config = JSON.parse(readFileSync(settings(home), 'utf8'));
  assert.equal(config.theme, 'dark', 'unrelated settings intact');
  const commands = (config.hooks?.Stop ?? [])
    .flatMap((g: { hooks: { command: string }[] }) => g.hooks)
    .map((h: { command: string }) => h.command);
  assert.deepEqual(commands, ['someone-elses-hook'], 'only ours is gone');
  assert.equal(config.hooks.UserPromptSubmit, undefined);

  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')), false);

  const agents = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Always run the tests\./);
  assert.doesNotMatch(agents, /okfctl capture/);
});

test('removing what was never installed changes nothing', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['claude-code'], { remove: true }), 0);
  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')), false);
});

test('--remove without a host is refused', () => {
  const { home, bundle } = isolate();
  assert.equal(quiet(() => runInit(bundle, { remove: true, home })), 1);
});

test('a dry run writes nothing for install or removal', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['claude-code', 'codex'], { dryRun: true }), 0);
  assert.equal(existsSync(settings(home)), false);
  assert.equal(existsSync(codexHooks(home)), false);

  install(home, bundle, ['claude-code']);
  const before = readFileSync(settings(home), 'utf8');
  install(home, bundle, ['claude-code'], { remove: true, dryRun: true });
  assert.equal(readFileSync(settings(home), 'utf8'), before);
});

test('every adapter is named and reachable', () => {
  assert.deepEqual(ADAPTERS.map((a) => a.name), ['claude-code', 'codex', 'copilot', 'agents-md']);
  assert.throws(() => findAdapter('nope'), /supported: claude-code, codex, copilot, agents-md/);
});

test('removal deletes a config that only existed because we created it', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code', 'codex']);
  assert.ok(existsSync(settings(home)));
  assert.ok(existsSync(codexHooks(home)));

  install(home, bundle, ['claude-code', 'codex'], { remove: true });
  assert.equal(existsSync(settings(home)), false, 'an emptied config is not left as a husk');
  assert.equal(existsSync(codexHooks(home)), false);
});

test('removal deletes an instructions file that held nothing else', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['agents-md', 'copilot']);
  install(home, bundle, ['agents-md', 'copilot'], { remove: true });
  assert.equal(existsSync(join(home, 'AGENTS.md')), false);
  assert.equal(existsSync(join(home, '.github', 'copilot-instructions.md')), false);
});

test('removal prunes the directories it created, and only those', () => {
  const { home, bundle } = isolate();
  // Something of the user's, in a directory we also write into.
  mkdirSync(join(home, '.claude', 'skills', 'theirs'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'theirs', 'SKILL.md'), 'theirs\n');

  install(home, bundle, ['claude-code']);
  install(home, bundle, ['claude-code'], { remove: true });

  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-capture')), false, 'our dir is pruned');
  assert.equal(existsSync(join(home, '.claude', 'commands', 'okf')), false);
  assert.ok(existsSync(join(home, '.claude', 'skills', 'theirs', 'SKILL.md')), 'theirs survives');
  assert.ok(existsSync(join(home, '.claude', 'skills')), 'a directory with anything else in it stays');
});

test('nothing above the home directory is ever pruned', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code', 'agents-md']);
  install(home, bundle, ['claude-code', 'agents-md'], { remove: true });
  assert.ok(existsSync(home), 'the home directory itself is never removed');
});

test('a config the user has other settings in survives removal', () => {
  const { home, bundle } = isolate();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), JSON.stringify({ model: 'opus' }, null, 2));
  install(home, bundle, ['claude-code']);
  install(home, bundle, ['claude-code'], { remove: true });

  assert.ok(existsSync(settings(home)), 'a config holding the user\'s settings is kept');
  assert.deepEqual(JSON.parse(readFileSync(settings(home), 'utf8')), { model: 'opus' });
});

test('capture installs at user scope and the curation suite into the bundle', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code']);

  // Capture works from any repository, so it is user scope.
  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'capture.md')));

  // Curation happens where the knowledge lives, so it is project scope.
  for (const skill of ['okf-triage', 'okf-ingest', 'okf-promote', 'okf-review', 'okf-deprecate']) {
    assert.ok(existsSync(join(bundle, '.claude', 'skills', skill, 'SKILL.md')), `${skill} in the bundle`);
    assert.equal(existsSync(join(home, '.claude', 'skills', skill)), false, `${skill} is not user scope`);
  }
  assert.ok(existsSync(join(bundle, '.claude', 'commands', 'okf', 'review.md')));
  assert.equal(existsSync(join(home, '.claude', 'commands', 'okf', 'review.md')), false);
});

test('codex uses its own skills directories, at both scopes', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['codex']);

  assert.ok(existsSync(join(home, '.agents', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(bundle, '.agents', 'skills', 'okf-review', 'SKILL.md')));
  // Codex has no slash-command equivalent, so none are written.
  assert.equal(existsSync(join(bundle, '.agents', 'commands')), false);
});

test('the installed skills are the packaged ones, byte for byte', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code']);
  assert.equal(
    readFileSync(join(bundle, '.claude', 'skills', 'okf-review', 'SKILL.md'), 'utf8'),
    readSkill('okf-review'),
    'no second copy that can drift from the source',
  );
  assert.equal(
    readFileSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md'), 'utf8'),
    readSkill(CAPTURE_SKILL),
  );
});

test('skills installed into a bundle do not become corpus', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { home, command: 'okfctl' }));
  const before = loadBundle(bundle).concepts.length;

  install(home, bundle, ['claude-code', 'codex']);
  const after = loadBundle(bundle);
  assert.equal(after.concepts.length, before, 'a dotdir is skipped by the bundle walk');
  assert.equal(countBy(checkBundle(after), 'error'), 0);
});

test('removal takes back both scopes and leaves the bundle itself alone', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { home, command: 'okfctl' }));
  install(home, bundle, ['claude-code', 'codex']);
  install(home, bundle, ['claude-code', 'codex'], { remove: true });

  assert.equal(existsSync(join(home, '.claude')), false, 'user scope gone');
  assert.equal(existsSync(join(home, '.agents')), false);
  assert.equal(existsSync(join(bundle, '.claude')), false, 'project scope gone');
  assert.equal(existsSync(join(bundle, '.agents')), false);

  // Removal unwires the agents; it does not touch the knowledge base.
  assert.ok(existsSync(join(bundle, 'index.md')));
  assert.ok(existsSync(join(bundle, 'log.md')));
});

test('reinstalling into a bundle overwrites rather than duplicating', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['claude-code']);
  writeFileSync(join(bundle, '.claude', 'skills', 'okf-review', 'SKILL.md'), 'stale\n');
  install(home, bundle, ['claude-code']);
  assert.equal(
    readFileSync(join(bundle, '.claude', 'skills', 'okf-review', 'SKILL.md'), 'utf8'),
    readSkill('okf-review'),
    'an outdated copy is refreshed from the package',
  );
});

test('every packaged skill and command is readable', () => {
  for (const skill of [CAPTURE_SKILL, ...LIFECYCLE_SKILLS]) {
    const raw = readSkill(skill);
    assert.match(raw, /^---\n/, `${skill} opens with frontmatter`);
    assert.match(raw, new RegExp(`^name: ${skill}$`, 'm'), `${skill} declares its name`);
    assert.match(raw, /^description: .+/m, `${skill} declares a description`);
    assert.ok(readCommand(skill).length > 0, `${skill} has a command file`);
  }
});
