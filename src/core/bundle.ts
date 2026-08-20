import { readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { readConcept, type Concept } from './concept.ts';

/** SPEC §3.1. Reserved at any level of the hierarchy. */
export const RESERVED = new Set(['index.md', 'log.md']);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build']);

export interface Bundle {
  /** Absolute path to the bundle root. */
  root: string;
  /** Every non-reserved `.md` file, sorted by id. */
  concepts: Concept[];
  /** Bundle-relative paths of reserved files that are present. */
  indexFiles: string[];
  logFiles: string[];
}

export function loadBundle(dir: string): Bundle {
  const root = resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(`not a directory: ${root}`);
  }

  const concepts: Concept[] = [];
  const indexFiles: string[] = [];
  const logFiles: string[] = [];

  for (const file of walk(root)) {
    const rel = relative(root, file).split(sep).join('/');
    const name = rel.split('/').pop()!;
    if (name === 'index.md') indexFiles.push(rel);
    else if (name === 'log.md') logFiles.push(rel);
    else concepts.push(readConcept(file, rel.replace(/\.md$/, '')));
  }

  concepts.sort((a, b) => a.id.localeCompare(b.id));
  indexFiles.sort();
  logFiles.sort();

  return { root, concepts, indexFiles, logFiles };
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield full;
  }
}

/** Resolve a user-supplied concept reference to a loaded concept. */
export function findConcept(bundle: Bundle, ref: string): Concept {
  const wanted = ref.replace(/^\.?\//, '').replace(/\.md$/, '');
  const exact = bundle.concepts.find((concept) => concept.id === wanted);
  if (exact) return exact;

  const suffix = bundle.concepts.filter(
    (concept) => concept.id === wanted || concept.id.endsWith(`/${wanted}`),
  );
  if (suffix.length === 1) return suffix[0];
  if (suffix.length > 1) {
    const ids = suffix.map((concept) => concept.id).join(', ');
    throw new Error(`"${ref}" is ambiguous; matches: ${ids}`);
  }
  throw new Error(`no concept "${ref}" in ${bundle.root}`);
}
