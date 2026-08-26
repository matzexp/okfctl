---
name: okf-refine
description: Turn raw dumps in an OKF bundle's dumps area into typed, titled entries in the drafts area — including extending an existing entry with new material, or flagging one it contradicts. Use when the user wants to refine, clean up, tidy, or process the dumps inbox, turn raw captures into proper entries, update an existing entry with a follow-up finding, or asks what is sitting unrefined and needs shaping before review.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Convert raw dumps into typed, titled, well-formed entries in the drafts area, citing what
they were drawn from rather than claiming first-hand authorship.

This sits between `okf-capture` (dump arrives, unshaped, in the dumps area) and
`okf-review` (a drafts-area entry gets placed in the corpus and eventually promoted).
It is the workflow for knowledge that came *from a dump*; `okf-ingest` is the one for
knowledge arriving with its type and placement already obvious and no dump behind it.
Refining is the step where "what is this and what should it be called" gets answered — not
before, when the capturing session may not know yet, and not later, when review is trying
to also decide placement at the same time.

**Two modes.** Default to **gated**: propose each refined entry and wait for approval
before writing. Switch to **automatic** only when the user explicitly asks for it — "just
refine everything," "run it without asking me each time." Both modes apply the same
judgment; automatic only changes when the user reviews (after, in bulk) rather than before,
per entry.

**Steps**

1. **Establish the bundle root**

   As in `okf-triage`: find the directory holding the bundle's top-level `index.md`, ask
   when it is ambiguous, and pass `--bundle <root>` on every command.

2. **Read this bundle's content and field policy, if it has one**

   Check for `.okf/policy/content-policy.md` and `.okf/policy/field-policy.md`. If either
   exists, read it and apply it to the shape/type/title judgment in step 4 below —
   policy may narrow what this bundle wants refined, or state per-type field conventions
   this bundle already agreed on. It cannot widen what the guardrails below forbid: it can
   never license inventing an actor, skipping a citation, or claiming a dump's findings as
   your own first-hand work. Proceed on `refining-standard.md`'s judgment if no policy
   file exists.

3. **Read the dumps inbox**

   ```bash
   okfctl --bundle <root> refine --list
   ```

   (`okfctl status --dumps --json` reports the same inbox with the full record per entry,
   when you want the frontmatter rather than a listing.)

   Work from this list, not from a guess at what looks stale. Read each dump's body along
   with its frontmatter — the title on a capture is a one-line summary, not necessarily the
   shape the refined entry should take.

4. **Check whether this relates to existing knowledge**

   Before assuming a dump is unrelated to everything else, search for it — the same way
   `okf-recall` would, through `okfctl search <query>`, over both the drafts area and the
   corpus. If nothing plausible turns up, proceed to step 5's shape decision as normal.

   If a plausible match turns up, stop and ask the user whether it is: unrelated (a
   coincidental term match — proceed as normal), an **extension** (the dump adds to what
   the match already says), or a **contradiction** (the dump conflicts with it). This is a
   decision point inside gated mode's existing pause-and-confirm — automatic mode pauses
   here too, the same way it already declines a dump it cannot confidently refine rather
   than guessing through an ambiguous case.

   On extension or contradiction, skip step 5's shape decision for this dump and go to
   step 6's extend/new-draft handling instead.

   **When the answer is "unrelated", the search result is still worth keeping.** A
   coincidental term match is not, but a genuinely adjacent concept usually is — link to
   it from the body of the entry you write. Nothing else in the tooling creates links:
   `okfctl refs` verifies the ones that exist, and `okfctl status --orphan` will later
   count this entry as unreachable if nobody ever pointed at it. `okfctl related <id>` on
   a near-neighbour shows what the new entry should sit beside.

5. **Decide the shape, type, and title**

   The test: does this dump map to one drafts-area entry, several, or does it overlap
   another dump already in the inbox — and, once that's settled, what would a reader
   recognize this as in an index, filed where the bundle already files things like it?
   Read `refining-standard.md` (in this skill's own directory) for the full criteria:
   the one-to-one/split/consolidate shape decision, matching type and directory against
   the bundle's existing conventions, and what to do when a dump cannot be confidently
   refined at all.

   Refine has no provisional type — `--type` and `--title` are required in step 6, because
   assigning them for real is the whole point of this step.

6. **Preview, then write**

   **A fresh entry** (step 5's outcome, or step 4's "unrelated"):

   ```bash
   okfctl --bundle <root> refine <source...> \
     --type "<Type>" --title "<Title>" --by "<your producer id>" \
     --description "<one line: what this establishes>" --tags "<component>,<topic>" \
     --stdin --dry-run
   ```

   `--description` and `--tags` are optional to the CLI and expected here. They are what a
   reader sees in search results and in `index.md` without opening the file, and they carry
   the vocabulary a future search will actually use. Leaving them empty is the single
   easiest way to write an entry nobody finds — see `refining-standard.md`'s findability
   section.

   **An extension of an existing draft** (step 4 found a match that is itself still a
   draft): use `--extend` instead of `--type`/`--title`/a fresh id — it defaults both to
   the existing entry's current values, and updates that entry's file in place:

   ```bash
   okfctl --bundle <root> refine <new-source...> \
     --extend drafts/<existing-id> --by "<your producer id>" \
     --stdin --dry-run
   ```

   The body you supply with `--extend` **replaces the whole file's content** — read the
   existing draft first, and write the complete resulting body (prior content plus the new
   material), never just the new part. Never drop prior content or a prior citation; the
   dry-run preview shows the full resulting file specifically so you can check this before
   writing for real.

   **When you are only adding, pass `--append` and supply just the new material.** It keeps
   the existing body and adds to it, so prior content cannot be lost at all — which is the
   whole failure mode the paragraph above is guarding against by hand. Reach for a
   replacing `--extend` only when the existing text genuinely has to be rewritten, not
   merely added to. A replacing extend that ends up shorter than what was there is
   reported when it runs; that is information, not a refusal, and it is worth reading
   before accepting the result.

   **An extension of, or a contradiction with, a corpus concept**: a promoted concept is
   never edited in place. Run an ordinary (non-`--extend`) refine citing the corpus concept
   as one of the sources, alongside the new dump — this writes a new drafts-area entry
   carrying the corpus concept's content plus the new material, and leaves the corpus file
   untouched. A human reviews and promotes that new draft later, through `okf-review` and
   `okf-promote`, to actually supersede the original.

   **A contradiction, either way**: the body keeps *both* statements — the prior claim and
   the new one — each cited, explicitly marked as conflicting. Never decide which one is
   correct; that resolution belongs to a human, later, in `okf-review`.

   In gated mode, show the user the proposed type/title (or the extend target), body, and
   sources before running this for real — per-item, or as a batch if the user says so (same
   pattern `okf-promote` and `okf-deprecate` use). In automatic mode, run it directly and
   collect the batch for the closing report — except a step 4 match, which automatic mode
   also pauses on rather than guessing through.

   The actor is a provenance claim (SPEC §7): record yourself, the refiner, as
   `<producer>/<version>` — never a `human:` id, and never the original dump's producer.
   `okfctl refine` writes `generated.by` as you, and a `sources[]` entry per consumed dump
   citing its id and title; it does not copy the dump's own provenance forward; see the
   `add-refine-stage` design note if you need to know why.

   Write the body yourself. For a fresh entry, `refine`, like `capture`, moves bytes
   verbatim and invents no structure. For an extend or a corpus-citing new draft, you are
   composing the resulting body — a different, deliberate exception to that rule, bounded
   by the guardrails above. If the dump's findings came from a different agent, a different
   session, or a measurement you have not reproduced, say so plainly in the body: "restated
   from dumps/<id>," not phrased as your own first-hand finding.

7. **Decide whether to consume the source**

   `--consume` removes the dump(s) named in that invocation once the write succeeds. Default
   to *not* passing it until you are sure every part of a dump's content now has a home —
   for a split, that means every finding has been refined into its own entry, not just the
   first one. In gated mode, tell the user which sources you propose to consume and let them
   confirm before you pass the flag. In automatic mode, only consume once you have verified
   completeness yourself, and say so in the report.

   Leaving a fully-refined dump un-consumed is a minor untidiness, visible in the next
   `status` as a slightly stale-looking dumps inbox. Consuming a dump whose content is not
   fully distributed yet destroys part of it. When unsure, do not pass `--consume`.

   `--consume` only ever removes a *dumps-area* source — `okfctl refine` refuses it
   outright if a named source (a corpus concept cited alongside a new dump, say) is
   anywhere else. You never need to work around this; it is the CLI protecting a source
   that must not be deleted.

8. **Report**

   Gated mode: report as you go, one confirmed entry at a time, or a batch summary if that
   is how you asked for confirmation. Automatic mode: report the whole batch at the end —
   each entry written or extended, its type and title, which dump(s) it drew from, and
   whether the source was consumed — so the user can review in bulk from the report and
   `okfctl status`.

   Do not place any of these entries in the corpus and do not promote them. Refining answers
   "what is this," not "where does it belong" or "is it trusted" — those are `okf-review`
   and `okf-promote`.

**Guardrails**
- Never write or edit a frontmatter block by hand. `okfctl refine` creates it.
- Never invent an actor, a source, or claim a dump's findings as your own first-hand work.
- `--type` and `--title` are never left to a provisional default on a fresh entry — decide
  them for real, or leave the dump in the dumps area and say why you could not.
- Never write a fresh entry with no `--description` and no `--tags`. They are what makes it
  findable, and an entry nobody finds is not knowledge the bundle has. If the dump does not
  support a real one-line description, that is a reason to leave it unrefined, not a reason
  to write an empty field.
- Never invent an applicability boundary, a symptom string, or a caveat the dump does not
  establish. An invented boundary is worse than an absent one: the next reader will trust it.
- Never pass `--consume` before confirming every part of a dump's content has a drafts-area
  home. A partial split with `--consume` on an early call destroys the rest.
- Never relocate a refined entry into the corpus or promote it. That is `okf-review` and
  `okf-promote`, run separately, later.
- Never edit a corpus concept in place. An extension or contradiction found against one
  always produces a new drafts-area entry citing it — the corpus file is never the target
  of `--extend`.
- Never let `--extend`'s body drop content or a citation the existing entry already had.
  It replaces the whole file, so read the existing draft first and compose the complete
  resulting body — always preview with `--dry-run` before writing for real. When you are
  only adding, `--append` removes this risk entirely and is the right flag.
- Never resolve a contradiction yourself. Keep both statements, cited, explicitly flagged
  as conflicting, and leave the decision to a human in `okf-review`.
- In gated mode, do not write before the user has approved — per item or, if they say so,
  per batch. In automatic mode, still decline a dump you cannot confidently refine, and
  still pause on a step 4 match, rather than guessing through it.
- Bundle policy (`.okf/policy/`) can narrow or extend shape/type/field judgment; it can
  never license inventing an actor, skipping a citation, or claiming another producer's
  findings as your own.
