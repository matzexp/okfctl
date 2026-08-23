import { stringify as stringifyYaml } from 'yaml';
import { conceptTitle, type Concept } from './concept.ts';

/**
 * The formats every structured-output command accepts. `table` is each
 * command's own hand-written human output — never a generic renderer — so
 * `renderOutput` only handles the two machine-readable branches.
 */
export type OutputFormat = 'table' | 'json' | 'yaml';

/**
 * One rendering path for `json`/`yaml`, shared by every command instead of
 * each writing its own `JSON.stringify` branch. `table` is not handled here:
 * callers keep printing their own hand-tuned human output for it, since a
 * generic tabulator would be a regression relative to what each command
 * already does.
 */
export function renderOutput(data: unknown, format: 'json' | 'yaml'): string {
  return format === 'yaml' ? stringifyYaml(data) : JSON.stringify(data, null, 2);
}

/** `--format` values other than these three are refused before any command runs. */
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['table', 'json', 'yaml'];

export function isOutputFormat(value: string): value is OutputFormat {
  return (OUTPUT_FORMATS as readonly string[]).includes(value);
}

/**
 * `--json` is a permanent alias for `--format json` (never deprecated — SPEC
 * cli-output-format §"`--json` Is A Permanent Alias). `--format` wins when a
 * caller passes both, since it is the more specific flag. Throws rather than
 * printing, so every command reports the refusal the same way it reports its
 * other validation failures.
 */
export function resolveFormat(options: { format?: string; json?: boolean }): OutputFormat {
  const raw = options.format;
  if (raw) {
    if (!isOutputFormat(raw)) {
      throw new Error(`invalid --format "${raw}"; expected table, json, or yaml`);
    }
    return raw;
  }
  return options.json === true ? 'json' : 'table';
}

/**
 * Shared between `okfctl index` and `okfctl catalog`. Both render SPEC §8
 * list entries; they differ only in scope and in what they annotate, so the
 * entry shape lives here rather than in either command.
 */

/**
 * The type an untyped concept files under, singular like every other type
 * value so that the heading pluralizes the same way the rest of them do.
 * SPEC §4.1 leaves the vocabulary open; SPEC §11 makes a missing one an error,
 * which `check` reports — a generated listing still has to put the file
 * somewhere rather than hide it.
 */
export const UNTYPED = 'Concept';

export function conceptType(concept: Concept): string {
  const type = concept.data.type;
  return typeof type === 'string' && type.trim() ? type.trim() : UNTYPED;
}

/** Group concepts under their type heading, sections in alphabetical order. */
export function groupByType(concepts: Concept[]): Map<string, Concept[]> {
  const sections = new Map<string, Concept[]>();
  for (const concept of concepts) {
    const type = conceptType(concept);
    const list = sections.get(type) ?? [];
    list.push(concept);
    sections.set(type, list);
  }
  return new Map([...sections].sort(([a], [b]) => compare(a, b)));
}

/** The ` - description` suffix, or nothing when there is no usable one. */
export function describe(concept: Concept): string {
  const description = concept.data.description;
  if (typeof description !== 'string' || !description.trim()) return '';
  return ` - ${description.trim()}`;
}

/**
 * Fixed collation. `localeCompare` without a locale reads one from the
 * environment, which would make generated output differ between machines and
 * break `--check` for no reason anyone could see.
 */
export function compare(a: string, b: string): number {
  return a.localeCompare(b, 'en');
}

/** Order entries the way a reader scans them; id breaks ties (SPEC §2). */
export function byTitle(a: Concept, b: Concept): number {
  const titles = compare(conceptTitle(a).toLowerCase(), conceptTitle(b).toLowerCase());
  return titles !== 0 ? titles : compare(a.id, b.id);
}

export function pluralize(type: string): string {
  if (/(s|x|z|ch|sh)$/i.test(type)) return `${type}es`;
  if (/[^aeiou]y$/i.test(type)) return `${type.slice(0, -1)}ies`;
  return `${type}s`;
}
