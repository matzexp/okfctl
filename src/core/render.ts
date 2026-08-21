import { conceptTitle, type Concept } from './concept.ts';

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
