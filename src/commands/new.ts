import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadBundle } from '../core/bundle.ts';
import { commit } from '../core/commit.ts';
import { createConcept, serializeConcept } from '../core/concept.ts';
import { ACTOR_FORMS, isValidActor, resolveStaleIn } from '../core/lifecycle.ts';
import { cyan, dim, green, red } from '../core/term.ts';

export interface NewOptions {
  bundle: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  by?: string;
  status?: string;
  staleAfter?: string;
  staleIn?: string;
  dryRun?: boolean;
  noLog?: boolean;
}

export function runNew(target: string, options: NewOptions): number {
  const bundle = loadBundle(options.bundle);

  // SPEC §11 makes `type` the one mandatory value, and §4.1 leaves its
  // vocabulary open. So it is required, and anything non-empty is accepted.
  const type = options.type?.trim();
  if (!type) {
    console.error(red('a --type is required'));
    console.error(dim('SPEC §11 requires a non-empty type; the vocabulary is open (SPEC §4.1)'));
    return 1;
  }

  if (options.by !== undefined && !isValidActor(options.by)) {
    console.error(red(`invalid actor "${options.by}"`));
    console.error(dim(ACTOR_FORMS));
    return 1;
  }

  let id: string;
  let file: string;
  try {
    ({ id, file } = resolveTarget(bundle.root, target));
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (existsSync(file)) {
    console.error(red(`${id}.md already exists`));
    console.error(dim('okfctl never overwrites a concept; pick another path or edit that file'));
    return 1;
  }

  let staleAfter: string | null = null;
  if (options.staleAfter) staleAfter = options.staleAfter;
  else if (options.staleIn) {
    try {
      staleAfter = resolveStaleIn(options.staleIn);
    } catch (error) {
      console.error(red((error as Error).message));
      return 1;
    }
  }

  const title = options.title?.trim() || titleFromId(id);
  // SPEC §5.4: a concept nobody has verified opens as a draft.
  const status = options.status?.trim() || 'draft';
  const at = new Date().toISOString();

  const concept = createConcept(
    file,
    id,
    [
      ['type', type],
      ['title', title],
      ['description', options.description?.trim() || undefined],
      ['tags', options.tags?.length ? options.tags : undefined],
      ['status', status],
      // SPEC §5.2 provenance. Omitted rather than guessed when no actor is given.
      ['generated', options.by ? { by: options.by, at } : undefined],
      ['stale_after', staleAfter ?? undefined],
    ],
    `\n# ${title}\n`,
  );

  const entry = `**Created**: [${title}](/${id}.md) added as ${type} (${status})${options.by ? ` by ${options.by}` : ''}.`;

  return commit({
    root: bundle.root,
    file,
    contents: serializeConcept(concept),
    logEntry: entry,
    headline: `${cyan(`${id}.md`)}  ${green('created')}`,
    details: [
      `type: ${type}   status: ${status}`,
      options.by ? `generated = { by: ${options.by}, at: ${at} }` : 'no generated entry (pass --by)',
      staleAfter ? `stale_after = ${staleAfter}` : null,
    ],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}

/**
 * A concept id is its bundle-relative path minus `.md` (SPEC §2), so the two
 * are the same string read two ways. Accept the path with or without the
 * suffix, and refuse anything that lands outside the bundle.
 */
function resolveTarget(root: string, target: string): { id: string; file: string } {
  const cleaned = target.trim().replace(/^\.?\//, '').replace(/\.md$/i, '');
  if (!cleaned) throw new Error('empty concept path');

  const file = isAbsolute(target) ? `${resolve(cleaned)}.md` : resolve(root, `${cleaned}.md`);
  const rel = relative(root, file);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`"${target}" is outside the bundle at ${root}`);
  }

  const id = rel.split(sep).join('/').replace(/\.md$/, '');
  const name = `${id.split('/').pop()}.md`;
  if (name === 'index.md' || name === 'log.md') {
    throw new Error(`${name} is reserved (SPEC §3.1) and is not a concept`);
  }
  return { id, file: join(root, `${id}.md`) };
}

/** `decisions/gateway-api` -> `Gateway Api`. A placeholder, not a guess at intent. */
function titleFromId(id: string): string {
  return (id.split('/').pop() ?? id)
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}
