import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findConcept, loadBundle } from '../src/core/bundle.ts';
import { checkRefs } from '../src/core/refs.ts';
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

test('a failed --extend restores the draft rather than deleting it', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  const before = readFileSync(file, 'utf8');

  // The log append is the step after the concept write; a directory where the
  // log file belongs fails it deterministically, whatever the uid.
  rmSync(join(root, 'log.md'));
  mkdirSync(join(root, 'log.md'));

  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'This must not survive.' },
  ));

  assert.equal(code, 1);
  assert.equal(existsSync(file), true, 'the extended draft still exists');
  assert.equal(readFileSync(file, 'utf8'), before, 'its prior contents are back, byte for byte');
});

test('a failed refine leaves no log entry for the write it rolled back', () => {
  const root = sandbox();
  const logFile = join(root, 'log.md');
  const before = readFileSync(logFile, 'utf8');

  // Fail after the log append: the index regeneration `--consume` triggers is
  // the next step, and a directory where a concept file belongs breaks it.
  mkdirSync(join(root, 'dumps/gateway-timeout.md.d'));
  const dumpsIndex = join(root, 'dumps/index.md');
  rmSync(dumpsIndex, { force: true });
  mkdirSync(dumpsIndex);

  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...base, bundle: root, consume: true }));

  assert.equal(code, 1);
  assert.equal(readFileSync(logFile, 'utf8'), before, 'the log is byte-identical to before the attempt');
  assert.equal(existsSync(join(root, 'dumps/gateway-timeout.md')), true, 'the consumed dump is back');
});

test('a failed fresh refine still removes the file it created', () => {
  const root = sandbox();
  rmSync(join(root, 'log.md'));
  mkdirSync(join(root, 'log.md'));

  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...base, bundle: root }));

  assert.equal(code, 1);
  assert.equal(existsSync(join(root, 'drafts/gateway-timeout-retry-finding.md')), false);
});

test('--extend preserves frontmatter keys, comments, and key order it does not own', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('status: draft', 'owner: platform-team\n# why this horizon: quarterly review cycle\nstale_after: 2026-12-01\nstatus: draft'));

  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Extended body.' },
  ));
  assert.equal(code, 0);

  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^owner: platform-team$/m, 'an unknown producer-defined key survives (SPEC §4.1)');
  assert.match(raw, /^stale_after: 2026-12-01$/m);
  assert.match(raw, /^# why this horizon: quarterly review cycle$/m, 'comments survive');
  assert.ok(raw.indexOf('owner:') < raw.indexOf('status:'), 'key order is preserved');
});

test('--extend keeps a verified block, leaving the drift to be reported rather than erased', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  writeFileSync(file, readFileSync(file, 'utf8')
    .replace('status: draft', 'status: stable\nverified: [{ by: human:matze, at: 2026-08-22T10:00:00Z }]'));

  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Extended body.' },
  ));
  assert.equal(code, 0);

  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /by: human:matze/, 'the prior verification is not silently dropped');
  assert.match(raw, /^status: draft$/m, 'but the entry is a draft again: the content it attested to has changed');
});

test('--extend leaves description and tags alone when neither is passed', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  const before = readFileSync(file, 'utf8');
  assert.match(before, /^description: Refined from a dumps-area capture/m);

  const code = quiet(() => runRefine(
    ['dumps/retry-budget'],
    { bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'Extended body.' },
  ));
  assert.equal(code, 0);
  assert.match(readFileSync(file, 'utf8'), /^description: Refined from a dumps-area capture/m);
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

test('two sources sharing a basename get distinct citation ids', () => {
  const root = sandbox();
  mkdirSync(join(root, 'incidents'), { recursive: true });
  // Same basename as dumps/gateway-timeout, in a different area.
  writeFileSync(join(root, 'incidents/gateway-timeout.md'), [
    '---',
    'type: Incident Report',
    'title: The gateway timeout incident',
    '---',
    '',
    'What happened.',
  ].join('\n'));

  const code = quiet(() => runRefine(
    ['dumps/gateway-timeout', 'incidents/gateway-timeout'],
    { ...base, bundle: root },
  ));
  assert.equal(code, 0);

  const raw = readFileSync(join(root, 'drafts/gateway-timeout-retry-finding.md'), 'utf8');
  const ids = [...raw.matchAll(/^\s+(?:- )?id: (.+)$/gm)].map((match) => match[1].trim());
  assert.equal(new Set(ids).size, ids.length, 'no sources[].id is used twice');
  assert.ok(ids.includes('gateway-timeout'));
  assert.ok(ids.includes('incidents-gateway-timeout'), 'the collision grows leftward through the path');
});

test('refine writes a bundle that its own refs check finds clean', () => {
  const root = sandbox();
  mkdirSync(join(root, 'incidents'), { recursive: true });
  writeFileSync(join(root, 'incidents/gateway-timeout.md'), [
    '---', 'type: Incident Report', 'title: The gateway timeout incident', '---', '', 'What happened.',
  ].join('\n'));

  quiet(() => runRefine(
    ['dumps/gateway-timeout', 'incidents/gateway-timeout'],
    { ...base, bundle: root },
  ));

  const written = findConcept(loadBundle(root), 'drafts/gateway-timeout-retry-finding');
  const duplicates = checkRefs(written, { root })
    .filter((entry) => entry.rule === 'source-id-duplicate');
  assert.deepEqual(duplicates, [], 'the writer does not emit what the checker flags');
});

test('--list reports the unrefined inbox and writes nothing', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'log.md'), 'utf8');

  const written: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => void written.push(args.join(' '));
  let code: number;
  try {
    code = runRefine([], { bundle: root, list: true });
  } finally {
    console.log = log;
  }

  assert.equal(code, 0);
  const out = written.join('\n');
  assert.match(out, /dumps\/gateway-timeout/);
  assert.match(out, /Gateway timeout defaults are per-route/, 'titles, since dump ids are generated');
  assert.doesNotMatch(out, /drafts\/timeout-mitigation/, 'the drafts area is a different backlog');
  assert.equal(readFileSync(join(root, 'log.md'), 'utf8'), before);
});

test('--list needs no actor, but a write still does', () => {
  const root = sandbox();
  assert.equal(quiet(() => runRefine([], { bundle: root, list: true })), 0);
  assert.equal(
    quiet(() => runRefine(['dumps/retry-budget'], { bundle: root, type: 'Runbook', title: 'X', body: 'y' })),
    1,
  );
});

test('refine with no sources and no --list is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runRefine([], { ...base, bundle: root })), 1);
});

test('--append adds to the existing body instead of replacing it', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  const priorBody = readFileSync(file, 'utf8').split('\n---\n')[1];

  const code = quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root,
    extend: 'drafts/timeout-mitigation',
    append: true,
    by: BY,
    body: 'A follow-up finding about retry budgets.',
  }));
  assert.equal(code, 0);

  const after = readFileSync(file, 'utf8');
  assert.match(after, /Set the per-route timeout explicitly/, 'prior content survives');
  assert.match(after, /A follow-up finding about retry budgets\./, 'the new content is there');
  assert.ok(after.includes(priorBody.trim()), 'the prior body is present verbatim');
});

test('--append still merges sources and refreshes provenance', () => {
  const root = sandbox();
  quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root, extend: 'drafts/timeout-mitigation', append: true, by: BY, body: 'More.',
  }));
  const raw = readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8');
  assert.match(raw, /resource: dumps\/gateway-timeout/, 'the prior citation is kept');
  assert.match(raw, /resource: dumps\/retry-budget/, 'the new source is cited');
});

test('--append is refused on a fresh entry, which has nothing to append to', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(['dumps/gateway-timeout'], { ...base, bundle: root, append: true }));
  assert.equal(code, 1);
});

test('a replacing --extend that shrinks the entry warns, and still writes', () => {
  const root = sandbox();
  const written: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => void written.push(args.join(' '));
  let code: number;
  try {
    code = runRefine(['dumps/retry-budget'], {
      bundle: root, extend: 'drafts/timeout-mitigation', by: BY, body: 'A deliberate shorter rewrite.',
    });
  } finally {
    console.log = log;
  }

  assert.equal(code, 0, 'a shorter rewrite is legitimate and is not refused');
  assert.match(written.join('\n'), /fewer bytes of body/, 'but the drop is named rather than silent');
  assert.match(readFileSync(join(root, 'drafts/timeout-mitigation.md'), 'utf8'), /deliberate shorter rewrite/);
});

test('a longer replacing --extend needs no flag at all', () => {
  const root = sandbox();
  const code = quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root,
    extend: 'drafts/timeout-mitigation',
    by: BY,
    body: 'Set the per-route timeout explicitly rather than relying on the listener default. '
      + 'And the retry budget is shared across the service, so a per-route retry multiplies.',
  }));
  assert.equal(code, 0);
});

// --- SPEC §4.1 round-trip preservation ---------------------------------------

/**
 * `--extend` is a round trip through the YAML document model, and §4.1 asks
 * consumers to preserve what they do not understand. Simple scalars, comments and
 * key order are covered above; these are the shapes that actually break naive
 * re-serialization.
 */
test('--extend preserves exotic but legal frontmatter it does not own', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');

  writeFileSync(file, [
    '---',
    'type: Runbook',
    'title: Mitigate gateway timeout defaults',
    'description: Refined from a dumps-area capture; not yet placed in the corpus.',
    'status: draft',
    'generated: { by: okf-refine/1.0, at: 2026-08-21T10:00:00Z }',
    'owner: &team platform',
    'escalation: *team',
    'runbook_steps: |',
    '  1. Read the listener default.',
    '  2. Set the per-route timeout.',
    'summary: >-',
    '  A folded scalar that wraps',
    '  onto a second line.',
    'thresholds:',
    '  warn: 0.5',
    '  page: 0.9',
    'empty_value:',
    'quoted_number: "42"',
    'unicode_title: "gateway — timeout · 504"',
    'sources:',
    '  - id: gateway-timeout',
    '    title: Gateway timeout defaults are per-route',
    '    resource: dumps/gateway-timeout',
    '---',
    '',
    '# Mitigate gateway timeout defaults',
    '',
    'Set the per-route timeout explicitly rather than relying on the listener default.',
  ].join('\n'));

  const code = quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root, extend: 'drafts/timeout-mitigation', append: true, by: BY, body: 'Follow-up.',
  }));
  assert.equal(code, 0);

  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^runbook_steps: \|$/m, 'a literal block scalar keeps its style');
  assert.match(raw, /^ {2}1\. Read the listener default\.$/m, 'and its content');
  assert.match(raw, /^summary: >-$/m, 'a folded scalar keeps its style');
  assert.match(raw, /^thresholds:$/m, 'a nested mapping survives');
  assert.match(raw, /^ {2}page: 0\.9$/m);
  assert.match(raw, /^quoted_number: "42"$/m, 'a quoted number is not turned into a number');
  assert.match(raw, /gateway — timeout · 504/, 'non-ASCII is not escaped away');
  assert.match(raw, /^empty_value:\s*$/m, 'an empty value stays empty rather than becoming null');

  // Anchors and aliases are legal YAML; whichever way the writer renders them, the
  // resolved value must survive.
  const reparsed = loadBundle(root).concepts.find((c) => c.id === 'drafts/timeout-mitigation')!;
  assert.equal(reparsed.data.escalation, 'platform', 'an alias still resolves to its anchor');
  assert.equal(reparsed.parseError, null, 'the result is still parseable');
});

test('a round trip through --extend is stable: extending twice changes only what it owns', () => {
  const root = sandbox();
  const file = join(root, 'drafts/timeout-mitigation.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace(
    'status: draft',
    'owner: platform\nthresholds:\n  warn: 0.5\nstatus: draft',
  ));

  quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root, extend: 'drafts/timeout-mitigation', append: true, by: BY, body: 'First.',
  }));
  const once = readFileSync(file, 'utf8');

  quiet(() => runRefine(['dumps/retry-budget'], {
    bundle: root, extend: 'drafts/timeout-mitigation', append: true, by: BY, body: 'Second.',
  }));
  const twice = readFileSync(file, 'utf8');

  // Only `generated.at` may differ in the frontmatter; the body legitimately grew.
  const frontmatter = (text: string) => text.split('\n---\n')[0].replace(/at: [^\s}]+/g, 'at: TIME');
  assert.equal(frontmatter(twice), frontmatter(once), 'no field churns on a second pass');
  assert.match(twice, /First\./, 'the first append survived the second');
  assert.match(twice, /Second\./);
  assert.match(twice, /^owner: platform$/m);
  assert.match(twice, /^ {2}warn: 0\.5$/m);
});
