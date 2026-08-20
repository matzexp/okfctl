import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConcept } from '../src/core/concept.ts';
import { conceptRefs, checkRefs, readFootnotes } from '../src/core/refs.ts';

test('footnote extraction ignores code fences and inline code', () => {
  const { footnotes, undefined: missing } = readFootnotes(
    'Cited.[^a] Not `a [^b] literal`.\n\n```\n[^c]: fenced\n```\n\n[^a]: Source A\n',
  );
  assert.deepEqual(footnotes.map((entry) => entry.label), ['a']);
  assert.equal(footnotes[0].uses, 1);
  assert.deepEqual(missing, []);
});

test('a footnote joins the sources entry that carries its label as an id', () => {
  const refs = conceptRefs(
    parseConcept('/x.md', 'x', [
      '---',
      'type: Metric',
      'sources:',
      '  - { id: policy, title: Policy }',
      '  - { id: orphan, title: Orphan }',
      '---',
      'Body.[^policy] And a rename that broke.[^stale-label]',
      '',
      '[^policy]: Policy',
      '[^stale-label]: Policy',
    ].join('\n')),
  );

  const states = new Map(refs.joins.map((join) => [join.label, join.state]));
  assert.equal(states.get('policy'), 'joined');
  assert.equal(states.get('stale-label'), 'unjoined');
  assert.equal(states.get('orphan'), 'uncited');
});

test('footnotes in a document with no sources are plain Markdown, not broken joins', () => {
  const concept = parseConcept('/x.md', 'x', '---\ntype: Metric\n---\nBody.[^n]\n\n[^n]: A note.\n');
  assert.equal(conceptRefs(concept).joins[0].state, 'plain');
  assert.deepEqual(checkRefs(concept), []);
});

test('checkRefs reports broken joins but never uncited sources', () => {
  const concept = parseConcept('/x.md', 'x', [
    '---',
    'type: Metric',
    'sources:',
    '  - { id: policy, title: Policy }',
    '---',
    'Body.[^ghost]',
  ].join('\n'));

  const rules = checkRefs(concept).map((diagnostic) => diagnostic.rule);
  assert.deepEqual(rules, ['footnote-undefined']);
  assert.equal(checkRefs(concept).every((diagnostic) => diagnostic.level === 'warn'), true);
});

test('duplicate source ids make the join ambiguous', () => {
  const concept = parseConcept('/x.md', 'x', [
    '---',
    'type: Metric',
    'sources:',
    '  - { id: policy, title: One }',
    '  - { id: policy, title: Two }',
    '---',
    'Body.[^policy]',
    '',
    '[^policy]: One',
  ].join('\n'));

  assert.equal(checkRefs(concept).some((entry) => entry.rule === 'source-id-duplicate'), true);
});
