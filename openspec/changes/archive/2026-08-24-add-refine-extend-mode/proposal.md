## Why

`okf-refine`'s existing shape decision (one-to-one / split / consolidate) only ever
compares dumps against *other pending dumps*. It never checks whether a new dump's
knowledge relates to something *already refined or already promoted* — so a session that
learns more about a topic the bundle already has an entry for always produces a fresh,
disconnected draft rather than growing the existing one, and a session that discovers a
prior entry was wrong has no path to record that at all. Both are common: a follow-up
investigation extends what was already known; a later finding overturns an earlier one.
`okfctl refine` also has no way to update an existing drafts-area entry in place at
all — it refuses outright the moment a target path already exists ("okfctl never
overwrites a concept; pass a different --id").

Fixing this closes a real loop with two things this session already added: `okf-recall`
(searching the bundle before investigating) is the natural way to *find* the related
entry in the first place, and `refining-standard.md` already carries refine's
shape-judgment criteria that this proposal extends by one more case.

## What Changes

- Add `okfctl refine --extend <existing-drafts-id>`: updates that drafts-area concept's
  file in place with a full-replacement body (the whole resulting file — prior content
  plus new material — not a diff or an append marker), merges the new source(s) into its
  existing `sources[]` (never dropping prior citations), and logs an "extended" entry
  distinct from "refined." `--type`/`--title` default to the existing entry's current
  values and may be overridden. Refuses if the named target is not in the drafts area
  (a corpus concept is never extended in place — see below) or does not exist.
- **A corpus concept is never edited in place.** When the related existing entry is a
  stable, promoted concept, the workflow is unchanged at the CLI level: an ordinary
  `okfctl refine <corpus-id> <new-dump> --type ... --title ...` (no `--extend`) already
  accepts any concept as a source, so citing the corpus concept alongside the new dump
  produces a *new* drafts-area entry carrying the combined content, citing both — the
  corpus file itself is untouched, and a human reviews/promotes the new draft later to
  actually supersede the original.
- **Safety fix, exposed by the above:** `--consume` currently removes every resolved
  source unconditionally, with no check that a source is actually in the dumps area.
  Citing a corpus (or drafts) concept as a source for the first time makes this
  reachable in practice — `--consume` will now refuse if any named source is outside the
  dumps area, rather than deleting a corpus or drafts file.
- **Contradictions are never silently resolved.** Whether extending in place or creating
  a new draft, when the new material conflicts with what the target entry already says,
  the resulting body keeps both statements, each cited, explicitly marked as
  conflicting — resolution stays a human decision in `okf-review`, never decided by
  `okf-refine` itself.
- `okf-refine`'s workflow gains a new step: before treating a dump as unrelated to
  everything else, search existing drafts and corpus for a related concept — via
  `okf-recall`/`okfctl search`, not a new search implementation — and, if a plausible
  match turns up, ask the user (gated mode's existing pause-and-confirm posture, not a
  new mode) whether it is unrelated, an extension, or a contradiction before proceeding.
- The existing "moves bytes verbatim, invents no structure" guardrail is scoped down to
  a *fresh* refine. Composing a merged or juxtaposed body is a distinct, new mode with
  its own guardrail instead: never drop prior content or a prior citation, and always
  show the full resulting body before writing (dry-run previews the complete file, not
  just a diff, since this can overwrite something that already exists).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `knowledge-refinement`: `refine` gains an in-place update mode for drafts-area targets,
  a safety refusal on `--consume` against non-dumps sources, and previewing an extend
  shows the complete resulting body.
- `knowledge-skills`: `okf-refine`'s shape judgment gains a third case — relating a dump
  to an already-existing entry, not just to other pending dumps — with its own
  extend/contradiction handling, and a new pre-step that searches existing knowledge via
  `okf-recall` before deciding a dump is unrelated to everything else.

## Impact

- `src/commands/refine.ts`: `--extend` flag; in-place write path distinct from the
  create path; `--consume` gains a dumps-area-only guard.
- `skills/okf-refine/SKILL.md`: new step for checking against existing knowledge before
  the shape decision; extend/contradiction outcomes added to the gated-mode preview.
- `skills/okf-refine/refining-standard.md`: shape criteria gain the extend/contradiction
  case, alongside the existing one-to-one/split/consolidate cases.
- `test/refine.test.ts` (or equivalent): coverage for `--extend`, the sources[] merge,
  the consume safety refusal, and dry-run previewing the full resulting body.
- No change to `okfctl search`, `okf-recall`, `okf-review`, or `okf-promote` — this
  proposal only adds the pre-step that calls into search; review/promote's own mechanics
  for a subsequently-relocated or promoted draft are unaffected.
