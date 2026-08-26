#!/usr/bin/env node
import { Command } from 'commander';
import { runCheck } from './commands/check.ts';
import { runStatus } from './commands/status.ts';
import { runPromote, runDeprecate } from './commands/transition.ts';
import { runNew } from './commands/new.ts';
import { runCapture } from './commands/capture.ts';
import { runMove } from './commands/move.ts';
import { runInit } from './commands/init.ts';
import { runUpdate } from './commands/update.ts';
import { runHook } from './commands/hook.ts';
import { runReview } from './commands/review.ts';
import { runIndex } from './commands/index-gen.ts';
import { runCatalog } from './commands/catalog.ts';
import { runSearch, DEFAULT_LIMIT } from './commands/search.ts';
import { runRefs } from './commands/refs.ts';
import { runRefine } from './commands/refine.ts';
import { runRelated, DEFAULT_LIMIT as RELATED_LIMIT } from './commands/related.ts';
import { DEFAULT_DRAFTS_DIR } from './core/drafts.ts';
import { DEFAULT_DUMPS_DIR } from './core/dumps.ts';
import { requireBundleDir, resolveBundleDir } from './core/userconfig.ts';
import { red } from './core/term.ts';

const program = new Command();

program
  .name('okfctl')
  .description('Lifecycle tooling for Open Knowledge Format (OKF) v0.2 bundles')
  .version('0.1.0')
  .option('-b, --bundle <dir>', 'path to the bundle root')
  .option('--dumps-dir <dir>', 'bundle-relative dumps area (raw captures)', DEFAULT_DUMPS_DIR)
  .option('--drafts-dir <dir>', 'bundle-relative drafts area (refined entries)', DEFAULT_DRAFTS_DIR);

/** A comma-separated flag value, e.g. `--tags a,b`. Empty entries are dropped. */
const list = (value: string): string[] =>
  value.split(',').map((entry) => entry.trim()).filter(Boolean);

const bundleDir = (command: Command): string =>
  (command.optsWithGlobals().bundle as string | undefined) ?? resolveBundleDir();

/** For verbs that write: no silent fallback to the working directory. */
const writeBundleDir = (command: Command): string =>
  (command.optsWithGlobals().bundle as string | undefined) ?? requireBundleDir();

const dumpsDir = (command: Command): string =>
  (command.optsWithGlobals().dumpsDir as string) ?? DEFAULT_DUMPS_DIR;

const draftsDir = (command: Command): string =>
  (command.optsWithGlobals().draftsDir as string) ?? DEFAULT_DRAFTS_DIR;

program
  .command('check')
  .description('conformance errors (SPEC 11) and advisory lint warnings')
  .option('--strict', 'exit non-zero on warnings too (opt-in; not spec conformance)')
  .option('--quiet', 'show errors only')
  .option('--format <fmt>', 'table (default), json, or yaml')
  .option('--json', 'shorthand for --format json')
  .action(function (this: Command, options) {
    exit(runCheck({ bundle: bundleDir(this), dumpsDir: dumpsDir(this), ...options }));
  });

program
  .command('status')
  .description('corpus health: trust tiers, staleness, drift, dumps and drafts inboxes')
  .option('--stale', 'only concepts past stale_after')
  .option('--drifted', 'only concepts edited since their last verification')
  .option('--draft', 'only draft concepts')
  .option('--unverified', 'only concepts with no verified entry')
  .option('--dumps', 'only the dumps inbox (raw captures)')
  .option('--drafts', 'only the drafts inbox (refined entries)')
  .option('--all', 'include dumps- and drafts-area concepts in the attention list')
  .option('--format <fmt>', 'table (default), json, or yaml')
  .option('--json', 'shorthand for --format json')
  .action(function (this: Command, options) {
    exit(runStatus({ bundle: bundleDir(this), dumpsDir: dumpsDir(this), draftsDir: draftsDir(this), ...options }));
  });

program
  .command('new <path>')
  .description('create a conformant concept document at a bundle-relative path')
  .requiredOption('--type <type>', 'concept type, e.g. Decision (SPEC 11; open vocabulary)')
  .option('--title <text>', 'title; defaults to the filename read as words')
  .option('--description <text>', 'one-line summary')
  .option('--tags <list>', 'comma-separated tags', list)
  .option('--by <actor>', 'producing actor recorded in generated (SPEC 7)')
  .option('--status <status>', 'initial status', 'draft')
  .option('--stale-after <date>', 'set stale_after to an absolute YYYY-MM-DD')
  .option('--stale-in <duration>', 'set stale_after relative to today, e.g. 90d, 6m')
  .option('--no-log', 'skip the log.md entry')
  .option('-n, --dry-run', 'show what would be written without writing it')
  .action(function (this: Command, path: string, options) {
    exit(runNew(path, { bundle: bundleDir(this), ...options, noLog: options.log === false }));
  });

program
  .command('init [dir]')
  .description('scaffold a bundle, register it as this machine\'s knowledge base, wire an agent')
  .option('--register', 'record this bundle as the knowledge base captures default to')
  .option('--agent <host>', 'wire a coding agent to it; repeatable', (value: string, all: string[] = []) =>
    [...all, value], [] as string[])
  .option('--capture-every <n>', 'hold a turn open every nth turn (default 1)', (value: string) =>
    Number.parseInt(value, 10), 1)
  .option('--remove', 'with --agent, take back exactly what was installed')
  .option('-n, --dry-run', 'list every path it would create or edit without writing')
  .action(function (this: Command, dir: string | undefined, options) {
    exit(runInit(dir ?? '.', { dumpsDir: dumpsDir(this), draftsDir: draftsDir(this), ...options }));
  });

program
  .command('update [dir]')
  .description('refresh exactly the hosts already installed for a bundle: skills, commands, hook config')
  .option('--capture-every <n>', 'apply a new interval to every host touched (default: keep each one\'s current interval)', (value: string) =>
    Number.parseInt(value, 10))
  .option('-n, --dry-run', 'list every path it would refresh without writing')
  .action(function (this: Command, dir: string | undefined, options) {
    exit(runUpdate(dir ?? '.', options));
  });

program
  .command('hook <host>', { hidden: true })
  .description('capture hook; invoked by an agent, not by hand')
  .option('--every <n>', 'prompt every nth completed turn', (value: string) =>
    Number.parseInt(value, 10), 1)
  .action(function (this: Command, _host: string, options) {
    exit(runHook({ every: options.every }));
  });

program
  .command('capture')
  .description('capture knowledge into the dumps area with the placement deferred')
  .requiredOption('--title <text>', 'what was established, as a sentence')
  .requiredOption('--by <actor>', 'producing actor (SPEC 7); never guessed')
  .option('--type <type>', 'concept type; defaults to a provisional one (SPEC 4.1)')
  .option('--description <text>', 'one-line summary')
  .option('--tags <list>', 'comma-separated tags', list)
  .option('--body <text>', 'the body, written verbatim')
  .option('--stdin', 'read the body from standard input')
  .option('--to <dir>', 'target directory instead of the dumps area')
  .option('--id <slug>', 'a chosen id instead of the generated one')
  .option('--session <id>', 'agent session that produced it; grouped in the id, recorded as provenance')
  .option('--from <dir>', 'working directory recorded as the origin', process.cwd())
  .option('--no-origin', 'do not record where the capture came from')
  .option('--no-log', 'skip the log.md entry')
  .option('-n, --dry-run', 'show what would be written without writing it')
  .action(function (this: Command, options) {
    exit(runCapture({
      bundle: writeBundleDir(this),
      dumpsDir: dumpsDir(this),
      ...options,
      noOrigin: options.origin === false,
      noLog: options.log === false,
    }));
  });

program
  .command('refine <sources...>')
  .description('turn one or more dumps into a typed, titled entry in the drafts area')
  .option('--type <type>', 'concept type; required for a fresh entry, defaults to the existing type with --extend')
  .option('--title <text>', 'title; required for a fresh entry, defaults to the existing title with --extend')
  .requiredOption('--by <actor>', 'refining actor (SPEC 7); never guessed')
  .option('--description <text>', 'one-line summary')
  .option('--tags <list>', 'comma-separated tags', list)
  .option('--body <text>', 'the body, written verbatim (the full resulting file, when --extend is used)')
  .option('--stdin', 'read the body from standard input')
  .option('--to <dir>', 'target directory instead of the drafts area')
  .option('--id <slug>', 'a chosen id instead of one derived from the title')
  .option('--extend <id>', 'update an existing drafts-area entry in place instead of creating a new one')
  .option('--consume', 'remove the named sources after a successful write (refused if a source is outside the dumps area)')
  .option('--no-log', 'skip the log.md entry')
  .option('-n, --dry-run', 'show what would be written (and consumed) without writing it')
  .action(function (this: Command, sources: string[], options) {
    exit(runRefine(sources, {
      bundle: writeBundleDir(this),
      draftsDir: draftsDir(this),
      dumpsDir: dumpsDir(this),
      ...options,
      noLog: options.log === false,
    }));
  });

program
  .command('move <from> <to>')
  .description('relocate a concept, carrying its inbound links, indexes and log with it')
  .requiredOption('--by <actor>', 'actor performing the relocation (SPEC 7)')
  .option('--reason <text>', 'recorded in the log entry')
  .option('--no-log', 'skip the log.md entry')
  .option('--no-index', 'skip regenerating the affected index.md files')
  .option('-n, --dry-run', 'show the move, the link rewrites and the indexes without writing')
  .action(function (this: Command, from: string, to: string, options) {
    exit(runMove(from, to, {
      bundle: writeBundleDir(this),
      ...options,
      noLog: options.log === false,
      noIndex: options.index === false,
    }));
  });

program
  .command('review <concept>')
  .description('record a review outcome: still accurate, or no longer accurate')
  .option('--confirm', 'still accurate: record a verification')
  .option('--outdated', 'no longer accurate: mark stale as of today, verify nothing')
  .option('--by <actor>', 'reviewing actor (SPEC 7); required with --confirm')
  .option('--reason <text>', 'recorded in the log entry')
  .option('--stale-after <date>', 'with --confirm, set the next horizon to a YYYY-MM-DD')
  .option('--stale-in <duration>', 'with --confirm, set the next horizon relative to today')
  .option('--no-log', 'skip the log.md entry')
  .option('-n, --dry-run', 'show the outcome without writing')
  .action(function (this: Command, concept: string, options) {
    exit(runReview(concept, { bundle: bundleDir(this), ...options, noLog: options.log === false }));
  });

program
  .command('promote <concept>')
  .description('record verification and move a concept to status: stable')
  .requiredOption('--by <actor>', 'verifying actor, e.g. human:matze (SPEC 7)')
  .option('--stale-after <date>', 'set stale_after to an absolute YYYY-MM-DD')
  .option('--stale-in <duration>', 'set stale_after relative to today, e.g. 90d, 6m')
  .option('--no-log', 'skip the log.md entry')
  .option('--force', 'promote despite conformance errors')
  .option('-n, --dry-run', 'show the transition without writing')
  .action(function (this: Command, concept: string, options) {
    exit(runPromote(concept, { bundle: bundleDir(this), ...options, noLog: options.log === false }));
  });

program
  .command('deprecate <concept>')
  .description('move a concept to status: deprecated')
  .option('--by <actor>', 'actor performing the deprecation (SPEC 7)')
  .option('--reason <text>', 'recorded in the log entry')
  .option('--no-log', 'skip the log.md entry')
  .option('--force', 're-deprecate an already-deprecated concept')
  .option('-n, --dry-run', 'show the transition without writing')
  .action(function (this: Command, concept: string, options) {
    exit(runDeprecate(concept, { bundle: bundleDir(this), ...options, noLog: options.log === false }));
  });

program
  .command('refs')
  .description('reference integrity: footnote to sources[].id, and internal links')
  .option('--broken', 'only concepts with an unresolved reference')
  .option('--anchors', 'also verify #fragments against the target document headings')
  .option('--strict', 'exit non-zero on a broken reference, and imply --anchors (opt-in; not spec conformance)')
  .option('--format <fmt>', 'table (default), json, or yaml')
  .option('--json', 'shorthand for --format json')
  .action(function (this: Command, options) {
    exit(runRefs({ bundle: bundleDir(this), ...options }));
  });

program
  .command('index')
  .description('regenerate index.md from frontmatter (SPEC 8)')
  .option('--check', 'exit non-zero when an index.md has drifted')
  .option('--root-only', 'only regenerate the bundle-root index.md')
  .option('--include-deprecated', 'list deprecated concepts too')
  .action(function (this: Command, options) {
    exit(runIndex({ bundle: bundleDir(this), ...options }));
  });

program
  .command('search <query>')
  .description('find concepts by relevance across frontmatter and body, ranked with trust tier')
  .option('--limit <n>', `results to show (default ${DEFAULT_LIMIT})`, (value: string) =>
    Number.parseInt(value, 10))
  .option('--area <list>', 'only these areas: dumps, drafts, corpus', list)
  .option('--tier <list>', 'only these trust tiers: unverified, machine-confirmed, human-reviewed', list)
  .option('--type <list>', 'only these concept types, compared case-insensitively', list)
  .option('--tag <list>', 'only concepts carrying every one of these tags', list)
  .option('--snippet', 'show a line of matching body text under each result')
  .option('--format <fmt>', 'table (default), json, or yaml')
  .option('--json', 'shorthand for --format json')
  .action(function (this: Command, query: string, options) {
    // Unlike the other read commands this one requires a real bundle rather than
    // falling back to the cwd: searching whatever directory you happen to be in
    // returns a confident empty result, which reads as "the bundle knows nothing".
    exit(runSearch({
      bundle: writeBundleDir(this),
      dumpsDir: dumpsDir(this),
      draftsDir: draftsDir(this),
      query,
      ...options,
    }));
  });

program
  .command('related <concept>')
  .description('the neighbourhood of a concept: links out, links in, shared tags, similar text')
  .option('--limit <n>', `neighbours to show (default ${RELATED_LIMIT})`, (value: string) =>
    Number.parseInt(value, 10))
  .option('--format <fmt>', 'table (default), json, or yaml')
  .option('--json', 'shorthand for --format json')
  .action(function (this: Command, concept: string, options) {
    exit(runRelated({
      bundle: bundleDir(this),
      dumpsDir: dumpsDir(this),
      draftsDir: draftsDir(this),
      concept,
      ...options,
    }));
  });

program
  .command('catalog')
  .description('render the whole bundle as one document, grouped by type')
  .option('--write', 'write catalog.md at the bundle root instead of printing')
  .option('--out <path>', 'write to a bundle-relative path instead of catalog.md')
  .option('--check', 'exit non-zero when the written catalog has drifted')
  .option('--include-deprecated', 'list deprecated concepts too')
  .action(function (this: Command, options) {
    exit(runCatalog({ bundle: bundleDir(this), ...options }));
  });

function exit(code: number): never {
  process.exit(code);
}

try {
  program.parse();
} catch (error) {
  console.error(red((error as Error).message));
  process.exit(1);
}
