import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { loadBundle } from '../core/bundle.ts';
import { commit } from '../core/commit.ts';
import { createConcept, serializeConcept } from '../core/concept.ts';
import { resolveDumpsDir } from '../core/dumps.ts';
import { ACTOR_FORMS, isValidActor, isoDay } from '../core/lifecycle.ts';
import { originSource, readOrigin } from '../core/origin.ts';
import { cyan, dim, green, red } from '../core/term.ts';

/**
 * The type a dump opens with when the caller has no better answer. SPEC §11
 * requires the key, and §4.1 leaves the vocabulary open — but an absent type is
 * an error to every consumer, so a provisional value beats no value. It is
 * provisional precisely because the document sits in the dumps area to have
 * that answer revisited by `refine` or `move`.
 */
export const PROVISIONAL_TYPE = 'Note';

export interface CaptureOptions {
  bundle: string;
  dumpsDir?: string;
  title?: string;
  type?: string;
  description?: string;
  tags?: string[];
  by?: string;
  body?: string;
  stdin?: boolean;
  to?: string;
  id?: string;
  session?: string;
  from?: string;
  /** Capture date, overridable so tests do not depend on today. */
  now?: Date;
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

  let dumpsDir: string;
  try {
    dumpsDir = resolveDumpsDir(bundle.root, options.dumpsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const dir = options.to?.trim().replace(/^\.?\//, '').replace(/\/+$/, '') || dumpsDir;

  // An explicit id says "I have decided this name"; anything else is generated.
  // A title chosen in one line is a poor thing to harden into a path every link
  // and index entry will use (SPEC §2).
  const explicit = options.id?.trim()
    ? slugify(options.id.trim().replace(/^\.?\//, '').replace(/\.md$/i, ''))
    : null;
  if (options.id?.trim() && !explicit) {
    console.error(red(`"${options.id}" does not reduce to a usable id`));
    return 1;
  }

  const slug = explicit ?? generateId(bundle.root, dir, options.session, options.now);
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

  // An explicit id names a specific concept, and overwriting one is never right.
  // A generated id cannot get here — the sequence is taken from what is on disk.
  if (existsSync(file)) {
    console.error(red(`${id}.md already exists`));
    console.error(dim('okfctl never overwrites a concept; pass a different --id'));
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
  // The filename carries eight characters of the session and the filename does not
  // survive promotion, so the durable record goes where §5.1 already puts provenance.
  const session = sessionSource(options.session);
  const sources = [origin, session].filter((entry) => entry !== null);

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
      ['sources', sources.length > 0 ? sources : undefined],
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
      session ? `session: ${session.resource}` : null,
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

/**
 * The label used in a generated id when no session was supplied. A fixed
 * stand-in, not a generated identifier: something that looked like a session id
 * but was not one would be a false claim in a field other tools read, and the
 * sequence already guarantees uniqueness without it.
 */
export const NO_SESSION_LABEL = 'adhoc';

/** How much of a session id goes into a filename. A grouping label, not a key. */
const SESSION_PREFIX = 8;

/**
 * `<YYYY-MM-DD>-<session8>-<n>`: the date sorts, the session groups, the
 * sequence makes a collision arithmetically impossible.
 *
 * The sequence is read from the target directory rather than from the hook's
 * per-session state, so a capture run by hand — or after the state directory was
 * pruned — still picks a free id. The bundle is then the only thing that has to
 * be correct, which is also what makes a retry idempotent.
 */
export function generateId(root: string, dir: string, session?: string, now = new Date()): string {
  const label = sessionLabel(session);
  const stem = `${isoDay(now)}-${label}`;
  const target = dir ? join(root, dir) : root;

  let highest = 0;
  if (existsSync(target)) {
    const pattern = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.md$`);
    for (const name of readdirSync(target)) {
      const match = pattern.exec(name);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  }
  return `${stem}-${highest + 1}`;
}

export function sessionLabel(session?: string): string {
  const cleaned = slugify(session ?? '');
  return cleaned ? cleaned.replace(/-/g, '').slice(0, SESSION_PREFIX) : NO_SESSION_LABEL;
}

/** The `sources[]` entry for the producing session, or null when none is known. */
export function sessionSource(session?: string): Record<string, string> | null {
  const value = session?.trim();
  if (!value) return null;
  return { id: 'session', title: 'agent session', resource: value };
}

/**
 * Reduce a string to the bundle's id style. Only an explicit `--id` reaches this
 * now — titles no longer produce ids. Long input is cut on a hyphen boundary
 * rather than mid-word, which is what turned one capture into `...-and-histogra`.
 */
export function slugify(text: string): string {
  const full = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (full.length <= MAX_ID) return full;
  const cut = full.slice(0, MAX_ID + 1);
  const boundary = cut.lastIndexOf('-');
  return (boundary > 0 ? cut.slice(0, boundary) : full.slice(0, MAX_ID)).replace(/-+$/, '');
}

const MAX_ID = 72;
