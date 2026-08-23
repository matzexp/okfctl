## Why

`okfctl` currently has a two-stage lifecycle: `okfctl capture` writes raw, low-ceremony
dumps into the drafts area, and `okf-review` folds "figure out what this actually is"
(relocate, merge, split, consolidate) directly into final placement in the corpus. There is
no visible middle stage where a raw dump becomes a properly typed, well-formed draft entry
before it lands in a corpus directory. That work happens invisibly, inside a single review
pass, which makes it hard to see how much raw material has been turned into something
citable versus how much is still an unstructured dump, and forces refinement and placement
to happen in the same act even when a human wants to review the refined shape before it is
filed.

## What Changes

- **BREAKING**: the raw, low-ceremony capture area is renamed from `drafts/` to `dumps/`.
  `okfctl capture` now writes there by default; `--drafts-dir` is replaced by
  `--dumps-dir`. An existing bundle's populated `drafts/` directory is, after this change,
  no longer where `okfctl capture` looks — see design.md's Migration Plan.
- The name `drafts/` is reused for a new holding area: refined draft entries — typed,
  titled, well-formed concepts that are not yet placed in a corpus directory and not yet
  promoted. This is distinct from the raw dumps area both in name and in what it holds.
- New CLI verb, `okfctl refine`, that reads one or more dumps-area concepts and writes one
  or more `drafts/` concepts from them: extracting a clean type/title/body per the
  bundle's own conventions, carrying forward the original `generated` producer and
  `sources[]` as provenance rather than claiming the refiner's own authorship, and removing
  the dumps-area concepts it fully consumed. Supports one dump → many draft entries (split)
  and many dumps → one draft entry (consolidate).
- New skill, `okf-refine`, sitting between `okf-capture` and `okf-review`'s placement work.
  Two operating modes, chosen by the caller: **gated** (default) — propose refined entries,
  show them, write only after the user approves each one or the batch — and **automatic**
  — write refined entries directly per the bundle's guidelines, for a user who explicitly
  asks for it. Neither mode places entries in the corpus or promotes them; that is still
  `okf-review` / `okf-promote`.
- `okf-review`'s "emptying the inbox" step keeps its name and continues to operate on
  `drafts/`, but `drafts/` now holds refined entries rather than raw ones: relocate and
  merge still work as before; split and consolidate move upstream to become `okf-refine`'s
  job, since raw material no longer reaches `drafts/` unrefined.
- `okfctl status` reports a `dumps/` inbox (renamed from the current `drafts/` inbox) and a
  `drafts/` inbox (new meaning: refined-but-unplaced), as two independent lines.

## Capabilities

### New Capabilities
- `knowledge-refinement`: the (renamed) `drafts/` area's new semantics and the
  `okfctl refine` verb that converts dumps-area concepts into draft concepts, carrying
  provenance and consuming their sources.

### Modified Capabilities
- `knowledge-capture`: the drafts area — the target `okfctl capture` writes into — is
  renamed to the dumps area, defaulting to `dumps/` instead of `drafts/`, with
  `--dumps-dir` replacing `--drafts-dir`. Capture's other behavior (provisional type,
  generated id scheme, actor requirement, origin/session provenance) is unchanged.
- `knowledge-skills`: add the refine workflow to the skill suite's coverage; update the
  capture workflow's description to name the dumps area; the review workflow's "emptying
  the inbox" step keeps operating on `drafts/`, now understood as the refined-entry area
  rather than the raw one, with split/consolidate narrowed to an exception case.
- `corpus-status`: rename the existing drafts inbox reporting to the dumps inbox, and add a
  second, independent drafts inbox (new meaning) alongside it.

## Impact

- `src/core/drafts.ts` (today's raw-area module) is renamed to `src/core/dumps.ts`:
  `DEFAULT_DUMPS_DIR`, `resolveDumpsDir`, `inDumps`, `dumpConcepts`. `src/commands/
  capture.ts` moves to it.
- A new `src/core/drafts.ts` is created for the refine-target area:
  `DEFAULT_DRAFTS_DIR = 'drafts'`, `resolveDraftsDir`, `inDrafts`, `draftConcepts` — same
  shape as the module it replaces, now used by the new `src/commands/refine.ts`.
- `src/cli.ts`: `--drafts-dir` is replaced by `--dumps-dir` (capture's option) and a new
  `--drafts-dir` is added scoped to `refine`/`status` for the new meaning. `refine` is
  wired as a new verb.
- `src/commands/status.ts` reports both inboxes under their (swapped) names, with matching
  JSON fields.
- `skills/okf-refine/SKILL.md` is new; `skills/okf-capture/SKILL.md` and
  `skills/okf-review/SKILL.md` are edited for the renamed areas; `skills/okf-triage/
  SKILL.md` reports both inboxes.
- **Migration**: any bundle with an existing populated `drafts/` directory (raw captures,
  under today's meaning) needs it renamed to `dumps/` before or during upgrade, or
  `okfctl capture` and `okfctl status`'s dumps-inbox reporting will silently look in the
  wrong place. See design.md, Migration Plan.
