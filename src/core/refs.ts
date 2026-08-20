import type { Concept } from './concept.ts';
import type { Diagnostic } from './check.ts';

/**
 * OKF cites evidence by joining a Markdown footnote label in the body to an
 * `id` in `sources[]` (SPEC §5.1, §6). Nothing in the format enforces that
 * join: the body and the frontmatter are edited independently, so the label
 * an agent writes today is the dangling reference it leaves behind tomorrow.
 * This module reads the join in both directions.
 */

export interface Footnote {
  label: string;
  /** 1-based line within the body where the definition sits, if defined. */
  definedAt: number | null;
  /** How often the label is used as `[^label]` outside its own definition. */
  uses: number;
}

export interface Source {
  /** `sources[]` position, used to name an entry that has no id. */
  index: number;
  id: string | null;
  title: string | null;
  resource: string | null;
}

export type JoinState =
  /** Footnote and source entry agree — the citation resolves. */
  | 'joined'
  /** Footnote label with no `sources[].id` to join to. */
  | 'unjoined'
  /** `sources[].id` no footnote cites. */
  | 'uncited'
  /** A footnote in a document that declares no `sources[]` at all: plain
   *  Markdown, not a citation, so there is no join to break. */
  | 'plain';

export interface Join {
  state: JoinState;
  label: string;
  footnote: Footnote | null;
  source: Source | null;
}

export interface ConceptRefs {
  id: string;
  where: string;
  footnotes: Footnote[];
  sources: Source[];
  joins: Join[];
  /** Labels used in the body that no `[^label]:` line defines. */
  undefined: string[];
}

/** Fenced code and inline code spans are prose to Markdown, not citations. */
function stripCode(body: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, ' ');
  return body
    .replace(/^([ \t]*)(```|~~~)[\s\S]*?^\1?\2[ \t]*$/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

export function readFootnotes(body: string): { footnotes: Footnote[]; undefined: string[] } {
  const text = stripCode(body);
  const byLabel = new Map<string, Footnote>();
  const used = new Map<string, number>();

  for (const match of text.matchAll(/^\[\^([^\]\s]+)\]:/gm)) {
    const label = match[1];
    if (byLabel.has(label)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    byLabel.set(label, { label, definedAt: line, uses: 0 });
  }

  for (const match of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
    const definition = text[match.index + match[0].length] === ':' &&
      (match.index === 0 || text[match.index - 1] === '\n');
    if (definition) continue;
    used.set(match[1], (used.get(match[1]) ?? 0) + 1);
  }

  const missing: string[] = [];
  for (const [label, count] of used) {
    const footnote = byLabel.get(label);
    if (footnote) footnote.uses = count;
    else {
      missing.push(label);
      byLabel.set(label, { label, definedAt: null, uses: count });
    }
  }

  return {
    footnotes: [...byLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
    undefined: missing.sort(),
  };
}

export function readSources(data: Record<string, unknown>): Source[] {
  const raw = data.sources;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const record = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      index,
      id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : null,
      title: typeof record.title === 'string' ? record.title : null,
      resource: typeof record.resource === 'string' ? record.resource : null,
    };
  });
}

export function conceptRefs(concept: Concept): ConceptRefs {
  const { footnotes, undefined: missing } = readFootnotes(concept.body);
  const sources = readSources(concept.data);
  const byId = new Map<string, Source>();
  for (const source of sources) {
    if (source.id && !byId.has(source.id)) byId.set(source.id, source);
  }

  const joins: Join[] = [];
  for (const footnote of footnotes) {
    const source = byId.get(footnote.label) ?? null;
    let state: JoinState = source ? 'joined' : 'unjoined';
    if (!source && sources.length === 0) state = 'plain';
    joins.push({ state, label: footnote.label, footnote, source });
  }
  const cited = new Set(footnotes.map((footnote) => footnote.label));
  for (const source of sources) {
    if (source.id && !cited.has(source.id)) {
      joins.push({ state: 'uncited', label: source.id, footnote: null, source });
    }
  }

  return {
    id: concept.id,
    where: `${concept.id}.md`,
    footnotes,
    sources,
    joins,
    undefined: missing,
  };
}

/**
 * The subset of the join that `check` reports. Only breakage the document
 * itself claims: a `[^label]` with nothing behind it. An uncited `sources[]`
 * entry is normal — a source can back a concept without being footnoted —
 * so it stays in `refs` output and out of the advisory tier.
 */
export function checkRefs(concept: Concept): Diagnostic[] {
  const refs = conceptRefs(concept);
  const found: Diagnostic[] = [];
  const warn = (rule: string, message: string) =>
    found.push({ level: 'warn', where: refs.where, rule, message });

  for (const label of refs.undefined) {
    warn('footnote-undefined', `[^${label}] is used but never defined in this document`);
  }

  const duplicates = new Map<string, number>();
  for (const source of refs.sources) {
    if (source.id) duplicates.set(source.id, (duplicates.get(source.id) ?? 0) + 1);
  }
  for (const [id, count] of duplicates) {
    if (count > 1) {
      warn('source-id-duplicate', `sources[].id "${id}" appears ${count} times; the join is ambiguous (SPEC §5.1)`);
    }
  }

  for (const join of refs.joins) {
    // An undefined label is already reported above; it is one defect, not two.
    if (join.state === 'unjoined' && join.footnote!.definedAt !== null) {
      warn('footnote-unjoined', `[^${join.label}] has no matching sources[].id, so the citation resolves to nothing (SPEC §5.1)`);
    }
    if (join.state === 'joined' && join.footnote!.uses === 0) {
      warn('footnote-unused', `[^${join.label}] is defined and has a source, but the body never cites it`);
    }
  }

  return found;
}
