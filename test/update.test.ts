import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.ts';
import { runUpdate } from '../src/commands/update.ts';
import { DEFAULT_CAPTURE_EVERY } from '../src/commands/init.ts';
import { ADAPTERS, installedInterval } from '../src/core/agents/hosts.ts';
import { readSkill } from '../src/core/agents/sources.ts';
import { registeredBundle } from '../src/core/userconfig.ts';

function isolate(): { home: string; bundle: string } {
  const base = mkdtempSync(join(tmpdir(), 'okfctl-update-'));
  process.env.OKFCTL_CONFIG_HOME = join(base, 'config');
  process.env.OKFCTL_STATE_HOME = join(base, 'state');
  const home = join(base, 'home');
  mkdirSync(home, { recursive: true });
  return { home, bundle: mkdtempSync(join(tmpdir(), 'okfctl-updatekb-')) };
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

test('nothing installed: reports plainly, writes nothing, exits zero', () => {
  const { home, bundle } = isolate();
  const { code, out } = captured(() =>
    runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  assert.equal(code, 0);
  assert.match(out, /nothing installed/);
  assert.match(out, /init .* --agent/);
  assert.equal(existsSync(join(home, '.claude')), false);
});

test('only installed hosts are touched', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  assert.ok(existsSync(settings(home)));
  assert.equal(existsSync(codexHooks(home)), false, 'codex was never installed, so update never touches it');
});

test('update refreshes an outdated skill copy to the packaged one', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  const skillFile = join(bundle, '.claude', 'skills', 'okf-review', 'SKILL.md');
  writeFileSync(skillFile, 'stale\n');
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  assert.equal(readFileSync(skillFile, 'utf8'), readSkill('okf-review'));
});

test('the installed interval is preserved by default', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], captureEvery: 5, home, command: '/usr/bin/okfctl' }));
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  const config = JSON.parse(readFileSync(settings(home), 'utf8'));
  assert.match(config.hooks.Stop[0].hooks[0].command, /--every 5/);
});

test('--capture-every overrides preservation for every host touched', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code', 'codex'], captureEvery: 5, home, command: '/usr/bin/okfctl' }));
  quiet(() => runUpdate(bundle, { captureEvery: 9, home, command: '/usr/bin/okfctl' }));
  const claude = JSON.parse(readFileSync(settings(home), 'utf8'));
  const codex = JSON.parse(readFileSync(codexHooks(home), 'utf8'));
  assert.match(claude.hooks.Stop[0].hooks[0].command, /--every 9/);
  assert.match(codex.hooks.Stop[0].hooks[0].command, /--every 9/);
});

test('hosts installed at different intervals each keep their own on update', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], captureEvery: 3, home, command: '/usr/bin/okfctl' }));
  quiet(() => runInit(bundle, { agent: ['codex'], captureEvery: 8, home, command: '/usr/bin/okfctl' }));
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  const claude = JSON.parse(readFileSync(settings(home), 'utf8'));
  const codex = JSON.parse(readFileSync(codexHooks(home), 'utf8'));
  assert.match(claude.hooks.Stop[0].hooks[0].command, /--every 3/);
  assert.match(codex.hooks.Stop[0].hooks[0].command, /--every 8/);
});

test('an invalid --capture-every is refused and nothing is written', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  const before = readFileSync(settings(home), 'utf8');
  const code = quiet(() => runUpdate(bundle, { captureEvery: 0, home, command: '/usr/bin/okfctl' }));
  assert.equal(code, 1);
  assert.equal(readFileSync(settings(home), 'utf8'), before);
});

test('a dry run writes nothing', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  const before = readFileSync(settings(home), 'utf8');
  const skillFile = join(bundle, '.claude', 'skills', 'okf-review', 'SKILL.md');
  writeFileSync(skillFile, 'stale\n');
  quiet(() => runUpdate(bundle, { dryRun: true, home, command: '/usr/bin/okfctl' }));
  assert.equal(readFileSync(settings(home), 'utf8'), before);
  assert.equal(readFileSync(skillFile, 'utf8'), 'stale\n');
});

test('update never scaffolds bundle files', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  // `init` itself scaffolds these; remove them so this test isolates what
  // `update` does on its own, rather than what `init` already did.
  rmSync(join(bundle, 'dumps'), { recursive: true, force: true });
  rmSync(join(bundle, 'drafts'), { recursive: true, force: true });
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  assert.equal(existsSync(join(bundle, 'dumps')), false);
  assert.equal(existsSync(join(bundle, 'drafts')), false);
});

test('update never touches registration', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: '/usr/bin/okfctl' }));
  assert.equal(registeredBundle(), null);
  quiet(() => runUpdate(bundle, { home, command: '/usr/bin/okfctl' }));
  assert.equal(registeredBundle(), null);
});

test('every hook-capable host keeps its own interval, copilot included', () => {
  for (const host of ['claude-code', 'codex', 'copilot']) {
    const { home, bundle } = isolate();
    quiet(() => runInit(bundle, { agent: [host], captureEvery: 7, home, command: 'okfctl' }));
    quiet(() => runUpdate(bundle, { home, command: 'okfctl' }));

    const adapter = ADAPTERS.find((a) => a.name === host)!;
    const configPath = adapter.hookConfigPath({ command: 'okfctl', every: 1, home, bundle })!;
    assert.equal(installedInterval(configPath, host), 7,
      `${host} lost the interval it was installed with`);
  }
});

test('every hook-capable adapter says where its hook config lives', () => {
  // The lookup this replaced lived in `update` and silently omitted copilot, so
  // a host added to ADAPTERS is asked here rather than trusted to be remembered.
  for (const adapter of ADAPTERS) {
    const context = { command: 'okfctl', every: 1, home: '/home/x', bundle: '/b' };
    const path = adapter.hookConfigPath(context);
    assert.equal(path !== null, adapter.hook,
      `${adapter.name}: a hook host must name a config path, and a hookless one must not`);
  }
});

test('an unreadable interval falls back to the tool default, not to every turn', () => {
  const { home, bundle } = isolate();
  quiet(() => runInit(bundle, { agent: ['claude-code'], captureEvery: 7, home, command: 'okfctl' }));

  // The install is still detected by its skills; only the config is gone.
  rmSync(join(home, '.claude', 'settings.json'));
  quiet(() => runUpdate(bundle, { home, command: 'okfctl' }));

  const settings = readFileSync(join(home, '.claude', 'settings.json'), 'utf8');
  assert.match(settings, new RegExp(`--every ${DEFAULT_CAPTURE_EVERY}`),
    'a host with nothing to read back lands where a fresh install would');
});
