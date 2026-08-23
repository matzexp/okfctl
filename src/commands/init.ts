import { existsSync, mkdirSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { resolveDraftsDir } from '../core/drafts.ts';
import { resolveDumpsDir } from '../core/dumps.ts';
import {
  CONTENT_POLICY_FILE, FIELD_POLICY_FILE, SOURCE_POLICY_FILE,
  contentPolicyTemplate, fieldPolicyTemplate, sourcePolicyTemplate,
} from '../core/policy.ts';
import { isBundleRoot, readConfig, registeredBundle, writeConfig } from '../core/userconfig.ts';
import { findAdapter, ADAPTERS } from '../core/agents/hosts.ts';
import type { Plan } from '../core/agents/adapter.ts';
import { bold, cyan, dim, green, red, yellow } from '../core/term.ts';

export interface InitOptions {
  dumpsDir?: string;
  draftsDir?: string;
  register?: boolean;
  agent?: string[];
  captureEvery?: number;
  remove?: boolean;
  /** Absolute path the installed hook should invoke. */
  command?: string;
  /** Home directory to install host configuration under. */
  home?: string;
  dryRun?: boolean;
}

/** SPEC §12. Written on the bundle-root index and nowhere else. */
const OKF_VERSION = '0.2';

interface Planned {
  path: string;
  kind: 'file' | 'directory';
  contents?: string;
}

export function runInit(target: string, options: InitOptions): number {
  const root = resolve(target || '.');
  const hosts = options.agent ?? [];

  const every = options.captureEvery ?? 1;
  if (!Number.isInteger(every) || every < 1) {
    console.error(red(`--capture-every must be a whole number of turns, at least 1 (got ${every})`));
    return 1;
  }

  // Removal touches no bundle; it only takes back what was installed.
  if (options.remove) {
    if (hosts.length === 0) {
      console.error(red('--remove needs at least one --agent <host>'));
      return 1;
    }
    return runHosts(hosts, options, every, true, root);
  }

  let dumpsDir: string;
  let draftsDir: string;
  try {
    // Resolve against the intended root even before it exists.
    dumpsDir = resolveDumpsDir(root, options.dumpsDir);
    draftsDir = resolveDraftsDir(root, options.draftsDir);
  } catch (error) {
    console.error(red((error as Error).message));
    return 1;
  }

  const planned: Planned[] = [
    { path: root, kind: 'directory' },
    { path: join(root, 'index.md'), kind: 'file', contents: rootIndex(basename(root)) },
    { path: join(root, 'log.md'), kind: 'file', contents: rootLog() },
    { path: join(root, dumpsDir), kind: 'directory' },
    { path: join(root, draftsDir), kind: 'directory' },
    { path: join(root, CONTENT_POLICY_FILE), kind: 'file', contents: contentPolicyTemplate() },
    { path: join(root, SOURCE_POLICY_FILE), kind: 'file', contents: sourcePolicyTemplate() },
    { path: join(root, FIELD_POLICY_FILE), kind: 'file', contents: fieldPolicyTemplate() },
  ];

  const missing = planned.filter((entry) => !existsSync(entry.path));
  const skipped = planned.filter((entry) => existsSync(entry.path));

  console.log(bold(`${cyan(root)}  ${missing.length === 0 ? dim('already scaffolded') : 'init'}`));
  for (const entry of missing) {
    console.log(`  ${green('create')} ${dim(display(root, entry))}`);
  }
  for (const entry of skipped) {
    if (entry.path === root) continue;
    console.log(`  ${dim(`keep   ${display(root, entry)} (exists)`)}`);
  }

  // Registration is separable from scaffolding: `init` alone leaves user-level
  // configuration untouched.
  const displaced = options.register ? registeredBundle() : null;
  if (options.register) {
    console.log(`  ${green('register')} ${dim('as this machine\'s knowledge base')}`);
    if (displaced && displaced !== root) {
      console.log(`  ${dim(`replaces ${displaced}`)}`);
    }
  }

  if (options.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  for (const entry of missing) {
    if (entry.kind === 'directory') mkdirSync(entry.path, { recursive: true });
    else {
      mkdirSync(join(entry.path, '..'), { recursive: true });
      writeFileSync(entry.path, entry.contents ?? '');
    }
  }

  if (options.register) {
    if (!isBundleRoot(root)) {
      console.error(red(`${root} is not a bundle; nothing registered`));
      return 1;
    }
    writeConfig({ ...readConfig(), registeredBundle: root });
  }

  if (hosts.length > 0) {
    const code = runHosts(hosts, options, every, false, root);
    if (code !== 0) return code;
  }

  console.log(green('\nready'));
  if (!options.register && registeredBundle() !== root) {
    console.log(dim('register it as this machine\'s knowledge base with `okfctl init --register`'));
  }
  if (hosts.length === 0) {
    console.log(dim(`wire an agent with \`okfctl init --agent ${ADAPTERS[0].name}\``));
  }
  return 0;
}

/**
 * Install or remove the capture workflow for one or more hosts.
 *
 * This is the only place okfctl writes to paths it does not own, so the contract
 * is narrow: additive, idempotent, previewable, reversible, and never a rewrite
 * of a file it could not parse.
 */
export function runHosts(
  hosts: string[],
  options: InitOptions,
  every: number,
  remove: boolean,
  bundle: string,
): number {
  const context = {
    command: options.command ?? 'okfctl',
    every,
    home: options.home ?? homedir(),
    bundle,
  };

  const plans: Plan[] = [];
  for (const name of hosts) {
    try {
      const adapter = findAdapter(name);
      plans.push(remove ? adapter.planRemoval(context) : adapter.plan(context));
    } catch (error) {
      console.error(red((error as Error).message));
      return 1;
    }
  }

  for (const plan of plans) {
    console.log(bold(`\n${cyan(plan.host)}  ${remove ? 'remove' : 'install'}`));
    for (const edit of plan.edits) {
      if (remove && edit.contents === null && !edit.existed) continue;
      const verb = remove
        ? (edit.existed ? 'remove' : 'skip  ')
        : (edit.existed ? 'update' : 'create');
      console.log(`  ${edit.existed || !remove ? green(verb) : dim(verb)} ${edit.path}`);
      console.log(`    ${dim(edit.describe)}`);
    }
    // An adapter may not claim a wiring it does not perform.
    for (const gap of plan.unsupported) {
      console.log(`  ${yellow('note')} ${dim(gap)}`);
    }
    if (!remove) {
      const project = plan.edits.filter((e) => e.path.startsWith(resolve(context.bundle))).length;
      console.log(`  ${dim(context.home === homedir()
        ? 'user scope: capture works in every session on this machine'
        : `user scope under ${context.home}`)}`);
      if (project > 0) {
        console.log(`  ${dim(`project scope: ${project} curation skill${project === 1 ? '' : 's'} in the bundle, loaded when you work in it`)}`);
      }
      if (plan.hook) {
        console.log(`  ${dim(`holds a turn open every ${every} turn${every === 1 ? '' : 's'}; each costs a model round-trip`)}`);
      }
    }
  }

  if (options.dryRun) {
    console.log(cyan('\ndry run; nothing written'));
    return 0;
  }

  for (const plan of plans) {
    for (const edit of plan.edits) {
      if (edit.contents === null) {
        if (edit.existed) rmSync(edit.path, { force: true });
        pruneEmpty(join(edit.path, '..'), edit.path.startsWith(resolve(context.bundle))
          ? resolve(context.bundle)
          : context.home);
        continue;
      }
      mkdirSync(join(edit.path, '..'), { recursive: true });
      writeFileSync(edit.path, edit.contents);
    }
  }
  return 0;
}

/**
 * Walk up removing directories that are now empty, stopping at the home
 * directory. A directory `~/.claude/skills/okf-capture` exists only because we
 * created it, and leaving the husk behind means removal did not take back what
 * it installed. A directory with anything else in it is someone else's and stays.
 */
function pruneEmpty(from: string, home: string): void {
  const stop = resolve(home);
  let dir = resolve(from);
  while (dir.startsWith(stop) && dir !== stop) {
    try {
      if (readdirSync(dir).length > 0) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    dir = join(dir, '..');
  }
}

/** Register an existing bundle without scaffolding anything. */
export function runRegister(target: string): number {
  const root = resolve(target || '.');
  if (!isBundleRoot(root)) {
    console.error(red(`${root} is not a bundle`));
    console.error(dim('a bundle root carries an index.md declaring okf_version (SPEC §12)'));
    return 1;
  }
  const displaced = registeredBundle();
  writeConfig({ ...readConfig(), registeredBundle: root });
  console.log(`${green('registered')} ${cyan(root)}`);
  if (displaced && displaced !== root) console.log(dim(`replaces ${displaced}`));
  return 0;
}

function display(root: string, entry: Planned): string {
  const rel = entry.path === root ? '.' : entry.path.slice(root.length + 1);
  return entry.kind === 'directory' && rel !== '.' ? `${rel}/` : rel;
}

function rootIndex(name: string): string {
  return [
    '---',
    `okf_version: "${OKF_VERSION}"`,
    '---',
    '',
    `# ${name}`,
    '',
    'Regenerate this file from frontmatter with `okfctl index`.',
    '',
  ].join('\n');
}

function rootLog(): string {
  return '# Directory Update Log\n';
}
