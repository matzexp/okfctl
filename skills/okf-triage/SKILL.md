---
name: okf-triage
description: Report the health of an OKF knowledge bundle and say what to do about it. Use when the user asks how a bundle is doing, what needs attention, what is stale or drifted or unverified, whether the knowledge is still trustworthy, or asks for a knowledge audit — and whenever a concept is named but the right lifecycle action is not yet clear. Read-only.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read
license: MIT
compatibility: Requires the okfctl CLI (`npm i -g okfctl`, or run it from a checkout with `node --experimental-strip-types src/cli.ts`).
metadata:
  author: okfctl
  version: "1.0"
---

Report on an OKF bundle's health and name the workflow each finding calls for.

**This workflow does not write.** It reads the bundle and recommends. Every change belongs
to one of the writing workflows, and the user chooses whether to run them.

**Steps**

1. **Establish the bundle root**

   `okfctl` defaults `--bundle` to `.`, which is right for a maintainer standing in the
   bundle and wrong for an agent standing in a repo that contains one. Find the root before
   running anything: it is the directory holding the bundle's top-level `index.md`, usually
   named for the corpus (`homelab/`, `finance/`) or given by the user.

   If more than one candidate exists, ask which. Then pass `--bundle <root>` on every
   command below, and say which root you used.

2. **Read the health report**

   ```bash
   okfctl --bundle <root> status --json
   ```

   The JSON carries, per concept: `status` (draft/stable/deprecated), `tier` (unverified /
   machine-confirmed / human-reviewed), `stale`, `drifted`, and `staleAfter`. The four
   signals are independent — a stable, human-reviewed concept can be both stale and
   drifted.

3. **Read conformance and reference integrity**

   ```bash
   okfctl --bundle <root> check
   okfctl --bundle <root> refs --broken
   ```

   Keep the two tiers apart when you report. **Errors** are the three conformance rules of
   SPEC §11 and are the only findings that make a bundle non-conformant. **Warnings** are
   advisory conventions — a missing `description`, an unjoined footnote, an unresolved
   link. A bundle with fifty warnings and zero errors is a conformant bundle. Never
   describe warnings as failures.

4. **Report, grouped by the action each group needs**

   Lead with the counts, then the groups that need something:

   | Finding | What it means | Workflow |
   |---|---|---|
   | `drifted` | Content changed after its last verification, so the trust tier is no longer earned | `okf-review` — first, it is the strongest signal |
   | `stale` | `today >= stale_after` (SPEC §5.5) | `okf-review` |
   | `draft` + settled in practice | Never promoted, though the knowledge is relied on | `okf-promote` |
   | `unverified` | No `verified` entry at all, so no trust tier | `okf-review --confirm`, or `okf-promote` if it should also become stable |
   | dumps inbox growing | Raw captures arriving faster than anyone refines them | `okf-refine` — an inbox nobody empties launders "we wrote it down" into "we know it" |
   | drafts inbox growing | Refined entries arriving faster than anyone places them | `okf-review` — same failure mode, one stage later |
   | conformance **errors** | Unparseable frontmatter, or a missing `type` | Fix the file directly; nothing else can run cleanly until then |
   | broken refs | A footnote or link that no longer resolves | Fix the file directly |
   | `deprecated` but still linked | Live concepts pointing at retired knowledge | Rewrite the referring concepts |
   | `orphans` | Placed concepts nothing in the bundle links to: findable by search, outside the structure a reader navigates by | `okfctl status --orphan` to list them; `okfctl related <id>` to find where each should attach. Not urgent, and never reported as rot |
   | an inbox entry `over 30d` | Sitting long enough that nobody is going to refine it in the normal course | Decide rather than let it age: refine it, or drop it. `okfctl status` names the count on the inbox line |

   Report the **reach** line too, when the bundle has placed concepts: how many are
   orphans. It is a count, not an alarm — an orphan is not rotting — but a corpus where
   most concepts are orphans is one that is searchable and not navigable, and that is
   worth naming once rather than never.

   Report both inboxes as their own lines: how many entries the dumps area and the drafts
   area each hold, and the age of the oldest in each. `okfctl status` prints both,
   independently — never merge them into one figure, since they are different backlogs. An
   inbox with entries older than the bundle's other attention items is a finding in its own
   right — name it and point at `okf-refine` for the dumps inbox, `okf-review` for the
   drafts inbox.

   Name concepts by id. Give counts, not a wall of rows — if a group has more than about
   ten members, say how many and list the ones that matter.

5. **Check the derived files, if the bundle keeps them**

   `index.md` and `catalog.md` are generated from frontmatter, so they drift whenever
   concepts change and nobody regenerates them:

   ```bash
   okfctl --bundle <root> index --check
   okfctl --bundle <root> catalog --check   # only if the bundle keeps a catalog.md
   ```

   Drift here is not a defect in the knowledge — it is a derived file that is out of date,
   fixed by `okfctl index` / `okfctl catalog --write`. Report it as housekeeping, and say
   which command fixes it. Do not run either from this workflow; both write.

6. **Recommend an order, and stop**

   Suggest one or two next actions with the command or workflow that performs them. Do not
   run them. If the user says "go ahead", hand off to the named workflow.

**Guardrails**
- Read-only. This workflow never writes to a concept, a `log.md`, or an `index.md`.
- Report both inboxes even when one is the only thing to say. A backlog nobody can see is a
  backlog nobody works.
- Never call a warning an error, or a conformant bundle broken.
- Never assert a concept is accurate or inaccurate — this workflow reads frontmatter, not
  content. Judging accuracy is `okf-review`'s job.
- Never report orphans as a defect. Nothing links to them yet; that is a gap in the link
  structure, not a claim that the knowledge is wrong or stale.
- Report what `okfctl` reports. Do not compute freshness or trust by reading frontmatter
  yourself; the derived signals have precise definitions and the CLI is where they live.
