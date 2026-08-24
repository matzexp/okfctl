## Context

See proposal.md - Why. Three existing mechanisms this change reuses rather than
reinvents: `SkillLayout` (per-host directory choice, already generic over any skill
name), `readSkill`/`readCommand` (already generic over any skill/command name), and
description-based skill selection (already how every existing skill is chosen without the
user typing a slash command — see `openspec/specs/knowledge-skills/spec.md`'s "Workflow
Coverage" requirement, one scenario per skill, each triggered by matching the user's
request or an installed prompt against the skill's own `description`).

Two things do not yet exist and this change adds them: a *second* user-scope skill
(today only `CAPTURE_SKILL` installs there — `skillEdits()` handles it as a single
hardcoded case, not a loop), and a *second* section inside one instructions-only host's
single instructions file (today `MARK_START`/`MARK_END` are one hardcoded constant pair,
so `upsertSection`/`removeSection` support exactly one managed section per file).

## Goals / Non-Goals

**Goals:**
- An agent working in any repository learns, the same way it already learns to capture,
  that it can search the registered knowledge base first.
- Trust-tier and area (dumps/drafts/corpus) interpretation is explicit in the skill, so a
  search hit is never treated as settled fact just because it matched.
- Instructions-only hosts (whatever occupies that category when this lands) get the same
  awareness, via a second section in the one file they read, without disturbing the
  existing capture section — including hosts with content in that section already
  installed by the pre-this-change tool.

**Non-Goals:**
- Not a hook. No event fires on recall, and no turn is held open — see "Why proactive is
  a description, not a mechanism" below for why this is the correct fit, not a scope cut.
- Not a new `.okf/policy/` file. Recall reads no bundle policy; see "Recall does not read
  bundle policy" below.
- Not changing `okfctl search` itself — ranking, trust-tier boost, and output formats are
  all `bundle-search`'s existing, unmodified behavior.
- Not extending the generalized section-marker mechanism to support more than the two
  sections this change needs. A third section is a problem for whichever change adds a
  third thing to teach an instructions-only host.

## Decisions

### Name: `okf-recall`

Every existing skill name is `okf-<verb>` naming one clear action: triage, refine,
ingest, promote, review, deprecate, capture. `recall` reads as the verb pairing most
directly with `capture` — one writes a session's knowledge in, the other reads the
bundle's knowledge out — without colliding with `okfctl search`'s own name (the skill
teaches *when and how* to use `search`; it is not a rename of the CLI verb).

### Proactive is a description, not a mechanism

Considered a hook, the way capture uses `Stop` to hold a turn open and prompt. Rejected:
capture's hook exists because the *cost of not capturing* is asymmetric — a turn ends and
the knowledge is gone forever, so blocking briefly to ask is worth it (see
`knowledge-skills`'s "The Hook Prompts, It Does Not Capture" requirement for the existing
reasoning). Recall has no equivalent asymmetry: searching late, or not at all, costs at
worst some duplicated investigation — recoverable, not lost. A hook that fired before
every tool call an agent might use to investigate something would also have no clean event
to attach to (there is no "the agent is about to investigate something" event on any
host), unlike capture's clean turn-completion boundary.

Instead, `okf-recall`'s `description` frontmatter is written to match the moment that
matters — starting non-trivial investigation, answering "have we seen this before,"
debugging something that smells like a repeat — the same selection mechanism that already
makes `okf-triage` fire on "what needs attention" without a slash command. This is not a
weaker guarantee than a hook, just a different one already proven by seven other skills in
this suite: an agent recognizing the moment from a good description, not a blocking event
forcing the question.

### Trust-tier interpretation is explicit, not left to the search output's own fields

`okfctl search` already returns each hit's area and trust tier; the risk this change
guards against is an agent treating "it matched" as "it's true." The skill states the
rule plainly: `corpus` + `stable`/`human-reviewed` is citable as established; anything in
`dumps`/`drafts`, or `corpus` at `unverified`/`draft`, is a lead — worth reading, not worth
repeating without saying it is unverified. This mirrors `okf-refine`'s existing discipline
about never claiming a dump's findings as first-hand work (SPEC §7 provenance), applied to
reading instead of writing.

### Recall does not read bundle policy

`.okf/policy/`'s three files each answer one question: what's worth capturing
(`content-policy.md`), what makes a citation good enough (`source-policy.md`), and what
frontmatter a type needs (`field-policy.md`). None answers "how should search results be
interpreted" — that judgment is generic to OKF's trust-tier model (SPEC §5.3), not
something a bundle customizes per-bundle the way capture criteria or citation standards
are. Forcing a fit into one of the three, or adding a fourth policy file for one skill,
would be solving a problem that does not exist yet. If a real bundle-specific recall
customization need shows up later, that is a new, small change — not a reason to guess at
its shape now.

### Generalizing the section marker: parameterize by id, preserve `capture`'s marker text

`MARK_START`/`MARK_END` become functions of a section id:
`sectionMarkers(id) => { start: '<!-- okfctl:${id} -->', end: '<!-- /okfctl:${id} -->' }`.
`upsertSection`/`removeSection` take that id as a parameter instead of closing over the
module-level constant. The capture call site passes `'capture'`, producing the exact
marker text already on disk from every prior install (`<!-- okfctl:capture -->`) — a
pre-this-change instructions file upserts and removes correctly with no migration step.
The new recall call site passes `'recall'`.

`instructionsOnly()`'s `plan()`/`planRemoval()` change from one `edit()` call to two — one
per section — both targeting the same file, applied by `applyPlan` in sequence. Considered
merging both sections into a single `upsertSection` call with combined content instead of
two independently-marked sections. Rejected: independent markers mean removing recall
alone (say, a future `--remove recall`-style granularity, even though this change does not
add that flag) does not require re-parsing and reconstructing capture's section, and a
partially-corrupted file (one marker pair intact, the other hand-edited) fails narrowly
instead of losing both sections' content to a single failed parse.

### User-scope skill installation: a list, not a second hardcoded block

`skillEdits()`'s current shape has one `put()` call naming `CAPTURE_SKILL` explicitly,
then a loop over `LIFECYCLE_SKILLS`. This change replaces the single hardcoded call with a
loop over a new `USER_SCOPE_SKILLS = [CAPTURE_SKILL, RECALL_SKILL]` (both constants
exported from `sources.ts`), using the same per-skill `put()` shape the `LIFECYCLE_SKILLS`
loop already has. This is the smallest change that avoids a third near-duplicate block if
a future skill also needs user scope, and keeps `CAPTURE_SKILL`'s existing behavior
(including every existing test path keyed off it) unchanged — it is still exported, still
named, just no longer the only member of its own list.

## Risks / Trade-offs

- **Description-based selection is judgment, not a guarantee — an agent can simply not
  recognize the moment and skip searching** → accepted: this is the same trade-off every
  other skill in the suite already carries (capture's own advisory "declining is the right
  answer more often than not" is the identical philosophy applied to writing); recall gets
  no stronger guarantee than the rest of the suite has, and no hook mechanism fits without
  inventing an event this project does not otherwise have.
- **Two sections in one instructions file is more moving parts than one** → mitigated by
  parameterizing rather than duplicating the marker functions, and by each section still
  being independently parseable/removable — a corrupt recall section does not risk
  capture's.
- **A pre-this-change instructions-only install has only the capture section; after this
  change, `update` adds a recall section to a file the user may have hand-edited around
  the existing marker** → the existing "additive, never removing or replacing content it
  did not write" contract (`agent-integration`'s relevant requirement) already covers this:
  `upsertSection` only touches content between its own markers, so anything the user added
  outside the capture markers is untouched by the new recall section landing elsewhere in
  the same file.

## Migration Plan

Additive. Existing `okf-capture`-only installs gain `okf-recall` and, for
instructions-only hosts, a second section, on the next `init --agent`/`update` for that
host — the same propagation path every other packaged-content change already uses. No
bundle-format or CLI-verb change; nothing scaffolded or migrated on an existing bundle.
