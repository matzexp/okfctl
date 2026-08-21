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

**Steps**

1. **Establish the bundle root**

   As in `okf-triage`: find the directory holding the bundle's top-level `index.md`, ask
   when it is ambiguous, and pass `--bundle <root>` on every command.

2. **Decide placement and type — against the bundle, not from habit**

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

   Derive the id from the title in the bundle's existing style — usually kebab-case, no
   date prefix unless the directory already uses one (incident logs often do).

3. **Preview before writing**

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

4. **Create it**

   Re-run without `--dry-run`. The document is written as `status: draft` with a `generated`
   entry, and the creation is logged to the nearest `log.md` (SPEC §9).

   New knowledge is a draft. It has not been verified by anyone yet, and saying otherwise
   in frontmatter is a false claim. Promotion is a separate, deliberate act — `okf-promote`.

5. **Write the body**

   Edit the file directly for prose. This is the one thing the CLI does not do, and the
   only edit any workflow makes to a concept file by hand. Leave the frontmatter block
   exactly as `new` wrote it.

   Write what the reader needs and no more. Follow the shape of neighbouring documents of
   the same type — if every decision in `decisions/` opens with a `# Decision` heading and
   a `## Context`, so does this one.

   If the knowledge rests on sources, cite them: add a `sources[]` entry and reference it
   with a footnote whose label matches the `id` (SPEC §5.1). `okfctl refs` holds that join
   together, and it only works if the labels match.

6. **Verify**

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
  type or a new top-level directory.
- Do not promote what you just created.
