import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { search } from '../src/core/search.ts';
import { runSearch } from '../src/commands/search.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

const ids = (bundle: ReturnType<typeof loadBundle>, query: string) =>
  search(bundle, query).map((hit) => hit.concept.id);

/** Capture stdout for the CLI-surface assertions. */
function captured(run: () => number): { code: number; lines: string[] } {
  const written: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => void written.push(args.join(' '));
  try {
    return { code: run(), lines: written };
  } finally {
    console.log = log;
  }
}

function emptyBundle(): string {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Empty\n');
  writeFileSync(join(root, 'log.md'), '# Directory Update Log\n');
  return root;
}

test('a query matches on title', () => {
  const bundle = loadBundle(FIXTURE);
  assert.ok(ids(bundle, 'margin').includes('metrics/margin'));
});

test('a query matches text found only in the body', () => {
  const bundle = loadBundle(FIXTURE);
  const concept = bundle.concepts.find((c) => c.id === 'metrics/revenue')!;
  assert.ok(!/fiscal/i.test(String(concept.data.title)), 'the term is not in the title');
  assert.ok(/fiscal/i.test(concept.body), 'the term is in the body');
  assert.ok(ids(bundle, 'fiscal').includes('metrics/revenue'));
});

test('a title match outranks a body-only match for the same term', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-'));
  mkdirSync(join(root, 'notes'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Rank\n');
  writeFileSync(
    join(root, 'notes', 'body-only.md'),
    '---\ntype: Note\ntitle: Something else entirely\n---\n\nThe word gateway appears here.\n',
  );
  writeFileSync(
    join(root, 'notes', 'in-title.md'),
    '---\ntype: Note\ntitle: Gateway timeouts\n---\n\nUnrelated prose.\n',
  );

  const ranked = ids(loadBundle(root), 'gateway');
  assert.deepEqual(ranked, ['notes/in-title', 'notes/body-only']);
});

test('a query with no matches returns nothing and the command still exits zero', () => {
  const bundle = loadBundle(FIXTURE);
  assert.deepEqual(search(bundle, 'zzzznotathinganywhere'), []);

  const { code, lines } = captured(() =>
    runSearch({ bundle: FIXTURE, query: 'zzzznotathinganywhere' }));
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /no matches/);
});

test('an empty bundle searches to zero results and exits zero', () => {
  const root = emptyBundle();
  assert.equal(loadBundle(root).concepts.length, 0);
  assert.deepEqual(search(loadBundle(root), 'anything'), []);

  const { code, lines } = captured(() => runSearch({ bundle: root, query: 'anything' }));
  assert.equal(code, 0);
  assert.match(lines.join('\n'), /no matches/);
});

test('--limit truncates and reports how many more matched', () => {
  const { lines } = captured(() => runSearch({ bundle: FIXTURE, query: 'revenue', limit: 1 }));
  const total = search(loadBundle(FIXTURE), 'revenue').length;
  assert.ok(total > 1, 'the fixture has more than one match to truncate');
  assert.equal(lines.filter((line) => line.trim()).length, 2, 'one result, one summary line');
  assert.match(lines.join('\n'), new RegExp(`${total - 1} more matches? not shown`));
});

test('a limit at or above the match count prints no summary line', () => {
  const { lines } = captured(() => runSearch({ bundle: FIXTURE, query: 'revenue', limit: 99 }));
  assert.ok(!lines.join('\n').includes('not shown'));
});

test('a non-positive limit is refused rather than silently corrected', () => {
  for (const limit of [0, -1, 1.5]) {
    assert.equal(runSearch({ bundle: FIXTURE, query: 'revenue', limit }), 1, `limit ${limit}`);
  }
});

test('search writes nothing to the bundle', () => {
  const before = loadBundle(FIXTURE);
  captured(() => runSearch({ bundle: FIXTURE, query: 'revenue' }));
  const after = loadBundle(FIXTURE);
  assert.deepEqual(
    after.concepts.map((c) => c.id),
    before.concepts.map((c) => c.id),
  );
  assert.equal(after.catalogFile, before.catalogFile);
});

test('a concept without a title is found and falls back to its filename stem', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Untitled\n');
  writeFileSync(join(root, 'untitled-thing.md'), '---\ntype: Note\n---\n\nBody about kubelets.\n');

  assert.deepEqual(ids(loadBundle(root), 'kubelets'), ['untitled-thing']);
  const { lines } = captured(() => runSearch({ bundle: root, query: 'kubelets' }));
  assert.match(lines.join('\n'), /untitled-thing/);
});

test('each hit carries its area', () => {
  const bundle = loadBundle(FIXTURE);
  const hits = search(bundle, 'gateway timeout');
  const dump = hits.find((h) => h.concept.id === 'dumps/gateway-timeout');
  const draft = hits.find((h) => h.concept.id === 'drafts/timeout-mitigation');
  const corpus = hits.find((h) => h.concept.id.startsWith('metrics/'));
  assert.equal(dump?.area, 'dumps');
  assert.equal(draft?.area, 'drafts');
  if (corpus) assert.equal(corpus.area, 'corpus');
});

test('each hit carries its trust tier', () => {
  const bundle = loadBundle(FIXTURE);
  const hits = search(bundle, 'gateway');
  const dump = hits.find((h) => h.concept.id === 'dumps/gateway-timeout');
  assert.equal(dump?.tier, 'unverified');
});

function rankingBundle(): string {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-rank-'));
  mkdirSync(join(root, 'decisions'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Rank\n');
  return root;
}

test('trust tier breaks a near-tie: same term, same field, higher trust ranks first', () => {
  const root = rankingBundle();
  writeFileSync(
    join(root, 'decisions', 'unverified-timeout.md'),
    '---\ntype: Decision\ntitle: Timeout policy for the edge\nstatus: draft\n---\n\nBody.\n',
  );
  writeFileSync(
    join(root, 'decisions', 'reviewed-timeout.md'),
    [
      '---',
      'type: Decision',
      'title: Timeout policy at the edge',
      'status: stable',
      'generated: { by: agent/1.0, at: 2026-01-01T00:00:00Z }',
      'verified:',
      '  - { by: human:matze, at: 2026-01-02T00:00:00Z }',
      '---',
      '',
      'Body.',
      '',
    ].join('\n'),
  );

  const ranked = search(loadBundle(root), 'timeout policy edge').map((h) => h.concept.id);
  assert.deepEqual(ranked, ['decisions/reviewed-timeout', 'decisions/unverified-timeout']);
});

test('strong relevance still beats trust tier: a title match outranks a distant body match', () => {
  const root = rankingBundle();
  // Higher trust, but the term only appears once, deep in the body.
  writeFileSync(
    join(root, 'decisions', 'reviewed-unrelated.md'),
    [
      '---',
      'type: Decision',
      'title: Something entirely unrelated',
      'status: stable',
      'generated: { by: agent/1.0, at: 2026-01-01T00:00:00Z }',
      'verified:',
      '  - { by: human:matze, at: 2026-01-02T00:00:00Z }',
      '---',
      '',
      'A long document that, somewhere in the middle, happens to mention gateway once.',
      '',
    ].join('\n'),
  );
  // Unverified, but the term is right in the title.
  writeFileSync(
    join(root, 'decisions', 'unverified-match.md'),
    '---\ntype: Decision\ntitle: Gateway\nstatus: draft\n---\n\nUnrelated body text.\n',
  );

  const ranked = search(loadBundle(root), 'gateway').map((h) => h.concept.id);
  assert.deepEqual(ranked, ['decisions/unverified-match', 'decisions/reviewed-unrelated']);
});

test('--format json includes area, tier and score per result', () => {
  const { code, lines } = captured(() => runSearch({ bundle: FIXTURE, query: 'timeout', format: 'json' }));
  assert.equal(code, 0);
  const parsed = JSON.parse(lines.join('\n'));
  assert.equal(parsed.query, 'timeout');
  assert.ok(Array.isArray(parsed.results));
  assert.ok(parsed.results.length > 0);
  const first = parsed.results[0];
  assert.ok('id' in first && 'title' in first && 'area' in first && 'tier' in first && 'score' in first);
});

test('--format json respects --limit', () => {
  const { lines } = captured(() => runSearch({ bundle: FIXTURE, query: 'revenue', limit: 1, format: 'json' }));
  const parsed = JSON.parse(lines.join('\n'));
  assert.equal(parsed.results.length, 1);
  assert.ok(parsed.total >= 1);
});

test('--format json on zero matches is a valid, empty result list', () => {
  const { code, lines } = captured(() =>
    runSearch({ bundle: FIXTURE, query: 'zzzznotathinganywhere', format: 'json' }));
  assert.equal(code, 0);
  const parsed = JSON.parse(lines.join('\n'));
  assert.deepEqual(parsed.results, []);
  assert.equal(parsed.total, 0);
});
