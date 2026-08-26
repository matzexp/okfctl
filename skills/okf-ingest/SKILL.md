---
name: okf-ingest
description: Add new knowledge to an OKF bundle as a properly formed concept document. Use when the user wants to capture, record, write down, document, or ingest something into a knowledge bundle — a decision, an incident, a runbook, a metric definition, a finding worth keeping — or asks to create a new concept, note, or entry in a bundle.
allowed-tools: Bash(okfctl:*), Bash(okf:*), Read, Write, Edit, Glob, Grep
license: MIT
compatibility: Requires the okfctl CLI.
metadata:
  author: okfctl
  version: "1.0"
---

Capture knowledge into an OKF bundle as a conformant concept.

Frontmatter is created by `okfctl new`, never by hand. The body is yours to write.

**Which of the three writing workflows this is.** All three end at a concept file, and the
difference is what is already decided when you start:

| | Type and placement | Trust | Use |
|---|---|---|---|
| `okf-capture` | undecided | unearned | A session produced something; nobody has filed it. Lands in `dumps/`. |
| `okf-refine` | being decided now, *from an existing dump* | unearned | Working the dumps inbox. Lands in `drafts/`, citing what it drew from. |
| `okf-ingest` | already known | unearned | Knowledge arriving with its home obvious. Lands in the corpus directly. |

If the knowledge came from a dump, use `okf-refine` — it records the citation that keeps
the provenance honest, which writing the same content through `new` would silently drop.
Reach for `okf-ingest` when there is no dump to draw from and you already know the type
and the directory. When in doubt between them, refine: an unnecessary citation costs
nothing, and a missing one is a false first-hand claim (SPEC §7).

**Steps**

1. **Establish the bundle root**

   As in `okf-triage`: find the directory holding the bundle's top-level `index.md`, ask
   when it is ambiguous, and pass `--bundle <root>` on every command.

2. **Decide placement and type — against the bundle, not from habit**

   Check for `.okf/policy/field-policy.md` first. A bundle that has already agreed on
   per-type conventions records them there — match what it says before falling back to
   inferring from the corpus below.

   OKF's `type` vocabulary is open (SPEC §4.1) and each bundle settles into its own. Read
   what this one uses before choosing:

   ```bash
   okfctl --bundle <root> status --json
   ```

   The `type` field of each concept, and the directory each sits in, are the convention.
   A bundle with `decisions/`, `incidents/`, `operations/` and types `Decision`,
   `Incident`, `Runbook` tells you where a new decision goes and what to call it. Match it.
   Inventing `Architectural Decision Record` beside eleven documents typed `Decision`
   fragments the corpus for no gain.

   Some bundles state their placement rule in a root guide or `README`. Read it if present
   and follow it.

   A bundle with no corpus is the exception: `dumps/` and `drafts/` and nothing else means
   there is no convention to match, and the first concept filed invents one. Do not invent
   it silently. Propose a layout, ask, and then record the agreed answer in
   `.okf/policy/field-policy.md` — not as a corpus concept. The answer describes how this
   bundle organizes itself, not something true about the world the bundle describes, so it
   belongs in policy, which the next `okf-ingest` run already checks first. Sorting by
   subject domain and sorting by concept type are both coherent; a bundle that does half of
   each is not, and nothing in the tooling will report the split.

   Derive the id from the title in the bundle's existing style — usually kebab-case, no
   date prefix unless the directory already uses one (incident logs often do).

3. **Carry the searchable surface**

   A concept is only reusable if the next session finds it, and it will be searching with
   the words it has then — an error string, a symptom, a component name — not the words
   you have now. So `--description` and `--tags` are not optional decoration: they are what
   a reader sees in `okfctl search` and `index.md` without opening the file, and they are
   weighted heavily in ranking. Match tags the bundle already uses rather than inventing
   near-synonyms. Where the knowledge has a literal symptom — an exact error message, an
   exit code, a failing command — quote it in the body rather than paraphrasing it.

   `okf-refine`'s `refining-standard.md` states the full criteria; they apply here too,
   with the difference that ingest already knows the type and placement.

4. **Preview before writing**

   ```bash
   okfctl --bundle <root> new <dir>/<id> --type "<Type>" \
     --title "<Title>" --description "<one line>" --tags "<a,b>" \
     --by "<actor>" --dry-run
   ```

   Show the user the resolved path and the frontmatter. `new` creates intermediate
   directories, so a typo'd path silently becomes a new directory — the preview is what
   catches that.

   The actor is a provenance claim (SPEC §7): `human:<id>` when a person is the source,
   `<producer>/<version>` when a tool generated it, `process:<id>` for an automation.
   Never invent one — ask if you do not know it.

5. **Create it**

   Re-run without `--dry-run`. The document is written as `status: draft` with a `generated`
   entry, and the creation is logged to the nearest `log.md` (SPEC §9).

   New knowledge is a draft. It has not been verified by anyone yet, and saying otherwise
   in frontmatter is a false claim. Promotion is a separate, deliberate act — `okf-promote`.

6. **Write the body**

   Edit the file directly for prose. This is the one thing the CLI does not do, and the
   only edit any workflow makes to a concept file by hand. Leave the frontmatter block
   exactly as `new` wrote it.

   Write what the reader needs and no more. Follow the shape of neighbouring documents of
   the same type — if every decision in `decisions/` opens with a `# Decision` heading and
   a `## Context`, so does this one. `new` writes an H1 repeating the title; delete it where
   the bundle's documents open on a section heading instead. The title is already in
   frontmatter, and two of them read as a mistake.

   If the knowledge rests on sources, cite them — check `.okf/policy/source-policy.md`
   first if it exists, for what this bundle considers a good enough citation, then write
   accordingly. Know what you can and cannot write regardless of policy.
   `okfctl new` has no flag for `sources[]`, and frontmatter is not yours to edit, so a
   concept created here cannot carry a machine-checkable citation. Record the source in the
   prose instead, under its own heading: the repository and commit, the query, the document.
   Where a `sources[]` block already exists, as on a document `okfctl capture` wrote,
   reference it with a footnote whose label matches the `id` (SPEC §5.1). `okfctl refs`
   holds that join together, and it only works if the labels match.

7. **Verify**

   ```bash
   okfctl --bundle <root> check
   okfctl --bundle <root> refs --broken
   okfctl --bundle <root> index
   ```

   The new concept must contribute zero errors. Regenerating the index is what puts it in
   front of the next reader; a concept absent from `index.md` is knowledge nobody finds.

**Guardrails**
- Never write or edit a frontmatter block by hand. `okfctl new` creates it; the transition
  verbs change it. Direct edits bypass actor validation, the log entry, and the round-trip
  preservation of keys the tool does not understand.
- Never overwrite an existing concept. If `new` refuses because the path is taken, that is
  the answer — extend the existing document, or pick a different id after asking.
- Never invent an actor, a source, or a `stale_after` horizon. Absent is honest; guessed
  is a false claim in a field other tools will read.
- Match the bundle's existing types and directory structure. Ask before introducing a new
  type or a new top-level directory — including the first one, when the bundle has none.
- Never let `--by` claim another producer's work as yours. It records who wrote the
  document; when the findings came from a different agent, a different session, or
  measurements you did not reproduce, name that in the body and say the figures were
  restated rather than re-measured.
- Do not promote what you just created.
- Bundle policy (`.okf/policy/`) can narrow or extend placement/type/citation judgment; it
  can never license inventing an actor or a source.
