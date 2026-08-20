import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Bundle } from './bundle.ts';
import type { Concept } from './concept.ts';
import { STATUSES, isDrifted, isStale, verifiedEvents } from './lifecycle.ts';

export type Level = 'error' | 'warn';

export interface Diagnostic {
  level: Level;
  /** Bundle-relative path the finding belongs to. */
  where: string;
  /** Short stable rule id, so output can be filtered and suppressed later. */
  rule: string;
  message: string;
}

/**
 * SPEC §11 defines conformance as exactly three rules and explicitly forbids
 * rejecting a bundle for unknown types, unknown keys, broken links, or a
 * missing index.md. Everything beyond those three rules is therefore a
 * warning, never an error.
 */
export function checkConcept(concept: Concept): Diagnostic[] {
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

  if (typeof concept.data.description !== 'string' || !concept.data.description.trim()) {
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
    const keys = [...raw.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((match) => match[1]);
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

export function checkBundle(bundle: Bundle): Diagnostic[] {
  return [
    ...bundle.concepts.flatMap(checkConcept),
    ...checkReserved(bundle),
  ];
}

export function countBy(diagnostics: Diagnostic[], level: Level): number {
  return diagnostics.filter((diagnostic) => diagnostic.level === level).length;
}
