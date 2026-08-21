import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConcept } from '../src/core/concept.ts';
import { fileURLToPath } from 'node:url';
import { loadBundle, findConcept } from '../src/core/bundle.ts';
import { conceptRefs, checkRefs, readFootnotes, readLinks, slugify } from '../src/core/refs.ts';

const FIXTURE = fileURLToPath(new URL('./fixtures/bundle', import.meta.url));

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

// --- internal links -------------------------------------------------------

test('link extraction keeps internal targets and drops the network', () => {
  const links = readLinks([
    'Root [x](/guides/x.md), relative [y](../decisions/y.md), fragment [z](#section).',
    'External [w](https://example.com/a.md), mail [m](mailto:a@b.c).',
    'Image ![alt](diagram.png), titled [t](/guides/t.md "A title"), empty [e]().',
    '',
    '`inline [c](/nope.md)` and:',
    '',
    '```',
    '[fenced](/also-nope.md)',
    '```',
  ].join('\n'));

  assert.deepEqual(
    links.map((link) => link.target),
    ['/guides/x.md', '../decisions/y.md', '#section', 'diagram.png', '/guides/t.md'],
  );
  assert.equal(links[2].path, '');
  assert.equal(links[2].fragment, 'section');
  assert.equal(links[0].fragment, null);
});

test('headings slugify the way Markdown renderers approximate', () => {
  assert.equal(slugify('Label shape'), 'label-shape');
  assert.equal(slugify('Purpose: why, exactly?'), 'purpose-why-exactly');
  // Whitespace runs collapse and the ends are trimmed, which is more lenient
  // than GitHub. A false "anchor missing" is the failure worth avoiding.
  assert.equal(slugify('  Mixed   CASE  '), 'mixed-case');
});

test('links resolve against the bundle, and never outside it', () => {
  const bundle = loadBundle(FIXTURE);
  const concept = findConcept(bundle, 'metrics/margin');
  concept.body = [
    'Root [a](/metrics/revenue.md).',
    'Relative [b](../computations/revenue.md).',
    'Sibling [c](revenue.md).',
    'Directory [d](../metrics/).',
    'Reserved [e](/index.md) and [f](../log.md).',
    'Missing [g](/metrics/nope.md).',
    'Escaping [h](../../../etc/passwd).',
  ].join('\n');

  const byTarget = new Map(
    conceptRefs(concept, { root: bundle.root }).links.map((link) => [link.target, link]),
  );

  assert.equal(byTarget.get('/metrics/revenue.md')!.resolvesTo, 'metrics/revenue.md');
  assert.equal(byTarget.get('../computations/revenue.md')!.resolvesTo, 'computations/revenue.md');
  assert.equal(byTarget.get('revenue.md')!.resolvesTo, 'metrics/revenue.md');
  assert.equal(byTarget.get('../metrics/')!.state, 'resolved');
  assert.equal(byTarget.get('/index.md')!.state, 'resolved');
  assert.equal(byTarget.get('../log.md')!.state, 'resolved');

  assert.equal(byTarget.get('/metrics/nope.md')!.state, 'unresolved');
  assert.equal(byTarget.get('/metrics/nope.md')!.resolvesTo, null);
  // Exists on disk, but outside the bundle: a bundle check must not call it healthy.
  assert.equal(byTarget.get('../../../etc/passwd')!.state, 'unresolved');
});

test('links are not read at all without a bundle root', () => {
  const concept = parseConcept('/x.md', 'x', '---\ntype: Metric\n---\nSee [a](/nope.md).\n');
  assert.deepEqual(conceptRefs(concept).links, []);
});

test('anchors are unexamined by default and verified on request', () => {
  const bundle = loadBundle(FIXTURE);
  const concept = findConcept(bundle, 'metrics/margin');
  concept.body = [
    'Present [a](/metrics/revenue.md#definition).',
    'Absent [b](/metrics/revenue.md#no-such-heading).',
    'Self [c](#definition).',
    'On a directory [d](../metrics/#whatever).',
  ].join('\n');

  const relaxed = new Map(
    conceptRefs(concept, { root: bundle.root }).links.map((link) => [link.target, link.state]),
  );
  assert.equal(relaxed.get('/metrics/revenue.md#no-such-heading'), 'resolved');

  const strict = new Map(
    conceptRefs(concept, { root: bundle.root, anchors: true }).links.map(
      (link) => [link.target, link.state],
    ),
  );
  assert.equal(strict.get('/metrics/revenue.md#definition'), 'resolved');
  assert.equal(strict.get('/metrics/revenue.md#no-such-heading'), 'anchor-missing');
  // A bare fragment addresses the document it sits in, whose own body has no headings.
  assert.equal(strict.get('#definition'), 'anchor-missing');
  // A directory has no headings to match, so its fragment stays unverifiable.
  assert.equal(strict.get('../metrics/#whatever'), 'resolved');
});
