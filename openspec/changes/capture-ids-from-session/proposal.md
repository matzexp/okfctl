## Why

A captured concept's id is derived from its title, and it is thrown away almost every time.
In a live bundle of ten captures, nine were renamed the moment a human moved them into the
corpus — `a-blocking-agent-stop-hook-must-block-with-a-stdout-decision-not-exit-2` became
`tooling/stop-hook-blocking-mechanism`, `telemetry-cost-drivers-talos-audit-logs-and-runtime-identity-labels`
became `observability/log-volume-drivers`. The one that survived had its id passed by hand.

That would be merely wasteful if the derived id were harmless. It is not:

- **It is mangled.** The slug is capped at 72 characters and trailing hyphens stripped,
  which is how `...-resource-labels-and-histogra` reached the bundle, cut mid-word.
- **It throws away work.** A second capture whose title slugifies the same is *refused*, so
  the agent loses the summary it just wrote. Refusing is right for `okfctl new`, which is
  protecting an existing concept; here there is nothing to protect and something to lose.
- **It hardens a guess.** A concept's id is its bundle-relative path (SPEC §2), so the
  title an agent chose in one line becomes the string every link, index entry and citation
  refers to until somebody renames it.

Meanwhile the thing that *is* durably interesting about a capture — which conversation
produced it — is recorded nowhere at all.

## What Changes

- **Generated ids become `<YYYY-MM-DD>-<session8>-<n>`**, e.g. `drafts/2026-08-22-45fcb979-1`.
  Sortable by date, grouped by session, and sequenced so a collision is arithmetically
  impossible. The sequence is derived from what is already in the drafts area on disk, so
  capture works standing alone without the hook having run.
- **`capture` gains `--session <id>`**, and the full session id is recorded in `sources[]`
  next to the working directory and commit it already records — so "which conversation
  produced this" survives the rename and the move into the corpus.
- **Without `--session`, the id says so.** A stand-in marker is used rather than a
  fabricated session id, and no session is written to `sources[]`. Absent is honest;
  invented is a false claim in a field other tools read.
- **`--id <slug>` stays the escape hatch** for a name you actually want, and an `--id`
  already taken still refuses. The generated scheme never refuses, because it never
  collides.
- **`okfctl status --drafts` prints titles.** This is not cosmetic: the id is the only
  thing the listing shows today, and an opaque id would make the inbox unreadable. Shipping
  the id change without this would be shipping a regression.
- **`slugify` stops deriving ids from titles**, and its mid-word truncation is fixed for the
  one job it keeps — normalizing an explicit `--id`.

## Capabilities

### New Capabilities

None. This changes how an existing capability behaves.

### Modified Capabilities

- `knowledge-capture`: the generated id scheme, the collision rule for generated ids, and
  the session recorded as provenance alongside the origin.
- `corpus-status`: the drafts inbox listing shows each concept's title, because its id no
  longer carries meaning.

## Impact

- **Changed code**: `src/commands/capture.ts` (id generation, `--session`, collision rule),
  `src/core/origin.ts` (session in `sources[]`), `src/commands/status.ts` (titles in the
  drafts listing), `src/cli.ts` (the `--session` flag).
- **Changed skills**: `.claude/skills/okf-capture/SKILL.md` — the workflow should pass
  `--session` when the host reports one, and should stop reaching for `--id`.
- **Docs**: the `capture` section of `docs/design.md` and the README's drafts-area section.
- **No migration.** Concepts already captured keep their ids; nothing rewrites them. The
  scheme applies to captures made from here on.
- **Not breaking.** `--id` behaves as before, and no existing flag changes meaning.
