import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { findConcept, loadBundle } from '../core/bundle.ts';
import { serializeConcept } from '../core/concept.ts';
import { isoDay } from '../core/lifecycle.ts';
import { appendLogEntry, displayPath, nearestLog } from '../core/log.ts';
import { applyLinkRewrites, inboundLinks, retargetLink } from '../core/refs.ts';
import { regenerateIndexes } from './index-gen.ts';
import { bold, cyan, dim, green, red } from '../core/term.ts';

export interface MoveOptions {
  bundle: string;
  by?: string;
  reason?: string;
  dryRun?: boolean;
  noLog?: boolean;
  noIndex?: boolean;
}

/** A file whose prior bytes are held so rollback can put them back. */
interface Restorable {
  file: string;
  /** Prior contents, or null when the file did not exist. */
  previous: string | null;
}

interface Staged extends Restorable {
  contents: string;
}

export function runMove(from: string, to: string, options: MoveOptions): number {
  const bundle = loadBundle(options.bundle);

  const by = options.by?.trim();
  if (!by) {
    console.error(red('a --by actor is required'));
    return 1;
  }

  let source;
  try {
    source = findConcept(bundle, from);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  let targetId: string;
  try {
    targetId = resolveTargetId(bundle.root, to, source.id);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  if (targetId === source.id) {
    console.error(red('source and target are the same concept'));
    return 1;
  }

  const targetFile = join(bundle.root, `${targetId}.md`);
  if (existsSync(targetFile)) {
    console.error(red(`${targetId}.md already exists`));
    console.error(dim('okfctl never overwrites a concept; move it elsewhere or merge by hand'));
    return 1;
  }

  // Only links that resolved before the move. An already-broken link is not
  // ours to guess at, and rewriting it would hide a defect `refs` reports.
  const oldPath = `${source.id}.md`;
  const newPath = `${targetId}.md`;
  const inbound = inboundLinks(
    bundle.concepts.filter((concept) => concept.id !== source.id),
    oldPath,
    bundle.root,
  );

  const staged: Staged[] = [];
  const byFile = new Map<string, typeof inbound>();
  for (const link of inbound) {
    const list = byFile.get(link.concept.file) ?? [];
    list.push(link);
    byFile.set(link.concept.file, list);
  }
  for (const [file, links] of byFile) {
    const concept = links[0].concept;
    const edits = links.map((link) => ({
      span: link.span,
      replacement: retargetLink(link.span, concept.file, bundle.root, newPath),
    }));
    const rewritten = { ...concept, body: applyLinkRewrites(concept.body, edits) };
    staged.push({
      file,
      contents: serializeConcept(rewritten),
      previous: readFileSync(file, 'utf8'),
    });
  }

  const logFile = nearestLog(bundle.root, targetFile);
  const entry = `**Moved**: \`${source.id}\` to [${targetId}](/${newPath}) by ${by}${
    options.reason ? `. ${options.reason.replace(/\.$/, '')}` : ''
  }.`;

  console.log(bold(`${cyan(`${source.id}.md`)} ${dim('→')} ${cyan(newPath)}`));
  console.log(`  ${dim('status, verified and stale_after are unchanged; this is not a promotion')}`);
  for (const [file, links] of byFile) {
    console.log(`  ${dim(`rewrite ${links.length} link${links.length === 1 ? '' : 's'} in ${displayPath(bundle.root, file)}`)}`);
  }
  if (byFile.size === 0) console.log(`  ${dim('no inbound links to rewrite')}`);
  if (!options.noLog) console.log(`  ${dim(`log: ${displayPath(bundle.root, logFile)}`)}`);

  const dirs = [dirname(source.id), dirname(targetId)]
    .map((dir) => (dir === '.' ? '' : dir));
  if (!options.noIndex) {
    for (const dir of [...new Set(dirs)]) {
      console.log(`  ${dim(`regenerate ${dir ? `${dir}/` : ''}index.md`)}`);
    }
  }

  if (options.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  // Stage every write, then apply. A relocation that half-happened leaves a
  // bundle whose links point at a file that is neither here nor there.
  const done: Restorable[] = [];
  let moved = false;
  try {
    for (const write of staged) {
      writeFileSync(write.file, write.contents);
      done.push(write);
    }
    mkdirSync(dirname(targetFile), { recursive: true });
    renameSync(source.file, targetFile);
    moved = true;

    if (!options.noLog) {
      // Staged like every other write, so a failure after this point does not
      // leave the log asserting a relocation that was rolled back.
      done.push({
        file: logFile,
        previous: existsSync(logFile) ? readFileSync(logFile, 'utf8') : null,
      });
      appendLogEntry(logFile, entry, isoDay());
    }
    if (!options.noIndex) regenerateIndexes(loadBundle(bundle.root), [...new Set(dirs)]);
  } catch (error) {
    rollback(done, moved ? { fromFile: source.file, targetFile } : null);
    console.error(red(`move failed: ${(error as Error).message}`));
    console.error(dim('the bundle was restored to its previous state'));
    return 1;
  }

  console.log(green('\nmoved'));
  return 0;
}

function rollback(done: Restorable[], file: { fromFile: string; targetFile: string } | null): void {
  if (file && existsSync(file.targetFile)) {
    try {
      renameSync(file.targetFile, file.fromFile);
    } catch {
      // Nothing further to try; the message below tells the user what to check.
    }
  }
  for (const write of done) {
    try {
      if (write.previous === null) rmSync(write.file, { force: true });
      else writeFileSync(write.file, write.previous);
    } catch {
      // Same: restore what we can, report the failure to the caller.
    }
  }
}

/**
 * A target may name a concept path or a directory. `move drafts/x decisions/`
 * and `move drafts/x decisions/x` mean the same thing, which is what anyone
 * typing it expects.
 */
function resolveTargetId(root: string, target: string, sourceId: string): string {
  const raw = target.trim();
  if (!raw) throw new Error('empty target path');

  const directory = /[\\/]$/.test(raw);
  const cleaned = raw.replace(/^\.?\//, '').replace(/[\\/]+$/, '').replace(/\.md$/i, '');
  if (!cleaned && !directory) throw new Error('empty target path');

  const stem = sourceId.split('/').pop()!;
  const id = directory || isExistingDir(root, cleaned) ? `${cleaned}/${stem}`.replace(/^\//, '') : cleaned;

  const file = join(root, `${id}.md`);
  const within = relative(root, file);
  if (within.startsWith('..') || isAbsolute(within)) {
    throw new Error(`"${target}" is outside the bundle at ${root}`);
  }

  const name = `${id.split('/').pop()}.md`;
  if (name === 'index.md' || name === 'log.md') {
    throw new Error(`${name} is reserved (SPEC §3.1) and is not a concept`);
  }
  return within.split(sep).join('/').replace(/\.md$/, '');
}

function isExistingDir(root: string, candidate: string): boolean {
  if (!candidate) return false;
  const path = join(root, candidate);
  try {
    return existsSync(path) && !existsSync(`${path}.md`) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
