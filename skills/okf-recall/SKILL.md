---
name: okf-recall
description: Search an OKF bundle's knowledge base for what it already knows before starting non-trivial investigation, or when asked whether something has already been figured out. Use before debugging, researching, or answering a question a knowledge base might already settle — or when the user asks "have we seen this before" or "is this already documented."
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Search the registered knowledge base before investigating something from scratch, and
read what comes back with the right amount of confidence.

This is `okf-capture`'s counterpart — capture writes a session's knowledge in; recall
reads the bundle's knowledge out. Reach for it before non-trivial investigation that a
knowledge base might already answer, or when the user asks whether something is already
known. It never writes.

**Steps**

1. **Decide whether to search**

   The test: is what you're about to investigate the kind of thing a knowledge base would
   hold — a past decision, a root cause, a gotcha, a procedure, a measurement? If so,
   search before spending effort re-deriving it. Searching costs little; not searching
   before duplicating work costs more.

2. **Search**

   ```bash
   okfctl search "<query>"
   ```

   `okfctl` resolves the bundle the same way every other command does: an explicit
   `--bundle`, else the bundle you are standing in, else the registered one. If it fails
   naming `init --register`, there is no knowledge base configured — report that and
   proceed with the investigation normally, since there is nothing to search.

   Try more than one query if the first turns up nothing — a different phrasing, a
   component name instead of a symptom, or vice versa.

3. **Read each result's area and trust tier before acting on it**

   Every hit carries an area (`dumps`, `drafts`, or `corpus`) and a trust tier
   (`unverified`, `machine-confirmed`, `human-reviewed`). They are not interchangeable:

   - **`corpus` + `status: stable` + `trust: human-reviewed`** is citable as established
     fact. Reference it directly.
   - **Anything in `dumps` or `drafts`, or `corpus` at `unverified`/`draft`** is a lead,
     not a fact. It is worth reading and worth following up on, but present it as
     unverified if you surface it to the user or act on it — "the bundle has an unreviewed
     note suggesting X" is honest; treating it as settled is not.

   This mirrors why `okf-refine` never claims a dump's findings as its own first-hand
   work (SPEC §7 provenance): reading someone else's unverified claim and repeating it as
   fact would misrepresent how sure the bundle actually is.

4. **Act on what you found — or say nothing turned up**

   If a result answers the question, use it and say where it came from. If nothing
   relevant turns up, say so in one line and proceed with the investigation normally —
   an empty search is not a problem to report at length, just a fact to note in passing.

**Guardrails**
- Recall never writes. If a search turns up a gap worth filling, that is a separate act —
  `okf-capture`, `okf-refine`, or `okf-ingest`, run explicitly, not automatically from here.
- Never present an unreviewed or unverified result with the same confidence as a
  human-reviewed, stable one.
- `.okf/policy/` is not read by this workflow — none of the three policy files scope how
  search results should be interpreted; that judgment is generic to OKF's trust-tier
  model, not a bundle-specific convention.
