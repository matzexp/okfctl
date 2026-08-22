import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { DEFAULT_DRAFTS_DIR, draftConcepts, inDrafts, resolveDraftsDir } from '../src/core/drafts.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-drafts-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

test('the drafts area defaults to drafts/ at the bundle root', () => {
  const root = sandbox();
  assert.equal(resolveDraftsDir(root), DEFAULT_DRAFTS_DIR);
  assert.equal(resolveDraftsDir(root, '   '), DEFAULT_DRAFTS_DIR);
});

test('an override replaces the default, and drafts/ then means nothing', () => {
  const root = sandbox();
  const dir = resolveDraftsDir(root, 'inbox');
  assert.equal(dir, 'inbox');
  assert.equal(inDrafts('inbox/thing', dir), true);
  assert.equal(inDrafts('drafts/gateway-timeout', dir), false);
});

test('an override may be nested, absolute, or slash-decorated', () => {
  const root = sandbox();
  assert.equal(resolveDraftsDir(root, 'scratch/inbox'), 'scratch/inbox');
  assert.equal(resolveDraftsDir(root, './inbox/'), 'inbox');
  assert.equal(resolveDraftsDir(root, join(root, 'inbox')), 'inbox');
});

test('a drafts area outside the bundle is refused', () => {
  const root = sandbox();
  assert.throws(() => resolveDraftsDir(root, '../elsewhere'), /outside the bundle/);
  assert.throws(() => resolveDraftsDir(root, '/tmp'), /outside the bundle/);
  // The bundle root itself is not a drafts area either.
  assert.throws(() => resolveDraftsDir(root, '.'), /outside the bundle/);
});

test('membership is by path prefix, at any depth', () => {
  assert.equal(inDrafts('drafts/gateway', 'drafts'), true);
  assert.equal(inDrafts('drafts/infra/gateway', 'drafts'), true);
  assert.equal(inDrafts('drafts', 'drafts'), true);
  assert.equal(inDrafts('draftsmanship/gateway', 'drafts'), false);
  assert.equal(inDrafts('metrics/revenue', 'drafts'), false);
});

test('the fixture drafts area loads as ordinary concepts', () => {
  const root = sandbox();
  const bundle = loadBundle(root);
  const drafts = draftConcepts(bundle, 'drafts');
  assert.deepEqual(drafts.map((c) => c.id), ['drafts/gateway-timeout', 'drafts/retry-budget']);
  // Conformant on the first read: they carry a type, like any other concept.
  assert.equal(drafts[0].data.type, 'Note');
  assert.equal(drafts[0].data.status, 'draft');
  assert.equal(drafts[0].data.verified, undefined);
});

test('an absent drafts area reads as empty rather than erroring', () => {
  const root = sandbox();
  rmSync(join(root, 'drafts'), { recursive: true, force: true });
  const bundle = loadBundle(root);
  assert.deepEqual(draftConcepts(bundle, 'drafts'), []);
  // Reading must not conjure the directory.
  assert.equal(existsSync(join(root, 'drafts')), false);
});
