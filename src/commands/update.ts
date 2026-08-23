import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { ADAPTERS, installedInterval } from '../core/agents/hosts.ts';
import { runHosts } from './init.ts';
import { dim, green, red } from '../core/term.ts';

export interface UpdateOptions {
  captureEvery?: number;
  /** Absolute path the installed hook should invoke. */
  command?: string;
  /** Home directory host configuration lives under. */
  home?: string;
  dryRun?: boolean;
}

/**
 * Refresh exactly the hosts already installed for a bundle: current skill and
 * command content, current hook config, preserving each host's existing
 * `--capture-every` interval unless the caller overrides it. Never installs a
 * host that was not already installed, never scaffolds bundle files, never
 * touches registration — narrower than `init`, on purpose (design.md).
 */
export function runUpdate(target: string, options: UpdateOptions): number {
  const bundle = resolve(target || '.');
  const home = options.home ?? homedir();
  const command = options.command ?? 'okfctl';

  if (options.captureEvery !== undefined) {
    if (!Number.isInteger(options.captureEvery) || options.captureEvery < 1) {
      console.error(red(`--capture-every must be a whole number of turns, at least 1 (got ${options.captureEvery})`));
      return 1;
    }
  }

  const installed = ADAPTERS.filter((adapter) => adapter.isInstalled({ command, every: 1, home, bundle }));

  if (installed.length === 0) {
    console.log(dim(`nothing installed for ${bundle}`));
    console.log(dim(`wire an agent with \`okfctl init ${target} --agent ${ADAPTERS[0].name}\``));
    return 0;
  }

  // Group by the interval each host will carry: an explicit --capture-every
  // applies to every host uniformly; otherwise each hook host keeps its own
  // previously-installed interval, read back from its own config.
  const byInterval = new Map<number, string[]>();
  for (const adapter of installed) {
    const every = options.captureEvery ?? currentInterval(adapter.name, home) ?? 1;
    const names = byInterval.get(every) ?? [];
    names.push(adapter.name);
    byInterval.set(every, names);
  }

  for (const [every, names] of byInterval) {
    const code = runHosts(names, { command, home, dryRun: options.dryRun }, every, false, bundle);
    if (code !== 0) return code;
  }

  if (!options.dryRun) console.log(green('\nupdated'));
  return 0;
}

/** The interval currently installed for a hook-capable host, or null for one without hooks. */
function currentInterval(host: string, home: string): number | null {
  if (host === 'claude-code') return installedInterval(join(home, '.claude', 'settings.json'), host);
  if (host === 'codex') return installedInterval(join(home, '.codex', 'hooks.json'), host);
  return null;
}
