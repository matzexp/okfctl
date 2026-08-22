import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, findConcept } from '../src/core/bundle.ts';
import { runMove } from '../src/commands/move.ts';
import { runIndex, regenerateIndexes } from '../src/commands/index-gen.ts';
import { conceptRefs, readLinkSpans, inboundLinks } from '../src/core/refs.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));
const BY = 'human:matze';

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-move-'));
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

/** A linking concept whose body exercises every form the rewriter must handle. */
function withLinks(root: string): void {
  writeFileSync(join(root, 'metrics/linker.md'), [
    '---',
    'type: Metric',
    'title: Linker',
    'status: stable',
    '---',
    '',
    '# Linker',
    '',
    'Root absolute: [a](/drafts/retry-budget.md)',
    'Relative: [b](../drafts/retry-budget.md)',
    'With fragment: [c](/drafts/retry-budget.md#retry-budgets-are-shared-across-a-service)',
    'Already broken: [d](/drafts/gone-missing.md)',
    'External: [e](https://example.com/drafts/retry-budget.md)',
    'Bare prose mention of drafts/retry-budget.md stays put.',
    'Inline code `drafts/retry-budget.md` stays put.',
    '',
    '```sh',
    'cat drafts/retry-budget.md',
    '```',
    '',
  ].join('\n'));
}

test('a move changes the id and leaves nothing behind', () => {
  const root = sandbox();
  const code = quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  assert.equal(code, 0);
  assert.equal(existsSync(join(root, 'drafts/retry-budget.md')), false);
  assert.ok(existsSync(join(root, 'metrics/retry-budget.md')));
  assert.equal(findConcept(loadBundle(root), 'metrics/retry-budget').id, 'metrics/retry-budget');
});

test('a move is not a promotion', () => {
  const root = sandbox();
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  const raw = readFileSync(join(root, 'metrics/retry-budget.md'), 'utf8');
  assert.match(raw, /^status: draft$/m);
  assert.doesNotMatch(raw, /^verified:/m);
  assert.doesNotMatch(raw, /^stale_after:/m);
});

test('unknown producer keys survive a move', () => {
  const root = sandbox();
  quiet(() => runMove('metrics/revenue', 'computations/revenue-moved', { bundle: root, by: BY }));
  assert.match(readFileSync(join(root, 'computations/revenue-moved.md'), 'utf8'), /^custom_producer_key: keep-me$/m);
});

test('resolved inbound links follow the move, in the form the author used', () => {
  const root = sandbox();
  withLinks(root);
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  const raw = readFileSync(join(root, 'metrics/linker.md'), 'utf8');

  assert.match(raw, /\[a\]\(\/metrics\/retry-budget\.md\)/, 'root-absolute stays root-absolute');
  assert.match(raw, /\[b\]\(\.\/retry-budget\.md\)/, 'relative is recomputed and stays relative');
  assert.match(raw, /\[c\]\(\/metrics\/retry-budget\.md#retry-budgets-are-shared-across-a-service\)/, 'fragment rides along');
});

test('an already-broken link is not touched', () => {
  const root = sandbox();
  withLinks(root);
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  assert.match(readFileSync(join(root, 'metrics/linker.md'), 'utf8'), /\[d\]\(\/drafts\/gone-missing\.md\)/);
});

test('prose, code spans, fences and external links are left alone', () => {
  const root = sandbox();
  withLinks(root);
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  const raw = readFileSync(join(root, 'metrics/linker.md'), 'utf8');

  assert.match(raw, /\[e\]\(https:\/\/example\.com\/drafts\/retry-budget\.md\)/);
  assert.match(raw, /Bare prose mention of drafts\/retry-budget\.md stays put\./);
  assert.match(raw, /Inline code `drafts\/retry-budget\.md` stays put\./);
  assert.match(raw, /cat drafts\/retry-budget\.md/);
});

test('a move breaks no link that resolved before it', () => {
  const root = sandbox();
  withLinks(root);

  // The fixture carries deliberately-unresolved links for the refs tests, so the
  // claim is that a move adds none — not that the bundle is clean.
  const unresolved = (dir: string) =>
    loadBundle(dir).concepts.flatMap((concept) =>
      conceptRefs(concept, { root: dir }).links.filter((link) => link.state === 'unresolved'),
    ).length;

  const before = unresolved(root);
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  assert.equal(unresolved(root), before, 'a relocation must not orphan a link that resolved');
});

test('both indexes are regenerated', () => {
  const root = sandbox();
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  assert.doesNotMatch(readFileSync(join(root, 'drafts/index.md'), 'utf8'), /retry-budget/);
  assert.match(readFileSync(join(root, 'metrics/index.md'), 'utf8'), /retry-budget\.md/);
});

test('the move is logged with both ids', () => {
  const root = sandbox();
  quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
  const log = readFileSync(join(root, 'log.md'), 'utf8');
  assert.match(log, /\*\*Moved\*\*/);
  assert.match(log, /drafts\/retry-budget/);
  assert.match(log, /metrics\/retry-budget/);
});

test('an existing target is refused and nothing changes', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'metrics/revenue.md'), 'utf8');
  const code = quiet(() => runMove('computations/revenue', 'metrics/revenue', { bundle: root, by: BY }));
  assert.equal(code, 1);
  assert.equal(readFileSync(join(root, 'metrics/revenue.md'), 'utf8'), before);
  assert.ok(existsSync(join(root, 'computations/revenue.md')));
});

test('a reserved target is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runMove('drafts/retry-budget', 'metrics/index', { bundle: root, by: BY })), 1);
  assert.equal(quiet(() => runMove('drafts/retry-budget', 'metrics/log', { bundle: root, by: BY })), 1);
});

test('an ambiguous or missing source is refused with the candidates', () => {
  const root = sandbox();
  assert.equal(quiet(() => runMove('revenue', 'metrics/x', { bundle: root, by: BY })), 1);
  assert.equal(quiet(() => runMove('nope', 'metrics/x', { bundle: root, by: BY })), 1);
});

test('a missing actor is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root })), 1);
  assert.ok(existsSync(join(root, 'drafts/retry-budget.md')));
});

test('a directory target keeps the concept stem', () => {
  const root = sandbox();
  quiet(() => runMove('drafts/retry-budget', 'metrics/', { bundle: root, by: BY }));
  assert.ok(existsSync(join(root, 'metrics/retry-budget.md')));
});

test('a dry run writes nothing', () => {
  const root = sandbox();
  withLinks(root);
  const linker = readFileSync(join(root, 'metrics/linker.md'), 'utf8');
  const log = readFileSync(join(root, 'log.md'), 'utf8');

  const code = quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY, dryRun: true }));
  assert.equal(code, 0);
  assert.ok(existsSync(join(root, 'drafts/retry-budget.md')));
  assert.equal(existsSync(join(root, 'metrics/retry-budget.md')), false);
  assert.equal(readFileSync(join(root, 'metrics/linker.md'), 'utf8'), linker);
  assert.equal(readFileSync(join(root, 'log.md'), 'utf8'), log);
});

test('a failure partway through restores the bundle', () => {
  const root = sandbox();
  withLinks(root);
  const linkerBefore = readFileSync(join(root, 'metrics/linker.md'), 'utf8');

  // Make the target directory unwritable so the rename fails after the link
  // rewrite has already been applied.
  const blocked = join(root, 'locked');
  writeFileSync(join(root, 'metrics/placeholder.md'), '---\ntype: Metric\ntitle: P\n---\n');
  chmodSync(join(root, 'metrics'), 0o555);
  try {
    const code = quiet(() => runMove('drafts/retry-budget', 'metrics/retry-budget', { bundle: root, by: BY }));
    if (code === 0) return; // running as root; the write could not be blocked
    assert.equal(readFileSync(join(root, 'metrics/linker.md'), 'utf8'), linkerBefore, 'link rewrite rolled back');
    assert.ok(existsSync(join(root, 'drafts/retry-budget.md')), 'source restored');
  } finally {
    chmodSync(join(root, 'metrics'), 0o755);
  }
});

test('inboundLinks reports only what resolved, with offsets into the body', () => {
  const root = sandbox();
  withLinks(root);
  const bundle = loadBundle(root);
  const found = inboundLinks(bundle.concepts, 'drafts/retry-budget.md', root);
  assert.equal(found.length, 3, 'three resolved links; the broken, external and prose forms are not links to it');

  const linker = bundle.concepts.find((c) => c.id === 'metrics/linker')!;
  for (const { span } of found) {
    assert.equal(linker.body.slice(span.start, span.end), span.target);
  }
});

test('readLinkSpans locates repeated targets independently', () => {
  const root = sandbox();
  const bundle = loadBundle(root);
  const concept = { ...bundle.concepts[0], body: 'x [a](/a.md) y [b](/a.md) z' };
  const spans = readLinkSpans(concept);
  assert.equal(spans.length, 2);
  assert.notEqual(spans[0].start, spans[1].start);
  assert.equal(concept.body.slice(spans[1].start, spans[1].end), '/a.md');
});

test('targeted regeneration rewrites only the named directories', () => {
  const root = sandbox();
  // Bring every index up to date first, so any later difference is the move's.
  quiet(() => runIndex({ bundle: root }));
  const snapshot = new Map(
    loadBundle(root).indexFiles.map((rel) => [rel, readFileSync(join(root, rel), 'utf8')]),
  );

  const written = regenerateIndexes(loadBundle(root), ['metrics']);
  assert.deepEqual(written, [], 'an index already in sync is not rewritten');

  writeFileSync(join(root, 'metrics/late.md'), '---\ntype: Metric\ntitle: Late\n---\n');
  const after = regenerateIndexes(loadBundle(root), ['metrics']);
  assert.deepEqual(after, ['metrics/index.md']);

  for (const [rel, before] of snapshot) {
    if (rel === 'metrics/index.md') continue;
    assert.equal(readFileSync(join(root, rel), 'utf8'), before, `${rel} must be untouched`);
  }
});

test('targeted regeneration creates an index for a directory that lacks one', () => {
  const root = sandbox();
  mkdirSync(join(root, 'guides'), { recursive: true });
  writeFileSync(join(root, 'guides/onboarding.md'), '---\ntype: Guide\ntitle: Onboarding\n---\n');
  assert.equal(existsSync(join(root, 'guides/index.md')), false);

  const written = regenerateIndexes(loadBundle(root), ['guides']);
  assert.deepEqual(written, ['guides/index.md']);
  assert.match(readFileSync(join(root, 'guides/index.md'), 'utf8'), /onboarding\.md/);
});
