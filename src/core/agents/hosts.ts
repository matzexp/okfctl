import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyPlan, captureInstructions, recallInstructions, readIfPresent, removeSection,
  sectionMarkers, upsertSection,
  type Adapter, type Edit, type InstallContext, type Plan,
} from './adapter.ts';
import {
  CAPTURE_SKILL, USER_SCOPE_SKILLS, LIFECYCLE_SKILLS, commandStem, readCommand,
  readSkill, readSkillResources,
} from './sources.ts';

/** How the installed entry is recognized again, for idempotence and removal. */
const TAG = 'okfctl hook';

interface HookEntry {
  type: 'command';
  command: string;
  timeout?: number;
}

interface Matcher {
  matcher?: string;
  hooks: HookEntry[];
}

type HookConfig = Record<string, Matcher[]>;

function hookCommand(context: InstallContext, host: string): string {
  return `${context.command} hook ${host} --every ${context.every}`;
}

function isOurs(entry: unknown): boolean {
  return Boolean(
    entry && typeof entry === 'object' &&
    typeof (entry as HookEntry).command === 'string' &&
    (entry as HookEntry).command.includes(TAG),
  );
}

/**
 * Add our entry to an event's hook list, replacing any earlier entry of ours and
 * leaving every other hook on that event exactly where it was.
 */
function upsertHook(config: HookConfig, event: string, command: string): HookConfig {
  const groups = Array.isArray(config[event]) ? [...config[event]] : [];
  const cleaned = groups
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((entry) => !isOurs(entry)) }))
    .filter((group) => group.hooks.length > 0);
  cleaned.push({ hooks: [{ type: 'command', command, timeout: 30 }] });
  return { ...config, [event]: cleaned };
}

function removeHook(config: HookConfig, event: string): HookConfig {
  if (!Array.isArray(config[event])) return config;
  const cleaned = config[event]
    .map((group) => ({ ...group, hooks: (group.hooks ?? []).filter((entry) => !isOurs(entry)) }))
    .filter((group) => group.hooks.length > 0);
  const next = { ...config };
  if (cleaned.length === 0) delete next[event];
  else next[event] = cleaned;
  return next;
}

interface FlatHookEntry {
  type: 'command';
  command: string;
  timeoutSec?: number;
}

type FlatHookConfig = Record<string, FlatHookEntry[]>;

/**
 * Copilot's hook config has no matcher-group wrapper: entries sit directly in
 * each event's array. Filter-then-push, same idempotence contract as
 * `upsertHook`, one nesting level shallower.
 */
function upsertFlatHook(config: FlatHookConfig, event: string, command: string): FlatHookConfig {
  const existing = Array.isArray(config[event]) ? config[event] : [];
  const cleaned = existing.filter((entry) => !isOurs(entry));
  cleaned.push({ type: 'command', command, timeoutSec: 30 });
  return { ...config, [event]: cleaned };
}

function removeFlatHook(config: FlatHookConfig, event: string): FlatHookConfig {
  if (!Array.isArray(config[event])) return config;
  const cleaned = config[event].filter((entry) => !isOurs(entry));
  const next = { ...config };
  if (cleaned.length === 0) delete next[event];
  else next[event] = cleaned;
  return next;
}

/**
 * Read the currently-installed prompt interval back out of a hook host's config,
 * by finding the entry `isOurs()` recognizes and extracting the digits after
 * `--every ` in its command string — the only place the interval is recorded.
 * `null` when the config is absent, unparseable, or carries no entry of ours;
 * `update` falls back to the tool's default in that case rather than refusing.
 *
 * Both config shapes are read: the matcher-group nesting Claude Code and Codex
 * use, and Copilot's flat one. Reading only the nested shape meant a Copilot
 * install's interval was never found, so every `update` silently reset it to
 * prompting on every turn.
 */
export function installedInterval(configPath: string, host: string): number | null {
  const raw = readIfPresent(configPath);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const hooks = parsed && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>).hooks
    : null;
  if (!hooks || typeof hooks !== 'object') return null;

  const intervalOf = (entry: unknown): number | null => {
    if (!isOurs(entry)) return null;
    const command = (entry as HookEntry).command;
    if (!command.includes(` hook ${host} `)) return null;
    const match = /--every (\d+)/.exec(command);
    return match ? Number.parseInt(match[1], 10) : null;
  };

  for (const entries of Object.values(hooks as Record<string, unknown>)) {
    if (!Array.isArray(entries)) continue;
    for (const item of entries) {
      // Flat: the entry sits directly in the event's array.
      const direct = intervalOf(item);
      if (direct !== null) return direct;
      // Nested: the event's array holds matcher groups, each with its own hooks.
      for (const entry of (item as Matcher)?.hooks ?? []) {
        const found = intervalOf(entry);
        if (found !== null) return found;
      }
    }
  }
  return null;
}

/** Read a JSON config we are about to edit. Unparseable is a refusal, not an overwrite. */
function readJson(path: string): Record<string, unknown> | null {
  const raw = readIfPresent(path);
  if (raw === null || raw.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

function edit(path: string, contents: string | null, describe: string): Edit {
  return { path, contents, existed: readIfPresent(path) !== null, describe };
}

/**
 * Strip our section from an instructions file. A file left with nothing in it
 * only existed because we created it, so it goes too — removal takes back what
 * it installed, and an empty husk is not "taken back".
 */
function sectionRemoval(path: string, id: string, what: string): Edit {
  const existing = readIfPresent(path);
  const stripped = removeSection(existing, id);
  const emptied = stripped !== null && stripped.trim() === '';
  return {
    path,
    contents: emptied ? null : stripped,
    existed: existing !== null,
    describe: emptied ? `delete ${path.split('/').pop()}, which holds nothing else` : `remove ${what}`,
  };
}

function jsonHookPlan(
  host: string,
  configPath: string,
  events: string[],
  context: InstallContext,
  extra: Edit[],
  remove: boolean,
): Plan {

  // A removal that leaves another bundle wired takes back only this bundle's
  // curation skills. The hook is shared across every bundle on the machine, so
  // stripping it here would silently stop capture working for the others.
  if (remove && context.keepShared) {
    return { host, edits: extra, unsupported: [], hook: true };
  }
  const current = readJson(configPath);
  if (current === null) {
    throw new Error(
      `cannot parse ${configPath}; fix or remove it before installing — okfctl will not rewrite a config it cannot read`,
    );
  }

  const hooks = (current.hooks && typeof current.hooks === 'object'
    ? current.hooks
    : {}) as HookConfig;

  let next = hooks;
  for (const event of events) {
    next = remove
      ? removeHook(next, event)
      : upsertHook(next, event, hookCommand(context, host));
  }

  const merged = { ...current, hooks: next };
  if (remove && Object.keys(next).length === 0) delete (merged as Record<string, unknown>).hooks;

  // A config with nothing left in it only existed because we created it, so
  // removal deletes it rather than leaving an empty husk behind. Anything the
  // user had in there keeps the file alive.
  const emptied = remove && Object.keys(merged).length === 0;

  const describe = remove
    ? emptied
      ? 'delete the config, which holds nothing else'
      : `remove the ${events.join(' and ')} hook, keeping every other setting`
    : `${events.join(' and ')} hook, every ${context.every} turn${context.every === 1 ? '' : 's'}`;

  return {
    host,
    edits: [
      edit(configPath, emptied ? null : `${JSON.stringify(merged, null, 2)}\n`, describe),
      ...extra,
    ],
    unsupported: [],
    hook: true,
  };
}

/**
 * A hook config the host loads as its own dedicated file, not merged into a
 * shared settings file — Copilot reads every `*.json` under `~/.copilot/hooks/`
 * itself, so `okfctl` can own one file outright rather than parse-merge-preserve
 * into someone else's. Still upserts by marker (`isOurs()`) rather than
 * unconditionally overwriting, for the same reason `jsonHookPlan` does: a
 * caller could point `COPILOT_HOME` at a directory holding an unrelated
 * `okfctl.json`, or hand-add another hook to the same file later.
 */
function flatHookPlan(
  host: string,
  configPath: string,
  event: string,
  context: InstallContext,
  extra: Edit[],
  remove: boolean,
): Plan {

  // A removal that leaves another bundle wired takes back only this bundle's
  // curation skills. The hook is shared across every bundle on the machine, so
  // stripping it here would silently stop capture working for the others.
  if (remove && context.keepShared) {
    return { host, edits: extra, unsupported: [], hook: true };
  }
  const current = readJson(configPath);
  if (current === null) {
    throw new Error(
      `cannot parse ${configPath}; fix or remove it before installing — okfctl will not rewrite a config it cannot read`,
    );
  }

  const hooks = (current.hooks && typeof current.hooks === 'object'
    ? current.hooks
    : {}) as FlatHookConfig;

  const next = remove
    ? removeFlatHook(hooks, event)
    : upsertFlatHook(hooks, event, hookCommand(context, host));

  const merged = { version: 1, ...current, hooks: next };
  if (remove && Object.keys(next).length === 0) delete (merged as Record<string, unknown>).hooks;

  // This file only ever holds `version` and `hooks` unless something else wrote
  // into it — empty of both means it only existed because we created it.
  const remainingKeys = Object.keys(merged).filter((key) => key !== 'version' && key !== 'hooks');
  const emptied = remove && Object.keys(next).length === 0 && remainingKeys.length === 0;

  const describe = remove
    ? emptied
      ? 'delete the config, which holds nothing else'
      : `remove the ${event} hook, keeping every other setting`
    : `${event} hook, every ${context.every} turn${context.every === 1 ? '' : 's'}`;

  return {
    host,
    edits: [
      edit(configPath, emptied ? null : `${JSON.stringify(merged, null, 2)}\n`, describe),
      ...extra,
    ],
    unsupported: [],
    hook: true,
  };
}

/**
 * Where a host loads skills from, per scope. Both hosts read the same `SKILL.md`
 * standard, so the suite is written once and placed twice.
 */
interface SkillLayout {
  /** User-scope skills directory, relative to the home directory. */
  userSkills: string[];
  /** Project-scope skills directory, relative to the bundle root. */
  projectSkills: string[];
  /** User-scope slash commands, when the host has them. */
  userCommands?: string[];
  /** Project-scope slash commands, when the host has them. */
  projectCommands?: string[];
}

function skillEdits(context: InstallContext, layout: SkillLayout, remove: boolean): Edit[] {
  const edits: Edit[] = [];
  const at = (base: string, parts: string[]) => join(base, ...parts);

  const put = (path: string, contents: string, describe: string) =>
    edits.push(edit(path, remove ? null : contents, remove ? `delete ${describe}` : describe));

  // Capture and recall must work from any repository, so they go to user scope —
  // which is also why a removal that leaves another bundle wired leaves them
  // alone: they are shared, and this bundle does not own them.
  const shared = !(remove && context.keepShared);
  for (const skill of shared ? USER_SCOPE_SKILLS : []) {
    put(
      at(context.home, [...layout.userSkills, skill, 'SKILL.md']),
      readSkill(skill),
      `the ${skill} skill`,
    );
    for (const resource of readSkillResources(skill)) {
      put(
        at(context.home, [...layout.userSkills, skill, resource.relPath]),
        resource.contents,
        `the ${skill} skill's ${resource.relPath}`,
      );
    }
    if (layout.userCommands) {
      put(
        at(context.home, [...layout.userCommands, `${commandStem(skill)}.md`]),
        readCommand(skill),
        `the /okf:${commandStem(skill)} command`,
      );
    }
  }

  // Curation happens in the knowledge base, so the rest go into the bundle.
  for (const skill of LIFECYCLE_SKILLS) {
    put(
      at(context.bundle, [...layout.projectSkills, skill, 'SKILL.md']),
      readSkill(skill),
      `the ${skill} skill`,
    );
    for (const resource of readSkillResources(skill)) {
      put(
        at(context.bundle, [...layout.projectSkills, skill, resource.relPath]),
        resource.contents,
        `the ${skill} skill's ${resource.relPath}`,
      );
    }
    if (layout.projectCommands) {
      put(
        at(context.bundle, [...layout.projectCommands, `${commandStem(skill)}.md`]),
        readCommand(skill),
        `the /okf:${commandStem(skill)} command`,
      );
    }
  }
  return edits;
}

/**
 * True when this host is wired for this exact bundle: the capture skill exists
 * at user scope (this host is wired on this machine at all) *and* at least one
 * curation skill exists at this bundle's project scope (this bundle specifically
 * received it) — checking only the first is not enough, since capture is shared
 * across every bundle on the machine and would otherwise make `update` install
 * curation skills into a bundle this host was never wired to.
 */
function isWiredToThisBundle(context: InstallContext, layout: SkillLayout): boolean {
  const captureInstalled = existsSync(
    join(context.home, ...layout.userSkills, CAPTURE_SKILL, 'SKILL.md'),
  );
  const firstCuration = LIFECYCLE_SKILLS[0];
  const curationInstalled = existsSync(
    join(context.bundle, ...layout.projectSkills, firstCuration, 'SKILL.md'),
  );
  return captureInstalled && curationInstalled;
}

const CLAUDE_LAYOUT: SkillLayout = {
  userSkills: ['.claude', 'skills'],
  userCommands: ['.claude', 'commands', 'okf'],
  projectSkills: ['.claude', 'skills'],
  projectCommands: ['.claude', 'commands', 'okf'],
};

/** Codex reads `.agents/skills` at repo scope and `~/.agents/skills` at user scope. */
const CODEX_LAYOUT: SkillLayout = {
  userSkills: ['.agents', 'skills'],
  projectSkills: ['.agents', 'skills'],
};

/**
 * Copilot reads `.github/skills` (also `.claude/skills`/`.agents/skills`, but
 * `.github/skills` is the one this project doesn't already write for another
 * host) at project scope and `~/.copilot/skills` at user scope. Skills
 * auto-expose as `/skill-name`, so — like Codex — there is no separate
 * command directory to write.
 */
const COPILOT_LAYOUT: SkillLayout = {
  userSkills: ['.copilot', 'skills'],
  projectSkills: ['.github', 'skills'],
};

/**
 * Claude Code. `Stop` carries the prompt because `SessionEnd` output is
 * discarded by the host and so cannot prompt anything. `UserPromptSubmit` arms
 * the session, which is how the Stop hook tells a real turn from the
 * continuation its own block produced — Claude Code documents no flag for that.
 */
const claudeCode: Adapter = {
  name: 'claude-code',
  hook: true,
  plan(context) {
    return jsonHookPlan(
      'claude-code',
      join(context.home, '.claude', 'settings.json'),
      ['Stop', 'UserPromptSubmit'],
      context,
      skillEdits(context, CLAUDE_LAYOUT, false),
      false,
    );
  },
  planRemoval(context) {
    return jsonHookPlan(
      'claude-code',
      join(context.home, '.claude', 'settings.json'),
      ['Stop', 'UserPromptSubmit'],
      context,
      skillEdits(context, CLAUDE_LAYOUT, true),
      true,
    );
  },
  isInstalled(context) {
    return isWiredToThisBundle(context, CLAUDE_LAYOUT);
  },
  hookConfigPath(context) {
    return join(context.home, '.claude', 'settings.json');
  },
};

/**
 * Codex. Same event, same payload shape, same exit codes — and it reports its own
 * continuations through `stop_hook_active`, so no arming hook is needed. Hooks may
 * live in `hooks.json` or in a `[hooks]` table in `config.toml`; we write the JSON
 * file, which the host loads alongside the TOML rather than instead of it. Codex
 * has no slash-command equivalent, so the suite installs as skills only.
 */
const codex: Adapter = {
  name: 'codex',
  hook: true,
  plan(context) {
    const agents = join(context.home, '.codex', 'AGENTS.md');
    return jsonHookPlan('codex', join(context.home, '.codex', 'hooks.json'), ['Stop'], context, [
      edit(agents, upsertSection(readIfPresent(agents), 'capture', captureInstructions(context.command)), 'capture instructions in AGENTS.md'),
      ...skillEdits(context, CODEX_LAYOUT, false),
    ], false);
  },
  planRemoval(context) {
    return jsonHookPlan('codex', join(context.home, '.codex', 'hooks.json'), ['Stop'], context, [
      ...(context.keepShared
        ? []
        : [sectionRemoval(join(context.home, '.codex', 'AGENTS.md'), 'capture', 'the capture section in AGENTS.md')]),
      ...skillEdits(context, CODEX_LAYOUT, true),
    ], true);
  },
  isInstalled(context) {
    return isWiredToThisBundle(context, CODEX_LAYOUT);
  },
  hookConfigPath(context) {
    return join(context.home, '.codex', 'hooks.json');
  },
};

/**
 * A host with no event mechanism gets instructions, and is told so plainly.
 * Both capture and recall are text sections in the one file, independently
 * upsertable/removable by their own markers — removing one never disturbs
 * the other, or anything the user added outside either.
 */
function instructionsOnly(name: string, file: (context: InstallContext) => string): Adapter {
  return {
    name,
    hook: false,
    plan(context) {
      const path = file(context);
      let contents = readIfPresent(path);
      contents = upsertSection(contents, 'capture', captureInstructions(context.command));
      contents = upsertSection(contents, 'recall', recallInstructions(context.command));
      return {
        host: name,
        edits: [edit(path, contents, 'capture and recall instructions')],
        unsupported: ['event hooks — this host has no equivalent mechanism, so nothing fires automatically'],
        hook: false,
      };
    },
    planRemoval(context) {
      const path = file(context);
      // Everything this host has is user scope and shared, so a removal that
      // leaves another bundle wired has nothing of its own to take back.
      if (context.keepShared) {
        return { host: name, edits: [], unsupported: [], hook: false };
      }
      const existing = readIfPresent(path);
      let stripped = removeSection(existing, 'capture');
      stripped = removeSection(stripped, 'recall');
      const emptied = stripped !== null && stripped.trim() === '';
      return {
        host: name,
        edits: [{
          path,
          contents: emptied ? null : stripped,
          existed: existing !== null,
          describe: emptied
            ? `delete ${path.split('/').pop()}, which holds nothing else`
            : 'remove the capture and recall sections',
        }],
        unsupported: [],
        hook: false,
      };
    },
    isInstalled(context) {
      const existing = readIfPresent(file(context));
      return existing !== null && existing.includes(sectionMarkers('capture').start);
    },
    hookConfigPath() {
      return null;
    },
  };
}

/**
 * Copilot. Registered under the event name `Stop`, not `agentStop` — Copilot
 * emits a "VS Code compatible" payload shape under that name
 * (`hook_event_name`, `session_id`, `stop_hook_active`, snake_case) that
 * matches `hook.ts`'s existing `Payload` parser exactly. `agentStop` would get
 * camelCase fields the parser does not recognize, silently degrading every
 * event to a no-op. `stop_hook_active` self-reports continuations the same
 * way Codex's does, so no arming hook is needed here either. Hook config goes
 * to a dedicated file at `~/.copilot/hooks/`, not merged into shared
 * settings — see `flatHookPlan`. Instructions go to `~/.copilot/copilot-instructions.md`,
 * Copilot's actual user-scope (cross-repository) custom-instructions path —
 * `~/.github/copilot-instructions.md` is not a path Copilot reads at all.
 */
const copilot: Adapter = {
  name: 'copilot',
  hook: true,
  plan(context) {
    const instructions = join(context.home, '.copilot', 'copilot-instructions.md');
    return flatHookPlan(
      'copilot',
      join(context.home, '.copilot', 'hooks', 'okfctl.json'),
      'Stop',
      context,
      [
        edit(
          instructions,
          upsertSection(readIfPresent(instructions), 'capture', captureInstructions(context.command)),
          'capture instructions in copilot-instructions.md',
        ),
        ...skillEdits(context, COPILOT_LAYOUT, false),
      ],
      false,
    );
  },
  planRemoval(context) {
    const instructions = join(context.home, '.copilot', 'copilot-instructions.md');
    return flatHookPlan(
      'copilot',
      join(context.home, '.copilot', 'hooks', 'okfctl.json'),
      'Stop',
      context,
      [
        ...(context.keepShared
          ? []
          : [sectionRemoval(instructions, 'capture', 'the capture section in copilot-instructions.md')]),
        ...skillEdits(context, COPILOT_LAYOUT, true),
      ],
      true,
    );
  },
  isInstalled(context) {
    return isWiredToThisBundle(context, COPILOT_LAYOUT);
  },
  hookConfigPath(context) {
    return join(context.home, '.copilot', 'hooks', 'okfctl.json');
  },
};

const agentsMd = instructionsOnly('agents-md', (context) => join(context.home, 'AGENTS.md'));

export const ADAPTERS: Adapter[] = [claudeCode, codex, copilot, agentsMd];

export function findAdapter(name: string): Adapter {
  const found = ADAPTERS.find((adapter) => adapter.name === name);
  if (!found) {
    throw new Error(`unknown host "${name}"; supported: ${ADAPTERS.map((a) => a.name).join(', ')}`);
  }
  return found;
}

export { applyPlan };
