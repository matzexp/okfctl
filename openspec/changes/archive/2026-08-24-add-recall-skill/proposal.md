## Why

`okfctl search <query>` already does the hard part: ranked full-text search over
`title`/`description`/`tags`/body, trust-tier boosted, and — via the existing bundle
resolution precedence (SPEC delta in `agent-integration`'s "Bundle Resolution By
Precedence") — it already resolves the registered bundle from any repository with no
flags. But no installed skill, command, or instructions file ever tells an agent it
exists: a grep for "search" across `skills/`, `src/core/agents/adapter.ts`
(`captureInstructions()`, the text written into every instructions-only host's file), and
`commands/` returns nothing. `okf-capture` is deliberately installed at user scope so
writing into the knowledge base works from any repository; there is no symmetric skill
teaching an agent that the knowledge base can answer a question it is about to go
investigate from scratch. Knowledge flows in; nothing tells an agent it can flow back out
before duplicate work happens.

## What Changes

- Add `okf-recall`, a new skill teaching an agent to search the registered knowledge base
  and interpret what comes back, installed at user scope alongside `okf-capture` (same
  `SkillLayout.userSkills`, same rationale: it must work from any repository, not just
  inside the bundle) plus a paired slash command (`commands/okf/recall.md`, mirroring
  `commands/okf/capture.md`).
- The skill's own `description` frontmatter is written to trigger proactively — before
  starting non-trivial investigation that a knowledge base might already answer — the
  same mechanism that already makes every other skill description-selectable, not a new
  enforcement mechanism. See design.md for why this is the right lever rather than a hook.
- The skill teaches trust-tier and area interpretation explicitly: a `corpus` hit with
  `status: stable`/`trust: human-reviewed` is citable as established fact; a `dumps`- or
  `drafts`-area hit with `unverified` trust is a lead to verify, not a fact to act on
  without saying so.
- Generalize `upsertSection`/`removeSection`/`MARK_START`/`MARK_END` in
  `src/core/agents/adapter.ts` to take a section identifier, so an instructions-only
  host's single instructions file can carry two independently upsertable/removable
  sections — the existing capture section and a new recall section — instead of the one
  hardcoded marker pair supporting exactly one section. The capture section's marker text
  is preserved byte-for-byte (still `<!-- okfctl:capture -->`) so existing installs are
  read and removed correctly after this change.
- Add `recallInstructions(command)`, paired with the existing `captureInstructions(command)`,
  and wire `instructionsOnly()`'s `plan()`/`planRemoval()` to upsert/remove both sections
  in the one instructions file.
- `okf-recall` does not read `.okf/policy/`: none of the three existing policy files
  (content, source, field) scope "how to search" or "how much to trust a hit" — recall is
  a read operation, not a capture/refine/ingest/review judgment call. This is a deliberate
  non-fit, not an oversight; see design.md.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `knowledge-skills`: a new workflow (recall) joins the suite's coverage, discoverable by
  description before non-trivial investigative work, with its own trust-interpretation
  standard.
- `agent-integration`: skill installation at user scope gains a second skill alongside
  capture; instructions-only hosts' single instructions file gains a second, independently
  managed section.

## Impact

- `skills/okf-recall/SKILL.md`: new.
- `commands/okf/recall.md`: new.
- `src/core/agents/sources.ts`: new `RECALL_SKILL` constant; `CAPTURE_SKILL` and
  `RECALL_SKILL` both become members of a new `USER_SCOPE_SKILLS` list `hosts.ts` loops
  over, replacing the single hardcoded capture-only install block.
- `src/core/agents/adapter.ts`: `upsertSection`/`removeSection`/marker constants
  generalized; new `recallInstructions()`.
- `src/core/agents/hosts.ts`: `skillEdits()` installs the recall skill and its command at
  user scope; `instructionsOnly()` upserts/removes two sections instead of one.
- `test/agents.test.ts`: install/removal assertions extend to cover the recall skill, its
  command, and the second instructions-file section, for every host.
- `README.md`: mention `okf-recall` alongside the existing skill list, if one exists.
- No change to `okfctl search` itself, or to any bundle-format/CLI-verb behavior.
