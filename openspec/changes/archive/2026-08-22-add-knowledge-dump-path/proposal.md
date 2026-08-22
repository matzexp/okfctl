## Why

Knowledge is produced in conversations with coding agents and lost when the session
ends. `okfctl` today covers the maintainer's loop — a concept that already exists gets
reviewed, promoted, deprecated — but the moment a finding is *worth keeping* has no
cheap path into a bundle. `okfctl new` asks for a type, a directory, a title and a
description before it will write anything, which is the right bar for corpus knowledge
and the wrong bar for a thought you have thirty seconds to record.

The result is a gap the format itself does not have: OKF distinguishes *trust not yet
earned* (`status: draft`) but has nowhere to put *placement and shape not yet decided*.
This change adds that holding area, a way for agents to write into it without ceremony,
and the two verbs a human needs to empty it — relocate, or merge into what already exists.

## What Changes

- **A drafts area.** `drafts/` at the bundle root is a holding area for captured
  knowledge whose final placement is undecided. Its contents are conformant concepts
  (`status: draft`, no `verified`), not scratch files — see design.md for why raw
  frontmatter-less files were rejected.
- **`okfctl capture`.** A low-ceremony creation verb aimed at agents: title and body
  from stdin or flags, everything else inferred, target defaulted to the drafts area.
  It is `new` with the corpus-placement questions deferred rather than answered.
- **`okfctl move <from> <to>`.** A concept's id is its bundle-relative path, so
  relocating one changes its id and silently breaks every internal link that pointed at
  it. `move` rewrites those links, regenerates the affected `index.md` files, and logs
  the relocation. It does **not** touch `status` or `verified` — relocation is not
  promotion, and `okfctl promote` stays the separate deliberate act.
- **`okfctl init`.** Scaffolds a bundle (root `index.md`, `log.md`, `drafts/`); with
  `--register`, records it as *the* knowledge base for this machine; with `--agent <host>`,
  wires the capture workflow into a coding agent's user-level configuration so that a
  session in any repository can reach it.
- **Bundle resolution by precedence.** `--bundle`, then the bundle you are standing in,
  then the registered one. A hook firing in an unrelated repository has no other way to
  know where knowledge goes, and a session inside a bundle must never write into a
  different one.
- **A dump records its origin.** Captured knowledge carries the working directory it came
  from, and the git remote and commit when there is one, so a concept in a central bundle
  says which project produced it.
- **Agent host adapters.** Claude Code and Codex each get a skill plus a turn-end hook that
  prompts for capture — the two hosts share one hook contract, so `okfctl` ships one hook
  program and a config writer per host. Hosts with no event mechanism get instruction-file
  guidance and are documented as such. Adapters SHALL NOT claim a wiring they do not
  perform, and SHALL be removable.
- **`okfctl status` segregates the drafts area** into its own inbox count, held out of
  the main attention list so a dumping habit cannot drown the stale/drifted signal.
- **An `okf-capture` agent skill**, and a review workflow that can route a draft to
  relocation *or* to a merge into an existing concept.

No change to what `check` treats as an error. Every file this change writes is
conformant to SPEC §11's three rules on the first write, so nothing here needs a new
error tier or a new gate.

## Capabilities

### New Capabilities

- `knowledge-capture`: The drafts area — how it is identified, what a captured dump is
  on disk, and the `capture` verb that writes one.
- `concept-relocation`: The `move` verb — id change, inbound link rewriting, index
  regeneration, logging, and the refusal rules that keep it from destroying knowledge.
- `agent-integration`: `okfctl init` — bundle scaffolding, registration of the machine's
  knowledge base, bundle resolution by precedence, and the per-host adapters that install
  the capture workflow into a coding agent, including the hook's behavioral contract and
  the honesty rules governing what an adapter may claim.

### Modified Capabilities

- `corpus-status`: The drafts area is reported as a separate inbox group with its own
  count and drill-in filter, and its concepts are excluded from the default attention
  list they would otherwise dominate.
- `knowledge-skills`: The suite grows a capture workflow, and the review workflow gains
  the drafts-emptying outcomes — relocate into the corpus, or merge into an existing
  concept — alongside the confirm/outdated outcomes it already routes on.
- `index-generation`: A generated index must reflect a relocation, and the drafts area's
  own index is generated on the same terms as any other directory.

## Impact

- **New code**: `src/commands/capture.ts`, `src/commands/move.ts`, `src/commands/init.ts`,
  `src/core/drafts.ts` (drafts-area resolution), `src/core/userconfig.ts` (registered bundle
  and per-session hook state), `src/core/agents/` (one hook program plus a config writer per
  host).
- **Changed code**: `src/cli.ts` (three verbs, a global `--drafts-dir`, bundle resolution
  by precedence), `src/core/bundle.ts` (that precedence chain), `src/core/refs.ts`
  (expose inbound-link resolution for rewriting), `src/commands/status.ts` (inbox group),
  `src/commands/index-gen.ts` (regenerate a named subset).
- **New skills**: `.claude/skills/okf-capture/`, `.claude/commands/okf/capture.md`; the
  `okf-review` skill grows the relocate/merge routes.
- **Docs**: README command table and `docs/design.md` gain sections for `capture`,
  `move`, and `init`.
- **Writes outside the bundle**: `init --register` writes a user-level config, and
  `init --agent` writes into a user's global agent configuration (`~/.claude/settings.json`,
  `~/.codex/hooks.json`) — the first time `okfctl` writes to paths it does not own, and the
  first time it changes behavior in repositories other than the one it ran in. That needs an
  explicit contract, including removal — see design.md.
- No dependency changes. No breaking changes to existing verbs or on-disk formats.
