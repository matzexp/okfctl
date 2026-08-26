import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit , DEFAULT_CAPTURE_EVERY } from '../src/commands/init.ts';
import { removeSection } from '../src/core/agents/adapter.ts';
import { ADAPTERS, findAdapter, installedInterval } from '../src/core/agents/hosts.ts';
import {
  CAPTURE_SKILL, LIFECYCLE_SKILLS, readCommand, readSkill, readSkillResources,
} from '../src/core/agents/sources.ts';
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

function captured(run: () => number): { code: number; out: string } {
  const log = console.log;
  let out = '';
  console.log = (...args: unknown[]) => {
    out += `${args.join(' ')}\n`;
  };
  try {
    return { code: run(), out };
  } finally {
    console.log = log;
  }
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
  assert.match(config.hooks.Stop[0].hooks[0].command, new RegExp(`okfctl hook claude-code --every ${DEFAULT_CAPTURE_EVERY}`));

  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'capture.md')));
  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-recall', 'SKILL.md')), 'recall pairs with capture at user scope');
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'recall.md')));
});

test('codex installs a Stop hook and AGENTS.md guidance, and needs no arming hook', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['codex']), 0);

  const config = JSON.parse(readFileSync(codexHooks(home), 'utf8'));
  assert.ok(config.hooks.Stop);
  assert.equal(config.hooks.UserPromptSubmit, undefined, 'stop_hook_active is its own guard');
  assert.match(config.hooks.Stop[0].hooks[0].command, new RegExp(`okfctl hook codex --every ${DEFAULT_CAPTURE_EVERY}`));
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
  const adapter = findAdapter('agents-md');
  assert.equal(adapter.hook, false);
  const plan = adapter.plan({ command: 'okfctl', every: 1, home, bundle });
  assert.equal(plan.hook, false);
  assert.ok(plan.unsupported.length > 0, 'the gap is named, never glossed over');
  assert.match(plan.unsupported[0], /no equivalent mechanism/);

  install(home, bundle, ['agents-md']);
  const agents = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.match(agents, /okfctl capture/);
  assert.match(agents, /okfctl search/, 'recall gets a section too, on the same instructions-only file');
});

test('an instructions-only host manages capture and recall as independent sections', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['agents-md']);
  const both = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.match(both, /## Capturing knowledge into OKF/);
  assert.match(both, /## Finding existing knowledge in OKF/);

  // Removing just the host entirely takes both; verify each section's marker
  // independently by stripping one at a time through the same mechanism the
  // adapter uses, so a corrupt or hand-edited section on one side would not
  // silently take out the other.
  const captureOnly = removeSection(both, 'recall');
  assert.match(captureOnly!, /## Capturing knowledge into OKF/, 'capture survives removing recall');
  assert.doesNotMatch(captureOnly!, /## Finding existing knowledge in OKF/);

  const recallOnly = removeSection(both, 'capture');
  assert.match(recallOnly!, /## Finding existing knowledge in OKF/, 'recall survives removing capture');
  assert.doesNotMatch(recallOnly!, /## Capturing knowledge into OKF/);
});

test('a pre-existing capture-only instructions file gains a correct recall section on reinstall', () => {
  const { home, bundle } = isolate();
  // Simulate a capture-only install from before recall existed: only the
  // capture section's marker, nothing else.
  writeFileSync(join(home, 'AGENTS.md'), [
    '<!-- okfctl:capture -->',
    '## Capturing knowledge into OKF',
    '',
    'old capture text',
    '<!-- /okfctl:capture -->',
    '',
  ].join('\n'));

  install(home, bundle, ['agents-md']);
  const agents = readFileSync(join(home, 'AGENTS.md'), 'utf8');
  assert.match(agents, /## Capturing knowledge into OKF/, 'the pre-existing capture section is refreshed');
  assert.match(agents, /## Finding existing knowledge in OKF/, 'a recall section is added alongside it');
});

const copilotHooks = (home: string) => join(home, '.copilot', 'hooks', 'okfctl.json');
const copilotInstructions = (home: string) => join(home, '.copilot', 'copilot-instructions.md');

test('copilot installs a Stop hook (flat entry shape), instructions and skills, and needs no arming hook', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['copilot']), 0);

  const config = JSON.parse(readFileSync(copilotHooks(home), 'utf8'));
  assert.equal(config.version, 1);
  assert.ok(Array.isArray(config.hooks.Stop), 'entries sit directly in the event array, no matcher-group wrapper');
  assert.equal(config.hooks.UserPromptSubmit, undefined, 'stop_hook_active is its own guard');
  assert.match(config.hooks.Stop[0].command, new RegExp(`okfctl hook copilot --every ${DEFAULT_CAPTURE_EVERY}`));
  assert.equal(config.hooks.Stop[0].type, 'command');

  assert.match(readFileSync(copilotInstructions(home), 'utf8'), /okfctl capture/);
  assert.equal(existsSync(join(home, '.github', 'copilot-instructions.md')), false, 'the old, wrong path is not written');

  assert.ok(existsSync(join(home, '.copilot', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(bundle, '.github', 'skills', 'okf-review', 'SKILL.md')));
});

test('copilot removal deletes the hook config, instructions section and skills', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['copilot']);
  assert.equal(install(home, bundle, ['copilot'], { remove: true }), 0);

  assert.equal(existsSync(copilotHooks(home)), false, 'a hook config that only held our entry is deleted');
  assert.equal(existsSync(copilotInstructions(home)), false, 'an instructions file that held nothing else is deleted');
  assert.equal(existsSync(join(home, '.copilot', 'skills', 'okf-capture', 'SKILL.md')), false);
  assert.equal(existsSync(join(bundle, '.github', 'skills', 'okf-review', 'SKILL.md')), false);
});

test('copilot preview enumerates every path for install and removal, writing nothing', () => {
  const { home, bundle } = isolate();
  assert.equal(install(home, bundle, ['copilot'], { dryRun: true }), 0);
  assert.equal(existsSync(copilotHooks(home)), false);
  assert.equal(existsSync(copilotInstructions(home)), false);

  install(home, bundle, ['copilot']);
  const beforeHooks = readFileSync(copilotHooks(home), 'utf8');
  const beforeInstructions = readFileSync(copilotInstructions(home), 'utf8');
  install(home, bundle, ['copilot'], { remove: true, dryRun: true });
  assert.equal(readFileSync(copilotHooks(home), 'utf8'), beforeHooks);
  assert.equal(readFileSync(copilotInstructions(home), 'utf8'), beforeInstructions);
});

test('a hand-added hook in copilot\'s dedicated config file survives install and removal', () => {
  const { home, bundle } = isolate();
  mkdirSync(join(home, '.copilot', 'hooks'), { recursive: true });
  writeFileSync(copilotHooks(home), JSON.stringify({
    version: 1,
    hooks: { Stop: [{ type: 'command', command: 'someone-elses-hook' }] },
  }, null, 2));

  install(home, bundle, ['copilot']);
  let config = JSON.parse(readFileSync(copilotHooks(home), 'utf8'));
  let commands = config.hooks.Stop.map((h: { command: string }) => h.command);
  assert.ok(commands.includes('someone-elses-hook'), 'a pre-existing entry stays registered');
  assert.ok(commands.some((c: string) => c.includes('okfctl hook')));

  install(home, bundle, ['copilot'], { remove: true });
  config = JSON.parse(readFileSync(copilotHooks(home), 'utf8'));
  commands = config.hooks.Stop.map((h: { command: string }) => h.command);
  assert.deepEqual(commands, ['someone-elses-hook'], 'only ours is gone, the file survives');
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
  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'worth-capturing.md')), false);
  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-recall', 'SKILL.md')), false);
  assert.equal(existsSync(join(bundle, '.claude', 'skills', 'okf-refine', 'refining-standard.md')), false);

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

test('a dry run on a fresh install previews the host plan, not just the bundle scaffold', () => {
  const { home, bundle } = isolate();
  const { code, out } = captured(() => runInit(bundle, {
    agent: ['claude-code'], home, command: '/usr/bin/okfctl', dryRun: true,
  }));
  assert.equal(code, 0);
  assert.match(out, /claude-code\s+install/, 'the host plan is named, not silently skipped');
  assert.match(out, /okf-capture/);
  assert.match(out, /settings\.json/);
  assert.equal(existsSync(settings(home)), false, 'still nothing written');
  assert.equal(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')), false);
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
  assert.equal(existsSync(copilotInstructions(home)), false);
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

  // Capture and recall work from any repository, so they are user scope.
  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'capture.md')));
  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-capture', 'worth-capturing.md')));
  assert.ok(existsSync(join(home, '.claude', 'skills', 'okf-recall', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.claude', 'commands', 'okf', 'recall.md')));

  // Curation happens where the knowledge lives, so it is project scope.
  for (const skill of ['okf-triage', 'okf-refine', 'okf-ingest', 'okf-promote', 'okf-review', 'okf-deprecate']) {
    assert.ok(existsSync(join(bundle, '.claude', 'skills', skill, 'SKILL.md')), `${skill} in the bundle`);
    assert.equal(existsSync(join(home, '.claude', 'skills', skill)), false, `${skill} is not user scope`);
  }
  assert.ok(existsSync(join(bundle, '.claude', 'skills', 'okf-refine', 'refining-standard.md')));
  assert.ok(existsSync(join(bundle, '.claude', 'commands', 'okf', 'review.md')));
  assert.equal(existsSync(join(home, '.claude', 'commands', 'okf', 'review.md')), false);
});

test('codex uses its own skills directories, at both scopes', () => {
  const { home, bundle } = isolate();
  install(home, bundle, ['codex']);

  assert.ok(existsSync(join(home, '.agents', 'skills', 'okf-capture', 'SKILL.md')));
  assert.ok(existsSync(join(home, '.agents', 'skills', 'okf-capture', 'worth-capturing.md')));
  assert.ok(existsSync(join(home, '.agents', 'skills', 'okf-recall', 'SKILL.md')));
  assert.ok(existsSync(join(bundle, '.agents', 'skills', 'okf-review', 'SKILL.md')));
  assert.ok(existsSync(join(bundle, '.agents', 'skills', 'okf-refine', 'refining-standard.md')));
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

  for (const resource of readSkillResources(CAPTURE_SKILL)) {
    assert.equal(
      readFileSync(join(home, '.claude', 'skills', CAPTURE_SKILL, resource.relPath), 'utf8'),
      resource.contents,
      `${resource.relPath} matches the packaged source`,
    );
  }
  for (const resource of readSkillResources('okf-refine')) {
    assert.equal(
      readFileSync(join(bundle, '.claude', 'skills', 'okf-refine', resource.relPath), 'utf8'),
      resource.contents,
      `${resource.relPath} matches the packaged source`,
    );
  }
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

test('isInstalled is false before install, true after, false after --remove', () => {
  for (const name of ['claude-code', 'codex', 'copilot', 'agents-md']) {
    const { home, bundle } = isolate();
    const adapter = findAdapter(name);
    const context = { command: '/usr/bin/okfctl', every: 1, home, bundle };

    assert.equal(adapter.isInstalled(context), false, `${name}: not installed yet`);
    install(home, bundle, [name]);
    assert.equal(adapter.isInstalled(context), true, `${name}: installed`);
    quiet(() => runInit(bundle, { agent: [name], remove: true, home, command: '/usr/bin/okfctl' }));
    assert.equal(adapter.isInstalled(context), false, `${name}: removed`);
  }
});

test('isInstalled is not fooled by a pre-existing, unrelated config file', () => {
  const { home, bundle } = isolate();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), JSON.stringify({ someOtherSetting: true }));
  mkdirSync(join(home, '.copilot'), { recursive: true });
  writeFileSync(join(home, '.copilot', 'copilot-instructions.md'), '# My own notes\n');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, 'AGENTS.md'), '# My own notes\n');

  const context = { command: '/usr/bin/okfctl', every: 1, home, bundle };
  assert.equal(findAdapter('claude-code').isInstalled(context), false);
  assert.equal(findAdapter('copilot').isInstalled(context), false);
  assert.equal(findAdapter('agents-md').isInstalled(context), false);
});

test('isInstalled requires this bundle specifically, not just this host anywhere', () => {
  const { home, bundle } = isolate();
  const other = mkdtempSync(join(tmpdir(), 'okfctl-agentkb-other-'));
  install(home, bundle, ['claude-code']);

  const context = { command: '/usr/bin/okfctl', every: 1, home, bundle: other };
  assert.equal(
    findAdapter('claude-code').isInstalled(context),
    false,
    'capture is shared at user scope, but curation skills were never written into `other`',
  );
});

test('installedInterval reads back what was installed, and is null before install', () => {
  const { home, bundle } = isolate();
  assert.equal(installedInterval(settings(home), 'claude-code'), null);
  assert.equal(installedInterval(codexHooks(home), 'codex'), null);

  install(home, bundle, ['claude-code', 'codex'], { captureEvery: 7 });
  assert.equal(installedInterval(settings(home), 'claude-code'), 7);
  assert.equal(installedInterval(codexHooks(home), 'codex'), 7);
});

test('installedInterval is null against a config with an unrelated hooks entry', () => {
  const { home } = isolate();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(settings(home), JSON.stringify({
    hooks: { Stop: [{ hooks: [{ type: 'command', command: 'some-other-tool --flag' }] }] },
  }));
  assert.equal(installedInterval(settings(home), 'claude-code'), null);
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
