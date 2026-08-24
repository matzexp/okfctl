## Context

See proposal.md - Why. Three decisions were made by the user before this document existed
and are not reopened here: a corpus target is never edited in place (a new draft is
written instead, citing it); a drafts target IS updated in place; a contradiction always
keeps both statements, flagged, never auto-resolved. This document works out the
mechanics those decisions require.

`src/commands/refine.ts` today has exactly one write path: build a new concept, refuse if
the target file exists, write it. `<source...>` already resolves any concept by ref
(`findConcept`, not scoped to the dumps area) — so citing a corpus concept alongside a new
dump already produces a new drafts entry with both cited; that part of decision #1 needs
no CLI change. What is missing is (a) a second write path that updates an existing
drafts-area file instead of refusing, for decision #2, and (b) a guard on `--consume`,
because decision #1 makes "a corpus concept as a named source" a real, reachable case for
the first time, and `--consume` today would happily delete it.

## Goals / Non-Goals

**Goals:**
- `okfctl refine --extend <id>` updates an existing draft in place: full-replacement body,
  merged `sources[]`, distinct log wording.
- `--consume` refuses rather than silently destroying a corpus or drafts concept named as
  a source.
- `okf-refine`'s workflow checks for a related existing concept before assuming a dump is
  new, using the same search path `okf-recall` already uses.
- Contradictions are always visible in the resulting text, never quietly overwritten.

**Non-Goals:**
- Not building conflict *detection* into the CLI or the search verb. "Is this dump related
  to that concept" and "is it additive or contradictory" are judgment calls the agent
  makes from reading both, the same way today's split/consolidate judgment already is —
  `okfctl search` finds candidates; it does not decide relationships.
- Not adding a third write mode beyond "fresh refine" and "extend." A corpus target's "new
  draft citing the corpus concept" is not a new mode — it is an ordinary refine with an
  extra source, already possible today.
- Not touching `okf-review`'s existing merge (drafts-area entry folded into a corpus
  concept) or promote. This proposal's new drafts-area entries and extended drafts flow
  into those unchanged, later, as any other draft would.
- Not making `--extend` infer the target automatically. The caller (the skill, having
  already asked the user) names the target explicitly; `refine` does not search or guess.

## Decisions

### `--extend <id>`: a distinct flag, not an implicit overwrite

Considered making `refine` overwrite whenever `--id`/`--to` happens to resolve to an
existing file, dropping the current refusal. Rejected: "no overwrite" is a load-bearing
guardrail elsewhere in this codebase (`new`, `capture`'s generated-id scheme exists
specifically so a second capture never collides) and silently changing refine's meaning
based on whether a path happens to already exist is exactly the kind of implicit
mode-switching this project avoids (the same reasoning `update`'s design note gives for
why it is a separate verb from `init --refresh`). An explicit flag makes "I intend to
overwrite this specific existing thing" a deliberate statement, not an accident of which
id was picked.

`--extend` takes the *target* id directly (the drafts-area concept to update), not a
boolean — there is nothing else it could sensibly overwrite, and requiring the id inline
means a typo produces "no such concept" rather than silently extending the wrong one.

### Full-replacement body, not append

The user's instruction was explicit: the whole resulting file, not a diff or an appended
section. Mechanically, `--extend` still takes `--body`/`--stdin` the same as a fresh
refine — the difference is only that this content *replaces* the existing file's body
entirely rather than becoming a new file's body. The agent is responsible for having read
the existing draft first and composing the complete combined (or both-sides-flagged) text;
`refine` itself does not attempt to diff, merge, or splice — consistent with it never
having invented structure for a fresh refine, just extended to a mode where "the given
body" now means "the given whole body," not "the given new material."

### `sources[]` merge: union, keyed by id

Extending reads the existing entry's `sources[]`, then appends one entry per newly-named
source not already present (by id) — same citation shape (`id`, `title`, `resource`) a
fresh refine already writes. Never removes an existing citation: an extend is additive to
provenance even when the *content* it argues for is a correction, because "what was
consulted to reach this document's current state" only grows over time.

### Corpus-target refusal message names the actual path

`--extend` naming a concept outside the drafts area is refused with the concept's actual
area named (e.g. "```<id>``` is in the corpus, not drafts — refine cites it as a source on
a new entry instead of extending it in place"), not a generic "not found," so the caller
learns the right move immediately rather than needing to re-read documentation.

### `--consume`'s guard checks area membership, not a source's original invocation

The refusal condition is exactly "any named source's id does not fall under the dumps
area" (the same path-prefix membership check `resolveDumpsDir`/dumps-area detection
already uses elsewhere in the codebase) — checked against every source named in the
current invocation, before any write happens, so the failure is all-or-nothing per
`refine`'s existing "failure leaves the bundle unchanged" guarantee. This also protects a
plain (non-`--extend`) refine that happens to cite a drafts-area concept as one of several
sources: consuming that citation would delete someone else's not-yet-reviewed draft, which
is exactly the same class of mistake as deleting a corpus concept.

### The existing-knowledge check is a skill-level step, not a CLI feature

`okfctl refine` gains no search flag; the check ("does this dump relate to something
already here") lives entirely in `okf-refine`'s own workflow, calling `okfctl search` (the
same verb `okf-recall` teaches) directly. Considered giving `refine` an `--auto-related`
flag that runs the search itself. Rejected: relationship judgment (extension vs.
contradiction vs. unrelated) requires reading and understanding both documents, which is
exactly the kind of judgment this codebase already keeps out of the CLI and inside the
calling skill (see `knowledge-refinement`'s Non-Goal "not adding automated
extraction/summarization inside the CLI," carried over unchanged from the original
add-refine-stage design) — a CLI flag that ran the search would still need the skill to
interpret the results, so it would not remove a step, only add a second way to trigger the
same one.

### Gated mode's existing pause, not a third mode

The "ask the user how to proceed" moment is a new *decision point* inside gated mode's
existing pause-and-confirm behavior — the same place a fresh refine already stops to show
type/title/body/sources before writing. Considered a dedicated "conflict mode" toggle.
Rejected: automatic mode already has a rule for this class of situation implicitly (via
"never invents an actor or a source, still declines... rather than filing something
wrong") — a match this ambiguous is exactly the kind of case automatic mode should also
pause on rather than guess through, so no separate mode is needed; automatic mode simply
treats an existing-knowledge match as one more case where it must stop and ask, same as
gated mode always does.

## Risks / Trade-offs

- **A caller passes `--extend` at a target whose current content the agent has not
  actually re-read**, producing a "full replacement" that silently drops something →
  mitigated by the dry-run requirement (Preview Before Writing's new scenario) always
  showing the complete resulting body before a real write, and by the skill guardrail
  requiring the existing draft be read first — not enforceable by the CLI itself, which
  cannot know whether a body honestly reflects the prior content.
- **The existing-knowledge search misses a genuinely related concept** (a paraphrase
  `okfctl search`'s ranking does not surface) → accepted: this is the same limitation
  `okf-recall` already carries; a missed relationship produces a disconnected new entry,
  which is exactly today's status quo, not a regression.
- **`--consume`'s new refusal breaks a workflow that (incorrectly) relied on consuming a
  non-dumps source** → no such workflow exists today; the guard only closes a latent
  danger this proposal's corpus-citing use case makes reachable for the first time, so
  there is nothing working today that this could break.

## Migration Plan

Additive. `--extend` is a new flag; omitting it preserves every existing `refine`
behavior exactly. The `--consume` guard is a new refusal on a path (consuming a
non-dumps source) that was previously silently destructive and, per the risk above, not
known to be relied upon. No bundle-format change; no existing draft or corpus concept is
touched by adding this capability.
