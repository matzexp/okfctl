import { readFileSync } from 'node:fs';
import { parseDocument, Document, YAMLMap, YAMLSeq, isMap, isSeq } from 'yaml';

/** A single OKF concept document (SPEC §4). */
export interface Concept {
  /** Absolute path on disk. */
  file: string;
  /** Bundle-relative path with the `.md` suffix removed (SPEC §2). */
  id: string;
  /** Editable YAML document, or null when the file has no frontmatter block. */
  doc: Document.Parsed | null;
  /** Plain-JS view of the frontmatter. Empty when `doc` is null. */
  data: Record<string, unknown>;
  /** Everything after the frontmatter block. */
  body: string;
  /** True when the delimiters were present but the YAML failed to parse. */
  parseError: string | null;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

/**
 * The raw YAML between the delimiters, or null when the document has no
 * frontmatter block. Callers that need to inspect keys must go through this
 * rather than scanning the whole file: a body line like `Note: ...` is prose,
 * not a key, and reading it as one turns ordinary writing into a defect report.
 */
export function frontmatterText(raw: string): string | null {
  const match = FRONTMATTER.exec(raw);
  return match ? match[1] : null;
}

/**
 * Top-level frontmatter keys, in document order. `[]` when the document has no
 * frontmatter block at all; `null` when it opens one that does not parse, which
 * a caller checking a reserved file has to report rather than wave through.
 */
export function frontmatterKeys(raw: string): string[] | null {
  const yamlText = frontmatterText(raw);
  if (yamlText === null) return [];
  const doc = parseDocument(yamlText);
  if (doc.errors.length > 0) return null;
  if (!isMap(doc.contents)) return [];
  return doc.contents.items
    .map((item) => (item.key as { value?: unknown })?.value)
    .filter((key): key is string => typeof key === 'string');
}

export function parseConcept(file: string, id: string, raw: string): Concept {
  const match = FRONTMATTER.exec(raw);
  if (!match) {
    return { file, id, doc: null, data: {}, body: raw, parseError: null };
  }

  const [, yamlText, body = ''] = match;
  const doc = parseDocument(yamlText, { keepSourceTokens: true });
  const fatal = doc.errors[0];
  if (fatal) {
    return { file, id, doc: null, data: {}, body, parseError: fatal.message };
  }

  const data = (doc.toJS() ?? {}) as Record<string, unknown>;
  return { file, id, doc, data, body, parseError: null };
}

/**
 * Build a concept that has no file behind it yet. Frontmatter goes through the
 * same `Document` the parser produces, so `serializeConcept` renders a created
 * concept and an edited one identically — there is no second formatter to keep
 * in sync.
 *
 * Keys are written in the order given. Values that are `undefined` are skipped
 * entirely: an empty `description:` is worse than an absent one, since `check`
 * warns on absent and silently accepts blank.
 */
export function createConcept(
  file: string,
  id: string,
  frontmatter: Array<[string, unknown]>,
  body: string,
): Concept {
  const doc = new Document({});
  for (const [key, value] of frontmatter) {
    if (value === undefined || value === null) continue;
    doc.set(key, conventionalNode(doc, value));
  }
  return { file, id, doc: doc as Document.Parsed, data: (doc.toJS() ?? {}) as Record<string, unknown>, body, parseError: null };
}

export function readConcept(file: string, id: string): Concept {
  return parseConcept(file, id, readFileSync(file, 'utf8'));
}

/**
 * Render a concept back to disk form. Frontmatter goes through the YAML
 * document model rather than a re-serialized JS object, so key order,
 * comments, and producer-defined keys we do not understand all survive
 * the round trip (SPEC §4.1).
 */
export function serializeConcept(concept: Concept): string {
  if (!concept.doc) return concept.body;
  const yamlText = tightenFlowSeqs(concept.doc.toString({ lineWidth: 0 })).replace(/\n+$/, '');
  return `---\n${yamlText}\n---\n${concept.body}`;
}

/**
 * The YAML writer pads every flow collection, but OKF's own examples pad flow
 * mappings (`{ by: x, at: y }`) and leave flow sequences tight (`tags: [a, b]`).
 * Matching both keeps `promote` from churning lines it never touched. Only
 * sequences of plain scalars are tightened; anything holding a nested
 * collection is left exactly as the writer produced it.
 */
function tightenFlowSeqs(yamlText: string): string {
  return yamlText.replace(/\[ ([^[\]{}]*?) \]/g, '[$1]');
}

/** Display name for a concept: `title`, else the filename stem (SPEC §4.1). */
export function conceptTitle(concept: Concept): string {
  const title = concept.data.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  return concept.id.split('/').pop() ?? concept.id;
}

/**
 * Match the bundle's conventions: `{ by, at }` mappings and `[a, b]` sequences of
 * scalars stay on one line; anything nested does not.
 */
function conventionalNode(doc: Document, value: unknown): unknown {
  const node: unknown = doc.createNode(value);
  if (isMap(node)) node.flow = true;
  else if (isSeq(node) && node.items.every((item) => !isMap(item) && !isSeq(item))) {
    node.flow = true;
  }
  return node;
}

/**
 * Set a top-level frontmatter key, preserving surrounding structure — an existing
 * key keeps its position, and every key this one does not name is left untouched.
 * The value is rendered with the same conventions `createConcept` uses, so a field
 * written here and the same field written on creation look identical on disk.
 */
export function setField(concept: Concept, key: string, value: unknown): void {
  if (!concept.doc) throw new Error(`${concept.id}: no frontmatter to edit`);
  concept.doc.set(key, conventionalNode(concept.doc, value));
  concept.data[key] = value;
}

/**
 * Append a `{ by, at }` entry to a list-valued frontmatter field, coercing a
 * bare mapping into a one-element sequence first. SPEC §5.2 permits a single
 * `verified` entry to be written without the list dash, so any writer has to
 * handle both shapes.
 */
export function appendEvent(
  concept: Concept,
  key: string,
  event: { by: string; at: string },
): void {
  const doc = concept.doc;
  if (!doc) throw new Error(`${concept.id}: no frontmatter to edit`);

  const entry = doc.createNode(event) as YAMLMap;
  entry.flow = true;

  const existing = doc.get(key, true);

  if (isSeq(existing)) {
    (existing as YAMLSeq).add(entry);
  } else if (isMap(existing)) {
    const seq = doc.createNode([]) as YAMLSeq;
    seq.add(existing);
    seq.add(entry);
    doc.set(key, seq);
  } else {
    const seq = doc.createNode([]) as YAMLSeq;
    seq.add(entry);
    doc.set(key, seq);
  }

  concept.data = (doc.toJS() ?? {}) as Record<string, unknown>;
}
