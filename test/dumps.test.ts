import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { DEFAULT_DUMPS_DIR, dumpConcepts, inDumps, resolveDumpsDir } from '../src/core/dumps.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-dumps-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test('the dumps area defaults to dumps/ at the bundle root', () => {
  const root = sandbox();
  assert.equal(resolveDumpsDir(root), DEFAULT_DUMPS_DIR);
  assert.equal(resolveDumpsDir(root, '   '), DEFAULT_DUMPS_DIR);
});

test('an override replaces the default, and dumps/ then means nothing', () => {
  const root = sandbox();
  const dir = resolveDumpsDir(root, 'inbox');
  assert.equal(dir, 'inbox');
  assert.equal(inDumps('inbox/thing', dir), true);
  assert.equal(inDumps('dumps/gateway-timeout', dir), false);
});

test('an override may be nested, absolute, or slash-decorated', () => {
  const root = sandbox();
  assert.equal(resolveDumpsDir(root, 'scratch/inbox'), 'scratch/inbox');
  assert.equal(resolveDumpsDir(root, './inbox/'), 'inbox');
  assert.equal(resolveDumpsDir(root, join(root, 'inbox')), 'inbox');
});

test('a dumps area outside the bundle is refused', () => {
  const root = sandbox();
  assert.throws(() => resolveDumpsDir(root, '../elsewhere'), /outside the bundle/);
  assert.throws(() => resolveDumpsDir(root, '/tmp'), /outside the bundle/);
  // The bundle root itself is not a dumps area either.
  assert.throws(() => resolveDumpsDir(root, '.'), /outside the bundle/);
});

test('membership is by path prefix, at any depth', () => {
  assert.equal(inDumps('dumps/gateway', 'dumps'), true);
  assert.equal(inDumps('dumps/infra/gateway', 'dumps'), true);
  assert.equal(inDumps('dumps', 'dumps'), true);
  assert.equal(inDumps('dumpster/gateway', 'dumps'), false);
  assert.equal(inDumps('metrics/revenue', 'dumps'), false);
});

test('the fixture dumps area loads as ordinary concepts', () => {
  const root = sandbox();
  const bundle = loadBundle(root);
  const dumps = dumpConcepts(bundle, 'dumps');
  assert.deepEqual(dumps.map((c) => c.id), ['dumps/gateway-timeout', 'dumps/retry-budget']);
  // Conformant on the first read: they carry a type, like any other concept.
  assert.equal(dumps[0].data.type, 'Note');
  assert.equal(dumps[0].data.status, 'draft');
  assert.equal(dumps[0].data.verified, undefined);
});

test('an absent dumps area reads as empty rather than erroring', () => {
  const root = sandbox();
  rmSync(join(root, 'dumps'), { recursive: true, force: true });
  const bundle = loadBundle(root);
  assert.deepEqual(dumpConcepts(bundle, 'dumps'), []);
  // Reading must not conjure the directory.
  assert.equal(existsSync(join(root, 'dumps')), false);
});
