import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, findConcept } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';
import { runPromote, runDeprecate } from '../src/commands/transition.ts';
import { runNew } from '../src/commands/new.ts';
import { runReview } from '../src/commands/review.ts';
import { runIndex } from '../src/commands/index-gen.ts';
import { runCatalog, renderCatalog } from '../src/commands/catalog.ts';
import { runRefs } from '../src/commands/refs.ts';
import { conceptStatus, isDrifted, isStale, isoDay, trustTier } from '../src/core/lifecycle.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Capture what a command writes to stdout, including `process.stdout.write`. */
function captured(run: () => number): { code: number; out: string } {
  const log = console.log;
  const write = process.stdout.write.bind(process.stdout);
  let out = '';
  console.log = () => {};
  process.stdout.write = ((chunk: string) => {
    out += chunk;
    return true;
  }) as typeof process.stdout.write;
  try {
    return { code: run(), out };
  } finally {
    console.log = log;
    process.stdout.write = write;
  }
}

/** Commands print progress; keep the test output readable. */
function quietly<T>(run: () => T): T {
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

test('check separates conformance errors from advisory warnings', () => {
  const diagnostics = checkBundle(loadBundle(FIXTURE));
  assert.equal(countBy(diagnostics, 'error'), 1);
  assert.ok(countBy(diagnostics, 'warn') > 0);

  const error = diagnostics.find((entry) => entry.level === 'error')!;
  assert.equal(error.rule, 'type-missing');
  assert.equal(error.where, 'playbooks/freshness-alert.md');

  // A bundle-root index.md carrying only okf_version is legal (SPEC 12).
  assert.equal(diagnostics.some((entry) => entry.rule === 'index-frontmatter'), false);
});

test('prose in index.md is prose, not frontmatter keys', () => {
  const dir = sandbox();
  // Body lines shaped like `key:` are ordinary writing. Scanning the whole file
  // for them turned "Note:" into a hard conformance error that failed CI.
  writeFileSync(join(dir, 'index.md'), [
    '---',
    'okf_version: "0.2"',
    '---',
    '',
    '# Knowledge base',
    '',
    'Note: this bundle is maintained by agents.',
    'Usage: point okfctl at the root.',
    '',
    '```yaml',
    'type: Decision',
    '```',
    '',
  ].join('\n'));

  const diagnostics = checkBundle(loadBundle(dir));
  assert.equal(
    diagnostics.some((entry) => entry.rule === 'index-frontmatter'), false,
    'no key violation is reported for body prose',
  );
});

test('a root index.md whose frontmatter does not parse is an error', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'index.md'), '---\nokf_version: "0.2\n  bad: [\n---\n\n# Broken\n');

  const diagnostics = checkBundle(loadBundle(dir));
  const error = diagnostics.find((entry) => entry.rule === 'index-frontmatter');
  assert.ok(error, 'unparseable reserved-file frontmatter is reported');
  assert.equal(error!.level, 'error');
});

test('an extra key in root index.md frontmatter is still an error', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'index.md'), '---\nokf_version: "0.2"\ntitle: Nope\n---\n\n# Root\n');

  const diagnostics = checkBundle(loadBundle(dir));
  const error = diagnostics.find((entry) => entry.rule === 'index-frontmatter');
  assert.ok(error);
  assert.match(error!.message, /found title/);
});

test('promote records verification, flips status, and logs it', () => {
  const dir = sandbox();
  const code = quietly(() =>
    runPromote('metrics/revenue', { bundle: dir, by: 'human:matze', staleIn: '90d' }),
  );
  assert.equal(code, 0);

  const concept = findConcept(loadBundle(dir), 'metrics/revenue');
  assert.equal(conceptStatus(concept.data), 'stable');
  assert.equal(trustTier(concept.data), 'human-reviewed');
  assert.match(String(concept.data.stale_after), /^\d{4}-\d{2}-\d{2}$/);

  // Producer-defined keys we do not understand survive the round trip (SPEC 4.1).
  assert.equal(concept.data.custom_producer_key, 'keep-me');

  const log = readFileSync(join(dir, 'log.md'), 'utf8');
  assert.match(log, /\*\*Promotion\*\*: \[Revenue\]\(\/metrics\/revenue\.md\)/);
  // Newest date section first (SPEC 9).
  assert.ok(log.indexOf('**Promotion**') < log.indexOf('2026-05-15'));
});

test('promote refuses a concept with conformance errors unless forced', () => {
  const dir = sandbox();
  const blocked = quietly(() =>
    runPromote('playbooks/freshness-alert', { bundle: dir, by: 'human:matze' }),
  );
  assert.equal(blocked, 1);
  assert.equal(conceptStatus(findConcept(loadBundle(dir), 'playbooks/freshness-alert').data), 'stable');

  const forced = quietly(() =>
    runPromote('playbooks/freshness-alert', { bundle: dir, by: 'human:matze', force: true }),
  );
  assert.equal(forced, 0);
  assert.equal(trustTier(findConcept(loadBundle(dir), 'playbooks/freshness-alert').data), 'human-reviewed');
});

test('promote rejects an actor outside the SPEC 7 convention', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runPromote('metrics/revenue', { bundle: dir, by: 'matze' })), 1);
  assert.equal(conceptStatus(findConcept(loadBundle(dir), 'metrics/revenue').data), 'draft');
});

test('dry run writes nothing', () => {
  const dir = sandbox();
  const before = readFileSync(join(dir, 'metrics/revenue.md'), 'utf8');
  quietly(() => runPromote('metrics/revenue', { bundle: dir, by: 'human:matze', dryRun: true }));
  assert.equal(readFileSync(join(dir, 'metrics/revenue.md'), 'utf8'), before);
});

test('deprecate flips status and refuses a repeat', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runDeprecate('metrics/margin', { bundle: dir, by: 'human:matze' })), 0);
  assert.equal(conceptStatus(findConcept(loadBundle(dir), 'metrics/margin').data), 'deprecated');
  assert.equal(quietly(() => runDeprecate('metrics/margin', { bundle: dir })), 1);
});

test('ambiguous references are rejected rather than guessed', () => {
  const bundle = loadBundle(FIXTURE);
  assert.throws(() => findConcept(bundle, 'revenue'), /ambiguous/);
  assert.equal(findConcept(bundle, 'metrics/revenue').id, 'metrics/revenue');
  assert.equal(findConcept(bundle, 'income-statement').id, 'metrics/income-statement');
});

test('index regenerates, preserves okf_version, and detects drift', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runIndex({ bundle: dir, check: true })), 1);
  assert.equal(quietly(() => runIndex({ bundle: dir })), 0);
  assert.equal(quietly(() => runIndex({ bundle: dir, check: true })), 0);

  const root = readFileSync(join(dir, 'index.md'), 'utf8');
  assert.match(root, /^---\nokf_version: "0\.2"\n---/);
  assert.match(root, /# Subdirectories/);

  const metrics = readFileSync(join(dir, 'metrics/index.md'), 'utf8');
  assert.doesNotMatch(metrics, /^---/);
  assert.match(metrics, /# Metrics/);
  assert.match(metrics, /\* \[Revenue\]\(revenue\.md\) - Recognized revenue for a fiscal year\./);
});

test('index omits deprecated concepts unless asked for them', () => {
  const dir = sandbox();
  quietly(() => runDeprecate('metrics/margin', { bundle: dir }));
  quietly(() => runIndex({ bundle: dir }));
  assert.doesNotMatch(readFileSync(join(dir, 'metrics/index.md'), 'utf8'), /Gross margin/);

  quietly(() => runIndex({ bundle: dir, includeDeprecated: true }));
  assert.match(readFileSync(join(dir, 'metrics/index.md'), 'utf8'), /Gross margin/);
});

test('refs is advisory by default and gating only under --strict', () => {
  assert.equal(quietly(() => runRefs({ bundle: FIXTURE })), 0);
  assert.equal(quietly(() => runRefs({ bundle: FIXTURE, strict: true })), 1);
});

test('check surfaces broken citations as warnings, never as errors', () => {
  const diagnostics = checkBundle(loadBundle(FIXTURE));
  const refs = diagnostics.filter((entry) => entry.rule.startsWith('footnote-'));
  assert.deepEqual(
    refs.map((entry) => `${entry.where} ${entry.rule}`).sort(),
    ['metrics/margin.md footnote-unjoined', 'metrics/revenue.md footnote-undefined'],
  );
  assert.equal(refs.every((entry) => entry.level === 'warn'), true);
  assert.equal(countBy(diagnostics, 'error'), 1);
});

test('refs gates on broken links under --strict, and anchors come with it', () => {
  assert.equal(quietly(() => runRefs({ bundle: FIXTURE })), 0);
  assert.equal(quietly(() => runRefs({ bundle: FIXTURE, strict: true })), 1);
  // --anchors alone widens what is checked without gating.
  assert.equal(quietly(() => runRefs({ bundle: FIXTURE, anchors: true })), 0);
});

test('check reports an unresolved link as a warning, leaving the bundle conformant', () => {
  const diagnostics = checkBundle(loadBundle(FIXTURE));
  const links = diagnostics.filter((entry) => entry.rule === 'link-unresolved');

  assert.deepEqual(links.map((entry) => entry.where), ['metrics/income-statement.md']);
  assert.match(links[0].message, /\/metrics\/cogs\.md/);
  assert.equal(links[0].level, 'warn');
  // The one error is the fixture's missing `type`, not anything link-related.
  assert.equal(countBy(diagnostics, 'error'), 1);
});

test('check never reports a missing anchor, however strict the caller is', () => {
  const diagnostics = checkBundle(loadBundle(FIXTURE));
  assert.equal(diagnostics.some((entry) => entry.rule.includes('anchor')), false);
});

test('new writes a conformant concept and logs it', () => {
  const dir = sandbox();
  const code = quietly(() =>
    runNew('decisions/gateway-api', {
      bundle: dir,
      type: 'Decision',
      description: 'Gateway API replaces Ingress.',
      tags: ['networking'],
      by: 'human:matze',
    }),
  );
  assert.equal(code, 0);

  const created = findConcept(loadBundle(dir), 'decisions/gateway-api');
  assert.equal(created.data.type, 'Decision');
  assert.equal(conceptStatus(created.data), 'draft');
  assert.equal(trustTier(created.data), 'unverified');
  // A title the caller did not give is derived from the filename, not left empty.
  assert.equal(created.data.title, 'Gateway Api');
  assert.equal((created.data.generated as { by: string }).by, 'human:matze');
  // SPEC 5.5: no horizon is claimed when none was asked for.
  assert.equal(created.data.stale_after, undefined);

  // The new concept contributes no conformance errors of its own.
  const errors = checkBundle(loadBundle(dir)).filter(
    (entry) => entry.level === 'error' && entry.where === 'decisions/gateway-api.md',
  );
  assert.equal(errors.length, 0);

  assert.match(readFileSync(join(dir, 'log.md'), 'utf8'), /\*\*Created\*\*: \[Gateway Api\]/);
});

test('new requires a type but accepts one outside the conventional set', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runNew('notes/x', { bundle: dir })), 1);
  assert.equal(existsSync(join(dir, 'notes/x.md')), false);

  // SPEC 11 forbids rejecting an unknown type.
  assert.equal(quietly(() => runNew('notes/x', { bundle: dir, type: 'Runbook' })), 0);
  assert.equal(findConcept(loadBundle(dir), 'notes/x').data.type, 'Runbook');
});

test('new refuses to overwrite, and never doubles the extension', () => {
  const dir = sandbox();
  const before = readFileSync(join(dir, 'metrics/revenue.md'), 'utf8');
  assert.equal(quietly(() => runNew('metrics/revenue.md', { bundle: dir, type: 'Metric' })), 1);
  assert.equal(readFileSync(join(dir, 'metrics/revenue.md'), 'utf8'), before);
  assert.equal(existsSync(join(dir, 'metrics/revenue.md.md')), false);
});

test('new rejects a reserved filename and a path outside the bundle', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runNew('metrics/index', { bundle: dir, type: 'Metric' })), 1);
  assert.equal(quietly(() => runNew('../escape', { bundle: dir, type: 'Metric' })), 1);
});

test('new dry run writes neither the concept nor the log', () => {
  const dir = sandbox();
  const log = readFileSync(join(dir, 'log.md'), 'utf8');
  assert.equal(
    quietly(() => runNew('decisions/x', { bundle: dir, type: 'Decision', dryRun: true })),
    0,
  );
  assert.equal(existsSync(join(dir, 'decisions/x.md')), false);
  assert.equal(readFileSync(join(dir, 'log.md'), 'utf8'), log);
});

test('review demands exactly one outcome', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runReview('metrics/margin', { bundle: dir })), 1);
  assert.equal(
    quietly(() => runReview('metrics/margin', { bundle: dir, confirm: true, outdated: true, by: 'human:matze' })),
    1,
  );
});

test('a confirmed review verifies, answers drift, and leaves status alone', () => {
  const dir = sandbox();
  const before = findConcept(loadBundle(dir), 'metrics/margin');
  assert.equal(isDrifted(before.data), true);

  const code = quietly(() =>
    runReview('metrics/margin', { bundle: dir, confirm: true, by: 'human:matze', staleIn: '90d' }),
  );
  assert.equal(code, 0);

  const after = findConcept(loadBundle(dir), 'metrics/margin');
  assert.equal(conceptStatus(after.data), 'stable');
  assert.equal(trustTier(after.data), 'human-reviewed');
  // The new verification post-dates generated.at, so the concept reads clean.
  assert.equal(isDrifted(after.data), false);
  assert.equal(isStale(after.data), false);
  assert.match(readFileSync(join(dir, 'log.md'), 'utf8'), /confirmed still accurate by human:matze/);
});

test('confirming a draft records the verification without promoting it', () => {
  const dir = sandbox();
  quietly(() => runReview('metrics/revenue', { bundle: dir, confirm: true, by: 'human:matze' }));
  const concept = findConcept(loadBundle(dir), 'metrics/revenue');
  assert.equal(conceptStatus(concept.data), 'draft');
  assert.equal(trustTier(concept.data), 'human-reviewed');
});

test('confirmation without an actor writes nothing', () => {
  const dir = sandbox();
  const before = readFileSync(join(dir, 'metrics/margin.md'), 'utf8');
  assert.equal(quietly(() => runReview('metrics/margin', { bundle: dir, confirm: true })), 1);
  assert.equal(readFileSync(join(dir, 'metrics/margin.md'), 'utf8'), before);
});

test('an outdated review marks stale today and claims no verification', () => {
  const dir = sandbox();
  const before = findConcept(loadBundle(dir), 'metrics/income-statement');
  assert.equal(isStale(before.data), false);

  const code = quietly(() =>
    runReview('income-statement', { bundle: dir, outdated: true, by: 'human:matze', reason: 'FY26 restatement' }),
  );
  assert.equal(code, 0);

  const after = findConcept(loadBundle(dir), 'metrics/income-statement');
  assert.equal(after.data.stale_after, isoDay());
  assert.equal(isStale(after.data), true);
  // The trust tier is exactly what it was: the review disproved the content,
  // so it must not raise the tier by appending to verified (SPEC 5.3).
  assert.deepEqual(after.data.verified, before.data.verified);
  assert.equal(trustTier(after.data), trustTier(before.data));
  // Status is the maintainer's next decision, not this command's.
  assert.equal(conceptStatus(after.data), conceptStatus(before.data));

  const log = readFileSync(join(dir, 'log.md'), 'utf8');
  assert.match(log, /found outdated by human:matze/);
  assert.match(log, /FY26 restatement/);
});

test('an outdated review writes no frontmatter key OKF does not define', () => {
  const dir = sandbox();
  const before = Object.keys(findConcept(loadBundle(dir), 'metrics/margin').data);
  quietly(() => runReview('metrics/margin', { bundle: dir, outdated: true }));
  const after = Object.keys(findConcept(loadBundle(dir), 'metrics/margin').data);
  assert.deepEqual(after, before);
});

test('a created concept survives the full loop with zero conformance errors', () => {
  const dir = sandbox();
  const errors = () =>
    checkBundle(loadBundle(dir)).filter(
      (entry) => entry.level === 'error' && entry.where === 'decisions/loop.md',
    ).length;

  quietly(() => runNew('decisions/loop', { bundle: dir, type: 'Decision', by: 'human:matze' }));
  assert.equal(errors(), 0);
  quietly(() => runPromote('decisions/loop', { bundle: dir, by: 'human:matze', staleIn: '30d' }));
  assert.equal(errors(), 0);
  quietly(() => runReview('decisions/loop', { bundle: dir, confirm: true, by: 'human:matze', staleIn: '90d' }));
  assert.equal(errors(), 0);
  quietly(() => runReview('decisions/loop', { bundle: dir, outdated: true, by: 'human:matze' }));
  assert.equal(errors(), 0);
  quietly(() => runDeprecate('decisions/loop', { bundle: dir, by: 'human:matze' }));
  assert.equal(errors(), 0);
  assert.equal(conceptStatus(findConcept(loadBundle(dir), 'decisions/loop').data), 'deprecated');
});

test('new rejects an actor outside the SPEC 7 convention', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runNew('notes/y', { bundle: dir, type: 'Note', by: 'matze' })), 1);
  assert.equal(existsSync(join(dir, 'notes/y.md')), false);
});

test('new can opt out of the log entry', () => {
  const dir = sandbox();
  const log = readFileSync(join(dir, 'log.md'), 'utf8');
  assert.equal(quietly(() => runNew('notes/z', { bundle: dir, type: 'Note', noLog: true })), 0);
  assert.equal(existsSync(join(dir, 'notes/z.md')), true);
  assert.equal(readFileSync(join(dir, 'log.md'), 'utf8'), log);
});

test('review dry run writes neither the concept nor the log', () => {
  const dir = sandbox();
  const before = readFileSync(join(dir, 'metrics/margin.md'), 'utf8');
  const log = readFileSync(join(dir, 'log.md'), 'utf8');
  assert.equal(
    quietly(() => runReview('metrics/margin', { bundle: dir, outdated: true, dryRun: true })),
    0,
  );
  assert.equal(readFileSync(join(dir, 'metrics/margin.md'), 'utf8'), before);
  assert.equal(readFileSync(join(dir, 'log.md'), 'utf8'), log);
});

test('catalog groups the whole bundle by type, across directories', () => {
  const dir = sandbox();
  quietly(() => runNew('playbooks/headcount', { bundle: dir, type: 'Metric' }));
  const body = renderCatalog(loadBundle(dir), false);

  assert.match(body, /^# Catalog\n/);
  // A Metric filed under playbooks/ belongs with the rest of the Metrics; the
  // catalog groups by type, not by where a file happens to sit.
  const metrics = body.slice(body.indexOf('# Metrics'), body.indexOf('\n\n# ', body.indexOf('# Metrics')));
  assert.match(metrics, /\(playbooks\/headcount\.md\)/);
  assert.match(metrics, /\(metrics\/revenue\.md\)/);
  // A concept with no usable type still gets listed (SPEC 11 calls that an
  // error; the catalog reports the bundle it has, it does not hide from it).
  assert.match(body, /# Concepts\n\n\* \[.*\]\(playbooks\/freshness-alert\.md\)/);
});

test('catalog renders the same bytes twice, and nothing derived from today', () => {
  const bundle = loadBundle(FIXTURE);
  assert.equal(renderCatalog(bundle, false), renderCatalog(loadBundle(FIXTURE), false));

  // metrics/margin is past its stale_after; staleness must not reach the body,
  // or a checked-in catalog drifts on a morning nobody changed anything.
  assert.equal(isStale(findConcept(bundle, 'metrics/margin').data), true);
  assert.equal(renderCatalog(bundle, false).includes('stale'), false);
});

test('catalog marks what cannot be trusted, and leaves settled entries bare', () => {
  const body = renderCatalog(loadBundle(FIXTURE), false);
  const entry = (id: string) =>
    body.split('\n').find((line) => line.includes(`(${id}.md)`))!;

  // draft and never verified: both markers, in a fixed order.
  assert.match(entry('metrics/revenue'), /\[draft, unverified\]/);
  // stable and verified, but edited since: drift is ours, not the spec's.
  assert.match(entry('metrics/margin'), /\[drifted\]/);
  assert.equal(entry('metrics/income-statement').includes('['), true);
  assert.match(entry('metrics/income-statement'), /\]\(metrics\/income-statement\.md\) - /);
});

test('catalog omits deprecated concepts unless asked for them', () => {
  const dir = sandbox();
  quietly(() => runDeprecate('metrics/margin', { bundle: dir, by: 'human:matze' }));

  assert.equal(renderCatalog(loadBundle(dir), false).includes('metrics/margin.md'), false);
  assert.match(renderCatalog(loadBundle(dir), true), /metrics\/margin\.md\) \[deprecated/);
});

test('catalog prints by default and writes nothing', () => {
  const dir = sandbox();
  const { code, out } = captured(() => runCatalog({ bundle: dir }));

  assert.equal(code, 0);
  assert.match(out, /^# Catalog\n/);
  assert.equal(existsSync(join(dir, 'catalog.md')), false);
});

test('catalog writes a conformant concept and carries generated.at across', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runCatalog({ bundle: dir, write: true })), 0);

  const file = join(dir, 'catalog.md');
  const written = readFileSync(file, 'utf8');
  assert.match(written, /^---\ntype: Index\n/);
  assert.match(written, /generated: \{ by: okfctl\/0\.1\.0, at: /);

  // Rewriting an unchanged catalog must not move the timestamp, or --check
  // fails tomorrow on a bundle nobody touched.
  quietly(() => runCatalog({ bundle: dir, write: true }));
  assert.equal(readFileSync(file, 'utf8'), written);

  // The generated file is output, not corpus: it is neither a concept nor a
  // source of new diagnostics.
  const bundle = loadBundle(dir);
  assert.equal(bundle.catalogFile, 'catalog.md');
  assert.equal(bundle.concepts.some((concept) => concept.id === 'catalog'), false);
  assert.equal(countBy(checkBundle(bundle), 'error'), 1);
});

test('catalog --check reports a missing and an out-of-date file, writing nothing', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runCatalog({ bundle: dir, check: true })), 1);
  assert.equal(existsSync(join(dir, 'catalog.md')), false);

  quietly(() => runCatalog({ bundle: dir, write: true }));
  assert.equal(quietly(() => runCatalog({ bundle: dir, check: true })), 0);

  quietly(() => runNew('metrics/churn', { bundle: dir, type: 'Metric' }));
  assert.equal(quietly(() => runCatalog({ bundle: dir, check: true })), 1);
});

test('catalog --out stays inside the bundle', () => {
  const dir = sandbox();
  assert.equal(quietly(() => runCatalog({ bundle: dir, out: 'derived/all.md' })), 0);
  assert.equal(existsSync(join(dir, 'derived/all.md')), true);
  assert.equal(quietly(() => runCatalog({ bundle: dir, out: '../escape.md' })), 1);
});

test('a catalog below the root is an ordinary concept', () => {
  const dir = sandbox();
  writeFileSync(join(dir, 'metrics/catalog.md'), '---\ntype: Note\n---\n\n# Not ours\n');

  const bundle = loadBundle(dir);
  assert.equal(bundle.catalogFile, null);
  assert.equal(bundle.concepts.some((concept) => concept.id === 'metrics/catalog'), true);
});

test('the root index links the catalog only once one exists', () => {
  const dir = sandbox();
  quietly(() => runIndex({ bundle: dir }));
  assert.equal(readFileSync(join(dir, 'index.md'), 'utf8').includes('# Catalog'), false);

  quietly(() => runCatalog({ bundle: dir, write: true }));
  quietly(() => runIndex({ bundle: dir }));
  const root = readFileSync(join(dir, 'index.md'), 'utf8');
  assert.match(root, /# Catalog\n\n\* \[Catalog\]\(catalog\.md\) - /);
  assert.ok(root.indexOf('# Catalog') < root.indexOf('# Subdirectories'));

  // Nested indexes never link it.
  assert.equal(readFileSync(join(dir, 'metrics/index.md'), 'utf8').includes('catalog.md'), false);
});
