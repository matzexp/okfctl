import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { runRefine } from '../src/commands/refine.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));
const BY = 'okf-refine/1.0';

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-refine-'));
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

const base = { bundle: '', type: 'Runbook', title: 'Gateway timeout retry finding', by: BY, body: 'Refined body.' };

test('a minimal refine writes a typed concept into the drafts area', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...base, bundle: root }));
  assert.equal(code, 0);

  const file = join(root, 'drafts/gateway-timeout-retry-finding.md');
  assert.ok(existsSync(file));
  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^type: Runbook$/m);
  assert.match(raw, /^status: draft$/m);
  assert.match(raw, /generated: \{ by: okf-refine\/1\.0/);
  assert.doesNotMatch(raw, /^verified:/m);
  assert.match(raw, /resource: dumps\/gateway-timeout/);
});

test('--type is required; refine has no provisional default', () => {
  const root = sandbox();
  const { type, ...rest } = base;
  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...rest, bundle: root }));
  assert.equal(code, 1);
  assert.equal(existsSync(join(root, 'drafts/gateway-timeout-retry-finding.md')), false);
});

test('--title is required', () => {
  const root = sandbox();
  const { title, ...rest } = base;
  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...rest, bundle: root }));
  assert.equal(code, 1);
});

test('--by is required', () => {
  const root = sandbox();
  const { by, ...rest } = base;
  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...rest, bundle: root }));
  assert.equal(code, 1);
});

test('a source that does not resolve is refused, and nothing is written', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(['dumps/does-not-exist'], { ...base, bundle: root }));
  assert.equal(code, 1);
  assert.equal(existsSync(join(root, 'drafts/gateway-timeout-retry-finding.md')), false);
});

test('multiple sources consolidate into one entry, each cited', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/gateway-timeout', 'dumps/retry-budget'],
    { ...base, bundle: root, title: 'Resilience findings' },
  ));
  assert.equal(code, 0);
  const raw = readFileSync(join(root, 'drafts/resilience-findings.md'), 'utf8');
  assert.match(raw, /resource: dumps\/gateway-timeout/);
  assert.match(raw, /resource: dumps\/retry-budget/);
});

test('a source can be refined into two entries (split) before being consumed', () => {
  const root = sandbox();
  const first = quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'First finding' },
  ));
  const second = quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Second finding' },
  ));
  assert.equal(first, 0);
  assert.equal(second, 0);
  assert.ok(existsSync(join(root, 'drafts/first-finding.md')));
  assert.ok(existsSync(join(root, 'drafts/second-finding.md')));
  // Neither call consumed it.
  assert.ok(existsSync(join(root, 'dumps/gateway-timeout.md')));
});

test('--consume removes exactly the named sources after a successful write', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Only this one', consume: true },
  ));
  assert.equal(existsSync(join(root, 'dumps/gateway-timeout.md')), false);
  // The other dump is untouched.
  assert.ok(existsSync(join(root, 'dumps/retry-budget.md')));
});

test('sources are left in place by default', () => {
  const root = sandbox();
  quiet(() => runRefine(['dumps/gateway-timeout'], { ...base, bundle: root }));
  assert.ok(existsSync(join(root, 'dumps/gateway-timeout.md')));
});

test('a target that already exists is refused rather than overwritten', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Timeout mitigation' },
  ));
  // The fixture already carries drafts/timeout-mitigation.md.
  assert.equal(code, 1);
});

test('a reserved filename is refused', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, id: 'index' },
  ));
  assert.equal(code, 1);
});

test('a dry run writes nothing and consumes nothing', () => {
  const root = sandbox();
  const logBefore = readFileSync(join(root, 'log.md'), 'utf8');
  const code = quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Nothing doing', consume: true, dryRun: true },
  ));
  assert.equal(code, 0);
  assert.equal(existsSync(join(root, 'drafts/nothing-doing.md')), false);
  assert.ok(existsSync(join(root, 'dumps/gateway-timeout.md')));
  assert.equal(readFileSync(join(root, 'log.md'), 'utf8'), logBefore);
});

test('the refine is logged, naming sources, actor, and consume outcome', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Logged finding', consume: true },
  ));
  const log = readFileSync(join(root, 'log.md'), 'utf8');
  assert.match(log, /\*\*Refined\*\*.*Logged finding/);
  assert.match(log, /dumps\/gateway-timeout/);
  assert.match(log, /sources consumed/);
});

test('consuming a source regenerates the affected index', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Indexed finding', consume: true },
  ));
  const dumpsIndex = existsSync(join(root, 'dumps/index.md'))
    ? readFileSync(join(root, 'dumps/index.md'), 'utf8')
    : '';
  assert.doesNotMatch(dumpsIndex, /gateway-timeout/);
  const bundle = loadBundle(root);
  assert.equal(bundle.concepts.some((c) => c.id === 'dumps/gateway-timeout'), false);
});

test('provenance is carried forward, not claimed: the refiner is generated.by, not the source', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/gateway-timeout'],
    { ...base, bundle: root, title: 'Attributed finding' },
  ));
  const raw = readFileSync(join(root, 'drafts/attributed-finding.md'), 'utf8');
  assert.match(raw, new RegExp(`generated: \\{ by: ${BY.replace('/', '\\/')}`));
  assert.doesNotMatch(raw, /generated: \{ by: claude-code/);
});

test('--extend updates an existing draft in place, merging sources', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Updated body with the retry-budget follow-up.' },
  ));
  assert.equal(code, 0);

  const file = join(root, 'drafts/timeout-mitigation.md');
  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^type: Runbook$/m, 'type defaulted to the existing entry');
  assert.match(raw, /^title: Mitigate gateway timeout defaults$/m, 'title defaulted to the existing entry');
  assert.match(raw, /Updated body with the retry-budget follow-up\./, 'body fully replaced');
  assert.doesNotMatch(raw, /Set the per-route timeout explicitly/, 'the old body text is gone — extend is a full replacement');
  assert.match(raw, /resource: dumps\/gateway-timeout/, 'the prior citation survives');
  assert.match(raw, /resource: dumps\/retry-budget/, 'the new citation is added');
});

test('--extend re-run with an already-cited source adds no duplicate citation', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'First extend.' },
  ));
  quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Second extend, same source again.' },
  ));
  const raw = readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8');
  assert.equal((raw.match(/resource: dumps\/retry-budget/g) ?? []).length, 1, 'no duplicate citation');
});

test('--extend accepts an explicit --type/--title override', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Retyped.', type: 'Decision', title: 'Retyped title' },
  ));
  const raw = readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8');
  assert.match(raw, /^type: Decision$/m);
  assert.match(raw, /^title: Retyped title$/m);
});

test('--extend refuses a corpus target, naming its actual area', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'metrics/margin', by: BY, body: 'x' },
  ));
  assert.equal(code, 1);
  const raw = readFileSync(join(root, 'metrics/margin.md'), 'utf8');
  assert.match(raw, /Gross profit divided by revenue/, 'the corpus concept is untouched');
});

test('--extend refuses a target that does not exist', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/does-not-exist', by: BY, body: 'x' },
  ));
  assert.equal(code, 1);
});

test('--extend combined with --to or --id is refused', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', to: 'drafts', by: BY, body: 'x' },
  ));
  assert.equal(code, 1);
});

test('--extend dry run shows the full resulting body and writes nothing', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8');
  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Preview-only body.', dryRun: true },
  ));
  assert.equal(code, 0);
  assert.equal(readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8'), before, 'nothing written');
});

test('--extend is logged as extended, distinct from a fresh refine', () => {
  const root = sandbox();
  quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'x', consume: true },
  ));
  const log = readFileSync(join(root, 'log.md'), 'utf8');
  assert.match(log, /\*\*Extended\*\*.*Mitigate gateway timeout defaults/);
  assert.match(log, /dumps\/retry-budget/);
  assert.match(log, /sources consumed/);
});

test('--consume refuses when a named source is outside the dumps area, on a fresh refine', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['drafts/timeout-mitigation'],
    { ...base, bundle: root, title: 'Should not be written', consume: true },
  ));
  assert.equal(code, 1);
  assert.equal(existsSync(join(root, 'drafts/should-not-be-written.md')), false);
  assert.ok(existsSync(join(root, 'drafts/timeout-mitigation.md')), 'the drafts-area source survives');
});

test('--consume refuses when a named source is outside the dumps area, on --extend', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['metrics/margin'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'x', consume: true },
  ));
  assert.equal(code, 1);
  assert.ok(existsSync(join(root, 'metrics/margin.md')), 'the corpus source survives');
});

test('citing a corpus concept as a source (without --consume) is allowed and leaves it untouched', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(
    ['metrics/margin', 'dumps/retry-budget'],
    { ...base, bundle: root, title: 'Margin follow-up' },
  ));
  assert.equal(code, 0);
  const raw = readFileSync(join(root, 'drafts/margin-follow-up.md'), 'utf8');
  assert.match(raw, /resource: metrics\/margin/);
  assert.match(raw, /resource: dumps\/retry-budget/);
  assert.ok(existsSync(join(root, 'metrics/margin.md')), 'corpus concept untouched');
});
