---
name: okf-deprecate
description: Retire a concept in an OKF bundle, marking it deprecated. Use when the user wants to deprecate, retire, sunset, archive, or supersede knowledge — a decision that has been reversed, a runbook for a system that is gone, a metric nobody computes any more.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Retire a concept, and deal with what was pointing at it.

Deprecation in OKF does not delete. The document stays, readable, with `status:
deprecated` — history that explains why the current state is what it is. `okfctl index`
omits deprecated concepts from the index by default, so retiring a concept removes it from
the reader's path without removing it from the record.

**Steps**

1. **Establish the bundle root** — as in `okf-triage`.

2. **Resolve the concept and confirm the target**

   Resolve as in `okf-promote`; ask when the reference is ambiguous. Read the document, and
   state plainly what is being retired before retiring it.

3. **Establish why**

   ```bash
   okfctl --bundle <root> deprecate <concept> --by "<actor>" --reason "<why>" --dry-run
   ```

   The reason goes into the log and is the only durable record of *why* this knowledge was
   retired. A deprecation with no reason is a dead end for the next reader. Ask for one if
   the user has not given it.

   If the knowledge was replaced rather than abandoned, name the replacement in the reason:
   "superseded by decisions/envoy-gateway". OKF v0.2 has no frontmatter field for
   supersession, so the log entry and a link in the body are where that lives.

4. **Deprecate**

   Re-run without `--dry-run`.

5. **Find what still points at it** — this is the part a hand edit forgets

   ```bash
   okfctl --bundle <root> refs
   grep -rn "<concept-id>" <root> --include=*.md
   ```

   Links to a deprecated concept still *resolve* — the file is still there — so `refs`
   will not flag them. Read the results yourself and report every live concept still
   pointing at retired knowledge. Each is a reader who will be sent somewhere wrong.

   Offer to update them; if there is a replacement, that is usually a small edit to the
   body of each referring document. Do not make those edits without asking.

6. **Refresh the index**

   ```bash
   okfctl --bundle <root> index
   ```

   Report the deprecation, the reason recorded, and the list of concepts still referring
   to it.

**Guardrails**
- Never delete a concept file. Deprecation is a status change; deletion destroys the
  record of why the current state is what it is. If the user asks for deletion, say what
  deprecation preserves and let them choose.
- Never edit frontmatter directly.
- Never invent a reason or a replacement.
- If the command refuses because the concept is already deprecated, report that rather
  than reaching for `--force`.
- Deprecating a batch: preview every target and confirm before the first write.
