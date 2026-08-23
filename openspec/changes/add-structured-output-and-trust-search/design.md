## Context

See proposal.md - Why. Today's three `--json` implementations (`status.ts`, `check.ts`,
`refs.ts`) each branch on `options.json` and call `JSON.stringify(data, null, 2)` directly
with their own shape; `search.ts` has no structured output branch at all. There is no
shared rendering helper. `src/core/render.ts` already exists and holds small human-output
helpers (`pluralize`, table formatting via `term.ts`'s `table`) but nothing about
machine-readable formats.

`src/core/search.ts`'s `search()` returns `SearchHit[] = { concept, score }`. Trust tier is
already computed per concept by `src/core/lifecycle.ts`'s `health()` (used throughout
`status.ts`); nothing currently calls it from search.

## Goals / Non-Goals

**Goals:**
- One rendering path (`table` / `json` / `yaml`) shared by every command that emits
  structured data, so a new command adopts it by calling one function instead of writing
  its own branch.
- `--json` keeps working unchanged everywhere it exists today — this is additive to
  existing scripts, not a breaking flag rename.
- `search` becomes scriptable: structured output, and enough per-hit metadata (area, trust
  tier) that a caller can filter or sort further with `jq` without re-deriving trust tier
  itself.
- Trust tier measurably affects ranking without letting a barely-relevant but
  highly-trusted concept bury a strong text match — see "soft boost," not a hard sort key,
  per design decision below (user's explicit choice over a hard sort key).

**Non-Goals:**
- Not adding `--format` to write verbs' preview/confirmation output (`capture`, `new`,
  `move`, `promote`, `deprecate`, `review`, `refine`) in this change. Those print a
  human-oriented preview and a confirmation, not a queryable report; scripting a write verb
  is a different, larger question (idempotency, `--yes`-style non-interactive confirmation)
  better left for its own proposal if wanted.
- Not persisting a search index or any ranking state — this change adds a scoring factor to
  the existing fresh-per-invocation index (`bundle-search`'s "Fresh Index, No Persisted
  State" requirement is unaffected).
- Not changing which concepts `search` returns — dumps, drafts, and corpus are already all
  searched; only their visibility in the output and their weight in ranking change.
- Not adding a `--exclude-dumps`/`--exclude-drafts` filter to `search` in this change. The
  ask was to make dumps/drafts search visible and trust-ranked, not to add exclusion
  filtering; a filter can follow later if the trust-tier visibility turns out not to be
  enough signal for some callers.

## Decisions

### `--format table|json|yaml`, `--json` as a permanent alias

`table` is the default (today's human-readable output, unchanged). `--json` is not
deprecated — it is kept indefinitely as shorthand for `--format json`, since it is already
muscle memory for three commands and breaking it buys nothing. Both flags write into the
same resolved `format` value; passing both is not an error, `--format` wins if they
disagree (an explicit, more specific flag beats a shorthand).

YAML is included because `okfctl` already depends on the `yaml` package for frontmatter,
so the marginal cost is low, and it gives callers using `yq` the same option JSON gives
`jq` users — but it is not the priority. If YAML rendering turns out to need real design
work (e.g. a data shape that does not round-trip cleanly through the `yaml` library's
stringify), it is fine to ship `table`/`json` first and follow with `yaml`; this is called
out as an explicit fallback, not a hidden scope cut.

### One shared renderer, not per-command branches

Add `renderOutput(data: unknown, format: OutputFormat): string` to `src/core/render.ts`
(the same module today's small formatting helpers live in). Every command that supports
`--format` builds its own data object exactly as `status.ts`/`check.ts`/`refs.ts` do today
for `--json`, then calls `renderOutput` instead of an inline `JSON.stringify`. `table`
format keeps each command's existing hand-written human output — `renderOutput` is not
asked to invent a generic table renderer for arbitrary JSON, since each command's human
output is already tuned to what that command reports (column choice, coloring, grouping)
and a generic tabulator would be a regression relative to that.

### `search` output gains area and trust tier, in both table and structured form

Each `SearchHit` gains, at read time (not stored, computed the same way `status.ts` already
computes `health()` per concept):
- `area`: `"dumps"` when the concept is in the dumps area, `"drafts"` when in the drafts
  area (both per the renamed areas in `add-refine-stage`, if that change has landed; until
  then, per today's single drafts area), otherwise `"corpus"`.
- `tier`: the concept's trust tier (`unverified` / `machine-confirmed` / `human-reviewed`),
  from the existing `health()` computation — no new derivation logic, reusing what
  `status` already relies on.

Table output adds these as trailing columns; `--format json`/`yaml` includes them as
fields per hit.

### Trust-tier ranking: soft boost, not a hard sort key

Chosen per explicit direction: a hard sort key (every stable/human-reviewed concept above
every draft/unverified one, regardless of relevance) was rejected because it lets a weakly
relevant but well-trusted concept bury a strongly relevant dump — the opposite failure from
the one this change is fixing. Instead, trust tier contributes a multiplicative boost to
the existing MiniSearch relevance score, in the same style `search.ts`'s existing `BOOST`
constant already boosts `title`/`description`/`tags` matches:

```
human-reviewed:     ×1.5
machine-confirmed:  ×1.2
unverified:         ×1.0 (no boost)
```

These are deliberately modest — enough to break a near-tie toward the more trusted result,
not enough to let trust tier alone overturn a clearly stronger text match. Exact values are
implementation-tunable (task-level), not a spec-level contract; the spec requirement is the
direction (higher trust tier ranks higher, all else equal) and the "near-tie, not override"
character, not the literal multipliers.

## Risks / Trade-offs

- **A generic `renderOutput` tempts a command into using it for `table` too, producing a
  worse report than a hand-tuned one** → mitigated by the explicit decision above: `table`
  format is always the command's existing hand-written output, never routed through a
  generic renderer.
- **Trust-tier boost values are subjective** → mitigated by keeping them as small,
  documented constants in one place (`search.ts`, alongside the existing `BOOST` table)
  rather than configurable per-call; if they prove wrong in practice, they are a one-line
  change, not a breaking one.
- **YAML output could round-trip poorly for some values (dates, nested arrays)** →
  mitigated by non-goal: ship JSON first if YAML needs more design work than expected.

## Migration Plan

Additive. No existing bundle or script is affected: `--json` keeps working exactly as
before on every command that has it today; `search` gaining `--format`/area/trust-tier
fields is new output only a caller that opts in will see. No directory rename, no data
migration.
