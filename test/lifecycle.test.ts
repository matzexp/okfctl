import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConcept, serializeConcept, appendEvent } from '../src/core/concept.ts';
import {
  conceptStatus,
  isDrifted,
  isStale,
  resolveStaleIn,
  trustTier,
  verifiedEvents,
} from '../src/core/lifecycle.ts';

const concept = (frontmatter: string, body = '\n# Body\n') =>
  parseConcept('/tmp/x.md', 'x', `---\n${frontmatter}\n---\n${body}`);

test('absent status defaults to stable (SPEC 5.4)', () => {
  assert.equal(conceptStatus(concept('type: Metric').data), 'stable');
  assert.equal(conceptStatus(concept('type: Metric\nstatus: draft').data), 'draft');
});

test('trust tiers derive from verified actors (SPEC 5.3)', () => {
  assert.equal(trustTier(concept('type: Metric').data), 'unverified');
  assert.equal(
    trustTier(concept('type: Metric\nverified: [{ by: process:nightly, at: 2026-01-01T00:00:00Z }]').data),
    'machine-confirmed',
  );
  assert.equal(
    trustTier(concept('type: Metric\nverified: [{ by: human:a, at: 2026-01-01T00:00:00Z }]').data),
    'human-reviewed',
  );
});

test('a bare verified mapping reads as a one-element list (SPEC 5.2)', () => {
  const events = verifiedEvents(concept('type: Metric\nverified: { by: human:a, at: 2026-01-01T00:00:00Z }').data);
  assert.equal(events.length, 1);
  assert.equal(events[0].by, 'human:a');
});

test('staleness is a plain date comparison (SPEC 5.5)', () => {
  const data = concept('type: Metric\nstale_after: 2026-06-01').data;
  assert.equal(isStale(data, new Date('2026-05-31T23:00:00Z')), false);
  assert.equal(isStale(data, new Date('2026-06-01T00:00:00Z')), true);
  assert.equal(isStale(concept('type: Metric').data, new Date()), false);
});

test('drift is content changed after the last verification', () => {
  const drifted = concept([
    'type: Metric',
    'generated: { by: agent/v1, at: 2026-08-01T00:00:00Z }',
    'verified: { by: human:a, at: 2026-07-01T00:00:00Z }',
  ].join('\n'));
  assert.equal(isDrifted(drifted.data), true);

  const clean = concept([
    'type: Metric',
    'generated: { by: agent/v1, at: 2026-07-01T00:00:00Z }',
    'verified: { by: human:a, at: 2026-08-01T00:00:00Z }',
  ].join('\n'));
  assert.equal(isDrifted(clean.data), false);
  assert.equal(isDrifted(concept('type: Metric').data), false);
});

test('v0.1 timestamp still feeds drift detection (SPEC 13.1)', () => {
  const legacy = concept([
    'type: Metric',
    "timestamp: '2026-08-01T00:00:00+00:00'",
    'verified: { by: human:a, at: 2026-07-01T00:00:00Z }',
  ].join('\n'));
  assert.equal(isDrifted(legacy.data), true);
});

test('round-tripping preserves key order, unknown keys, and body', () => {
  const original = [
    '---',
    'type: Metric',
    'title: Revenue',
    'custom_producer_key: keep-me',
    'tags: [a, b]',
    '---',
    '',
    '# Definition',
    '',
    'Body text.',
    '',
  ].join('\n');
  const parsed = parseConcept('/tmp/x.md', 'x', original);
  assert.equal(serializeConcept(parsed), original);
});

test('appendEvent promotes a bare mapping to a list', () => {
  const parsed = concept('type: Metric\nverified: { by: human:a, at: 2026-01-01T00:00:00Z }');
  appendEvent(parsed, 'verified', { by: 'process:nightly', at: '2026-02-01T00:00:00Z' });
  const events = verifiedEvents(parsed.data);
  assert.deepEqual(events.map((event) => event.by), ['human:a', 'process:nightly']);
  assert.match(serializeConcept(parsed), /verified:\n {2}- \{ by: human:a, at: /);
});

test('appendEvent creates the field when absent', () => {
  const parsed = concept('type: Metric');
  appendEvent(parsed, 'verified', { by: 'human:a', at: '2026-02-01T00:00:00Z' });
  assert.equal(trustTier(parsed.data), 'human-reviewed');
});

test('resolveStaleIn handles day, week, month, year', () => {
  const from = new Date('2026-01-01T00:00:00Z');
  assert.equal(resolveStaleIn('90d', from), '2026-04-01');
  assert.equal(resolveStaleIn('2w', from), '2026-01-15');
  assert.equal(resolveStaleIn('6m', from), '2026-07-01');
  assert.equal(resolveStaleIn('1y', from), '2027-01-01');
  assert.throws(() => resolveStaleIn('soon', from), /invalid duration/);
});
