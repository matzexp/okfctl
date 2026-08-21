## Why

`okfctl` operates on a bundle that already exists, and OKF says that bundle is
*continuously written and maintained by agents*. Two links in that loop are missing. There
is no way to **add** a concept — an agent ingesting knowledge hand-writes frontmatter and
guesses at the shape, so the first thing every new document does is fail `check`. And there
is no way to record a **review** that did not end in promotion: `status --stale` names the
concepts needing a look, but the only verb that answers is `promote`, which asserts the
concept is correct. A maintainer who reads a stale concept and finds it *wrong* has nothing
to write down, so the finding lives in their head and the concept keeps claiming a trust
tier it no longer earns.

Above both sits the real gap: nothing tells an agent *when* to run any of this. OpenSpec
gets its lifecycle from skills that drive its CLI at the right moments. OKF has the CLI and
no skills.

## What Changes

- **`okfctl new <path>`** scaffolds a conformant concept: parseable frontmatter, a non-empty
  `type`, `status: draft`, and a `generated` provenance entry naming the producing actor
  (SPEC §5.2, §7). It refuses to overwrite an existing file, and the document it writes
  passes `check` with zero errors before a word of body text is added.
- **`okfctl review <concept>`** records the outcome of looking at a concept, in two forms:
  - `--confirm` — still accurate. Appends a `verified` entry and pushes `stale_after`
    forward, which is `promote`'s re-verification path made explicit rather than implied by
    a verb that says "promote" while changing no status.
  - `--outdated` — no longer accurate. Sets `stale_after` to today, so SPEC §5.5 reports the
    concept stale from this moment, appends **nothing** to `verified`, and logs the finding.
    The concept keeps its status; deciding between a rewrite and `deprecate` is the
    maintainer's next move, not this command's.
- **A skill suite** under `.claude/skills/okf-*`, with `/okf:*` slash commands, mirroring the
  shape of the `openspec-*` skills already in this repo: thin, deterministic wrappers that
  drive `okfctl` and know which verb a situation calls for. Four workflows — ingest,
  promote, deprecate, and the stale-review loop — plus a status-reading entry point that
  routes to whichever of them the bundle currently needs.
- No new frontmatter fields. `--outdated` deliberately writes only `stale_after`, a field
  §5.5 defines, rather than inventing a `review:` key the format does not have and no other
  OKF consumer would read.

## Capabilities

### New Capabilities

- `concept-authoring`: creating a new concept document with conformant frontmatter —
  path and id derivation, the required and defaulted fields, provenance, and the refusal
  to clobber.
- `knowledge-skills`: the agent-facing skill suite — which workflows exist, what each one
  is responsible for, the boundary that keeps them driving the CLI rather than editing
  frontmatter directly, and the read-only default.

### Modified Capabilities

- `lifecycle-transitions`: gains the review outcomes — confirmation as an explicit verb
  alongside promotion, and the outdated finding that moves the freshness horizon without
  claiming verification.

## Impact

- `src/commands/new.ts`, `src/commands/review.ts` — one file per verb, matching the
  existing layout.
- `src/core/concept.ts` — a builder for a fresh frontmatter document; the round-trip
  serializer already handles writing it.
- `src/core/lifecycle.ts` — no change expected; `resolveStaleIn` and the actor form are
  reused as they stand.
- `src/cli.ts` — two command registrations.
- `.claude/skills/okf-*/SKILL.md`, `.claude/commands/okf/*.md` — new, and shipped in the
  repo the way the `openspec-*` skills are.
- `README.md` — the command table gains two rows, and the maintainer's loop gains the
  ingest end it currently omits.
- No new dependencies.
- **Not breaking.** `promote` keeps its re-verification behavior; `review --confirm` is a
  clearer spelling of it, not a replacement, and nothing existing changes shape.
