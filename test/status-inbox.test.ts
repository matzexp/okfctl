import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStatus } from '../src/commands/status.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-inbox-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
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

test('the inbox line names the count and the age of the oldest capture', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /Inbox/);
  assert.match(out, /drafts\/ 2 captured/);
  assert.match(out, /oldest \d+d/);
});

test('drafts-area concepts stay out of the default attention list', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.doesNotMatch(out, /drafts\/retry-budget/);
  assert.doesNotMatch(out, /drafts\/gateway-timeout/);
  // ...while whatever is actually rotting is still there.
  assert.match(out, /metrics\/revenue|metrics\/margin/);
});

test('--all restores the unsegregated attention list', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, all: true }));
  assert.match(out, /drafts\/retry-budget/);
  assert.match(out, /drafts\/gateway-timeout/);
});

test('--drafts drills into the inbox', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, drafts: true }));
  assert.match(out, /drafts\/retry-budget/);
  assert.match(out, /drafts\/gateway-timeout/);
  assert.doesNotMatch(out, /metrics\/revenue/);
});

test('a draft outside the drafts area is still flagged', () => {
  const root = sandbox();
  // metrics/revenue is status: draft in the fixture.
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /metrics\/revenue/);
});

test('drafts still count in the trust and lifecycle census', () => {
  const root = sandbox();
  const withDrafts = captured(() => runStatus({ bundle: root }));
  rmSync(join(root, 'drafts'), { recursive: true, force: true });
  const without = captured(() => runStatus({ bundle: root }));

  assert.match(withDrafts.out, /7 concepts/);
  assert.match(without.out, /5 concepts/);
  // The census counts them; only the attention list does not.
  const draftsCount = (text: string) => Number(/draft (\d+)/.exec(text)?.[1] ?? -1);
  assert.equal(draftsCount(withDrafts.out), draftsCount(without.out) + 2);
});

test('an empty or absent drafts area prints no inbox line', () => {
  const root = sandbox();
  rmSync(join(root, 'drafts'), { recursive: true, force: true });
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.doesNotMatch(out, /Inbox/);
});

test('--json carries the drafts area and a per-record flag', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, json: true }));
  const parsed = JSON.parse(out);
  assert.equal(parsed.draftsDir, 'drafts');
  const draft = parsed.concepts.find((c: { id: string }) => c.id === 'drafts/retry-budget');
  const metric = parsed.concepts.find((c: { id: string }) => c.id === 'metrics/revenue');
  assert.equal(draft.inDrafts, true);
  assert.equal(metric.inDrafts, false);
});

test('an overridden drafts area is what gets segregated', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, draftsDir: 'metrics' }));
  assert.match(out, /metrics\/ 3 captured/);
  assert.doesNotMatch(out, /metrics\/revenue/);
  // drafts/ is now ordinary corpus, so it is back in the attention list.
  assert.match(out, /drafts\/retry-budget/);
});

test('--drafts lists titles, because generated ids cannot be read', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, drafts: true }));
  assert.match(out, /TITLE/);
  assert.match(out, /Gateway timeout defaults are per-route/);
  assert.match(out, /Retry budgets are shared across a service/);
  assert.match(out, /CAPTURED/);
});

test('a concept with no title falls back to its filename stem', () => {
  const root = sandbox();
  writeFileSync(join(root, 'drafts/2026-08-22-abcdefgh-1.md'), '---\ntype: Note\n---\n\nbody\n');
  const { out } = captured(() => runStatus({ bundle: root, drafts: true }));
  assert.match(out, /2026-08-22-abcdefgh-1/, 'the stem stands in (SPEC 4.1)');
});

test('the default attention list keeps its columns', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /ID\s+STATUS\s+TRUST\s+FLAGS/);
  assert.doesNotMatch(out, /CAPTURED/, 'the title column is added only where ids are generated');
});
