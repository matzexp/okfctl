## Context

See proposal.md - Why. Two things already in the codebase matter here and are easy to
miss:

1. The vocabulary this change needs is a genuine rename, not an addition. Today
   `src/commands/capture.ts` and `openspec/specs/knowledge-capture/spec.md` already call a
   captured raw artifact "a dump" throughout (`PROVISIONAL_TYPE`'s doc comment, every
   scenario name: "A dump is untrusted", "A dump is findable", etc.), but the directory it
   lives in is called `drafts/`, "the drafts area." This change moves the directory name to
   match the artifact's existing name — `dumps/` — and frees `drafts/` up for a new,
   different meaning: refined, typed entries that are not yet placed in the corpus.
2. `src/core/drafts.ts`'s doc comment already draws the distinction this change needs:
   drafts-area membership (as it exists today) is a *placement* axis (a guess about type
   and location), while `status: draft` is a *trust* axis (nobody has verified this yet).
   After this change, the same distinction holds with the new names: `dumps/` and `drafts/`
   membership are both placement axes (unrefined vs. refined-but-unplaced), and
   `status: draft` remains the separate trust axis, unaffected — a concept in `drafts/` (new
   meaning) is still `status: draft` until promoted, just as one in `dumps/` is.

**This is an explicit naming decision, requested after an initial version of this proposal
recommended the opposite** (keep `drafts/` for raw dumps, add a new `staging/` area for
refined entries, to avoid a breaking rename). That recommendation is superseded: the
directory names below are final for this change. The trade-off it avoided — a breaking
rename of an already-shipped directory — is real and is accepted here; see Migration Plan.

## Goals / Non-Goals

**Goals:**
- Give refinement (raw dump → typed, titled, well-formed entry) a visible holding area and
  a CLI verb, separate from both raw capture and final placement/promotion.
- Land on `dumps/` (raw) and `drafts/` (refined) as the final directory names, matching
  vocabulary already used for the artifacts themselves, and complete the rename cleanly
  rather than leaving both meanings live under ambiguous names.
- Preserve provenance across refinement the same way `okf-review`'s existing merge/split
  path already does when it re-authors through `okfctl new` — name the original producer
  and source, do not claim first-hand authorship of restated findings.
- Make both backlogs visible in `okfctl status`, independently.

**Non-Goals:**
- Not changing *what* `okfctl capture` writes, only *where* — same provisional type,
  generated-id scheme, actor requirement, origin/session provenance.
- Not adding automated extraction/summarization inside the CLI. `okfctl refine`, like
  `okfctl new` and `okfctl capture`, writes the body it is given; the judgment of what the
  refined content should say is the calling agent's (or skill's), not the tool's.
- Not making the CLI infer when a dump has been "fully" extracted. That is not a
  machine-checkable fact (a split can spread one dump's content across several draft
  entries written in separate invocations), so it stays an explicit, opt-in act.
- Not touching promotion. `okf-promote` and `status: stable` are unaffected.
- Not providing an automated migration command for existing bundles in this change (see
  Migration Plan) — the rename is a manual, one-line step a maintainer runs once.

## Decisions

### Naming: `dumps/` for raw, `drafts/` (renamed from today's meaning) for refined

Chosen directly: rename `drafts/` → `dumps/` for the raw, low-ceremony capture area, and
reuse the name `drafts/` for the new refined-entry area. `DEFAULT_DUMPS_DIR = 'dumps'`
replaces today's `DEFAULT_DRAFTS_DIR`; a new `DEFAULT_DRAFTS_DIR = 'drafts'` is defined
against the refine target instead, with the same escapes-the-bundle guard
`resolveDraftsDir`/`resolveDumpsDir` both carry today.

This trades a breaking rename (below) for names that read correctly with no residual
ambiguity: "a dump" already means the raw artifact everywhere in the code and specs, so
`dumps/` needs no new vocabulary; "draft" already means "not yet trusted" via
`status: draft`, and an entry sitting in `drafts/` un-placed-and-unpromoted is squarely
that — draft in both the placement sense and the trust sense line up, rather than talking
past each other the way `drafts/`-for-raw and `status: draft`-for-anything did before.

### `okfctl refine`: shape and flags

```
okfctl refine <source...> --to drafts/<id> --type <Type> --title <Title> \
  --by <actor> [--description <d>] [--tags <a,b>] (--body <text> | --stdin) \
  [--consume] [--dry-run]
```

- `<source...>`: one or more references to dumps-area concepts (same resolution rules as
  `okfctl move`'s source argument — full id, unique suffix, refused if ambiguous). One
  source with several `refine` calls against it implements a **split**; several sources in
  one call implement a **consolidate**.
- `--type` and `--title` are **required**, unlike `capture`'s provisional-type default —
  the entire point of refining is that type and title are no longer guesses. `--by` is
  required for the same provenance reason every write verb requires it (SPEC §7).
- The body is supplied verbatim (`--body` or `--stdin`), never templated or transformed —
  consistent with `capture` and `new`. The calling skill composes it; the CLI moves bytes.
- The written concept carries `generated: { by: <refiner>, at: <now> }` — the refiner is
  honestly the author of *this* document, exactly as `okf-review`'s existing re-authoring
  guidance already states for merge/split. It also carries a `sources[]` entry per
  consumed source, identifying the original dumps-area concept (its id, title, and its own
  `generated.by`/session provenance where present) — see "Provenance carryover" below.
- `--consume`: only with this flag does `refine` remove the listed `<source...>` concepts
  after a successful write. Default is to leave them in place. This mirrors `okf-review`'s
  existing discipline around deletion ("never delete a draft without showing what was
  folded in and confirming") — the CLI cannot know a split is complete, so removal is an
  explicit act the caller opts into once it is. A skill in gated mode confirms with the
  user before ever passing `--consume`.
- `--dry-run`: same contract as every other write verb — resolved path, frontmatter, and
  (when `--consume` is set) which source files would be removed.
- Refuses to overwrite an existing target, refuses a target outside the bundle, refuses a
  reserved filename — matching `new`/`capture`/`move`.
- Logs to the nearest `log.md`: which draft concept was written, its type, from which
  source(s), by whom, and whether sources were consumed.

### Provenance carryover

A `sources[]` entry added by `refine` for a consumed dumps-area concept looks like the
`session` entry `capture` already writes (SPEC §5.1 shape): an `id`, a `title`, and a
`resource` naming the original concept's id (bundle-relative path). Where the source dump
itself carries a session or origin `sources[]` entry, that is *not* copied forward
automatically — the dumps-area document still exists (unless `--consume` removed it) and
remains the durable record of that provenance; the draft entry's `sources[]` entry pointing
at the dump's id is enough of a join, and copying denormalizes provenance into two places
that could drift. If `--consume` removes the source, its provenance is already captured in
the draft entry's `sources[]` before removal, so nothing is lost.

### `okf-refine` skill: gated vs. automatic

Both modes exist behind one skill; the difference is only whether writes pause for
approval. The user picks per-invocation (e.g. "refine the dumps inbox, but check with me
first" vs. "just refine everything automatically"); the skill defaults to gated when not
told otherwise, matching every other write-workflow skill's default posture
("Confirmation Before Writing" in `knowledge-skills`).

- **Gated (default)**: for each candidate (a dump, or a group the agent judges belong
  together), the skill drafts the refined type/title/body and shows it — including which
  source(s) it drew from and whether it proposes `--consume` — before running `refine`.
  Approval can be per-item or, if the user says so, per-batch after seeing the whole list
  (same pattern `okf-promote` and `okf-deprecate` already use for batches).
  `--dry-run` is used to preview before every real write.
- **Automatic**: the skill performs the same judgment (type/title/body, split/consolidate
  decisions, whether to consume) without pausing per item, and reports the full batch
  afterward. It still never invents an actor or a source, still never fabricates
  provenance, and still declines a dump it cannot confidently refine rather than filing
  something wrong — automatic changes *when* the user reviews (after, in bulk, from the
  report and `git diff`/`okfctl status`), not *whether* the same judgment is applied.

### `okf-review`'s "emptying the inbox" step keeps its name, changes its input

Review's "Emptying The Drafts Inbox" requirement keeps that name — it still empties
`drafts/` — but `drafts/` itself now holds refined entries, not raw ones. Its two
outcomes (relocate into the corpus, merge into an existing concept) are unchanged in
mechanics (`okfctl move`, body-fold-then-remove). Split and consolidate, as *raw-dump*
operations, move to being `okf-refine`'s job; they remain available to a reviewer who finds
a draft entry is still miscoped after refinement (rare — refinement is where that judgment
is supposed to happen), but the common path is: dump arrives in `dumps/` → refined into
`drafts/` by `okf-refine` → placed into the corpus and promoted by `okf-review` /
`okf-promote`.

### `okfctl status` reports both inboxes, independently

The existing drafts-inbox reporting is renamed to the dumps inbox (count, oldest-entry age,
`--dumps` filter, `inDumps`/`dumpsDir` in JSON — same mechanics as today, new names). A
second, independent drafts inbox (new meaning) is added alongside it: count, oldest-entry
age, `--drafts` filter, `inDrafts`/`draftsDir` in JSON. The two are always reported on
separate lines, never merged — they are different backlogs (unrefined vs.
refined-but-unplaced) and collapsing them would hide which one is actually backing up.

## Risks / Trade-offs

- **Breaking rename of an already-shipped, populated directory** → this is the primary
  cost of choosing these names over the additive `staging/` alternative. Mitigated only by
  it being a one-line fix per bundle (`mv drafts dumps`, or pass `--dumps-dir drafts` to
  keep the old path if a bundle would rather not rename); not mitigated by any
  compatibility shim in this change (see Migration Plan — an automatic migration path is
  explicitly out of scope here).
- **Two backlogs to work instead of one** → mitigated by keeping both visible in `status`
  and giving each its own skill/step, rather than one bigger, vaguer backlog.
- **`--consume` being skipped leaves stale-looking duplicates in `dumps/`** (a dump fully
  refined but still sitting there) → acceptable: an un-consumed dump is not wrong, only
  not-yet-cleaned-up, and the inbox age/count in `status` surfaces a growing backlog either
  way.
- **A caller passes `--consume` on a split's non-final call and deletes a source with
  content still to extract** → mitigated only by skill discipline (gated mode shows the
  proposed `--consume` before running; automatic mode's report makes it auditable
  afterward) and by `--consume` requiring an explicit flag rather than being the default.
  No CLI-side safeguard is possible without the tool understanding document content, which
  is out of scope (see Non-Goals).

## Migration Plan

Not additive — every bundle relying on `okfctl capture`'s default `drafts/` target is
affected. Before (or as part of) upgrading to a build of `okfctl` that includes this
change, a bundle maintainer must do one of:

1. `mv drafts dumps` at the bundle root, so existing raw captures land in the new default
   location and are picked up by `okfctl status`'s dumps inbox reporting. This is the
   recommended path — it is what the rename is for.
2. Pass `--dumps-dir drafts` on every `capture`/`status --dumps` invocation (or set it in
   whatever wraps those calls) to keep the old path without renaming the directory on disk.
   This works but keeps a directory named `drafts/` holding raw, unrefined material, which
   is exactly the naming collision this change exists to remove — treat it as a stopgap,
   not the intended end state.

If a bundle also wants to start using the new refine stage, its `drafts/` directory (after
option 1's rename) is empty and free for `okfctl refine` to start writing into
immediately — no further action needed. There is no data-loss risk either way: nothing is
deleted by upgrading, only `okfctl capture`'s default write target changes.
