import { join } from 'node:path';
import {
  applyPlan, captureInstructions, readIfPresent, removeSection, upsertSection,
  type Adapter, type Edit, type InstallContext, type Plan,
} from './adapter.ts';
import {
  CAPTURE_SKILL, LIFECYCLE_SKILLS, commandStem, readCommand, readSkill,
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
function sectionRemoval(path: string, what: string): Edit {
  const existing = readIfPresent(path);
  const stripped = removeSection(existing);
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

  // Capture must work from any repository, so it goes to user scope.
  put(
    at(context.home, [...layout.userSkills, CAPTURE_SKILL, 'SKILL.md']),
    readSkill(CAPTURE_SKILL),
    `the ${CAPTURE_SKILL} skill`,
  );
  if (layout.userCommands) {
    put(
      at(context.home, [...layout.userCommands, `${commandStem(CAPTURE_SKILL)}.md`]),
      readCommand(CAPTURE_SKILL),
      `the /okf:${commandStem(CAPTURE_SKILL)} command`,
    );
  }

  // Curation happens in the knowledge base, so the rest go into the bundle.
  for (const skill of LIFECYCLE_SKILLS) {
    put(
      at(context.bundle, [...layout.projectSkills, skill, 'SKILL.md']),
      readSkill(skill),
      `the ${skill} skill`,
    );
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
      edit(agents, upsertSection(readIfPresent(agents), captureInstructions(context.command)), 'capture instructions in AGENTS.md'),
      ...skillEdits(context, CODEX_LAYOUT, false),
    ], false);
  },
  planRemoval(context) {
    return jsonHookPlan('codex', join(context.home, '.codex', 'hooks.json'), ['Stop'], context, [
      sectionRemoval(join(context.home, '.codex', 'AGENTS.md'), 'the capture section in AGENTS.md'),
      ...skillEdits(context, CODEX_LAYOUT, true),
    ], true);
  },
};

/** A host with no event mechanism gets instructions, and is told so plainly. */
function instructionsOnly(name: string, file: (context: InstallContext) => string): Adapter {
  return {
    name,
    hook: false,
    plan(context) {
      const path = file(context);
      return {
        host: name,
        edits: [edit(path, upsertSection(readIfPresent(path), captureInstructions(context.command)), 'capture instructions')],
        unsupported: ['event hooks — this host has no equivalent mechanism, so nothing fires automatically'],
        hook: false,
      };
    },
    planRemoval(context) {
      const path = file(context);
      return {
        host: name,
        edits: [sectionRemoval(path, 'the capture section')],
        unsupported: [],
        hook: false,
      };
    },
  };
}

const copilot = instructionsOnly('copilot', (context) =>
  join(context.home, '.github', 'copilot-instructions.md'));

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
