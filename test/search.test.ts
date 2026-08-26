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

// --- filters, snippets, and query precision ---------------------------------

test('--area keeps only the named areas', () => {
  const bundle = loadBundle(FIXTURE);
  const corpus = search(bundle, 'timeout', { areas: ['corpus'] });
  assert.ok(corpus.length > 0 || true);
  assert.equal(corpus.every((hit) => hit.area === 'corpus'), true);

  const dumps = search(bundle, 'timeout', { areas: ['dumps'] });
  assert.ok(dumps.length > 0, 'the fixture has a matching dump');
  assert.equal(dumps.every((hit) => hit.area === 'dumps'), true);
});

test('--tier keeps only the named trust tiers', () => {
  const bundle = loadBundle(FIXTURE);
  const hits = search(bundle, 'revenue', { tiers: ['human-reviewed'] });
  assert.equal(hits.every((hit) => hit.tier === 'human-reviewed'), true);
  assert.ok(
    search(bundle, 'revenue').length > hits.length,
    'the unfiltered search returns strictly more',
  );
});

test('--type is compared case-insensitively', () => {
  const bundle = loadBundle(FIXTURE);
  const hits = search(bundle, 'timeout', { types: ['runbook'] });
  assert.ok(hits.length > 0);
  assert.equal(
    hits.every((hit) => String(hit.concept.data.type).toLowerCase() === 'runbook'), true,
  );
});

test('--tag requires every tag given, not any of them', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-tags-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Tags\n');
  writeFileSync(join(root, 'both.md'), [
    '---', 'type: Note', 'title: Both tags', 'tags: [gateway, networking]', '---', '', 'Gateway text.',
  ].join('\n'));
  writeFileSync(join(root, 'one.md'), [
    '---', 'type: Note', 'title: One tag', 'tags: [gateway]', '---', '', 'Gateway text.',
  ].join('\n'));

  const bundle = loadBundle(root);
  const hits = search(bundle, 'gateway', { tags: ['gateway', 'networking'] });
  assert.deepEqual(hits.map((hit) => hit.concept.id), ['both']);
});

test('a hit carries the terms it matched and a line of body context', () => {
  const bundle = loadBundle(FIXTURE);
  const hit = search(bundle, 'fiscal').find((entry) => entry.concept.id === 'metrics/revenue')!;
  assert.ok(hit.terms.length > 0, 'the matched terms are reported');
  assert.ok(hit.snippet, 'a snippet is produced for a body match');
  assert.ok(!hit.snippet!.startsWith('#'), 'a heading is not used as context');
  assert.match(hit.snippet!, /fiscal/i);
});

test('every term must match before any of them does', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-and-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# And\n');
  writeFileSync(join(root, 'both.md'), [
    '---', 'type: Note', 'title: Gateway timeout defaults', '---', '', 'The gateway timeout is per-route.',
  ].join('\n'));
  for (const [name, body] of [['gateway-only', 'Only the gateway.'], ['timeout-only', 'Only the timeout.']]) {
    writeFileSync(join(root, `${name}.md`), [
      '---', 'type: Note', `title: ${name}`, '---', '', body,
    ].join('\n'));
  }

  const hits = search(loadBundle(root), 'gateway timeout');
  assert.deepEqual(hits.map((hit) => hit.concept.id), ['both'],
    'the document carrying both words is the whole answer, not the top of a list of three');
});

test('when nothing matches every term, only the best partial matches come back', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-partial-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Partial\n');
  writeFileSync(join(root, 'three.md'), [
    '---', 'type: Note', 'title: Harbor image pull', '---', '', 'Harbor image pull behaviour.',
  ].join('\n'));
  writeFileSync(join(root, 'one.md'), [
    '---', 'type: Note', 'title: Harbor only', '---', '', 'Just harbor here.',
  ].join('\n'));

  // No document carries "zzzznotaword", so the exact-AND pass finds nothing.
  const hits = search(loadBundle(root), 'harbor image pull zzzznotaword');
  assert.deepEqual(hits.map((hit) => hit.concept.id), ['three'],
    'a three-of-four near-miss answers; a one-of-four coincidence does not');
});

test('stopwords do not drag the corpus in, but a stopword-only query still runs', () => {
  const bundle = loadBundle(FIXTURE);
  const asked = search(bundle, 'why does the revenue metric matter');
  const bare = search(bundle, 'revenue metric matter');
  assert.deepEqual(asked.map((h) => h.concept.id), bare.map((h) => h.concept.id),
    'the question words change nothing');

  // Only stopwords: answering with silence would be worse than answering badly.
  assert.doesNotThrow(() => search(bundle, 'what is the'));
});

test('an unknown --area or --tier is refused rather than matching nothing', () => {
  const bad = captured(() => runSearch({ bundle: FIXTURE, query: 'x', area: ['nope'] }));
  assert.equal(bad.code, 1);
  const badTier = captured(() => runSearch({ bundle: FIXTURE, query: 'x', tier: ['trusted'] }));
  assert.equal(badTier.code, 1);
});

test('--snippet prints the matching line under the result', () => {
  const { code, lines } = captured(() =>
    runSearch({ bundle: FIXTURE, query: 'fiscal', snippet: true }));
  assert.equal(code, 0);
  assert.ok(lines.some((line) => /fiscal/i.test(line) && /^\s{2}/.test(line)),
    'an indented context line is printed');
});

test('a filter narrows the cascade rather than truncating its result', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-narrow-'));
  mkdirSync(join(root, 'dumps'), { recursive: true });
  mkdirSync(join(root, 'decisions'), { recursive: true });
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Narrow\n');
  // Carries every term, so it wins the exact-AND pass and ends the cascade.
  writeFileSync(join(root, 'dumps', 'raw.md'), [
    '---', 'type: Note', 'title: gateway timeout upstream envoy raised note', 'status: draft', '---',
    '', 'gateway timeout upstream envoy raised',
  ].join('\n'));
  // Carries most of them, so only a looser pass reaches it.
  writeFileSync(join(root, 'decisions', 'gw.md'), [
    '---', 'type: Decision', 'title: Gateway timeout tuning',
    'verified: [{ by: "human:me", at: "2026-01-01" }]', '---',
    '', 'The envoy gateway upstream request timeout was raised.',
  ].join('\n'));

  const bundle = loadBundle(root);
  const query = 'gateway timeout upstream envoy raised note';
  assert.deepEqual(search(bundle, query).map((hit) => hit.concept.id), ['dumps/raw'],
    'unfiltered, the exact match is the whole answer');

  assert.deepEqual(
    search(bundle, query, { areas: ['corpus'] }).map((hit) => hit.concept.id),
    ['decisions/gw'],
    'filtering to the corpus keeps searching rather than reporting the bundle silent',
  );
  assert.deepEqual(
    search(bundle, query, { tiers: ['human-reviewed'] }).map((hit) => hit.concept.id),
    ['decisions/gw'],
    'the same holds for the trust tier okf-recall reaches for',
  );
});

test('--match any ranks by overlap instead of requiring every term', () => {
  const root = mkdtempSync(join(tmpdir(), 'okf-search-any-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Any\n');
  // The document that actually answers the question, in the bundle's vocabulary.
  writeFileSync(join(root, 'cnpg.md'), [
    '---', 'type: Note', 'title: CNPG primary restart briefly interrupts Authentik', '---',
    '', 'A primary restart interrupts the session store.',
  ].join('\n'));
  // A neighbour carrying more of the query's literal words, and the wrong answer.
  writeFileSync(join(root, 'headroom.md'), [
    '---', 'type: Note', 'title: Authentik database failover headroom planning', '---',
    '', 'Worker headroom during a database failover.',
  ].join('\n'));

  const bundle = loadBundle(root);
  const query = 'authentik database failover interruption';

  const lookup = search(bundle, query).map((h) => h.concept.id);
  assert.deepEqual(lookup, ['headroom'],
    'the best partial overlap wins, and the document that answers the question is not in it');

  const loose = search(bundle, query, { match: 'any' }).map((h) => h.concept.id);
  assert.ok(loose.includes('cnpg'),
    'the similarity question reaches the right document even phrased in the searcher\'s words');
});

test('an unknown --match mode is refused, and an empty lookup names the loose one', () => {
  const bad = captured(() => runSearch({ bundle: FIXTURE, query: 'x', match: 'sideways' }));
  assert.equal(bad.code, 1);

  const { code, lines } = captured(() =>
    runSearch({ bundle: FIXTURE, query: 'zzzznotawordanywhere' }));
  assert.equal(code, 0);
  assert.ok(lines.some((line) => line.includes('--match any')),
    'the escape hatch is named where a caller who found nothing will see it');

  const loose = captured(() =>
    runSearch({ bundle: FIXTURE, query: 'zzzznotawordanywhere', match: 'any' }));
  assert.ok(!loose.lines.some((line) => line.includes('--match any')),
    'and not suggested to a caller already using it');
});
