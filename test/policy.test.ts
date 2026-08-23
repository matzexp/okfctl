import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../src/commands/init.ts';
import { loadBundle } from '../src/core/bundle.ts';
import {
  CONTENT_POLICY_FILE, FIELD_POLICY_FILE, POLICY_DIR, SOURCE_POLICY_FILE,
  contentPolicyTemplate, fieldPolicyTemplate, sourcePolicyTemplate,
} from '../src/core/policy.ts';

function isolate(): string {
  const home = mkdtempSync(join(tmpdir(), 'okfctl-policy-home-'));
  process.env.OKFCTL_CONFIG_HOME = join(home, 'config');
  process.env.OKFCTL_STATE_HOME = join(home, 'state');
  return home;
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

test('init creates all three policy files with non-empty, real content', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-policy-'));
  assert.equal(quiet(() => runInit(root, {})), 0);

  const content = readFileSync(join(root, CONTENT_POLICY_FILE), 'utf8');
  const source = readFileSync(join(root, SOURCE_POLICY_FILE), 'utf8');
  const field = readFileSync(join(root, FIELD_POLICY_FILE), 'utf8');

  assert.equal(content, contentPolicyTemplate());
  assert.equal(source, sourcePolicyTemplate());
  assert.equal(field, fieldPolicyTemplate());

  // Real guidance, not a placeholder — long enough to be more than a stub, and
  // each names the skill(s) that read it.
  assert.ok(content.length > 500);
  assert.match(content, /okf-capture/);
  assert.match(content, /okf-refine/);
  assert.ok(source.length > 300);
  assert.match(source, /okf-review/);
  assert.ok(field.length > 300);
  assert.match(field, /okf-ingest/);
});

test('a second init run leaves an edited policy file untouched', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-policy-'));
  quiet(() => runInit(root, {}));

  const edited = '# My own content policy\n\nOnly capture things about the payments service.\n';
  writeFileSync(join(root, CONTENT_POLICY_FILE), edited);

  quiet(() => runInit(root, {}));
  assert.equal(readFileSync(join(root, CONTENT_POLICY_FILE), 'utf8'), edited);
  // The other two, untouched by the user, are still the seeded template.
  assert.equal(readFileSync(join(root, SOURCE_POLICY_FILE), 'utf8'), sourcePolicyTemplate());
});

test('a partially-scaffolded policy directory is completed, not reset', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-policy-'));
  mkdirSync(join(root, POLICY_DIR), { recursive: true });
  const edited = '# Already had this one\n';
  writeFileSync(join(root, CONTENT_POLICY_FILE), edited);

  quiet(() => runInit(root, {}));

  assert.equal(readFileSync(join(root, CONTENT_POLICY_FILE), 'utf8'), edited, 'existing file untouched');
  assert.ok(existsSync(join(root, SOURCE_POLICY_FILE)), 'missing file created');
  assert.ok(existsSync(join(root, FIELD_POLICY_FILE)), 'missing file created');
});

test('.okf/policy/ contributes no concepts, even with content that looks like frontmatter', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-policy-'));
  quiet(() => runInit(root, {}));
  // Sanity: even if a policy file happened to open with a `---` block, it must
  // still never be read as a concept, because the whole directory is skipped
  // before any file inside it is parsed.
  writeFileSync(join(root, CONTENT_POLICY_FILE), '---\ntype: Note\ntitle: Not a concept\n---\n\nBody.\n');

  const bundle = loadBundle(root);
  assert.equal(bundle.concepts.length, 0);
  assert.equal(bundle.concepts.some((c) => c.id.startsWith('.okf')), false);
});

test('an absent policy directory is not an error', () => {
  isolate();
  const root = mkdtempSync(join(tmpdir(), 'okfctl-policy-'));
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n');
  writeFileSync(join(root, 'log.md'), '# Directory Update Log\n');
  rmSync(join(root, POLICY_DIR), { recursive: true, force: true });

  const bundle = loadBundle(root);
  assert.equal(bundle.concepts.length, 0);
});
