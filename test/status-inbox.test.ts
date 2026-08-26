import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStatus } from '../src/commands/status.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

/** Run a command in `--json` mode and hand back the parsed payload. */
function capturedJson(run: () => number): { code: number; out: any } {
  const log = console.log;
  let text = '';
  console.log = (...args: unknown[]) => { text += `${args.join(' ')}\n`; };
  try {
    const code = run();
    return { code, out: JSON.parse(text) };
  } finally {
    console.log = log;
  }
}

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

test('the dumps inbox line names the count and the age of the oldest capture', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /Dumps/);
  assert.match(out, /dumps\/ 2 captured/);
  assert.match(out, /oldest \d+d/);
});

test('the drafts inbox line names the count and the age of the oldest refined entry', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /Drafts/);
  assert.match(out, /drafts\/ 1 refined/);
});

test('dumps- and drafts-area concepts stay out of the default attention list', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.doesNotMatch(out, /dumps\/retry-budget/);
  assert.doesNotMatch(out, /dumps\/gateway-timeout/);
  assert.doesNotMatch(out, /drafts\/timeout-mitigation/);
  // ...while whatever is actually rotting is still there.
  assert.match(out, /metrics\/revenue|metrics\/margin/);
});

test('--all restores the unsegregated attention list', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, all: true }));
  assert.match(out, /dumps\/retry-budget/);
  assert.match(out, /dumps\/gateway-timeout/);
  assert.match(out, /drafts\/timeout-mitigation/);
});

test('--dumps drills into the dumps inbox', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, dumps: true }));
  assert.match(out, /dumps\/retry-budget/);
  assert.match(out, /dumps\/gateway-timeout/);
  assert.doesNotMatch(out, /metrics\/revenue/);
  assert.doesNotMatch(out, /timeout-mitigation/);
});

test('--drafts drills into the drafts inbox', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, drafts: true }));
  assert.match(out, /timeout-mitigation/);
  assert.doesNotMatch(out, /metrics\/revenue/);
  assert.doesNotMatch(out, /gateway-timeout|retry-budget/);
});

test('a draft outside both inbox areas is still flagged', () => {
  const root = sandbox();
  // metrics/revenue is status: draft in the fixture.
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /metrics\/revenue/);
});

test('dumps and drafts still count in the trust and lifecycle census', () => {
  const root = sandbox();
  const withBoth = captured(() => runStatus({ bundle: root }));
  rmSync(join(root, 'dumps'), { recursive: true, force: true });
  rmSync(join(root, 'drafts'), { recursive: true, force: true });
  const without = captured(() => runStatus({ bundle: root }));

  assert.match(withBoth.out, /8 concepts/);
  assert.match(without.out, /5 concepts/);
  // The census counts them; only the attention list does not.
  const draftCount = (text: string) => Number(/draft (\d+)/.exec(text)?.[1] ?? -1);
  assert.equal(draftCount(withBoth.out), draftCount(without.out) + 3);
});

test('an empty or absent inbox prints no line for that inbox', () => {
  const root = sandbox();
  rmSync(join(root, 'dumps'), { recursive: true, force: true });
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.doesNotMatch(out, /Dumps/);
  assert.match(out, /Drafts/);
});

test('--json carries both areas and per-record flags', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, json: true }));
  const parsed = JSON.parse(out);
  assert.equal(parsed.dumpsDir, 'dumps');
  assert.equal(parsed.draftsDir, 'drafts');
  const dump = parsed.concepts.find((c: { id: string }) => c.id === 'dumps/retry-budget');
  const draft = parsed.concepts.find((c: { id: string }) => c.id === 'drafts/timeout-mitigation');
  const metric = parsed.concepts.find((c: { id: string }) => c.id === 'metrics/revenue');
  assert.equal(dump.inDumps, true);
  assert.equal(dump.inDrafts, false);
  assert.equal(draft.inDrafts, true);
  assert.equal(draft.inDumps, false);
  assert.equal(metric.inDumps, false);
  assert.equal(metric.inDrafts, false);
});

test('an overridden dumps area is what gets segregated', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, dumpsDir: 'metrics' }));
  assert.match(out, /metrics\/ 3 captured/);
  assert.doesNotMatch(out, /metrics\/revenue/);
  // dumps/ is now ordinary corpus, so it is back in the attention list.
  assert.match(out, /dumps\/retry-budget/);
});

test('--dumps lists titles, because generated ids cannot be read', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root, dumps: true }));
  assert.match(out, /TITLE/);
  assert.match(out, /Gateway timeout defaults are per-route/);
  assert.match(out, /Retry budgets are shared across a service/);
  assert.match(out, /CAPTURED/);
});

test('a concept with no title falls back to its filename stem', () => {
  const root = sandbox();
  writeFileSync(join(root, 'dumps/2026-08-22-abcdefgh-1.md'), '---\ntype: Note\n---\n\nbody\n');
  const { out } = captured(() => runStatus({ bundle: root, dumps: true }));
  assert.match(out, /2026-08-22-abcdefgh-1/, 'the stem stands in (SPEC 4.1)');
});

test('the default attention list keeps its columns', () => {
  const root = sandbox();
  const { out } = captured(() => runStatus({ bundle: root }));
  assert.match(out, /ID\s+STATUS\s+TRUST\s+FLAGS/);
  assert.doesNotMatch(out, /CAPTURED/, 'the title column is added only where ids are generated');
});

// --- orphans ----------------------------------------------------------------

test('a placed concept nothing links to is an orphan; a linked one is not', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-orphan-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Orphans\n');
  const concept = (id: string, body: string) =>
    writeFileSync(join(root, `${id}.md`), ['---', 'type: Note', `title: ${id}`, '---', '', body].join('\n'));

  concept('linker', 'See [the target](/target.md).');
  concept('target', 'Linked from elsewhere.');
  concept('lonely', 'Nothing points here.');

  const { code, out } = capturedJson(() => runStatus({ bundle: root, json: true }));
  assert.equal(code, 0);
  const byId = new Map(out.concepts.map((row: any) => [row.id, row]));
  assert.equal(byId.get('target').orphan, false);
  assert.equal(byId.get('lonely').orphan, true);
  assert.equal(byId.get('linker').orphan, true, 'linking out does not make you reachable');
});

test('the holding areas are exempt: an unplaced entry has no inbound links yet', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-orphan-areas-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Areas\n');
  mkdirSync(join(root, 'dumps'));
  mkdirSync(join(root, 'drafts'));
  for (const id of ['dumps/raw', 'drafts/refined']) {
    writeFileSync(join(root, `${id}.md`), ['---', 'type: Note', 'title: t', '---', '', 'x'].join('\n'));
  }

  const { out } = capturedJson(() => runStatus({ bundle: root, json: true }));
  assert.equal(out.concepts.every((row: any) => row.orphan === false), true);
});

test('--orphan filters to exactly those concepts', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-orphan-filter-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Filter\n');
  writeFileSync(join(root, 'a.md'), '---\ntype: Note\ntitle: a\n---\n\nSee [b](/b.md).');
  writeFileSync(join(root, 'b.md'), '---\ntype: Note\ntitle: b\n---\n\nEnd.');

  const { out } = capturedJson(() => runStatus({ bundle: root, orphan: true, json: true }));
  assert.deepEqual(out.concepts.map((row: any) => row.id), ['a']);
});
