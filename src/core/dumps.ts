import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Bundle } from './bundle.ts';
import type { Concept } from './concept.ts';

/**
 * The holding area for raw, low-ceremony captures whose placement is not yet decided.
 *
 * OKF already distinguishes trust not yet earned (`status: draft`, SPEC §5.4).
 * This directory carries a different axis: a captured dump's type is a guess and
 * its directory is a parking space, so it is a different backlog worked by a
 * different verb (`refine`, then `move`). The spec names no such directory — this
 * is ours. Distinct from `drafts.ts`, which holds the same shape of module for the
 * refined-entry area a dump graduates into.
 */
export const DEFAULT_DUMPS_DIR = 'dumps';

/**
 * Normalize a dumps-area override to a bundle-relative path with `/` separators
 * and no trailing slash. Refuses anything that escapes the bundle, since a
 * dumps area outside the bundle is not part of the corpus at all.
 */
export function resolveDumpsDir(root: string, override?: string): string {
  const raw = override?.trim();
  if (!raw) return DEFAULT_DUMPS_DIR;

  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
  const rel = relative(resolve(root), absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`dumps directory "${raw}" is outside the bundle at ${root}`);
  }
  return rel.split(sep).join('/');
}

/** True when a concept id sits in the dumps area, at any depth below it. */
export function inDumps(id: string, dumpsDir: string): boolean {
  return id === dumpsDir || id.startsWith(`${dumpsDir}/`);
}

/** Every concept in the dumps area, in the bundle's own id order. */
export function dumpConcepts(bundle: Bundle, dumpsDir: string): Concept[] {
  return bundle.concepts.filter((concept) => inDumps(concept.id, dumpsDir));
}
