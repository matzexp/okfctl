# okfctl

Lifecycle tooling for [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF) v0.2 bundles.

> **Proof of concept — work in progress, and written by an AI agent.**
> The code, the tests, and this documentation were produced by Claude working from a human's
> direction and review. It is an experiment in what tooling for an agent-maintained knowledge
> corpus should look like, not a finished product: expect rough edges, breaking changes, and
> commands that will be reshaped once the OKF spec moves past v0.2.
> **Suggestions, criticism, and pull requests are very welcome** — especially about which
> parts of the lifecycle model are wrong.

OKF describes a knowledge corpus that is continuously written and maintained by agents, and
puts trust, provenance, freshness, and lifecycle into frontmatter to make that tractable.
What it does not provide is any way to **operate** on those fields once they exist.
`okfctl` is that missing half: the commands that keep a bundle honest as it ages.

```bash
okfctl status      # what is stale, drifted, unverified, or still a draft
okfctl check       # conformance errors and advisory lint warnings
okfctl refs        # do citations and internal links still resolve?
```

## Why

A bundle rots in specific, mechanically detectable ways:

- `stale_after` dates pass, with nothing watching.
- `status: draft` concepts are never promoted, because promotion is a fiddly multi-field edit.
- `verified.at` drifts older than `generated.at` — the content changed after its last
  confirmation. The spec implies this defect but never names it; we call it **drifted**.
- `index.md` falls out of sync with the concepts it lists, because it is derived data
  maintained by hand.
- Footnote labels break their join to `sources[].id`, and cross-links break their join to
  the files they point at, the moment an agent renames or rewrites a document.

None of that is visible without tooling, and all of it is fixable with it.

`okfctl` covers the **maintainer's** loop, not the producer's — it does not generate
knowledge. See [docs/design.md](docs/design.md) for the reasoning behind that boundary and
the rest of the tool's design.

## Requirements

Node.js >= 20.19.0.

## Install

Not yet published to npm. Install from source:

```bash
git clone https://github.com/matzexp/okfctl.git
cd okfctl
npm install
npm run build
npm link          # puts `okfctl` (and the `okf` alias) on your PATH
```

Or run it from source without installing:

```bash
npm run dev -- status --bundle path/to/bundle
```

## Quick start

```bash
# Point it at a bundle and see what needs attention
okfctl status --bundle path/to/bundle
okfctl check  --bundle path/to/bundle
okfctl refs   --bundle path/to/bundle

# Create a concept that conforms on the first write
okfctl new decisions/envoy-gateway --type Decision --by human:you \
  --title "Envoy Gateway replaces Traefik" --tags networking,gateway

# ... write the body, then record that a human verified it
okfctl promote decisions/envoy-gateway --by human:you --stale-in 90d
```

Every command takes an optional bundle root via `--bundle <dir>` (default `.`).

## Commands

| Command | Purpose |
|---|---|
| `okfctl check` | Two-tier conformance + lint. Errors gate CI; warnings inform. |
| `okfctl status` | Corpus health: trust tiers, stale, draft, drifted, orphans. |
| `okfctl new <path>` | Ingest: create a concept that conforms on the first write. |
| `okfctl review <concept>` | Record what a review found: still accurate, or no longer accurate. |
| `okfctl promote <concept>` | The draft→stable transition: record verification, flip status, set freshness, log it. |
| `okfctl deprecate <concept>` | The stable→deprecated transition, logged the same way. |
| `okfctl index` | Regenerate `index.md` from frontmatter (§8). `--check` for CI. |
| `okfctl refs` | Reference integrity: footnote ↔ `sources[].id`, and internal links. `--strict` for CI. |

Common invocations:

```bash
okfctl check --strict                 # treat warnings as errors (opt-in only)
okfctl status --stale --drifted       # filter to what needs attention
okfctl status --json                  # machine-readable
okfctl new decisions/x --type Decision --dry-run    # preview the frontmatter
okfctl review <id> --confirm  --by human:me --stale-in 90d
okfctl review <id> --outdated --by human:me --reason "FY26 restatement"
okfctl deprecate <id> --by human:me --reason "superseded by /metrics/revenue-v2"
okfctl index --check                  # CI: fail when index.md has drifted
okfctl refs --anchors                 # also verify #fragments against target headings
okfctl refs --broken --strict         # CI: fail on any broken reference
```

Run `okfctl <command> --help` for the full flag list, and see
[docs/design.md](docs/design.md) for what each command writes and why.

## Derived signals

Nothing below is stored in frontmatter. Each is computed on read, exactly as the spec intends.

**Trust tier** (§5.3), lowest to highest:

| Tier | Condition |
|---|---|
| `unverified` | no `verified` key |
| `machine-confirmed` | `verified` by non-`human:` actors only |
| `human-reviewed` | at least one `human:<id>` actor |

**Stale** (§5.5): `today >= stale_after`. An absolute date comparison, with no reference to
read time.

**Drifted** (ours): the latest `verified.at` is older than `generated.at`. The content
changed after someone last confirmed it, so the trust tier is nominally intact but no longer
earned.

## Conformance is two-tier, by design

SPEC §11 *forbids* rejecting a bundle for unknown `type` values, unknown frontmatter keys,
broken cross-links, or missing `index.md`. Conformance is exactly three rules: parseable
frontmatter on every non-reserved `.md`, a non-empty `type` in each, and well-formed
reserved files. So `okfctl` separates:

- **errors** — the three conformance rules. These fail CI and block `promote`.
- **warnings** — advisory conventions (missing `description`, absent `generated`, unresolved
  footnote joins, unresolved links). These never fail a bundle unless you pass `--strict`.

A tool that errors on the soft tier produces bundles that are "valid" only to itself.

## Continuous integration

```yaml
- run: okfctl check          # conformance errors only
- run: okfctl index --check  # index.md is in sync with frontmatter
- run: okfctl refs --broken --strict
```

## Development bundle

The tool was developed against a real bundle converted from a homelab GitOps repository — its
ADRs, guides, and operational notes, plus the agent-skill repository used to operate it. 49
concepts, 101 internal links, 11 footnote citations, and genuinely deprecated, draft, stale,
and drifted states to run the commands against.

That bundle is private and is not part of this repository; the tracked fixtures under
`test/` are what the test suite runs on. If you want something to try the commands against,
any directory of Markdown files with OKF frontmatter will do — `okfctl new` will get you a
conformant first concept.

## Agent skills

The CLI knows *how* to make each change. The skills in [`.claude/skills/`](.claude/skills/)
know *when*. Each is invocable in Claude Code by name as `/okf:<name>`, or selected from its
description.

| Skill | For |
|---|---|
| `okf-triage` | "How is this bundle doing?" Reports health, names the workflow each finding needs, and writes nothing. |
| `okf-ingest` | New knowledge arriving. Matches the bundle's own types and placement, creates through `new`, then writes the body. |
| `okf-promote` | A draft that has earned trust. Reads it first, establishes a real actor, sets a horizon. |
| `okf-review` | The stale and drifted backlog. Checks each concept against its `sources[]` and routes to the outcome it actually found. |
| `okf-deprecate` | Retiring knowledge — and finding the live concepts still pointing at it. |

Two rules hold the set together. **The CLI is the only writer**: no skill edits a frontmatter
block by hand, so actor validation, the conformance gate, the log entry, and the preservation
of unknown keys apply to every change an agent makes. Body prose is the one exception,
because no verb authors content. And **nothing is invented**: an actor, a source, or a
freshness horizon the agent cannot establish is asked for, not guessed.

## Development

```bash
npm install
npm test              # node:test, no build step required
npm run build         # tsc -> dist/
npm run dev -- status # run the CLI from source
```

The source layout: `src/cli.ts` wires the commands, `src/commands/` holds one file per verb,
and `src/core/` holds the bundle reader, the concept/frontmatter model, and the derived-signal
logic that the commands share.

## Contributing

Issues, ideas, and pull requests are all welcome — this is a proof of concept, so
disagreement about the design is more useful than politeness about it. Open an issue if you
think a command writes the wrong field, or that the lifecycle model itself is off.

Two things worth knowing before you send a change:

- Behaviour changes should come with a test in `test/`; `npm test` must stay green.
- New rules belong in the tier the spec puts them in. If SPEC §11 forbids rejecting a bundle
  for something, it is a warning here, not an error.

## Status

Proof of concept, pre-1.0, and moving. `check`, `status`, `new`, `review`, `promote`,
`deprecate`, `index`, and `refs` are the surface that exists today; all of them work, and
none of them are frozen. Flags and output formats may change without ceremony until the
model settles. Targets OKF **v0.2**.

Built with [Claude Code](https://claude.com/claude-code) — the commits, the tests, and the
design notes in `docs/` are agent-written and human-reviewed.

## License

[MIT](LICENSE) © matzexp
