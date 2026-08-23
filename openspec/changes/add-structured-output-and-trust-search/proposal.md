## Why

`okfctl` is driven by agents as often as by humans, and agents work best against
consistent, parseable output they can pipe into `jq` or filter further — but today
machine-readable output is inconsistent: `--json` exists on only three commands (`check`,
`status`, `refs`), each with its own ad hoc `JSON.stringify` branch, and `search` — the
command most likely to be scripted, since its whole job is "find me the concept that
matches X" — has no structured output at all. Separately, `search` already returns results
from every area of the bundle (dumps, drafts, and the corpus) but does not say which area a
result came from or how trustworthy it is, and ranks purely on text relevance — so a
provisional dump with a lucky keyword match can outrank a human-reviewed decision on the
same query, with nothing in the output to warn the caller that happened.

## What Changes

- A shared `--format <table|json|yaml>` flag, consistent across every command that
  currently prints structured output (`status`, `check`, `refs`) plus `search`, which gains
  structured output for the first time. `table` is the default and matches today's human
  output; `--json` is kept working as a shorthand alias for `--format json` so no existing
  script breaks.
- `search` results carry, per hit: which area it is in (dumps / drafts / corpus) and its
  trust tier (SPEC §5.3), in both table and structured output — so a caller can see at a
  glance how much to trust a hit before reading it.
- `search` ranking applies a trust-tier boost on top of text relevance (a soft boost, not a
  hard sort key): `human-reviewed` boosts highest, `machine-confirmed` a smaller amount,
  `unverified` none — so a clearly-better relevance match can still outrank a more-trusted
  but weaker match, but near-ties resolve toward the more trustworthy result rather than by
  accident of wording.
- No change to which concepts `search` already includes — it already searches dumps,
  drafts, and the corpus together; this change makes that fact visible in the output rather
  than changing what is searched.

## Capabilities

### New Capabilities
- `cli-output-format`: the shared `--format` flag, its `table`/`json`/`yaml` renderers, and
  which commands carry it.

### Modified Capabilities
- `bundle-search`: result output gains area and trust-tier fields; ranking applies a
  trust-tier boost alongside relevance.

## Impact

- New `src/core/render.ts` addition (or a sibling module) providing a single
  `renderOutput(data, format)` used by every command instead of each writing its own
  `JSON.stringify` branch; a YAML variant via the `yaml` package already in use for
  frontmatter.
- `src/commands/status.ts`, `check.ts`, `refs.ts` swap their `--json` branch for the shared
  renderer; `src/commands/search.ts` gains structured output entirely.
- `src/core/search.ts` gains the trust-tier boost and reports each hit's area/trust tier
  alongside its score.
- `src/cli.ts`: `--format` added where `--json` exists today (as an alias) and newly on
  `search`.
