import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle } from './bundle.ts';
import { frontmatterKeys, type Concept } from './concept.ts';
import { STATUSES, isDrifted, isStale, verifiedEvents } from './lifecycle.ts';
import { checkRefs, type RefsContext } from './refs.ts';
import { DEFAULT_DUMPS_DIR, inDumps } from './dumps.ts';

export type Level = 'error' | 'warn';

export interface Diagnostic {
  level: Level;
  /** Bundle-relative path the finding belongs to. */
  where: string;
  /** Short stable rule id, so output can be filtered and suppressed later. */
  rule: string;
  message: string;
}

export interface CheckContext extends RefsContext {
  /** Resolved dumps area, so the advisory tier can leave the holding area alone. */
  dumpsDir?: string;
}

/**
 * SPEC §11 defines conformance as exactly three rules and explicitly forbids
 * rejecting a bundle for unknown types, unknown keys, broken links, or a
 * missing index.md. Everything beyond those three rules is therefore a
 * warning, never an error.
 */
export function checkConcept(concept: Concept, context: CheckContext = {}): Diagnostic[] {
  const found: Diagnostic[] = [];
  const where = `${concept.id}.md`;
  const error = (rule: string, message: string) =>
    found.push({ level: 'error', where, rule, message });
  const warn = (rule: string, message: string) =>
    found.push({ level: 'warn', where, rule, message });

  // Conformance rule 1: parseable YAML frontmatter.
  if (concept.parseError) {
    error('frontmatter-unparseable', `frontmatter is not valid YAML: ${concept.parseError}`);
    return found;
  }
  if (!concept.doc) {
    error('frontmatter-missing', 'no YAML frontmatter block (SPEC §4.1)');
    return found;
  }

  // Conformance rule 2: a non-empty `type`.
  const type = concept.data.type;
  if (typeof type !== 'string' || !type.trim()) {
    error('type-missing', '`type` is required and must be a non-empty string (SPEC §4.1)');
  }

  // --- advisory tier -------------------------------------------------------

  // Not asked of the dumps area. `capture` deliberately takes a title and a body
  // and nothing else — placement, type and shape are all still undecided there,
  // and the title is the one-line summary until `refine` assigns a real one. So
  // warning here flagged every capture the moment it was written, which is noise
  // the advisory tier cannot afford: a tier that always fires is a tier nobody
  // reads. `refine` is where a description becomes due, and it is required there.
  const holding = inDumps(concept.id, context.dumpsDir ?? DEFAULT_DUMPS_DIR);
  if (!holding && (typeof concept.data.description !== 'string' || !concept.data.description.trim())) {
    warn('description-missing', '`description` is recommended; index.md entries use it (SPEC §8)');
  }

  const generated = concept.data.generated;
  if (generated === undefined) {
    warn('generated-missing', '`generated` is recommended so consumers can tell a recent edit from a stale fact (SPEC §5.2)');
  } else if (!generated || typeof generated !== 'object') {
    warn('generated-malformed', '`generated` should be a mapping of `by` and `at`');
  } else if (typeof (generated as Record<string, unknown>).by !== 'string') {
    warn('generated-by-missing', '`generated.by` is required within `generated` (SPEC §5.2)');
  }

  for (const [index, event] of verifiedEvents(concept.data).entries()) {
    if (!event.at) {
      warn('verified-at-missing', `verified[${index}] has no \`at\` timestamp (SPEC §5.2)`);
    }
  }

  const status = concept.data.status;
  if (status !== undefined && !(STATUSES as string[]).includes(String(status))) {
    warn('status-unknown', `unknown status "${String(status)}"; expected draft, stable, or deprecated (SPEC §5.4)`);
  }

  const sources = concept.data.sources;
  if (Array.isArray(sources)) {
    for (const [index, entry] of sources.entries()) {
      const record = entry as Record<string, unknown> | null;
      if (!record || typeof record !== 'object' || typeof record.resource !== 'string') {
        warn('source-resource-missing', `sources[${index}] has no \`resource\`, which is required within an entry (SPEC §5.1)`);
      }
    }
  }

  found.push(...checkRefs(concept, context));

  if (isStale(concept.data)) {
    warn('stale', `past stale_after (${String(concept.data.stale_after)}) (SPEC §5.5)`);
  }
  if (isDrifted(concept.data)) {
    warn('drifted', 'content changed after its last verification; trust tier is no longer earned (SPEC §5.2)');
  }

  return found;
}

/** Conformance rule 3: reserved files follow SPEC §8 and §9 when present. */
export function checkReserved(bundle: Bundle): Diagnostic[] {
  const found: Diagnostic[] = [];

  for (const rel of bundle.indexFiles) {
    const raw = readFileSync(join(bundle.root, rel), 'utf8');
    if (!/^---\r?\n/.test(raw)) continue;

    if (rel !== 'index.md') {
      found.push({
        level: 'error',
        where: rel,
        rule: 'index-frontmatter',
        message: 'only a bundle-root index.md may carry frontmatter (SPEC §12)',
      });
      continue;
    }
    const keys = frontmatterKeys(raw);
    if (keys === null) {
      found.push({
        level: 'error',
        where: rel,
        rule: 'index-frontmatter',
        message: 'root index.md opens a frontmatter block that is not valid YAML (SPEC §12)',
      });
      continue;
    }
    const extra = keys.filter((key) => key !== 'okf_version');
    if (extra.length > 0) {
      found.push({
        level: 'error',
        where: rel,
        rule: 'index-frontmatter',
        message: `root index.md frontmatter may only carry okf_version; found ${extra.join(', ')} (SPEC §12)`,
      });
    }
  }

  for (const rel of bundle.logFiles) {
    const raw = readFileSync(join(bundle.root, rel), 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.startsWith('## ')) continue;
      const heading = line.slice(3).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(heading)) {
        found.push({
          level: 'error',
          where: rel,
          rule: 'log-heading',
          message: `date heading "${heading}" must use ISO 8601 YYYY-MM-DD (SPEC §9)`,
        });
      }
    }
  }

  return found;
}

export function checkBundle(bundle: Bundle, context: CheckContext = {}): Diagnostic[] {
  return [
    ...bundle.concepts.flatMap((concept) =>
      checkConcept(concept, { ...context, root: bundle.root })),
    ...checkReserved(bundle),
  ];
}

export function countBy(diagnostics: Diagnostic[], level: Level): number {
  return diagnostics.filter((diagnostic) => diagnostic.level === level).length;
}
