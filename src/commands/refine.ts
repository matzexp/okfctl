import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { findConcept, loadBundle } from '../core/bundle.ts';
import { conceptTitle, createConcept, serializeConcept, type Concept } from '../core/concept.ts';
import { resolveDraftsDir } from '../core/drafts.ts';
import { slugify } from './capture.ts';
import { ACTOR_FORMS, isValidActor, isoDay } from '../core/lifecycle.ts';
import { appendLogEntry, displayPath, nearestLog } from '../core/log.ts';
import { regenerateIndexes } from './index-gen.ts';
import { bold, cyan, dim, green, red } from '../core/term.ts';

export interface RefineOptions {
  bundle: string;
  draftsDir?: string;
  to?: string;
  id?: string;
  type?: string;
  title?: string;
  description?: string;
  tags?: string[];
  by?: string;
  body?: string;
  stdin?: boolean;
  consume?: boolean;
  dryRun?: boolean;
  noLog?: boolean;
}

/**
 * Turn one or more dumps-area (or any) concepts into a typed, titled entry in the
 * drafts area, citing what it drew from rather than claiming first-hand authorship.
 *
 * Unlike `capture`, `--type` and `--title` are required and there is no
 * provisional default: refining is exactly the act of no longer guessing them.
 */
export function runRefine(sources: string[], options: RefineOptions): number {
  const bundle = loadBundle(options.bundle);

  if (sources.length === 0) {
    console.error(red('at least one source concept is required'));
    return 1;
  }

  const type = options.type?.trim();
  if (!type) {
    console.error(red('a --type is required (refine has no provisional type)'));
    return 1;
  }

  const title = options.title?.trim();
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

  let draftsDir: string;
  try {
    draftsDir = resolveDraftsDir(bundle.root, options.draftsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

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

  // One citation per source, keyed by that source's own trailing id segment so
  // it reads as a natural footnote label in the body (SPEC §5.1).
  const citations = resolved.map((source) => ({
    id: source.id.split('/').pop()!,
    title: conceptTitle(source),
    resource: source.id,
  }));

  const at = new Date().toISOString();
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
      ['sources', citations],
    ],
    body,
  );

  const consume = options.consume === true;
  const sourceIds = resolved.map((source) => source.id);
  const entry = `**Refined**: [${title}](/${id}.md) added as ${type} (draft) by ${by}, from ${sourceIds.map((s) => `\`${s}\``).join(', ')}${consume ? ' (sources consumed)' : ''}.`;
  const logFile = nearestLog(bundle.root, file);

  console.log(bold(`${cyan(`${id}.md`)}  ${green('refined')}`));
  console.log(`  ${dim(`type: ${type}   status: draft`)}`);
  console.log(`  ${dim(`generated = { by: ${by}, at: ${at} }`)}`);
  console.log(`  ${dim(`sources: ${sourceIds.join(', ')}`)}`);
  if (consume) {
    for (const source of resolved) console.log(`  ${dim(`consume ${source.id}.md`)}`);
  }
  if (!options.noLog) console.log(`  ${dim(`log: ${displayPath(bundle.root, logFile)}`)}`);

  if (options.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  const written: string[] = [];
  const removed: { file: string; contents: string }[] = [];
  try {
    writeFileSync(file, serializeConcept(concept));
    written.push(file);

    if (consume) {
      for (const source of resolved) {
        removed.push({ file: source.file, contents: readFileSync(source.file, 'utf8') });
        rmSync(source.file);
      }
    }

    if (!options.noLog) appendLogEntry(logFile, entry, isoDay());

    if (consume) {
      const dirs = [...new Set([dirname(id), ...resolved.map((source) => dirname(source.id))])]
        .map((d) => (d === '.' ? '' : d));
      regenerateIndexes(loadBundle(bundle.root), dirs);
    }
  } catch (error) {
    rollback(written, removed);
    console.error(red(`refine failed: ${(error as Error).message}`));
    console.error(dim('the bundle was restored to its previous state'));
    return 1;
  }

  console.log(green('\nrefined'));
  return 0;
}

function rollback(written: string[], removed: { file: string; contents: string }[]): void {
  for (const file of written) {
    try {
      rmSync(file, { force: true });
    } catch {
      // Best effort: report below is what the caller sees regardless.
    }
  }
  for (const entry of removed) {
    try {
      writeFileSync(entry.file, entry.contents);
    } catch {
      // Same.
    }
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
