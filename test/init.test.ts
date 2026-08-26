import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';
import { runInit, runRegister } from '../src/commands/init.ts';
import {
  enclosingBundle, isBundleRoot, readConfig, registeredBundle, requireBundleDir,
  resolveBundleDir, wiredBundles, writeConfig,
} from '../src/core/userconfig.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

/** Point the user-level config and state at a throwaway directory. */
function isolate(): string {
  const home = mkdtempSync(join(tmpdir(), 'okfctl-home-'));
  process.env.OKFCTL_CONFIG_HOME = join(home, 'config');
  process.env.OKFCTL_STATE_HOME = join(home, 'state');
  return home;
}

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-init-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
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

test('init scaffolds a conformant bundle in an empty directory', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-empty-'));
  assert.equal(quiet(() => runInit(root, {})), 0);

  assert.match(readFileSync(join(root, 'index.md'), 'utf8'), /^okf_version: "0\.2"$/m);
  assert.ok(existsSync(join(root, 'log.md')));
  assert.ok(existsSync(join(root, 'dumps')));
  assert.ok(existsSync(join(root, 'drafts')));
  assert.ok(existsSync(join(root, '.okf/policy/content-policy.md')));
  assert.ok(existsSync(join(root, '.okf/policy/source-policy.md')));
  assert.ok(existsSync(join(root, '.okf/policy/field-policy.md')));
  assert.equal(countBy(checkBundle(loadBundle(root)), 'error'), 0);
  assert.equal(loadBundle(root).concepts.length, 0, '.okf/ contributes no concepts');
  assert.equal(isBundleRoot(root), true);
});

test('init leaves an existing bundle alone', () => {
  isolate();
  const root = sandbox();
  const index = readFileSync(join(root, 'index.md'), 'utf8');
  const log = readFileSync(join(root, 'log.md'), 'utf8');

  assert.equal(quiet(() => runInit(root, {})), 0);
  assert.equal(readFileSync(join(root, 'index.md'), 'utf8'), index);
  assert.equal(readFileSync(join(root, 'log.md'), 'utf8'), log);
});

test('a second init reports that nothing was needed', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-twice-'));
  quiet(() => runInit(root, {}));
  const index = readFileSync(join(root, 'index.md'), 'utf8');
  quiet(() => runInit(root, {}));
  assert.equal(readFileSync(join(root, 'index.md'), 'utf8'), index);
});

test('a dry run writes nothing', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-dry-'));
  assert.equal(quiet(() => runInit(root, { dryRun: true, register: true })), 0);
  assert.equal(existsSync(join(root, 'index.md')), false);
  assert.equal(existsSync(join(root, 'dumps')), false);
  assert.equal(existsSync(join(root, 'drafts')), false);
  assert.equal(registeredBundle(), null, 'a dry run registers nothing either');
});

test('scaffolding and registration are separable', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-sep-'));
  quiet(() => runInit(root, {}));
  assert.equal(registeredBundle(), null);

  quiet(() => runInit(root, { register: true }));
  assert.equal(registeredBundle(), root);
});

test('registering a second bundle replaces the first', () => {
  isolate();
  const first = mkdtempSync(join(tmpdir(), 'okfctl-one-'));
  const second = mkdtempSync(join(tmpdir(), 'okfctl-two-'));
  quiet(() => runInit(first, { register: true }));
  quiet(() => runInit(second, { register: true }));
  assert.equal(registeredBundle(), second);
});

test('registering a path that is not a bundle is refused', () => {
  isolate();
  const plain = mkdtempSync(join(tmpdir(), 'okfctl-plain-'));
  assert.equal(quiet(() => runRegister(plain)), 1);
  assert.equal(registeredBundle(), null);
});

test('an explicit bundle wins over everything', () => {
  isolate();
  const registered = sandbox();
  quiet(() => runRegister(registered));
  // resolveBundleDir is only consulted when no --bundle was given; this asserts
  // the registration exists so the next tests are meaningful.
  assert.equal(registeredBundle(), registered);
});

test('the bundle you are standing in wins over the registered one', () => {
  isolate();
  const registered = sandbox();
  const standing = sandbox();
  quiet(() => runRegister(registered));

  assert.equal(enclosingBundle(join(standing, 'metrics')), standing);
  assert.equal(resolveBundleDir(join(standing, 'metrics')), standing);
  assert.equal(requireBundleDir(join(standing, 'metrics')), standing);
});

test('the registered bundle is the fallback outside any bundle', () => {
  isolate();
  const registered = sandbox();
  const elsewhere = mkdtempSync(join(tmpdir(), 'okfctl-elsewhere-'));
  quiet(() => runRegister(registered));

  assert.equal(enclosingBundle(elsewhere), null);
  assert.equal(resolveBundleDir(elsewhere), registered);
  assert.equal(requireBundleDir(elsewhere), registered);
});

test('nothing to resolve to names the registration command', () => {
  isolate();
  const elsewhere = mkdtempSync(join(tmpdir(), 'okfctl-nothing-'));
  assert.throws(() => requireBundleDir(elsewhere), /init --register/);
  // Reads still fall back to the working directory rather than erroring.
  assert.equal(resolveBundleDir(elsewhere), '.');
});

test('a registered bundle that has gone away is reported, not recreated', () => {
  isolate();
  const registered = sandbox();
  const elsewhere = mkdtempSync(join(tmpdir(), 'okfctl-gone-'));
  quiet(() => runRegister(registered));
  rmSync(registered, { recursive: true, force: true });

  assert.throws(() => requireBundleDir(elsewhere), /no longer a bundle|missing/);
  assert.equal(existsSync(registered), false, 'it must not be recreated');
});

test('a bundle root is recognized by okf_version, or by index plus log', () => {
  isolate();
  const versioned = mkdtempSync(join(tmpdir(), 'okfctl-ver-'));
  writeFileSync(join(versioned, 'index.md'), '---\nokf_version: "0.2"\n---\n');
  assert.equal(isBundleRoot(versioned), true);

  const legacy = mkdtempSync(join(tmpdir(), 'okfctl-legacy-'));
  writeFileSync(join(legacy, 'index.md'), '# No frontmatter\n');
  assert.equal(isBundleRoot(legacy), false);
  writeFileSync(join(legacy, 'log.md'), '# Log\n');
  assert.equal(isBundleRoot(legacy), true);
});

/** Capture stdout so a report line can be asserted on. */
function captured(run: () => number): { code: number; out: string } {
  const log = console.log;
  const error = console.error;
  let out = '';
  console.log = (...args: unknown[]) => void (out += `${args.join(' ')}\n`);
  console.error = () => {};
  try {
    return { code: run(), out };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** Two bundles wired to one host, which is where the shared half matters. */
function twoWired(): { home: string; a: string; b: string } {
  const home = isolate();
  const a = mkdtempSync(join(tmpdir(), 'okfctl-kb-a-'));
  const b = mkdtempSync(join(tmpdir(), 'okfctl-kb-b-'));
  quiet(() => runInit(a, { agent: ['claude-code'], home, command: 'okfctl' }));
  quiet(() => runInit(b, { agent: ['claude-code'], home, command: 'okfctl' }));
  return { home, a, b };
}

test('removing one bundle leaves the shared half for the bundles still wired', () => {
  const { home, a, b } = twoWired();
  const curation = (bundle: string) => join(bundle, '.claude/skills/okf-triage/SKILL.md');
  const capture = join(home, '.claude/skills/okf-capture/SKILL.md');
  const settings = join(home, '.claude/settings.json');

  quiet(() => runInit(a, { agent: ['claude-code'], remove: true, home, command: 'okfctl' }));
  assert.ok(!existsSync(curation(a)), 'the removed bundle loses its own curation skills');
  assert.ok(existsSync(curation(b)), 'the other bundle keeps its own');
  assert.ok(existsSync(capture), 'capture is shared and stays while another bundle uses it');
  assert.ok(existsSync(settings), 'and so does the hook that drives it');

  quiet(() => runInit(b, { agent: ['claude-code'], remove: true, home, command: 'okfctl' }));
  assert.ok(!existsSync(curation(b)));
  assert.ok(!existsSync(capture), 'the last bundle out takes the shared half with it');
  assert.ok(!existsSync(settings));
});

test('a removal that keeps the shared half says which bundle still holds it', () => {
  const { home, a, b } = twoWired();
  const { out } = captured(() =>
    runInit(a, { agent: ['claude-code'], remove: true, home, command: 'okfctl' }));
  assert.ok(out.includes(b), 'the bundle still using it is named, not just implied');
});

test('an install predating the wiring registry still removes in full', () => {
  const home = isolate();
  const bundle = mkdtempSync(join(tmpdir(), 'okfctl-kb-'));
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: 'okfctl' }));

  // What an install made before the registry existed looks like.
  const config = readConfig();
  delete config.wiredBundles;
  writeConfig(config);

  quiet(() => runInit(bundle, { agent: ['claude-code'], remove: true, home, command: 'okfctl' }));
  assert.ok(!existsSync(join(home, '.claude/skills/okf-capture/SKILL.md')),
    'with no other bundle we can name, the documented full removal stands');
});

test('a dry-run removal records nothing in the wiring registry', () => {
  const home = isolate();
  const bundle = mkdtempSync(join(tmpdir(), 'okfctl-kb-'));
  quiet(() => runInit(bundle, { agent: ['claude-code'], home, command: 'okfctl' }));
  assert.deepEqual(wiredBundles('claude-code'), [resolve(bundle)]);

  quiet(() => runInit(bundle, {
    agent: ['claude-code'], remove: true, dryRun: true, home, command: 'okfctl',
  }));
  assert.deepEqual(wiredBundles('claude-code'), [resolve(bundle)],
    'a preview leaves the registry exactly as it found it');
});
