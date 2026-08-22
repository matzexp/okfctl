import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadBundle } from '../core/bundle.ts';
import { commit } from '../core/commit.ts';
import { createConcept, serializeConcept } from '../core/concept.ts';
import { resolveDraftsDir } from '../core/drafts.ts';
import { ACTOR_FORMS, isValidActor } from '../core/lifecycle.ts';
import { originSource, readOrigin } from '../core/origin.ts';
import { cyan, dim, green, red } from '../core/term.ts';

/**
 * The type a dump opens with when the caller has no better answer. SPEC §11
 * requires the key, and §4.1 leaves the vocabulary open — but an absent type is
 * an error to every consumer, so a provisional value beats no value. It is
 * provisional precisely because the document sits in the drafts area to have
 * that answer revisited by `move`.
 */
export const PROVISIONAL_TYPE = 'Note';

export interface CaptureOptions {
  bundle: string;
  draftsDir?: string;
  title?: string;
  type?: string;
  description?: string;
  tags?: string[];
  by?: string;
  body?: string;
  stdin?: boolean;
  to?: string;
  id?: string;
  from?: string;
  noOrigin?: boolean;
  dryRun?: boolean;
  noLog?: boolean;
}

export function runCapture(options: CaptureOptions): number {
  const bundle = loadBundle(options.bundle);

  const title = options.title?.trim();
  if (!title) {
    console.error(red('a --title is required'));
    return 1;
  }

  // SPEC §7: the actor is a claim about a real producer. Capture is frequent and
  // automatic, so a guessed default would be wrong at scale rather than once.
  const by = options.by?.trim();
  if (!by) {
    console.error(red('a --by actor is required'));
    console.error(dim(ACTOR_FORMS));
    return 1;
  }
  if (!isValidActor(by)) {
    console.error(red(`invalid actor "${by}"`));
    console.error(dim(ACTOR_FORMS));
    return 1;
  }

  let draftsDir: string;
  try {
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const dir = options.to?.trim().replace(/^\.?\//, '').replace(/\/+$/, '') || draftsDir;
  const slug = (options.id?.trim() || slugify(title)).replace(/^\.?\//, '').replace(/\.md$/i, '');
  if (!slug) {
    console.error(red(`cannot derive an id from "${title}"; pass --id`));
    return 1;
  }

  const id = dir ? `${dir}/${slug}` : slug;
  const file = join(bundle.root, `${id}.md`);
  const rel = relative(bundle.root, file);
  if (rel.startsWith('..') || rel.startsWith(sep)) {
    console.error(red(`"${id}" is outside the bundle at ${bundle.root}`));
    return 1;
  }
  const name = `${id.split('/').pop()}.md`;
  if (name === 'index.md' || name === 'log.md') {
    console.error(red(`${name} is reserved (SPEC §3.1) and is not a concept`));
    return 1;
  }

  if (existsSync(file)) {
    console.error(red(`${id}.md already exists`));
    console.error(dim('okfctl never overwrites a concept; pass --id to pick another'));
    return 1;
  }

  let body: string;
  try {
    body = readBody(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const type = options.type?.trim() || PROVISIONAL_TYPE;
  const at = new Date().toISOString();

  // A concept does not cite the bundle it lives in.
  const from = resolve(options.from ?? process.cwd());
  const within = relative(bundle.root, from);
  const insideBundle = within === '' || (!within.startsWith('..') && !isAbsolute(within));
  const origin = options.noOrigin === true || insideBundle ? null : originSource(readOrigin(from));

  const concept = createConcept(
    file,
    id,
    [
      ['type', type],
      ['title', title],
      ['description', options.description?.trim() || undefined],
      ['tags', options.tags?.length ? options.tags : undefined],
      ['status', 'draft'],
      ['generated', { by, at }],
      ['sources', origin ? [origin] : undefined],
    ],
    body,
  );

  const entry = `**Captured**: [${title}](/${id}.md) added as ${type} (draft) by ${by}.`;

  return commit({
    root: bundle.root,
    file,
    contents: serializeConcept(concept),
    logEntry: entry,
    headline: `${cyan(`${id}.md`)}  ${green('captured')}`,
    details: [
      `type: ${type}${options.type ? '' : ' (provisional)'}   status: draft`,
      `generated = { by: ${by}, at: ${at} }`,
      origin ? `origin: ${origin.resource ?? origin.title}` : null,
    ],
    dryRun: options.dryRun === true,
    noLog: options.noLog === true,
  });
}

/**
 * The body is copied, never transformed. This is the one place a CLI verb
 * authors content, and it does so only by moving bytes it was handed —
 * no templating, no reformatting, no inferred structure.
 */
function readBody(options: CaptureOptions): string {
  let text: string;
  if (options.stdin) {
    text = readFileSync(0, 'utf8');
  } else if (options.body !== undefined) {
    text = options.body;
  } else {
    throw new Error('a body is required; pass --body <text> or --stdin');
  }
  if (!text.trim()) throw new Error('the body is empty; nothing to capture');
  return text.startsWith('\n') ? text : `\n${text}`;
}

/** `Envoy replaces Traefik at the edge` -> `envoy-replaces-traefik-at-the-edge`. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/, '');
}
