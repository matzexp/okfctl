import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';
import { runCapture, slugify } from '../src/commands/capture.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

function sandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'okfctl-capture-'));
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

const base = { by: 'claude-code/2.1', body: 'What we learned.', noOrigin: true };

test('a minimal capture lands in the drafts area with a provisional type', () => {
  const root = sandbox();
  const code = quiet(() => runCapture({ bundle: root, title: 'Envoy replaces Traefik', ...base }));
  assert.equal(code, 0);

  const file = join(root, 'drafts/envoy-replaces-traefik.md');
  assert.ok(existsSync(file));
  const raw = readFileSync(file, 'utf8');
  assert.match(raw, /^type: Note$/m);
  assert.match(raw, /^status: draft$/m);
  assert.match(raw, /generated: \{ by: claude-code\/2\.1/);
  assert.doesNotMatch(raw, /^verified:/m);
});

test('a capture is conformant on the first write', () => {
  const root = sandbox();
  const before = countBy(checkBundle(loadBundle(root)), 'error');
  quiet(() => runCapture({ bundle: root, title: 'Retry budgets are shared', ...base }));
  const after = countBy(checkBundle(loadBundle(root)), 'error');
  assert.equal(after, before, 'capture must contribute zero new conformance errors');
});

test('an explicit type is honored and no provisional default applied', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Gateway choice', type: 'Decision', ...base }));
  const raw = readFileSync(join(root, 'drafts/gateway-choice.md'), 'utf8');
  assert.match(raw, /^type: Decision$/m);
});

test('--to writes outside the drafts area', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Margin rule', to: 'metrics', ...base }));
  assert.ok(existsSync(join(root, 'metrics/margin-rule.md')));
  assert.equal(existsSync(join(root, 'drafts/margin-rule.md')), false);
});

test('the body is copied verbatim, not templated', () => {
  const root = sandbox();
  const body = '## Raw heading\n\n- one\n- two\n\n```sh\nnot [a](link)\n```\n';
  quiet(() => runCapture({ bundle: root, title: 'Verbatim', by: base.by, body, noOrigin: true }));
  const raw = readFileSync(join(root, 'drafts/verbatim.md'), 'utf8');
  assert.ok(raw.endsWith(body), 'body must survive byte-for-byte');
  assert.doesNotMatch(raw, /# Verbatim/, 'no heading is invented');
});

test('a missing or invalid actor is refused, and nothing is written', () => {
  const root = sandbox();
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'No actor', body: 'x' })), 1);
  assert.equal(existsSync(join(root, 'drafts/no-actor.md')), false);
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Bad actor', by: 'matze', body: 'x' })), 1);
  assert.equal(existsSync(join(root, 'drafts/bad-actor.md')), false);
});

test('an empty body is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Empty', by: base.by, body: '  \n' })), 1);
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'None', by: base.by })), 1);
});

test('a collision refuses rather than overwriting', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'drafts/retry-budget.md'), 'utf8');
  const code = quiet(() => runCapture({ bundle: root, title: 'Retry budget', ...base }));
  assert.equal(code, 1);
  assert.equal(readFileSync(join(root, 'drafts/retry-budget.md'), 'utf8'), before);
});

test('a reserved filename is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Index', ...base })), 1);
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Log', ...base })), 1);
});

test('a dry run writes nothing at all', () => {
  const root = sandbox();
  const logBefore = readFileSync(join(root, 'log.md'), 'utf8');
  const code = quiet(() => runCapture({ bundle: root, title: 'Nothing doing', ...base, dryRun: true }));
  assert.equal(code, 0);
  assert.equal(existsSync(join(root, 'drafts/nothing-doing.md')), false);
  assert.equal(readFileSync(join(root, 'log.md'), 'utf8'), logBefore);
});

test('the capture is logged', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Logged thing', ...base }));
  assert.match(readFileSync(join(root, 'log.md'), 'utf8'), /\*\*Captured\*\*.*Logged thing/);
});

test('an origin is recorded outside the bundle, with git detail when there is a repo', () => {
  const root = sandbox();
  const work = mkdtempSync(join(tmpdir(), 'okfctl-work-'));
  execFileSync('git', ['init', '-q'], { cwd: work });
  execFileSync('git', ['remote', 'add', 'origin', 'git@example.com:acme/api.git'], { cwd: work });
  execFileSync('git', ['-c', 'user.email=t@e', '-c', 'user.name=T', 'commit', '-q', '--allow-empty', '-m', 'x'], { cwd: work });

  quiet(() => runCapture({ bundle: root, title: 'From a repo', by: base.by, body: 'x', from: work }));
  const raw = readFileSync(join(root, 'drafts/from-a-repo.md'), 'utf8');
  assert.match(raw, /sources:/);
  assert.match(raw, /id: origin/);
  assert.match(raw, /git@example\.com:acme\/api\.git@[0-9a-f]{7}/);
});

test('outside a repository the origin names the directory alone', () => {
  const root = sandbox();
  const work = mkdtempSync(join(tmpdir(), 'okfctl-plain-'));
  quiet(() => runCapture({ bundle: root, title: 'From nowhere', by: base.by, body: 'x', from: work }));
  const raw = readFileSync(join(root, 'drafts/from-nowhere.md'), 'utf8');
  assert.match(raw, /id: origin/);
  assert.match(raw, new RegExp(`title: ${work.replace(/[/\\]/g, '.')}`));
  assert.doesNotMatch(raw, /resource:/);
});

test('capturing from inside the bundle records no origin', () => {
  const root = sandbox();
  mkdirSync(join(root, 'metrics'), { recursive: true });
  quiet(() => runCapture({ bundle: root, title: 'From within', by: base.by, body: 'x', from: join(root, 'metrics') }));
  const raw = readFileSync(join(root, 'drafts/from-within.md'), 'utf8');
  assert.doesNotMatch(raw, /sources:/, 'a concept does not cite the bundle it lives in');
});

test('an overridden drafts area is where captures land', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, draftsDir: 'inbox', title: 'Elsewhere', ...base }));
  assert.ok(existsSync(join(root, 'inbox/elsewhere.md')));
});

test('slugify produces bundle-style ids', () => {
  assert.equal(slugify('Envoy replaces Traefik at the edge'), 'envoy-replaces-traefik-at-the-edge');
  assert.equal(slugify('  Spaces --- and   punctuation!!  '), 'spaces-and-punctuation');
  assert.equal(slugify('CAPS and 123'), 'caps-and-123');
});
