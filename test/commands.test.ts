import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle, findConcept } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';
import { runPromote, runDeprecate } from '../src/commands/transition.ts';
import { runIndex } from '../src/commands/index-gen.ts';
import { runRefs } from '../src/commands/refs.ts';
import { conceptStatus, trustTier } from '../src/core/lifecycle.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
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
