## Why

There is no place for a bundle's own judgment to live. `okf-capture`, `okf-refine`, and
`okf-ingest` currently carry one fixed, generic idea of what counts as durable knowledge,
how to cite sources, and what a concept should carry in frontmatter — baked into the skill
files themselves, identical across every bundle. A homelab bundle and a finance bundle want
different answers to "is this worth saving," "what makes a citation good enough," and
"does a Decision need tags." Today the only way to record a bundle-specific answer to that
kind of question is `okf-ingest`'s existing fallback — "propose a layout, ask, and record
the answer as a concept" — which files a *process* decision as if it were *knowledge*, and
gives every future session a corpus concept to read rather than a policy to consult first.

## What Changes

- New capability, `bundle-policy`: `.okf/policy/`, a dotfile directory scaffolded by
  `okfctl init` alongside `index.md`/`log.md`/`dumps/`/`drafts/`, holding three
  user-editable prose files seeded with real starter content, not empty templates:
  - `content-policy.md` — what is worth capturing and refining in this bundle, and what
    is not; may also state staleness horizons per type.
  - `source-policy.md` — what makes a citation good enough in this bundle, and how
    sources should be checked during review.
  - `field-policy.md` — this bundle's required/recommended frontmatter per type, beyond
    what SPEC §11 requires everywhere.
- `.okf/` is a dotfile directory, so it is already excluded from the bundle walk by the
  existing rule (`bundle-model`'s "Build directories and dotfiles are skipped" — no core
  parsing/walk code changes needed). These files are prose, not OKF concepts: no
  frontmatter, no `type`, never appear in `status`/`index`/`catalog`.
- `okfctl init` seeds these files only when absent, exactly like every other scaffolded
  file — never overwritten on a second run, so user edits are permanent.
- `okf-capture`, `okf-refine`, `okf-ingest`, and `okf-review` read `.okf/policy/` (when
  present) as the first step after establishing the bundle root, and apply it as a
  bundle-specific refinement on top of each skill's built-in judgment — never a
  replacement for the guardrails that protect provenance and actor honesty.
- `okf-ingest`'s existing "propose a layout, ask, and record the answer as a concept"
  fallback, for a bundle with no corpus to match conventions against, is redirected to
  record the answer in `field-policy.md` (placement/type conventions) instead of filing a
  process decision as a corpus concept.

## Capabilities

### New Capabilities
- `bundle-policy`: the `.okf/policy/` directory, its three files, their seeded starter
  content, and `init`'s scaffolding of them.

### Modified Capabilities
- `agent-integration`: `okfctl init`'s Bundle Initialization requirement scaffolds
  `.okf/policy/` alongside the existing scaffolding.
- `knowledge-skills`: capture, refine, ingest, and review read and apply
  `.okf/policy/` when present; ingest's no-corpus fallback records its answer in
  `field-policy.md` rather than as a concept.

## Impact

- `src/commands/init.ts` gains three more seeded files in its scaffolding plan, following
  the same missing-vs-existing reporting every other scaffolded item already uses.
- `skills/okf-capture/SKILL.md`, `skills/okf-refine/SKILL.md`, `skills/okf-ingest/SKILL.md`,
  `skills/okf-review/SKILL.md` gain a step reading `.okf/policy/` when it exists.
- No change to `src/core/bundle.ts`'s walk — `.okf/` is already skipped.
- No new conformance gate: SPEC §11 forbids adding one, and `field-policy.md`'s
  requirements are advisory guidance a skill applies, not something `okfctl check` enforces.
