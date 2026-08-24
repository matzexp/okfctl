## Context

See proposal.md - Why. `src/core/agents/hosts.ts` currently has one hook-config writer,
`jsonHookPlan`, built around the shape `claude-code` and `codex` share: a JSON object with
`hooks[event]` holding an array of *matcher groups*, each carrying its own `hooks: []`
list, merged into a config file the host also uses for unrelated settings (`~/.claude/settings.json`,
`~/.codex/hooks.json`). Copilot's hook config is structurally different — `hooks[event]`
holds the entries themselves, no matcher-group wrapper — and it lives in its own directory
of files (`~/.copilot/hooks/*.json`) rather than one shared settings file, so `okfctl` can
own a whole file instead of merging into someone else's.

`src/commands/hook.ts`'s `Payload` interface already reads `hook_event_name`,
`session_id`, `stop_hook_active` — exactly the field names Copilot emits when a hook is
registered under the event name `Stop` (its "VS Code compatible" payload format,
purpose-built for interop with hosts like this one). Registering under `agentStop` instead
would get camelCase fields (`stopReason`, no `stop_hook_active`) that the existing parser
does not recognize, silently degrading every Copilot Stop event to `reason: 'ignored'`.
Event name choice is therefore not cosmetic — it is what makes `hook.ts` need zero changes.

## Goals / Non-Goals

**Goals:**
- `copilot` installs a `Stop` hook, capture instructions, and both skill scopes, matching
  `codex`'s shape and contract.
- The shared hook program (`hook.ts`) stays host-agnostic; the only new code is a
  configuration writer.
- Fix the wrong instructions-file path as part of the same change, since both live on the
  same lines and shipping the bug forward under a "full support" label would be worse.

**Non-Goals:**
- Not adding `preToolUse`/`sessionStart`/other Copilot hook events. Every other
  hook-capable host in this codebase installs exactly one event (turn completion); Copilot
  gets the same, not more.
- Not building a general "flat vs. matcher-group" abstraction over `jsonHookPlan` ahead of
  a second host that would need it. One sibling function for the one shape that exists
  today; a shared abstraction is for when there are three data points, not two.
- Not migrating or deleting a pre-existing `~/.github/copilot-instructions.md` from an
  install made before this change automatically. `okfctl` does not delete files at paths
  it no longer considers its own — see Risks below.

## Decisions

### A dedicated hook file, not a merge into a shared one

`claudeCode`/`codex` write into a config file the host itself uses for other settings, so
`jsonHookPlan` must parse-merge-preserve. Copilot's user-scope hook directory
(`~/.copilot/hooks/`) is a directory of independent `*.json` files by design — so `okfctl`
writes `~/.copilot/hooks/okfctl.json` as a file it fully owns, the same way it fully owns
every skill file it installs. This still goes through upsert/remove-by-marker logic
(`upsertFlatHook`/`removeFlatHook`, reusing the existing `isOurs()` check against the
`command` string) rather than being unconditionally overwritten, for one concrete reason:
a caller could point `COPILOT_HOME` at a directory that already holds an `okfctl.json`
from an unrelated source, or manually add another hook to the same file later, and the
existing contract ("never rewrite a file it cannot parse", "an existing hook on the same
event survives") should hold here too, not just for the hosts where merging was forced on
us.

Rejected: merge into whatever single file Copilot reads first in its load order. There
isn't one — Copilot reads every `*.json` in the directory and merges them itself, so
"the shared file" doesn't exist the way `settings.json` does, and inventing one adds
complexity the platform doesn't require.

### `Stop`, not `agentStop`

Registering the hook under the event name `Stop` gets the snake_case payload shape
`hook.ts` already parses; registering under `agentStop` would get a differently-shaped
payload the current parser silently ignores (`hook_event_name` would be absent, so
`evaluate()` falls through every branch to `reason: 'ignored'` — no crash, just a hook that
never fires). This is Copilot's own documented compatibility affordance for hosts modeled
on Claude Code/Codex, not a coincidence being relied on opportunistically.

### `flatHookPlan` as a sibling function, not a parameterized `jsonHookPlan`

Considered adding a `groupShape: 'matcher' | 'flat'` parameter to `jsonHookPlan` instead of
a second function. Rejected: the two shapes differ in the merge (matcher groups filter-then-
push a group; flat entries filter-then-push an entry directly into the event's array) and
in whether the top-level file is shared (`emptied` logic for a shared file must leave
unrelated top-level keys alone; a dedicated file only ever has `version` and `hooks`).
Branching a single function on shape would produce more conditionals than the two
functions' combined body, for a "shared" function that shares less code than it looks like
it should. A short sibling function reads the shape it embodies rather than an `if` that
only ever takes one branch per host.

### `COPILOT_LAYOUT` follows `CODEX_LAYOUT`'s no-commands shape

`SkillLayout.userCommands`/`projectCommands` stay unset for Copilot, same as Codex:
Copilot skills auto-expose as `/skill-name` slash commands with no separate command-file
mechanism, so there is nothing for a command writer to produce.

```ts
const COPILOT_LAYOUT: SkillLayout = {
  userSkills: ['.copilot', 'skills'],
  projectSkills: ['.github', 'skills'],
};
```

### Instructions path fix rides along, not split into its own change

The wrong path (`~/.github/copilot-instructions.md`) and the hook/skills upgrade touch the
same adapter definition and the same test assertions. Splitting them would mean the hook
upgrade briefly ships pointing capture instructions at a path Copilot never reads, which is
worse than one change that fixes both.

## Risks / Trade-offs

- **A prior `okfctl`-installed `copilot` host left `~/.github/copilot-instructions.md`
  behind, which this change's adapter no longer knows about** → `isInstalled` and
  `planRemoval` only ever look at paths the *current* adapter definition writes, so a stale
  file at the old path is invisible to both. Mitigation: `tasks.md` includes re-running
  `init --agent copilot` for existing installs and manually removing the stale file — this
  is the one manual step the change cannot make automatic, since `okfctl` does not delete
  paths outside what the current adapter claims.
- **Copilot changes its hook payload shape or event-name compatibility mapping in a future
  release** → same exposure every other host already has; `hook.ts`'s fail-open contract
  (`try { evaluate() } catch { ignored }`) means a shape change degrades to "hook never
  fires," never a crash or a wrongly-blocked turn.
- **`~/.copilot/hooks/` merge behavior (multiple files, load order) differs from what the
  docs describe if Copilot changes it** → `okfctl` only ever writes its own dedicated file
  and never inspects sibling files in that directory, so this risk is bounded to "our hook
  stops firing," not "we corrupt someone else's."

## Migration Plan

Additive to the adapter list; no other command changes. For a machine with `copilot`
already installed under the old `instructionsOnly` behavior: re-running
`okfctl init --agent copilot` (or `okfctl update`, once `isInstalled` recognizes the new
layout) installs the hook and skills and writes the corrected instructions file. The old
`~/.github/copilot-instructions.md` is left in place and should be removed by hand — see
Risks.
