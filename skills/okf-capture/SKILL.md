---
name: okf-capture
description: Capture knowledge established in a live session into an OKF bundle's drafts area as raw, unreviewed material. Use when a session produces a decision, a finding, a constraint, or an explanation worth keeping and its final placement is not yet decided — or when a capture hook asks whether the turn produced anything durable.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Summarize what this session established and write it into the drafts area.

This is the low-ceremony end of the lifecycle. `okf-ingest` is for knowledge whose type and
placement you already know; this is for knowledge you have and cannot yet file.

**Steps**

1. **Decide whether there is anything to capture**

   Durable knowledge outlives the session: a decision and the reasoning behind it, an
   incident and its cause, a constraint that was not obvious, a correction to something the
   team believed, a measurement nobody will repeat.

   Not durable: what you did, which files you edited, what the user asked for, or anything
   the repository already records. A restatement of code is not knowledge about it.

   **If nothing qualifies, write nothing and say so in one line.** Declining is the right
   answer more often than not. An inbox of noise is worse than an empty one, and every
   dump someone has to read and discard is a cost paid by a person.

2. **Establish the target bundle**

   `okfctl` resolves it: an explicit `--bundle`, else the bundle you are standing in, else
   the registered one. Run `okfctl status` to see which you got. If it fails naming
   `init --register`, there is no knowledge base configured — report that rather than
   creating one.

3. **Write the summary, not the transcript**

   A reader who was not in the session must be able to act on it. State what is true and
   why it is true; leave out the conversation that got there. If the finding rests on
   something checkable, name it.

   Two or three paragraphs is usually right. A dump nobody can read is not knowledge.

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
   it is, and the drafts area exists precisely so a human decides type and placement later.
   Use `--to` only when placement is genuinely already settled — at which point `okf-ingest`
   is the better workflow.

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
