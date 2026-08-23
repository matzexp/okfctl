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
  const dir = resolveDraftsDir(root, 'staging');
  assert.equal(dir, 'staging');
  assert.equal(inDrafts('staging/thing', dir), true);
  assert.equal(inDrafts('drafts/timeout-mitigation', dir), false);
});

test('an override may be nested, absolute, or slash-decorated', () => {
  const root = sandbox();
  assert.equal(resolveDraftsDir(root, 'scratch/staging'), 'scratch/staging');
  assert.equal(resolveDraftsDir(root, './staging/'), 'staging');
  assert.equal(resolveDraftsDir(root, join(root, 'staging')), 'staging');
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

test('drafts and dumps are independent areas', () => {
  assert.equal(inDrafts('dumps/gateway-timeout', 'drafts'), false);
});

test('the fixture drafts area loads as ordinary, refined concepts', () => {
  const root = sandbox();
  const bundle = loadBundle(root);
  const drafts = draftConcepts(bundle, 'drafts');
  assert.deepEqual(drafts.map((c) => c.id), ['drafts/timeout-mitigation']);
  // Refined: a real type, still status: draft, still unverified — refining is
  // not verifying.
  assert.equal(drafts[0].data.type, 'Runbook');
  assert.equal(drafts[0].data.status, 'draft');
  assert.equal(drafts[0].data.verified, undefined);
  // Carries provenance back to the dump it was refined from.
  const sources = drafts[0].data.sources as Array<{ resource: string }>;
  assert.equal(sources[0].resource, 'dumps/gateway-timeout');
});

test('an absent drafts area reads as empty rather than erroring', () => {
  const root = sandbox();
  rmSync(join(root, 'drafts'), { recursive: true, force: true });
  const bundle = loadBundle(root);
  assert.deepEqual(draftConcepts(bundle, 'drafts'), []);
  // Reading must not conjure the directory.
  assert.equal(existsSync(join(root, 'drafts')), false);
});
