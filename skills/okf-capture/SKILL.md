---
name: okf-capture
description: Capture knowledge established in a live session into an OKF bundle's dumps area as raw, unreviewed material. Use when a session produces a decision, a finding, a constraint, or an explanation worth keeping and its final placement is not yet decided — or when a capture hook asks whether the turn produced anything durable.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Summarize what this session established and write it into the dumps area.

This is the low-ceremony end of the lifecycle. `okf-refine` turns a dump into a typed,
titled entry once someone works the inbox; `okf-ingest` is for knowledge whose type and
placement you already know. This skill is for knowledge you have and cannot yet file.

**Steps**

1. **Decide whether there is anything to capture**

   Durable knowledge outlives the session because the next reader cannot re-derive it from
   the repository, the ticket, or common sense. Ask, for each candidate: if an agent picked
   up this bundle cold in a week, would they need to be told this, and could they not get it
   any other way? Concretely:

   - **A decision and why**, when "why" required weighing options a reader would otherwise
     re-litigate — not "we chose Postgres" but the constraint that ruled out the alternative.
   - **A root cause**, when finding it took real investigation — the actual mechanism, named
     precisely (the component, the exact condition, the version), not "there was a bug".
   - **A non-obvious constraint or gotcha**, especially one that looks like it should work
     and does not — an API contract that is narrower than it appears, an ordering requirement,
     a flag that silently changes behavior elsewhere.
   - **A correction to a standing belief**, when something the team or the docs assumed
     turns out to be false, and someone will act on the old belief again if it is not written
     down.
   - **A measurement**, when it took work to produce and would take the same work to
     reproduce — a benchmark, an audit count, a reduction percentage — recorded with its
     exact conditions (the window, the version, the environment), not just the headline number.
   - **A reusable procedure**, when a sequence of steps was worked out under real constraints
     (ordering, rollback points, what to verify before proceeding) and getting it wrong is
     costly enough that the next person should follow the worked-out order rather than
     reinvent it.
   - **A negative result**, when an approach was tried and specifically ruled out — this
     saves the next session from repeating the same dead end, and is easy to skip because it
     feels like "nothing happened."
   - **A mistake caused by this local setup or this org's own conventions**, when a
     technology behaved correctly but a *company-specific* or *this-machine-specific*
     condition made the obvious approach fail — a proxy, an internal registry mirror, a
     pinned internal fork, a naming or folder convention this repo enforces that upstream
     docs know nothing about, a permission or network policy unique to this environment.
     This is the highest-value category precisely because it is invisible to generic
     documentation, generic training data, and the technology's own docs — nothing outside
     this bundle will ever record it, so if it is not captured here it will be rediscovered
     the same expensive way every time. Name the generic symptom (what upstream docs would
     lead you to expect) and the local cause that actually explains it, not just "it didn't
     work."

   Not durable: what you did, which files you edited, what the user asked for, or anything
   the repository already records at a glance. A restatement of code is not knowledge about
   it — knowledge is the part that is not visible by reading the code. This cuts hardest
   against generic technology facts: a library's public API contract, a language's own
   semantics, a framework default documented in its own README, an error message that is
   the technology working as designed — an agent reading the code, the dependency, or the
   upstream docs gets these back for free, at no cost, whenever it needs them, so capturing
   them is pure inbox noise, never a shortcut. The bar is not "is this true and useful" —
   it is "is this bundle the only place this fact exists."

   **If nothing qualifies, write nothing and say so in one line.** Declining is the right
   answer more often than not. An inbox of noise is worse than an empty one, and every
   dump someone has to read and discard is a cost paid by a person.

2. **Establish the target bundle**

   `okfctl` resolves it: an explicit `--bundle`, else the bundle you are standing in, else
   the registered one. Run `okfctl status` to see which you got. If it fails naming
   `init --register`, there is no knowledge base configured — report that rather than
   creating one.

3. **Write the summary, not the transcript**

   A reader who was not in the session must be able to act on it without asking a follow-up
   question or re-deriving anything you already worked out. State what is true and why it
   is true; leave out the conversation that got there — not the back-and-forth, not what was
   tried before the working answer, not the tool calls.

   Be specific rather than general. Name the exact component, version, file, flag, error
   message, or command involved — "the CSI driver" is weaker than "truenas-csi-iscsi v1.0.2";
   "the audit volume dropped a lot" is weaker than "120,116 records fell to 11,849 over
   matched 10-minute windows." A future session cannot act on a vague claim, only verify or
   apply a precise one. Where the finding rests on something checkable — a command, a query,
   a log window, a file — name it exactly enough that someone could rerun it.

   Include the scope and the caveats, not just the headline: what was and was not verified,
   what remains unexplained, what would break this conclusion if it changed (a version
   bump, a config default, an environment difference). A summary that omits its own limits
   reads as more certain than it is, and the next reader inherits that false confidence.

   Length follows completeness, not the reverse — do not pad, but do not trim a caveat or a
   concrete number to hit a target length. A dump nobody can read is not knowledge, and
   neither is one that reads clean but leaves out the detail the next session needed.

4. **Capture it**

   ```bash
   okfctl capture --title "<what was established>" --by "<your producer id>" \
     --session "<your session id>" --stdin
   ```

   The actor is a provenance claim (SPEC §7). Record yourself — the agent that wrote the
   summary — as `<producer>/<version>`. Never a `human:` id: the human said the thing, but
   you wrote the summary, and `human:` is what raises a concept to the highest trust tier.

   Pass `--session` when your host reports a session id. It groups a conversation's captures
   under one filename prefix and is recorded as provenance, so "which session produced this"
   stays answerable after a human renames the concept and files it. Omit it when you do not
   know it — the id then says `adhoc`, which is honest. Never pass something else in its
   place.

   **Do not pass `--id`.** The id is generated as `<date>-<session>-<n>`, and that is the
   expected case: it cannot collide, so a second capture never destroys the first, and the
   title is what carries meaning until a human files the concept under a real name. Reach
   for `--id` only when the user has told you what to call it.

   Leave `--type` alone unless you are certain. The provisional type is honest about what
   it is, and the dumps area exists precisely so a human (or `okf-refine`) decides type and
   placement later. Use `--to` only when placement is genuinely already settled — at which
   point `okf-ingest` is the better workflow.

   `--dry-run` shows the resolved path and frontmatter first.

5. **Report**

   Name the concept id and its title, and say it is a draft awaiting review. The id is
   generated, so the title is the part a reader recognizes. Do not promote it, do not
   move it into the corpus, and do not regenerate the catalog to make it look filed.

**Guardrails**
- Never write or edit a frontmatter block by hand. `okfctl capture` creates it.
- Never record a human as the producer of a summary you wrote (SPEC §7).
- Never invent a source, and never invent a session id. Absent is honest; a fabricated
  identifier in a field other tools read is a false claim.
- Never promote, move, or merge what you just captured. Review is a separate act by a
  person — `okf-review`.
- Write nothing rather than something you are not confident is true. A wrong concept in a
  bundle is worse than an absent one, because someone will act on it.
