import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/core/bundle.ts';
import { checkBundle, countBy } from '../src/core/check.ts';
import { runCapture, slugify } from '../src/commands/capture.ts';
import { runMove } from '../src/commands/move.ts';

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

const SESSION = 'testsession-0000';
const DAY = new Date('2026-08-22T09:00:00Z');
/** The id the generated scheme produces for the nth capture of that session that day. */
const generated = (n: number) => `2026-08-22-testsess-${n}`;

const base = {
  by: 'claude-code/2.1',
  body: 'What we learned.',
  noOrigin: true,
  session: SESSION,
  now: DAY,
};

test('a minimal capture lands in the drafts area with a provisional type', () => {
  const root = sandbox();
  const code = quiet(() => runCapture({ bundle: root, title: 'Envoy replaces Traefik', ...base }));
  assert.equal(code, 0);

  const file = join(root, `drafts/${generated(1)}.md`);
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
  const raw = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');
  assert.match(raw, /^type: Decision$/m);
});

test('--to writes outside the drafts area', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Margin rule', to: 'metrics', ...base }));
  // The scheme applies wherever it lands; --to changes the directory, not the naming.
  assert.ok(existsSync(join(root, `metrics/${generated(1)}.md`)));
  assert.equal(existsSync(join(root, `drafts/${generated(1)}.md`)), false);
});

test('the body is copied verbatim, not templated', () => {
  const root = sandbox();
  const body = '## Raw heading\n\n- one\n- two\n\n```sh\nnot [a](link)\n```\n';
  quiet(() => runCapture({ bundle: root, ...base, title: 'Verbatim', body }));
  const raw = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');
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

test('an explicit id collision refuses rather than overwriting', () => {
  const root = sandbox();
  const before = readFileSync(join(root, 'drafts/retry-budget.md'), 'utf8');
  const code = quiet(() => runCapture({ bundle: root, title: 'Retry budget', id: 'retry-budget', ...base }));
  assert.equal(code, 1);
  assert.equal(readFileSync(join(root, 'drafts/retry-budget.md'), 'utf8'), before);
});

test('a generated id never refuses, however many captures share a title', () => {
  const root = sandbox();
  for (const n of [1, 2, 3]) {
    assert.equal(quiet(() => runCapture({ bundle: root, title: 'The same finding', ...base })), 0);
    assert.ok(existsSync(join(root, `drafts/${generated(n)}.md`)), `capture ${n} written`);
  }
});

test('a reserved filename is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Index', id: 'index', ...base })), 1);
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'Log', id: 'log', ...base })), 1);
});

test('a dry run writes nothing at all', () => {
  const root = sandbox();
  const logBefore = readFileSync(join(root, 'log.md'), 'utf8');
  const code = quiet(() => runCapture({ bundle: root, title: 'Nothing doing', ...base, dryRun: true }));
  assert.equal(code, 0);
  assert.equal(existsSync(join(root, `drafts/${generated(1)}.md`)), false);
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

  quiet(() => runCapture({ ...base, bundle: root, title: 'From a repo', body: 'x', from: work, noOrigin: false }));
  const raw = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');
  assert.match(raw, /sources:/);
  assert.match(raw, /id: origin/);
  assert.match(raw, /git@example\.com:acme\/api\.git@[0-9a-f]{7}/);
});

test('outside a repository the origin names the directory alone', () => {
  const root = sandbox();
  const work = mkdtempSync(join(tmpdir(), 'okfctl-plain-'));
  quiet(() => runCapture({ ...base, bundle: root, title: 'From nowhere', body: 'x', from: work, noOrigin: false }));
  const raw = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');
  assert.match(raw, /id: origin/);
  assert.match(raw, new RegExp(`title: ${work.replace(/[/\\]/g, '.')}`));
  // Scoped to the origin entry: the session entry legitimately carries a resource.
  const originEntry = /- id: origin\n((?:    .*\n)*)/.exec(raw)![1];
  assert.doesNotMatch(originEntry, /resource:/, 'no repository fields are invented');
});

test('capturing from inside the bundle records no origin', () => {
  const root = sandbox();
  mkdirSync(join(root, 'metrics'), { recursive: true });
  quiet(() => runCapture({ ...base, bundle: root, title: 'From within', body: 'x', from: join(root, 'metrics'), noOrigin: false, session: undefined }));
  const raw = readFileSync(join(root, `drafts/2026-08-22-adhoc-1.md`), 'utf8');
  assert.doesNotMatch(raw, /sources:/, 'a concept does not cite the bundle it lives in');
});

test('an overridden drafts area is where captures land', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, draftsDir: 'inbox', title: 'Elsewhere', ...base }));
  assert.ok(existsSync(join(root, `inbox/${generated(1)}.md`)));
});

test('slugify normalizes an explicit id and never cuts mid-word', () => {
  assert.equal(slugify('Envoy replaces Traefik at the edge'), 'envoy-replaces-traefik-at-the-edge');
  assert.equal(slugify('  Spaces --- and   punctuation!!  '), 'spaces-and-punctuation');
  assert.equal(slugify('CAPS and 123'), 'caps-and-123');

  // The bug that produced `...-resource-labels-and-histogra`.
  const long = 'victoriametrics cardinality is dominated by resource labels and histogram families';
  const cut = slugify(long);
  assert.ok(cut.length <= 72);
  assert.ok(long.split(' ').includes(cut.split('-').pop()!), 'the last segment is a whole word');
  assert.doesNotMatch(cut, /-$/);
});

test('the generated id is date, session and sequence', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'One', ...base }));
  quiet(() => runCapture({ bundle: root, title: 'Two', ...base }));
  assert.ok(existsSync(join(root, `drafts/${generated(1)}.md`)));
  assert.ok(existsSync(join(root, `drafts/${generated(2)}.md`)));
});

test('different sessions on one day each start their sequence again', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'A', ...base }));
  quiet(() => runCapture({ bundle: root, title: 'B', ...base, session: 'othersession-1111' }));
  assert.ok(existsSync(join(root, 'drafts/2026-08-22-testsess-1.md')));
  assert.ok(existsSync(join(root, 'drafts/2026-08-22-otherses-1.md')));
});

test('the same session on a later day starts again at one', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Day one', ...base }));
  quiet(() => runCapture({ bundle: root, title: 'Day two', ...base, now: new Date('2026-08-23T09:00:00Z') }));
  assert.ok(existsSync(join(root, 'drafts/2026-08-22-testsess-1.md')));
  assert.ok(existsSync(join(root, 'drafts/2026-08-23-testsess-1.md')));
});

test('the sequence is read from the bundle, not from any state the caller holds', () => {
  const root = sandbox();
  // Pre-seed the drafts area as if an earlier, unrelated process had captured.
  writeFileSync(join(root, `drafts/${generated(1)}.md`), '---\ntype: Note\ntitle: Seeded\n---\n');
  writeFileSync(join(root, `drafts/${generated(4)}.md`), '---\ntype: Note\ntitle: Seeded\n---\n');

  quiet(() => runCapture({ bundle: root, title: 'Next', ...base }));
  assert.ok(existsSync(join(root, `drafts/${generated(5)}.md`)), 'continues past the highest on disk');
});

test('a missing session is labelled, never fabricated', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'No session', ...base, session: undefined }));

  const file = join(root, 'drafts/2026-08-22-adhoc-1.md');
  assert.ok(existsSync(file), 'a fixed stand-in label, not a generated identifier');
  assert.doesNotMatch(readFileSync(file, 'utf8'), /id: session/, 'and nothing is claimed about it');
});

test('sessionless captures still cannot collide', () => {
  const root = sandbox();
  for (const n of [1, 2, 3]) {
    quiet(() => runCapture({ bundle: root, title: `Anon ${n}`, ...base, session: undefined }));
    assert.ok(existsSync(join(root, `drafts/2026-08-22-adhoc-${n}.md`)));
  }
});

test('the session is recorded as provenance alongside the origin', () => {
  const root = sandbox();
  const work = mkdtempSync(join(tmpdir(), 'okfctl-sess-'));
  quiet(() => runCapture({ ...base, bundle: root, title: 'Both', body: 'x', from: work, noOrigin: false }));

  const raw = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');
  assert.match(raw, /id: origin/);
  assert.match(raw, /id: session/);
  assert.match(raw, new RegExp(`resource: ${SESSION}`), 'the full session id, not the truncated label');
});

test('the session record outlives the filename', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Will move', ...base }));
  const before = readFileSync(join(root, `drafts/${generated(1)}.md`), 'utf8');

  quiet(() => runMove(generated(1), 'metrics/renamed-by-hand', { bundle: root, by: 'human:matze' }));
  const after = readFileSync(join(root, 'metrics/renamed-by-hand.md'), 'utf8');

  assert.match(after, new RegExp(`resource: ${SESSION}`), 'provenance survives the rename');
  assert.equal(
    /- id: session[\s\S]*?(?=\n---|\n  - id:|$)/.exec(before)?.[0],
    /- id: session[\s\S]*?(?=\n---|\n  - id:|$)/.exec(after)?.[0],
  );
});

test('an explicit id overrides the generated one', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Whatever', id: 'A Chosen Name', ...base }));
  assert.ok(existsSync(join(root, 'drafts/a-chosen-name.md')));
  assert.equal(existsSync(join(root, `drafts/${generated(1)}.md`)), false);
});

test('an id that reduces to nothing is refused', () => {
  const root = sandbox();
  assert.equal(quiet(() => runCapture({ bundle: root, title: 'X', id: '!!!', ...base })), 1);
});

test('no title is ever turned into an id', () => {
  const root = sandbox();
  quiet(() => runCapture({ bundle: root, title: 'Envoy replaces Traefik at the edge', ...base }));
  assert.equal(existsSync(join(root, 'drafts/envoy-replaces-traefik-at-the-edge.md')), false);
  assert.ok(existsSync(join(root, `drafts/${generated(1)}.md`)));
});
