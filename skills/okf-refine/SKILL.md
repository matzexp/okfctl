---
name: okf-refine
description: Turn raw dumps in an OKF bundle's dumps area into typed, titled entries in the drafts area. Use when the user wants to refine, clean up, tidy, or process the dumps inbox, turn raw captures into proper entries, or asks what is sitting unrefined and needs shaping before review.
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

2. **Read the dumps inbox**

   ```bash
   okfctl --bundle <root> status --dumps --json
   ```

   Work from this list, not from a guess at what looks stale. Read each dump's body along
   with its frontmatter — the title on a capture is a one-line summary, not necessarily the
   shape the refined entry should take.

3. **Decide the shape: one-to-one, split, or consolidate**

   Read each dump and ask what it actually contains:

   - **One clear finding** → refine it into exactly one drafts-area entry.
   - **Several distinct findings sharing one dump** (a session's end-of-turn capture often
     does this) → refine it into one entry per finding. Check that literally: a split that
     quietly drops the third paragraph is the failure mode here, and nothing will report it.
   - **Several dumps that substantially overlap** → refine them together into one entry,
     citing all of them. Do not create near-duplicate entries that will just have to be
     merged again in review.

   When in doubt, prefer more, smaller entries over one that bundles unrelated things — a
   `okf-review` split later has to redo this judgment with less context than you have now.

4. **Decide type and title — against the bundle, not from habit**

   Same discipline as `okf-ingest`: read what the bundle's existing types and directories
   are before choosing (`okfctl status --json`), and match them. Refine has no provisional
   type — `--type` and `--title` are required, because assigning them for real is the whole
   point of this step. A vague or restated capture title ("test finding", "gateway thing")
   is not a title; write one a reader would recognize in an index.

5. **Preview, then write**

   ```bash
   okfctl --bundle <root> refine <source...> \
     --type "<Type>" --title "<Title>" --by "<your producer id>" \
     --stdin --dry-run
   ```

   In gated mode, show the user the proposed type, title, body, and sources before running
   this for real — per-item, or as a batch if the user says so (same pattern `okf-promote`
   and `okf-deprecate` use). In automatic mode, run it directly and collect the batch for
   the closing report.

   The actor is a provenance claim (SPEC §7): record yourself, the refiner, as
   `<producer>/<version>` — never a `human:` id, and never the original dump's producer.
   `okfctl refine` writes `generated.by` as you, and a `sources[]` entry per consumed dump
   citing its id and title; it does not copy the dump's own provenance forward; see the
   `add-refine-stage` design note if you need to know why.

   Write the body yourself — `refine`, like `capture`, moves bytes verbatim and invents no
   structure. If the dump's findings came from a different agent, a different session, or a
   measurement you have not reproduced, say so plainly in the body: "restated from
   dumps/<id>," not phrased as your own first-hand finding.

6. **Decide whether to consume the source**

   `--consume` removes the dump(s) named in that invocation once the write succeeds. Default
   to *not* passing it until you are sure every part of a dump's content now has a home —
   for a split, that means every finding has been refined into its own entry, not just the
   first one. In gated mode, tell the user which sources you propose to consume and let them
   confirm before you pass the flag. In automatic mode, only consume once you have verified
   completeness yourself, and say so in the report.

   Leaving a fully-refined dump un-consumed is a minor untidiness, visible in the next
   `status` as a slightly stale-looking dumps inbox. Consuming a dump whose content is not
   fully distributed yet destroys part of it. When unsure, do not pass `--consume`.

7. **Report**

   Gated mode: report as you go, one confirmed entry at a time, or a batch summary if that
   is how you asked for confirmation. Automatic mode: report the whole batch at the end —
   each entry written, its type and title, which dump(s) it drew from, and whether the
   source was consumed — so the user can review in bulk from the report and `okfctl status`.

   Do not place any of these entries in the corpus and do not promote them. Refining answers
   "what is this," not "where does it belong" or "is it trusted" — those are `okf-review`
   and `okf-promote`.

**Guardrails**
- Never write or edit a frontmatter block by hand. `okfctl refine` creates it.
- Never invent an actor, a source, or claim a dump's findings as your own first-hand work.
- `--type` and `--title` are never left to a provisional default — decide them for real, or
  leave the dump in the dumps area and say why you could not.
- Never pass `--consume` before confirming every part of a dump's content has a drafts-area
  home. A partial split with `--consume` on an early call destroys the rest.
- Never relocate a refined entry into the corpus or promote it. That is `okf-review` and
  `okf-promote`, run separately, later.
- In gated mode, do not write before the user has approved — per item or, if they say so,
  per batch. In automatic mode, still decline a dump you cannot confidently refine rather
  than filing a guess.
