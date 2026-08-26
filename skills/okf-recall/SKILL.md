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

   **If a search returns nothing, or nothing that looks like an answer, retry it loosely
   before concluding the bundle is silent:**

   ```bash
   okfctl search "<query>" --match any
   ```

   The default is a lookup: it wants documents carrying *every* term, and falls back to the
   best partial overlap. That is right when you know the bundle's words for something and
   wrong when you do not — and not knowing them is the usual reason to be searching. A
   question phrased the way you would ask a colleague ("why does authentik go down during a
   database failover") can miss the entry that answers it, because the entry is titled in
   the vocabulary of the system ("CNPG primary restart briefly interrupts Authentik").
   `--match any` ranks by overlap instead of requiring it, which is what finds that entry.

   Search is lexical, not semantic: nothing here matches on meaning. So a miss is weak
   evidence of absence, and two phrasings plus `--match any` is the cheapest way to make it
   stronger before you spend real effort re-deriving something.

   Useful narrowing, once a first search shows what is there:

   ```bash
   okfctl search "<query>" --snippet             # why each result matched, without opening it
   okfctl search "<query>" --area corpus         # skip the unreviewed holding areas
   okfctl search "<query>" --tier human-reviewed # only what a person signed
   okfctl search "<query>" --type Runbook --tag networking
   ```

   `--snippet` is worth reaching for by default: it prints the matching line under each
   result, so triage costs one search instead of one search plus a read of every candidate.

3. **Follow the links out of a good hit**

   ```bash
   okfctl related <concept>
   ```

   A single relevant concept is usually the doorway to the two or three that complete the
   picture — what it links to, what links back, what shares its tags. Search finds a
   document; `related` finds the neighbourhood, which is where the rest of the answer
   usually is. Skip this when the first hit fully settles the question.

4. **Read each result's area and trust tier before acting on it**

   Every hit carries an area (`dumps`, `drafts`, or `corpus`) and a trust tier
   (`unverified`, `machine-confirmed`, `human-reviewed`). They are not interchangeable:

   - **`corpus` + `status: stable` + `trust: human-reviewed`** is citable as established
     fact. Reference it directly.
   - **`corpus` + `machine-confirmed`** is usable, with the verifier named. An agent ran
     `okfctl review --confirm` against this concept's `sources[]` and found it still
     accurate — a real check, recorded, just not one a person signed. Use it, and say
     where the confidence comes from: "verified by `<actor>` against `<source>` on
     `<date>`, not human-reviewed." Do not silently round it up to established fact, and
     do not round it down to a lead either — an agent's recorded verification is the one
     form of checking that keeps pace with how fast knowledge arrives, and treating it as
     worthless is what leaves a bundle with nothing citable in it.
   - **Anything in `dumps` or `drafts`, or `corpus` at `unverified`/`draft`** is a lead,
     not a fact. It is worth reading and worth following up on, but present it as
     unverified if you surface it to the user or act on it — "the bundle has an unreviewed
     note suggesting X" is honest; treating it as settled is not.

   Read `okfctl search --format json` when you need these fields exactly; the table output
   carries the same two in brackets after each result.

   This mirrors why `okf-refine` never claims a dump's findings as its own first-hand
   work (SPEC §7 provenance): reading someone else's unverified claim and repeating it as
   fact would misrepresent how sure the bundle actually is.

5. **Act on what you found — or say nothing turned up**

   If a result answers the question, use it and say where it came from. If nothing
   relevant turns up, say so in one line and proceed with the investigation normally —
   an empty search is not a problem to report at length, just a fact to note in passing.
   Say which phrasings you tried, and whether `--match any` was among them: "nothing on
   that" is worth more to the user when it names what was actually asked.

**Guardrails**
- Recall never writes. If a search turns up a gap worth filling, that is a separate act —
  `okf-capture`, `okf-refine`, or `okf-ingest`, run explicitly, not automatically from here.
- Never present an unreviewed or unverified result with the same confidence as a
  human-reviewed, stable one. `machine-confirmed` sits between the two and is reported as
  what it is: checked by an agent against its sources, on a date, not signed by a person.
- `.okf/policy/` is not read by this workflow — none of the three policy files scope how
  search results should be interpreted; that judgment is generic to OKF's trust-tier
  model, not a bundle-specific convention.
