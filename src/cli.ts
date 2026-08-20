#!/usr/bin/env node
import { Command } from 'commander';
import { runCheck } from './commands/check.ts';
import { runStatus } from './commands/status.ts';
import { runPromote, runDeprecate } from './commands/transition.ts';
import { runIndex } from './commands/index-gen.ts';
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
