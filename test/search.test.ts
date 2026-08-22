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
