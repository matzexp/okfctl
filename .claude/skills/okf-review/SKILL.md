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
