#!/usr/bin/env node
import { Command } from 'commander';
import { runCheck } from './commands/check.ts';
import { runStatus } from './commands/status.ts';
import { runPromote, runDeprecate } from './commands/transition.ts';
import { runNew } from './commands/new.ts';
import { runReview } from './commands/review.ts';
import { runIndex } from './commands/index-gen.ts';
import { runRefs } from './commands/refs.ts';
import { red } from './core/term.ts';

const program = new Command();

program
  .name('okfctl')
  .description('Lifecycle tooling for Open Knowledge Format (OKF) v0.2 bundles')
  .version('0.1.0')
  .option('-b, --bundle <dir>', 'path to the bundle root', '.');

const bundleDir = (command: Command): string =>
  (command.optsWithGlobals().bundle as string) ?? '.';

program
  .command('check')
  .description('conformance errors (SPEC 11) and advisory lint warnings')
  .option('--strict', 'exit non-zero on warnings too (opt-in; not spec conformance)')
  .option('--quiet', 'show errors only')
  .option('--json', 'machine-readable output')
  .action(function (this: Command, options) {
    exit(runCheck({ bundle: bundleDir(this), ...options }));
  });

program
  .command('status')
  .description('corpus health: trust tiers, staleness, drift, drafts')
  .option('--stale', 'only concepts past stale_after')
  .option('--drifted', 'only concepts edited since their last verification')
  .option('--draft', 'only draft concepts')
  .option('--unverified', 'only concepts with no verified entry')
  .option('--json', 'machine-readable output')
  .action(function (this: Command, options) {
    exit(runStatus({ bundle: bundleDir(this), ...options }));
  });

program
  .command('new <path>')
  .description('create a conformant concept document at a bundle-relative path')
  .requiredOption('--type <type>', 'concept type, e.g. Decision (SPEC 11; open vocabulary)')
  .option('--title <text>', 'title; defaults to the filename read as words')
  .option('--description <text>', 'one-line summary')
  .option('--tags <list>', 'comma-separated tags', (value: string) =>
    value.split(',').map((tag) => tag.trim()).filter(Boolean))
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
  .option('--json', 'machine-readable output')
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

function exit(code: number): never {
  process.exit(code);
}

try {
  program.parse();
} catch (error) {
  console.error(red((error as Error).message));
  process.exit(1);
}
