import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { findConcept, loadBundle } from '../core/bundle.ts';
import { conceptTitle, createConcept, serializeConcept, setField, type Concept } from '../core/concept.ts';
import { resolveDraftsDir, inDrafts } from '../core/drafts.ts';
import { resolveDumpsDir, inDumps, dumpConcepts } from '../core/dumps.ts';
import { slugify } from './capture.ts';
import { ACTOR_FORMS, generatedAt, isValidActor, isoDay } from '../core/lifecycle.ts';
import { appendLogEntry, displayPath, nearestLog } from '../core/log.ts';
import { regenerateIndexes } from './index-gen.ts';
import { bold, cyan, dim, green, red, yellow } from '../core/term.ts';

export interface RefineOptions {
  bundle: string;
  draftsDir?: string;
  dumpsDir?: string;
  to?: string;
  id?: string;
  extend?: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  by?: string;
  body?: string;
  stdin?: boolean;
  consume?: boolean;
  list?: boolean;
  append?: boolean;
  dryRun?: boolean;
  noLog?: boolean;
}

interface Citation {
  id: string;
  title: string;
  resource: string | null;
}

/**
 * Turn one or more dumps-area (or any) concepts into a typed, titled entry in the
 * drafts area, citing what it drew from rather than claiming first-hand authorship —
 * or, with `--extend`, update an existing drafts-area entry in place instead of
 * creating a new one.
 *
 * Unlike `capture`, `--type` and `--title` are required for a fresh entry and there
 * is no provisional default: refining is exactly the act of no longer guessing them.
 * Extending an existing entry defaults both to its current values instead, since the
 * point there is updating content, not re-deciding type and title.
 */
export function runRefine(sources: string[], options: RefineOptions): number {
  const bundle = loadBundle(options.bundle);

  let draftsDir: string;
  let dumpsDir: string;
  try {
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
    dumpsDir = resolveDumpsDir(bundle.root, options.dumpsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (options.list) return listInbox(bundle, dumpsDir);

  if (sources.length === 0) {
    console.error(red('at least one source concept is required'));
    return 1;
  }

  const extendRef = options.extend?.trim();
  let target: Concept | null = null;
  if (extendRef) {
    if (options.to || options.id) {
      console.error(red('--extend cannot be combined with --to or --id; the target is the extended entry\'s own existing path'));
      return 1;
    }
    try {
      target = findConcept(bundle, extendRef);
    } catch (error) {
      console.error(red((error as Error).message));
      return 1;
    }
    if (!inDrafts(target.id, draftsDir)) {
      const area = inDumps(target.id, dumpsDir) ? 'the dumps area' : 'the corpus';
      console.error(red(`"${target.id}" is in ${area}, not drafts — a concept outside drafts is never edited in place`));
      console.error(dim('cite it as an ordinary source instead: refine writes a new drafts-area entry, and that concept is left untouched'));
      return 1;
    }
  }

  const type = options.type?.trim() || (target ? String(target.data.type ?? '').trim() : '');
  if (!type) {
    console.error(red('a --type is required (refine has no provisional type)'));
    return 1;
  }

  const title = options.title?.trim() || (target ? String(target.data.title ?? '').trim() : '');
  if (!title) {
    console.error(red('a --title is required'));
    return 1;
  }

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

  const resolved: Concept[] = [];
  for (const ref of sources) {
    try {
      resolved.push(findConcept(bundle, ref));
    } catch (error) {
      console.error(red((error as Error).message));
      return 1;
    }
  }

  const consume = options.consume === true;
  if (consume) {
    const outside = resolved.find((source) => !inDumps(source.id, dumpsDir));
    if (outside) {
      console.error(red(`--consume refuses: "${outside.id}" is not in the dumps area`));
      console.error(dim('citing an already-refined or already-promoted concept as a source must never risk deleting it'));
      return 1;
    }
  }

  let id: string;
  let file: string;
  if (target) {
    id = target.id;
    file = target.file;
  } else {
    const dir = options.to?.trim().replace(/^\.?\//, '').replace(/\/+$/, '') || draftsDir;

    // Unlike capture's generated id, a refined entry's title is a real title, so
    // the id follows the bundle's ordinary kebab-case convention (as `okf-ingest`
    // already recommends) rather than the date-session scheme capture uses for a
    // title that is only a one-line summary.
    const slug = options.id?.trim() ? slugify(options.id.trim().replace(/^\.?\//, '').replace(/\.md$/i, '')) : slugify(title);
    if (!slug) {
      console.error(red('could not derive a usable id from the title; pass --id'));
      return 1;
    }
    id = dir ? `${dir}/${slug}` : slug;
    file = join(bundle.root, `${id}.md`);
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
      console.error(dim('okfctl never overwrites a concept; pass a different --id, or --extend it explicitly'));
      return 1;
    }
  }

  let body: string;
  try {
    body = readBody(options);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  // How much of the entry's existing body the caller is about to drop. Reported,
  // never refused: `--extend` replaces the file, so a shorter result is exactly
  // what a deliberate rewrite looks like, and a tool that refuses one teaches the
  // caller to reach for `--force` by reflex — which disarms the guard for the
  // case it was built for. Naming the shrink leaves the judgment where it belongs
  // while making an accidental drop visible instead of silent.
  let shrunkBy = 0;
  if (options.append) {
    if (!target) {
      console.error(red('--append only applies to --extend; a fresh entry has nothing to append to'));
      return 1;
    }
    // The safe half of extending, and the reason the warning below can stay a
    // warning: appending cannot lose prior content at all, so a caller who only
    // means to add something has a way to say exactly that.
    body = `${target.body.replace(/\n+$/, '')}\n\n${body.replace(/^\n+/, '')}`;
  } else if (target) {
    shrunkBy = target.body.trim().length - body.trim().length;
  }

  // Extending merges into whatever the entry already cited — a prior citation is
  // never dropped, and a source already cited (by resource, the only globally
  // unique field) is not cited twice. Existing ids are left exactly as they are:
  // the body may already footnote them.
  const existing = target && Array.isArray(target.data.sources)
    ? (target.data.sources as Citation[])
    : [];
  const existingResources = new Set(existing.map((citation) => citation.resource));
  const taken = new Set(existing.map((citation) => citation.id).filter(Boolean));

  const citations: Citation[] = [...existing];
  for (const source of resolved) {
    if (existingResources.has(source.id)) continue;
    const id = uniqueCitationId(source.id, taken);
    taken.add(id);
    citations.push({ id, title: conceptTitle(source), resource: source.id });
  }

  const description = options.description?.trim() || undefined;
  const tags = options.tags?.length ? options.tags : undefined;

  const at = new Date().toISOString();

  // Extending edits the entry's own document rather than building a replacement
  // from a fixed key list: SPEC §4.1 asks consumers to preserve unknown
  // producer-defined keys when round-tripping, and an extend is a round-trip, so
  // key order, comments, and every field extend does not own survive it. A
  // preserved `verified` block combined with the refreshed `generated.at` is
  // exactly the drift `check` already warns about — the trust tier is reported as
  // no longer earned instead of being silently erased.
  let concept: Concept;
  if (target) {
    if (!target.doc) {
      console.error(red(`"${target.id}" has no readable frontmatter to extend`));
      console.error(dim(target.parseError ?? 'a concept without a frontmatter block cannot be edited in place'));
      return 1;
    }
    concept = target;
    setField(concept, 'type', type);
    setField(concept, 'title', title);
    if (description !== undefined) setField(concept, 'description', description);
    if (tags !== undefined) setField(concept, 'tags', tags);
    setField(concept, 'status', 'draft');
    setField(concept, 'generated', { by, at });
    setField(concept, 'sources', citations);
    concept.body = body;
  } else {
    concept = createConcept(
      file,
      id,
      [
        ['type', type],
        ['title', title],
        ['description', description],
        ['tags', tags],
        ['status', 'draft'],
        ['generated', { by, at }],
        ['sources', citations],
      ],
      body,
    );
  }

  const sourceIds = resolved.map((source) => source.id);
  const entry = target
    ? `**Extended**: [${title}](/${id}.md) updated with ${sourceIds.map((s) => `\`${s}\``).join(', ')} by ${by}${consume ? ' (sources consumed)' : ''}.`
    : `**Refined**: [${title}](/${id}.md) added as ${type} (draft) by ${by}, from ${sourceIds.map((s) => `\`${s}\``).join(', ')}${consume ? ' (sources consumed)' : ''}.`;
  const logFile = nearestLog(bundle.root, file);

  console.log(bold(`${cyan(`${id}.md`)}  ${green(target ? 'extended' : 'refined')}`));
  console.log(`  ${dim(`type: ${type}   status: draft`)}`);
  console.log(`  ${dim(`generated = { by: ${by}, at: ${at} }`)}`);
  console.log(`  ${dim(`sources: ${citations.map((c) => c.resource).join(', ')}`)}`);
  if (options.append) console.log(`  ${dim('append: the existing body is kept and added to')}`);
  if (shrunkBy > 0) {
    console.log(`  ${yellow(`replacing: ${shrunkBy} fewer bytes of body than what is on disk`)}`);
    console.log(`  ${dim('--extend replaces the file; pass --append to add to it instead')}`);
  }
  if (consume) {
    for (const source of resolved) console.log(`  ${dim(`consume ${source.id}.md`)}`);
  }
  if (!options.noLog) console.log(`  ${dim(`log: ${displayPath(bundle.root, logFile)}`)}`);

  if (options.dryRun) {
    if (target) {
      console.log(`\n${dim('--- resulting file ---')}`);
      console.log(serializeConcept(concept));
    }
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  // A fresh refine creates its file, so undoing it means removing it; an extend
  // overwrites a file that was already there, so undoing it means putting the
  // prior contents back. Deleting on rollback would destroy the very draft the
  // caller was extending.
  const created: string[] = [];
  const restore: { file: string; contents: string }[] = [];
  try {
    if (target) restore.push({ file, contents: readFileSync(file, 'utf8') });
    writeFileSync(file, serializeConcept(concept));
    if (!target) created.push(file);

    if (consume) {
      for (const source of resolved) {
        restore.push({ file: source.file, contents: readFileSync(source.file, 'utf8') });
        rmSync(source.file);
      }
    }

    if (!options.noLog) {
      // Staged like every other write. An unstaged log append survives rollback
      // and leaves the bundle claiming a refine that was undone — which makes
      // the "restored to its previous state" message below a false statement.
      if (existsSync(logFile)) restore.push({ file: logFile, contents: readFileSync(logFile, 'utf8') });
      else created.push(logFile);
      appendLogEntry(logFile, entry, isoDay());
    }

    if (consume) {
      const dirs = [...new Set([dirname(id), ...resolved.map((source) => dirname(source.id))])]
        .map((d) => (d === '.' ? '' : d));
      regenerateIndexes(loadBundle(bundle.root), dirs);
    }
  } catch (error) {
    rollback(created, restore);
    console.error(red(`refine failed: ${(error as Error).message}`));
    console.error(dim('the bundle was restored to its previous state'));
    return 1;
  }

  console.log(green(target ? '\nextended' : '\nrefined'));
  return 0;
}

function rollback(created: string[], restore: { file: string; contents: string }[]): void {
  for (const file of created) {
    try {
      rmSync(file, { force: true });
    } catch {
      // Best effort: report below is what the caller sees regardless.
    }
  }
  for (const entry of restore) {
    try {
      writeFileSync(entry.file, entry.contents);
    } catch {
      // Same.
    }
  }
}

/**
 * The unrefined inbox, listed from inside the verb that empties it. `status
 * --dumps` reports the same thing, but the question "what is there to refine"
 * arises while reaching for `refine`, and sending the caller to another command
 * to answer it is friction for no gain.
 */
function listInbox(bundle: ReturnType<typeof loadBundle>, dumpsDir: string): number {
  const dumps = dumpConcepts(bundle, dumpsDir);
  if (dumps.length === 0) {
    console.log(dim(`nothing unrefined in ${dumpsDir}/`));
    return 0;
  }

  console.log(bold(`${dumps.length} unrefined in ${dumpsDir}/`));
  const width = Math.max(...dumps.map((dump) => dump.id.length));
  for (const dump of dumps) {
    const at = generatedAt(dump.data);
    const when = at ? isoDay(at) : dim('undated');
    console.log(`  ${cyan(dump.id.padEnd(width))}  ${conceptTitle(dump)}  ${dim(when)}`);
  }
  return 0;
}

/**
 * A footnote label for a source (SPEC §5.1), keyed by its own trailing id segment
 * so it reads naturally in the body. Two sources can share a basename —
 * `dumps/gateway-timeout` and `incidents/gateway-timeout` — and an id used twice
 * makes the join ambiguous, which `okfctl refs` reports as a defect in a file
 * `okfctl` itself just wrote. So the label grows leftward through the path until
 * it is unique, and only then falls back to a numeric suffix.
 */
function uniqueCitationId(sourceId: string, taken: Set<string>): string {
  const segments = sourceId.split('/');
  for (let from = segments.length - 1; from >= 0; from--) {
    const candidate = segments.slice(from).join('-');
    if (!taken.has(candidate)) return candidate;
  }
  const base = segments.join('-');
  for (let suffix = 2; ; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The body is copied, never transformed — same contract as `capture`. */
function readBody(options: RefineOptions): string {
  let text: string;
  if (options.stdin) {
    text = readFileSync(0, 'utf8');
  } else if (options.body !== undefined) {
    text = options.body;
  } else {
    throw new Error('a body is required; pass --body <text> or --stdin');
  }
  if (!text.trim()) throw new Error('the body is empty; nothing to write');
  return text.startsWith('\n') ? text : `\n${text}`;
}
