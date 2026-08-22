import { isAbsolute, relative, resolve, sep } from 'node:path';
import type { Bundle } from './bundle.ts';
import type { Concept } from './concept.ts';

/**
 * The holding area for captured knowledge whose placement is not yet decided.
 *
 * OKF already distinguishes trust not yet earned (`status: draft`, SPEC §5.4).
 * This directory carries a different axis: a captured dump's type is a guess and
 * its directory is a parking space, so it is a different backlog worked by a
 * different verb (`move`). The spec names no such directory — this is ours.
 */
export const DEFAULT_DRAFTS_DIR = 'drafts';

/**
 * Normalize a drafts-area override to a bundle-relative path with `/` separators
 * and no trailing slash. Refuses anything that escapes the bundle, since a
 * drafts area outside the bundle is not part of the corpus at all.
 */
export function resolveDraftsDir(root: string, override?: string): string {
  const raw = override?.trim();
  if (!raw) return DEFAULT_DRAFTS_DIR;

  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(root, raw);
  const rel = relative(resolve(root), absolute);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`drafts directory "${raw}" is outside the bundle at ${root}`);
  }
  return rel.split(sep).join('/');
}

/** True when a concept id sits in the drafts area, at any depth below it. */
export function inDrafts(id: string, draftsDir: string): boolean {
  return id === draftsDir || id.startsWith(`${draftsDir}/`);
}

/** Every concept in the drafts area, in the bundle's own id order. */
export function draftConcepts(bundle: Bundle, draftsDir: string): Concept[] {
  return bundle.concepts.filter((concept) => inDrafts(concept.id, draftsDir));
}
