import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BREAKER_LIMIT, decide, payloadFor } from '../src/commands/hook.ts';
import { runRegister, runInit } from '../src/commands/init.ts';
import { requireBundleDir, stateDir } from '../src/core/userconfig.ts';
import { runCapture } from '../src/commands/capture.ts';
import { loadBundle } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';

function isolate(): string {
  const home = mkdtempSync(join(tmpdir(), 'okfctl-hookhome-'));
  process.env.OKFCTL_CONFIG_HOME = join(home, 'config');
  process.env.OKFCTL_STATE_HOME = join(home, 'state');
  return home;
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

/** A registered bundle, so the hook has somewhere to point at. */
function registered(): string {
  const root = mkdtempSync(join(tmpdir(), 'okfctl-kb-'));
  quiet(() => runInit(root, {}));
  quiet(() => runRegister(root));
  return root;
}

const stop = (session: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ session_id: session, hook_event_name: 'Stop', ...extra });
const submit = (session: string) =>
  JSON.stringify({ session_id: session, hook_event_name: 'UserPromptSubmit' });

function turn(session: string, every = 1, extra: Record<string, unknown> = {}, now = Date.now()) {
  decide({ payload: submit(session) }, now);
  return decide({ payload: stop(session, extra), every }, now);
}

test('a turn is held open, and the prompt names the registered bundle', () => {
  isolate();
  const bundle = registered();
  const outcome = turn('s1');
  assert.equal(outcome.blocking, true, 'the turn is held open');
  assert.equal(outcome.code, 0, 'blocking is a decision, never an exit status');
  assert.equal(outcome.reason, 'blocked');
  assert.match(outcome.message ?? '', new RegExp(bundle.replace(/[/\\]/g, '.')));
  assert.match(outcome.message ?? '', /do not\s*\n?\s*paste the transcript/i);
});

test('the continuation a block produced is not itself blocked', () => {
  isolate();
  registered();
  assert.equal(turn('s2').blocking, true);
  // The continuation ends in a Stop with no fresh user input before it.
  const continuation = decide({ payload: stop('s2'), every: 1 });
  assert.equal(continuation.blocking, false);
  assert.equal(continuation.reason, 'continuation');
});

test("Codex's own stop_hook_active suppresses a repeat block", () => {
  isolate();
  registered();
  const outcome = turn('s3', 1, { stop_hook_active: true });
  assert.equal(outcome.blocking, false);
  assert.equal(outcome.reason, 'continuation');
});

test('the interval decides which turns are held open', () => {
  isolate();
  registered();
  const reasons = [1, 2, 3, 4, 5, 6].map(() => turn('s4', 3).reason);
  assert.deepEqual(reasons, ['not-due', 'not-due', 'blocked', 'not-due', 'not-due', 'blocked']);
});

test('the count restarts per session', () => {
  isolate();
  registered();
  assert.equal(turn('a', 2).reason, 'not-due');
  assert.equal(turn('b', 2).reason, 'not-due', 'a different session starts its own count');
  assert.equal(turn('a', 2).reason, 'blocked');
});

test('the circuit breaker bounds a runaway session', () => {
  isolate();
  registered();
  const now = Date.now();
  for (let i = 0; i < BREAKER_LIMIT; i++) {
    assert.equal(turn('runaway', 1, {}, now + i).blocking, true);
  }
  const tripped = turn('runaway', 1, {}, now + BREAKER_LIMIT);
  assert.equal(tripped.blocking, false);
  assert.equal(tripped.reason, 'breaker');
  assert.match(tripped.message ?? '', /disabled for this session/);

  // And it stays tripped.
  assert.equal(turn('runaway', 1, {}, now + BREAKER_LIMIT + 1).blocking, false);
});

test('with no registered bundle the hook never holds a turn open', () => {
  isolate();
  const outcome = turn('s5');
  assert.equal(outcome.blocking, false);
  assert.equal(outcome.reason, 'no-bundle');
});

test('every malformed input ends the turn', () => {
  isolate();
  registered();
  for (const payload of ['', 'not json', '{}', '[]', 'null', JSON.stringify({ session_id: '' })]) {
    assert.equal(decide({ payload, every: 1 }).code, 0, `payload ${JSON.stringify(payload)}`);
  }
});

test('events other than Stop and UserPromptSubmit are ignored', () => {
  isolate();
  registered();
  for (const event of ['SessionEnd', 'PreCompact', 'PostToolUse', 'SessionStart']) {
    const outcome = decide({ payload: JSON.stringify({ session_id: 'x', hook_event_name: event }) });
    assert.equal(outcome.code, 0);
    assert.equal(outcome.message, null);
  }
});

test('the hook writes no knowledge and no state inside the bundle', () => {
  isolate();
  const bundle = registered();
  const before = readdirSync(bundle).sort();
  turn('s6');
  assert.deepEqual(readdirSync(bundle).sort(), before, 'the bundle is untouched by the hook');
  assert.equal(existsSync(join(bundle, 'dumps', 'index.md')), false);

  // The session marker lives in user-level state instead.
  assert.ok(existsSync(join(stateDir(), 'sessions')));
});

test('an unarmed session is never blocked, whatever the interval', () => {
  isolate();
  registered();
  // Stop with no preceding user input at all.
  const outcome = decide({ payload: stop('s7'), every: 1 });
  assert.equal(outcome.blocking, false);
  assert.equal(outcome.reason, 'continuation');
});

test('end to end: a hook prompt in an unrelated repo captures into the registered bundle', () => {
  isolate();
  const bundle = registered();

  // A working directory that is not the bundle, and is its own git repository.
  const work = mkdtempSync(join(tmpdir(), 'okfctl-e2e-'));
  execFileSync('git', ['init', '-q'], { cwd: work });
  execFileSync('git', ['remote', 'add', 'origin', 'git@example.com:acme/payments-api.git'], { cwd: work });
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: work });

  // The turn ends: the hook holds it open and names where knowledge goes.
  const outcome = turn('e2e');
  assert.equal(outcome.blocking, true);
  assert.match(outcome.message ?? '', new RegExp(bundle.replace(/[/\\]/g, '.')));

  // The agent, prompted, resolves the bundle the same way and captures.
  const target = requireBundleDir(work);
  assert.equal(target, bundle, 'outside any bundle, the registered one is the target');

  const code = quiet(() => runCapture({
    bundle: target,
    title: 'Timeouts are per route',
    by: 'claude-code/2.1',
    body: 'The edge gateway applies its timeout per route.',
    from: work,
    // The agent passes the session the hook reported, which the id groups on.
    session: 'e2e',
    now: new Date('2026-08-22T09:00:00Z'),
  }));
  assert.equal(code, 0);

  const file = join(bundle, 'dumps', '2026-08-22-e2e-1.md');
  assert.ok(existsSync(file), 'the capture lands in the registered bundle');
  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^status: draft$/m);
  assert.match(raw, /generated: \{ by: claude-code\/2\.1/);
  assert.match(raw, /git@example\.com:acme\/payments-api\.git@[0-9a-f]{7}/, 'the origin repo is recorded');
  assert.match(raw, /id: session/, 'and the session that produced it');
  assert.equal(countBy(checkBundle(loadBundle(bundle)), 'error'), 0);
});

test('blocking is a decision on stdout, never an error on stderr', () => {
  isolate();
  const bundle = registered();
  const outcome = turn('json1');

  const payload = JSON.parse(payloadFor(outcome)!);
  assert.equal(payload.decision, 'block', 'the documented blocking decision');
  assert.match(payload.reason, new RegExp(bundle.replace(/[/\\]/g, '.')));
  assert.equal(payload.continue, undefined, '"continue": false would halt processing entirely');
  assert.equal(outcome.code, 0, 'an advisory prompt is not a hook failure');
});

test('the exit code is 0 on every path there is', () => {
  isolate();
  registered();
  const codes = new Set<number>();
  codes.add(turn('x', 1).code);                                  // blocked
  codes.add(decide({ payload: stop('x'), every: 1 }).code);       // continuation
  codes.add(turn('y', 5).code);                                   // not due
  codes.add(turn('z', 1, { stop_hook_active: true }).code);        // host guard
  codes.add(decide({ payload: 'not json' }).code);                 // malformed
  codes.add(decide({ payload: JSON.stringify({ session_id: 'q', hook_event_name: 'SessionEnd' }) }).code);
  assert.deepEqual([...codes], [0], 'no exit status can ever hold a user in a conversation');
});

test('a quiet outcome writes nothing at all to stdout', () => {
  isolate();
  registered();
  assert.equal(payloadFor(turn('quiet', 5)), null, 'a turn that is not due says nothing');
  assert.equal(payloadFor(decide({ payload: 'not json' })), null);
});

test('the breaker warning is a system message, not a block', () => {
  isolate();
  registered();
  const now = Date.now();
  for (let i = 0; i < BREAKER_LIMIT; i++) turn('trip', 1, {}, now + i);
  const tripped = turn('trip', 1, {}, now + BREAKER_LIMIT);

  const payload = JSON.parse(payloadFor(tripped)!);
  assert.equal(payload.decision, undefined, 'it must not block');
  assert.match(payload.systemMessage, /disabled for this session/);
});
