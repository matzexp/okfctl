## Why

`copilot` is currently an `instructionsOnly` adapter: it writes a capture-instructions
section into a Markdown file and reports plainly that it has no hook mechanism. That was
true when the adapter was written. It no longer is — GitHub Copilot has since shipped an
event-hook system (`sessionStart`, `Stop`/`agentStop`, `stop_hook_active`, …) and an Agent
Skills system (`SKILL.md`, the same standard `claude-code` and `codex` already install)
that together match the shape this codebase already builds adapters around. A coworker
explicitly asked for Copilot to be "fully supported" — meaning automatic capture prompts
on turn completion, not just a paragraph the model may or may not read.

Separately, the existing adapter's instructions file path is wrong: it writes to
`~/.github/copilot-instructions.md`, but Copilot's actual user-scope (cross-repository)
custom-instructions path is `~/.copilot/copilot-instructions.md`. `~/.github/...` is not a
path Copilot reads at all. Fixing this rides along with the upgrade since both touch the
same lines.

## What Changes

- Promote `copilot` from `instructionsOnly(...)` to a full `Adapter`, modeled on the
  existing `codex` adapter: a turn-completion (`Stop`) hook, capture instructions upserted
  into the corrected instructions path, and skill installation at both scopes.
- Add a hook-config writer for Copilot's flat per-event entry array
  (`{"version":1,"hooks":{"Stop":[{...}]}}`), distinct from the matcher-group shape
  `claude-code`/`codex` use, written to a dedicated file (`~/.copilot/hooks/okfctl.json`)
  rather than merged into a shared settings file.
- Register the hook under the event name `Stop` (not `agentStop`) so Copilot emits the
  snake_case, VS-Code-compatible payload shape (`hook_event_name`, `session_id`,
  `stop_hook_active`) that `src/commands/hook.ts` already parses unmodified — no change to
  the hook program itself, and no `UserPromptSubmit` arming hook, since
  `stop_hook_active` self-reports continuations exactly as Codex's does.
- Fix the capture-instructions file path from `~/.github/copilot-instructions.md` to
  `~/.copilot/copilot-instructions.md`.
- Install skills at Copilot's real skill directories: `~/.copilot/skills` (user scope,
  capture) and the bundle's `.github/skills` (project scope, curation). No command files —
  Copilot skills auto-expose as `/skill-name`, same as `codex`.
- Update `isInstalled` for `copilot` to the same `isWiredToThisBundle` check the other two
  hook-capable hosts use.
- `agents-md` is untouched and remains the only `instructionsOnly` host — it has no real
  product behind it to gain a hook mechanism from.

**BREAKING**: an `okfctl`-installed `copilot` host from before this change wrote to
`~/.github/copilot-instructions.md` with no hook. Re-running `okfctl init --agent copilot`
(or `okfctl update`) after this change installs the hook and skills and writes the
corrected instructions path, but does **not** remove the stale
`~/.github/copilot-instructions.md` file — that path was never something this tool's
removal logic knew about. `tasks.md` covers cleaning that up for existing installs.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-integration`: `copilot` moves from the "host with no hook mechanism" case to the
  "host with a hook mechanism" case throughout the existing generic requirements (host
  installation, removability, previewability, update, installed-detection, skill scope).
  No new requirement shapes are needed — the spec already describes hook-capable and
  instructions-only hosts generically; this change shifts which concrete host falls into
  which bucket, which the delta records as a scenario addition against the relevant
  requirements rather than a new requirement.

## Impact

- `src/core/agents/hosts.ts`: new flat-array hook plan writer; `copilot` adapter
  definition changes from `instructionsOnly(...)` to a full `Adapter`; new
  `COPILOT_LAYOUT`.
- `src/commands/hook.ts`: unchanged (already host-agnostic).
- `test/agents.test.ts`: assertions that `copilot` is instructions-only at
  `~/.github/copilot-instructions.md` change to reflect hook + skills behavior at the
  corrected path.
- `README.md`: host support table (`copilot` row).
- `docs/design.md`: the line describing `copilot`/`agents-md` as the instructions-only
  hosts.
- No change to the OKF bundle format, conformance rules, or any other command.
