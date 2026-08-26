import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBatch } from '../src/core/batch.ts';

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

test('an empty batch is refused', () => {
  assert.equal(quiet(() => runBatch([], () => 0)), 1);
});

test('a single concept is run directly, with no batch summary', () => {
  const written: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => void written.push(args.join(' '));
  try {
    assert.equal(runBatch(['one'], () => 0), 0);
  } finally {
    console.log = log;
  }
  assert.equal(written.join('\n').includes('succeeded'), false);
});

test('every concept runs even when one fails, and the batch reports non-zero', () => {
  const seen: string[] = [];
  const code = quiet(() => runBatch(['a', 'b', 'c'], (ref) => {
    seen.push(ref);
    return ref === 'b' ? 1 : 0;
  }));
  assert.deepEqual(seen, ['a', 'b', 'c'], 'a failure does not abandon the rest');
  assert.equal(code, 1);
});

test('a verb that throws fails only its own concept', () => {
  const seen: string[] = [];
  const code = quiet(() => runBatch(['a', 'b', 'c'], (ref) => {
    seen.push(ref);
    if (ref === 'b') throw new Error('no such concept');
    return 0;
  }));
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.equal(code, 1);
});

test('a wholly successful batch exits zero', () => {
  assert.equal(quiet(() => runBatch(['a', 'b'], () => 0)), 0);
});
