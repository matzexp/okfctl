import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRelated } from '../src/commands/related.ts';

function captured(run: () => number): { code: number; out: string } {
  const written: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...args: unknown[]) => void written.push(args.join(' '));
  console.error = () => {};
  try {
    return { code: run(), out: written.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

function concept(root: string, id: string, frontmatter: string[], body: string): void {
  writeFileSync(join(root, `${id}.md`), ['---', ...frontmatter, '---', '', body].join('\n'));
}

/**
 * A small graph: `subject` links to `target`, `citer` links back to `subject`,
 * `tagged` only shares a tag, `worded` only shares vocabulary, `alone` shares
 * nothing.
 */
function graph(): string {
  const root = mkdtempSync(join(tmpdir(), 'okf-related-'));
  writeFileSync(join(root, 'index.md'), '---\nokf_version: "0.2"\n---\n\n# Graph\n');
  writeFileSync(join(root, 'log.md'), '# Directory Update Log\n');

  concept(root, 'subject', ['type: Decision', 'title: Envoy Gateway routing', 'tags: [networking]'],
    'We route through [the CNI decision](/target.md).');
  concept(root, 'target', ['type: Decision', 'title: Cilium as CNI'], 'The CNI.');
  concept(root, 'citer', ['type: Guide', 'title: Operating the gateway'],
    'See [the routing decision](/subject.md).');
  concept(root, 'tagged', ['type: Guide', 'title: Unrelated words entirely', 'tags: [networking]'],
    'Nothing in common but the tag.');
  concept(root, 'worded', ['type: Guide', 'title: Envoy Gateway troubleshooting'], 'Envoy Gateway notes.');
  concept(root, 'alone', ['type: Note', 'title: Quarterly revenue'], 'Numbers.');
  return root;
}

const parsed = (root: string, id: string) => {
  const { code, out } = captured(() => runRelated({ bundle: root, concept: id, json: true }));
  assert.equal(code, 0);
  return JSON.parse(out) as {
    concept: string;
    total: number;
    related: { id: string; relation: string; sharedTags: string[] }[];
  };
};

test('an outbound link is reported, and the subject never lists itself', () => {
  const data = parsed(graph(), 'subject');
  const ids = data.related.map((entry) => entry.id);
  assert.ok(ids.includes('target'));
  assert.equal(ids.includes('subject'), false);
  assert.equal(data.related.find((entry) => entry.id === 'target')!.relation, 'links-out');
});

test('an inbound link is reported', () => {
  const data = parsed(graph(), 'subject');
  assert.equal(data.related.find((entry) => entry.id === 'citer')!.relation, 'links-in');
});

test('a shared tag is reported, naming which tags overlap', () => {
  const data = parsed(graph(), 'subject');
  const tagged = data.related.find((entry) => entry.id === 'tagged')!;
  assert.equal(tagged.relation, 'shared-tags');
  assert.deepEqual(tagged.sharedTags, ['networking']);
});

test('vocabulary overlap is the weakest relation, reported last', () => {
  const data = parsed(graph(), 'subject');
  const worded = data.related.find((entry) => entry.id === 'worded');
  assert.ok(worded, 'a concept sharing only wording still surfaces');
  assert.equal(worded!.relation, 'similar');

  const order = ['links-out', 'links-in', 'shared-tags', 'similar'];
  const ranks = data.related.map((entry) => order.indexOf(entry.relation));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'strongest relation first');
});

test('a deliberate link outranks a tag the same concept also shares', () => {
  const root = graph();
  // `target` now also carries the subject's tag; the link is the stronger claim.
  concept(root, 'target', ['type: Decision', 'title: Cilium as CNI', 'tags: [networking]'], 'The CNI.');
  const data = parsed(root, 'subject');
  assert.equal(data.related.find((entry) => entry.id === 'target')!.relation, 'links-out');
  assert.equal(data.related.filter((entry) => entry.id === 'target').length, 1, 'reported once');
});

test('a concept with no neighbours says so rather than printing the corpus', () => {
  const { code, out } = captured(() => runRelated({ bundle: graph(), concept: 'alone' }));
  assert.equal(code, 0);
  assert.match(out, /stands alone/);
});

test('--limit bounds the output and reports what was withheld', () => {
  const { code, out } = captured(() =>
    runRelated({ bundle: graph(), concept: 'subject', limit: 1 }));
  assert.equal(code, 0);
  assert.match(out, /more not shown/);
});

test('an unresolvable concept reference is refused', () => {
  const { code } = captured(() => runRelated({ bundle: graph(), concept: 'does-not-exist' }));
  assert.equal(code, 1);
});

test('related never writes', () => {
  const root = graph();
  const before = JSON.stringify(parsed(root, 'subject'));
  captured(() => runRelated({ bundle: root, concept: 'subject' }));
  assert.equal(JSON.stringify(parsed(root, 'subject')), before);
});
