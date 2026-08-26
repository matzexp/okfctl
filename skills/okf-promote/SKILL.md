---
name: okf-promote
description: Move a concept in an OKF bundle from draft to stable, recording who verified it. Use when the user wants to mark knowledge as stable, promote a draft, sign off on a concept, approve or bless it, or say that something is now trusted and settled.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Promote a concept to `status: stable`, recording the verification that earns it.

Promotion makes two claims at once: someone checked this, and it is now settled. Both have
to be true.

**Steps**

1. **Establish the bundle root** — as in `okf-triage`.

2. **Resolve the concept**

   ```bash
   okfctl --bundle <root> status --json
   ```

   A partial reference resolves when it is unambiguous. If the user's reference matches
   more than one concept, or none, list the candidates and ask — never pick one.

3. **Read it before promoting it**

   Read the document. Promotion asserts the content is correct; asserting that about a
   document you have not read is exactly the kind of hollow verification the trust tier
   exists to prevent.

   If the concept is `drifted` — content changed after its last verification — say so.
   That is the case promotion is most needed for and most likely to be wrong about.

4. **Establish the verifying actor**

   `--by` is required and is a claim about who did the verifying (SPEC §7):
   `human:<id>` for a person, `process:<id>` for an automation,
   `<producer>/<version>` for a tool.

   Ask if you do not know it. Do not use `human:` for yourself and do not reach for a
   plausible-looking process name — the trust tier is only worth reading if the actor is
   real. Note that a `human:` actor raises the concept to `human-reviewed`, the highest
   tier (SPEC §5.3); claim it only when a human actually reviewed the content.

5. **Set a freshness horizon**

   ```bash
   okfctl --bundle <root> promote <concept> --by "<actor>" --stale-in 90d --dry-run
   ```

   Knowledge that never goes stale is knowledge nobody rechecks. Suggest a horizon
   proportional to how fast the subject moves — a quarter for operational detail, a year
   for a settled architectural decision — and let the user set it. Accepts `d`, `w`, `m`,
   `y`, or `--stale-after <YYYY-MM-DD>`.

   Omitting it is legal and sometimes right; say so rather than inventing a date.

6. **Promote**

   Re-run without `--dry-run`. The command appends the `verified` entry, sets `status`,
   sets the horizon, and logs it.

   If it refuses because of conformance errors, that is the gate working. Fix the errors
   and re-run. Do not reach for `--force` — it exists for a maintainer who knows why the
   errors are acceptable, not for an agent clearing an obstacle.

7. **Refresh the index**

   ```bash
   okfctl --bundle <root> index
   ```

   Then report: the concept, its new status and trust tier, the horizon, and the log entry.

**Batching**

`promote` takes several concepts at once, so a confirmed batch sharing one actor and one
horizon is a single call:

```bash
okfctl --bundle <root> promote <a> <b> <c> --by human:<you> --stale-in 90d
```

Every concept still has to be read first, and the batch still has to be previewed and
confirmed before the first write — batching is how the writes are issued, never a reason
to promote something you have not read.

**Guardrails**
- Never edit frontmatter directly. `okfctl promote` writes `verified`, `status`, and
  `stale_after` together, with actor validation and a log entry.
- Never invent the actor. Ask.
- Do not use `--force` without the user explicitly asking, and say what it is bypassing.
- Read the concept before asserting it is correct.
- If the user wants to record "I checked it, it is still right" **without** changing
  status, that is `okf-review --confirm`, not promotion.
- Promoting more than one concept at once: preview all of them and confirm before the
  first write.
