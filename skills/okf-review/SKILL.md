---
name: okf-review
description: Review stale, drifted, or unverified knowledge in an OKF bundle and record what the review found. Use when the user wants to review, re-verify, revalidate, or refresh knowledge, work through what has gone stale, check whether concepts are still accurate, or clear a bundle's review backlog.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Edit, Glob, Grep, WebFetch
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Work the review backlog: check knowledge against reality, and record what you found.

A review has two possible outcomes and they write different things. Recording the wrong
one is worse than recording nothing — `verified` drives the trust tier every downstream
reader relies on.

| Finding | Command | What it writes |
|---|---|---|
| Still accurate | `okfctl review <c> --confirm --by <actor> --stale-in <d>` | Appends `verified`, moves `stale_after`. Status untouched. |
| No longer accurate | `okfctl review <c> --outdated --by <actor> --reason "<why>"` | Sets `stale_after` to today. Writes **nothing** to `verified`. Status untouched. |
| Cannot tell | *nothing* | Report it. Neither outcome is honest. |

**Steps**

1. **Establish the bundle root** — as in `okf-triage`.

2. **Build the backlog**

   ```bash
   okfctl --bundle <root> status --stale --drifted --json
   ```

   Work from this list, not from a guess at what looks old. Take `drifted` first: the
   content changed after its last verification, so the concept is making a trust claim it
   has not earned. Then `stale`.

   If the backlog is large, propose an order and a batch size, and confirm before starting.

3. **For each concept, check it against something real**

   Read the document. Then check its claims against whatever the bundle says they rest on:

   - `sources[]` entries — follow the `resource` to the file, repo, or URL and read it.
   - Links in the body to other concepts, or out to the system being described.
   - The system itself, when the bundle describes something inspectable and you have the
     means to inspect it — a repo, a config file, a cluster.

   Concepts with no sources and nothing inspectable are the hard case. Say so rather than
   guessing; see step 5.

4. **Preview the batch, then write**

   Before the first write, show the user the whole list: each concept, the finding, the
   command that will record it, and the horizon for each confirmation. Confirm, then run
   them.

   `--by` is a claim about who did the reviewing (SPEC §7) and is required for
   `--confirm`. If you checked the sources yourself, the actor is the agent identity, not
   a `human:` id — `human:` raises the concept to the highest trust tier and must mean a
   person read it. Ask if you do not know which to use.

5. **Route on what you found**

   **Still accurate** — confirm, with a new horizon. Confirming without moving
   `stale_after` leaves the concept stale and it comes straight back in the next backlog.

   **No longer accurate** — record `--outdated` with a reason. This sets `stale_after` to
   today, so the concept reports stale from now, and deliberately writes nothing to
   `verified`: a review that found the concept wrong must not raise its trust tier.

   Then offer the next step, do not choose it:
   - *The knowledge changed* → rewrite the body, then `--confirm` the corrected version.
     Editing the body is allowed; editing the frontmatter block by hand is not.
   - *The knowledge is gone* → `okf-deprecate`.

   **Cannot tell** — record neither outcome. Report which concepts you could not verify and
   why: no sources, an unreachable source, a claim about a system you cannot inspect. An
   unverifiable concept is a real finding, and inventing a confirmation to close it out is
   the one failure this workflow exists to prevent.

6. **Report**

   Per concept: the finding, what you checked it against, and what was written. Then the
   backlog that remains, and the concepts nobody could verify.

7. **Emptying the drafts inbox**

   A concept in the drafts area is a different backlog. It is not stale or drifted — it was
   refined (by `okf-refine`) from a raw dump into a typed, titled entry, but never placed in
   the corpus. `okfctl status` reports it as an inbox rather than as attention;
   `okfctl status --drafts` lists it.

   Because `okf-refine` already assigned a real type and title before the entry reached
   `drafts/`, the common case here is narrow: **relocate** it into the corpus, or **merge**
   it into a concept that already exists. Show the user the draft and both options; you must
   not choose between them silently.

   **It is knowledge in its own right** → relocate it.

   ```bash
   okfctl move drafts/<id> <dir>/<id> --by human:<you> --reason "<why here>"
   ```

   `move` carries the inbound links, both indexes and the log with it. Relocation is **not**
   promotion: the concept is still a draft, and `okf-promote` is still the act that says
   someone vouched for it.

   **It belongs inside a concept that already exists** → merge it.

   Read both, fold the content into the existing concept by editing its body, and log the
   merge. Then remove the draft — confirm with the user before deleting, and show what was
   folded in.

   A merged draft is **removed, not deprecated**. Deprecation is for knowledge that was true
   and stopped being so; an entry folded into another document was never knowledge in its
   own right. Run `okfctl refs --broken` afterwards to catch anything that linked to it.

   **It still bundles more than one finding, or overlaps another draft** → split or
   consolidate, as `okf-refine` would. This is the exception, not the common path: splitting
   raw dumps and consolidating overlapping ones is `okf-refine`'s job, done before an entry
   ever reaches `drafts/`. Reach for it here only when refinement missed it.

   - *Split*: write each finding as its own concept with `okf-ingest`, cross-link them, and
     remove the draft only once every paragraph has a home. Check that literally: a split
     that quietly drops the third paragraph is the failure mode here, and nothing will
     report it.
   - *Consolidate*: fold overlapping drafts into one concept per question answered, not one
     concept per draft. Name which drafts went into which concept before deleting any of
     them.

   **Carry the provenance across**, whichever outcome you choose. `okf-refine` already
   recorded the original producer and `sources[]` on the draft; if relocating or merging
   requires re-authoring through `okfctl new`, that step records *you* as the producer and
   drops the original `generated.by`/`sources[]` unless you restate them. Name the original
   producer and its source in the body, and say plainly that the figures were restated
   rather than re-measured. A re-authored concept that reads as your own first-hand finding
   is a false provenance claim in the sense SPEC §7 cares about, even though every field
   validates.

   **Neither fits** — an unintelligible draft, or one whose accuracy you cannot establish —
   leave it where it is and say so. Filing material you cannot vouch for is worse than an
   inbox that is one item longer.

**Guardrails**
- Never `--confirm` a concept you have not actually checked against something. A
  verification entry is a durable claim that someone did.
- Never `--outdated` on suspicion. "Old" is not "wrong" — `stale_after` passing means it
  is due for review, which is what you are doing, not that the content is incorrect.
- Never edit frontmatter directly. Body prose only.
- Never invent the reviewing actor.
- Confirmation does not change `status`. If a draft should also become stable, that is
  `okf-promote` — say so rather than doing it silently.
- Preview the whole batch before the first write.
- Never delete a draft without showing what was folded in and confirming.
- Never deprecate a merged draft. Remove it — it was never knowledge in its own right.
- Never relocate a draft still carrying the provisional type. `okf-refine` should have
  settled it already; if one slipped through, settle the type first rather than relocating it as-is.
- Never delete a draft until every part of it has a home or an explicit decision to drop it.
- Never let a re-authored draft claim your provenance for another producer's findings.
- Relocation is not promotion. `move` leaves `status` and `verified` alone, and so do you.
