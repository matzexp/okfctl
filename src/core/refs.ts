import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, relative, resolve } from 'node:path';
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

export type LinkState =
  /** The target exists inside the bundle (and its anchor matched, when checked). */
  | 'resolved'
  /** No such file or directory inside the bundle. */
  | 'unresolved'
  /** The file exists but no heading matched the `#fragment`. Only ever produced
   *  when anchor checking is switched on. */
  | 'anchor-missing';

export interface Link {
  /** The target exactly as written, reported verbatim so a user can grep for it. */
  target: string;
  /** The path part, with any `#fragment` removed. Empty for a bare fragment. */
  path: string;
  /** The `#fragment`, without the `#`. Null when the link carries none. */
  fragment: string | null;
  /** Bundle-relative path the link resolves to, or null when it resolves to nothing. */
  resolvesTo: string | null;
  state: LinkState;
}

export interface ConceptRefs {
  id: string;
  where: string;
  footnotes: Footnote[];
  sources: Source[];
  joins: Join[];
  /** Labels used in the body that no `[^label]:` line defines. */
  undefined: string[];
  /** Internal links found in the body. Empty unless a bundle root was supplied. */
  links: Link[];
}

export interface RefsContext {
  /** Absolute bundle root. Without it, links cannot be resolved and are not read. */
  root?: string;
  /** Verify `#fragment` against the target's headings. Off unless asked for. */
  anchors?: boolean;
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

/** Schemes that address the network rather than the bundle. */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:/i;

/** `[text](target)` and `![alt](target)`, with an optional "title" after the target. */
const LINK = /!?\[[^\]]*\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)/g;

/**
 * Collect the links in a body that address something inside the bundle. External
 * schemes are dropped: confirming those is a network check, not a bundle check.
 */
export function readLinks(body: string): { target: string; path: string; fragment: string | null }[] {
  const found: { target: string; path: string; fragment: string | null }[] = [];
  for (const match of stripCode(body).matchAll(LINK)) {
    const target = match[1];
    if (!target || EXTERNAL.test(target)) continue;
    const hash = target.indexOf('#');
    const path = hash === -1 ? target : target.slice(0, hash);
    const fragment = hash === -1 ? null : target.slice(hash + 1);
    found.push({ target, path, fragment: fragment || null });
  }
  return found;
}

/**
 * GitHub-style heading slug: lowercase, drop anything that is not alphanumeric,
 * space, or hyphen, then whitespace to hyphens, trimming the ends. Runs of
 * whitespace collapse to a single hyphen, which GitHub does not do — the lenient
 * reading is deliberate, since a false "anchor missing" is the failure mode worth
 * avoiding here. OKF names no algorithm at all, which is why anchor checking stays
 * opt-in: a mismatch may be this rule disagreeing with the reader's renderer
 * rather than a defect in the bundle.
 */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function headingSlugs(body: string): Set<string> {
  const slugs = new Set<string>();
  for (const match of stripCode(body).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    slugs.add(slugify(match[1]));
  }
  return slugs;
}

/**
 * Resolve one link against the bundle. Directories and reserved files count as
 * valid targets: `okfctl index` generates `[guides](guides/)` itself, so excluding
 * them would have the tool flag its own output.
 */
function resolveLink(
  raw: { target: string; path: string; fragment: string | null },
  concept: Concept,
  context: RefsContext,
): Link {
  const root = context.root!;
  const link: Link = { ...raw, resolvesTo: null, state: 'unresolved' };

  // A bare `#fragment` addresses the document it sits in.
  const file = raw.path === ''
    ? concept.file
    : raw.path.startsWith('/')
      ? join(root, raw.path.slice(1))
      : resolve(concept.file, '..', raw.path);

  const within = relative(root, file);
  if (within.startsWith('..') || isAbsolute(within)) return link;
  if (!existsSync(file)) return link;

  link.resolvesTo = normalize(within).split(/[\\/]/).join('/');
  link.state = 'resolved';

  if (!context.anchors || !raw.fragment) return link;

  // A directory has no headings to match against; a fragment on one is unverifiable.
  // A self-link uses the body in hand rather than re-reading it, so a caller holding
  // an edited concept sees results consistent with what it is holding.
  const body = file === concept.file ? concept.body : readBody(file);
  if (body === null) return link;
  if (!headingSlugs(body).has(raw.fragment.toLowerCase())) link.state = 'anchor-missing';
  return link;
}

/** The body of a target document, frontmatter stripped. Null for anything unreadable. */
function readBody(file: string): string | null {
  try {
    if (statSync(file).isDirectory()) return null;
    const raw = readFileSync(file, 'utf8');
    const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?([\s\S]*)$/.exec(raw);
    return match ? match[1] : raw;
  } catch {
    return null;
  }
}

export function conceptRefs(concept: Concept, context: RefsContext = {}): ConceptRefs {
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

  const links = context.root
    ? readLinks(concept.body).map((raw) => resolveLink(raw, concept, context))
    : [];

  return {
    id: concept.id,
    where: `${concept.id}.md`,
    footnotes,
    sources,
    joins,
    undefined: missing,
    links,
  };
}

/**
 * The subset of the join that `check` reports. Only breakage the document
 * itself claims: a `[^label]` with nothing behind it. An uncited `sources[]`
 * entry is normal — a source can back a concept without being footnoted —
 * so it stays in `refs` output and out of the advisory tier.
 */
export function checkRefs(concept: Concept, context: RefsContext = {}): Diagnostic[] {
  // Anchor verification never reaches `check`: it rests on a slug rule the format
  // does not define, so the default output never accuses a bundle of a defect the
  // tool cannot be sure about.
  const refs = conceptRefs(concept, { root: context.root, anchors: false });
  const found: Diagnostic[] = [];
  const warn = (rule: string, message: string) =>
    found.push({ level: 'warn', where: refs.where, rule, message });

  for (const label of refs.undefined) {
    warn('footnote-undefined', `[^${label}] is used but never defined in this document`);
  }

  for (const link of refs.links) {
    if (link.state === 'unresolved') {
      warn('link-unresolved', `[](${link.target}) points at nothing in this bundle (SPEC §11 keeps this advisory)`);
    }
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
