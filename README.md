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
okfctl search <q>  # find concepts by relevance, frontmatter and body together
okfctl capture     # dump what a session established into the dumps area
okfctl refine      # turn a dump into a typed, titled entry in the drafts area
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

### Initialize a bundle

```bash
okfctl init path/to/bundle          # scaffold a new, empty bundle
okfctl init path/to/bundle -n       # preview first: list what would be created
```

This creates the things an OKF bundle needs to exist at all: `index.md` (the
bundle-root index, SPEC §3.1), `log.md` (the dated activity log, SPEC §9), an empty
`dumps/` directory for low-ceremony capture, and an empty `drafts/` directory for entries
refined from a dump but not yet placed. Nothing else — no example concepts, no
directory layout beyond that, because the spec does not prescribe one and `okfctl` does
not invent conventions for a bundle to grow into on its own. Run it again against an
existing bundle and it reports what already exists rather than overwriting it — `init` is
idempotent.

Point every other command at it with `--bundle`, or skip the flag once you have registered
it (see [Capturing from a session](#capturing-from-a-session) below) or `cd`'d into it.

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

### Capturing from a session

Knowledge is produced in conversations with coding agents and lost when they end. Register
one bundle as this machine's knowledge base, wire your agents to it, and a session in any
repository can write into it:

```bash
okfctl init --register                                   # this bundle is the knowledge base
okfctl init --agent claude-code --agent codex            # wire the agents to it
okfctl init --agent claude-code --capture-every 5 -n     # preview, prompting every 5th turn
```

Captured knowledge lands in `dumps/` as a conformant concept — `status: draft`, no
`verified`, the agent recorded as its producer, and the repository and session it came from
recorded in `sources[]`. Its id is generated as `<date>-<session>-<n>`
(`dumps/2026-08-22-45fcb979-1.md`): the date sorts, the session groups a conversation's
captures, and the sequence means a capture can never collide with — and so never destroy —
one already there. Read the inbox with `okfctl status --dumps`, which prints titles. It is
usable and findable, but nobody has typed, titled, or vouched for it yet.

From there, `okfctl refine` turns a dump into a typed, titled entry in `drafts/`, citing the
dump it drew from rather than claiming first-hand authorship — one dump can become several
entries (split), or several dumps can become one (consolidate). A human (or `okf-review`)
empties the drafts inbox later with `okfctl move`, or by merging it into a concept that
already exists.

### Which bundle a command acts on

`--bundle <dir>`, then the bundle you are standing in, then the registered one. The middle
step matters: working *on* a bundle must never write into a different one.

Every command also takes `--dumps-dir <dir>` and `--drafts-dir <dir>` if `dumps/` or
`drafts/` are not where you want those holding areas.

## Commands

| Command | Purpose |
|---|---|
| `okfctl init [dir]` | Scaffold a bundle, `--register` it as this machine's knowledge base, `--agent` to wire a coding agent to it. |
| `okfctl capture` | Low-ceremony capture into the dumps area: title, actor and a body, placement deferred. |
| `okfctl refine <source...>` | Turn one or more dumps into a typed, titled entry in the drafts area, citing what it drew from. |
| `okfctl move <from> <to>` | Relocate a concept, carrying its inbound links, indexes and log with it. Not a promotion. |
| `okfctl check` | Two-tier conformance + lint. Errors gate CI; warnings inform. |
| `okfctl status` | Corpus health: trust tiers, stale, draft, drifted, orphans. |
| `okfctl new <path>` | Ingest: create a concept that conforms on the first write. |
| `okfctl review <concept>` | Record what a review found: still accurate, or no longer accurate. |
| `okfctl promote <concept>` | The draft→stable transition: record verification, flip status, set freshness, log it. |
| `okfctl deprecate <concept>` | The stable→deprecated transition, logged the same way. |
| `okfctl index` | Regenerate `index.md` from frontmatter (§8). `--check` for CI. |
| `okfctl refs` | Reference integrity: footnote ↔ `sources[].id`, and internal links. `--strict` for CI. |
| `okfctl catalog` | The whole bundle as one document, grouped by type. Prints by default. |
| `okfctl search <query>` | Ranked full-text search over `title`, `description`, `tags` and body, boosted by trust tier. Each result names its area (dumps/drafts/corpus) and trust tier. Indexed in memory per run, never persisted. `--limit` to widen. |

Common invocations:

```bash
okfctl check --strict                 # treat warnings as errors (opt-in only)
okfctl status --stale --drifted       # filter to what needs attention
okfctl status --json                  # machine-readable (shorthand for --format json)
okfctl status --format yaml           # same data, yaml
okfctl search "gateway timeout" --format json | jq '.results[] | select(.tier == "human-reviewed")'
okfctl new decisions/x --type Decision --dry-run    # preview the frontmatter
okfctl review <id> --confirm  --by human:me --stale-in 90d
okfctl review <id> --outdated --by human:me --reason "FY26 restatement"
okfctl deprecate <id> --by human:me --reason "superseded by /metrics/revenue-v2"
okfctl index --check                  # CI: fail when index.md has drifted
okfctl refs --anchors                 # also verify #fragments against target headings
okfctl refs --broken --strict         # CI: fail on any broken reference
okfctl catalog                        # print the whole bundle, grouped by type
okfctl catalog --write                # keep catalog.md at the bundle root
okfctl catalog --check                # CI: fail when catalog.md has drifted

okfctl init --register                              # register this bundle
okfctl init --agent codex --capture-every 5         # prompt every 5th turn
okfctl init --agent codex --remove                  # take back exactly what was installed
okfctl capture --title "..." --by agent/1.0 --session <id> --stdin
okfctl capture --title "..." --by agent/1.0 --id chosen-name --stdin  # name it yourself
okfctl status --dumps                 # drill into the dumps inbox
okfctl status --drafts                # drill into the drafts inbox
okfctl status --all                   # put dumps and drafts back in the attention list
okfctl refine dumps/x --type Runbook --title "..." --by agent/1.0 --stdin
okfctl refine dumps/x --type Runbook --title "..." --by agent/1.0 --stdin --consume
okfctl move drafts/x decisions/x --by human:me      # empty the drafts inbox
okfctl move drafts/x decisions/ -n    # preview the link rewrites first
```

## Machine-readable output

`status`, `check`, `refs`, and `search` all take `--format table|json|yaml` (`table` is the
default, matching each command's existing human output). `--json` still works everywhere it
did before — it is a permanent shorthand for `--format json`, not deprecated. `--format` wins
if you pass both.

```bash
okfctl status --format json | jq '.concepts[] | select(.tier == "unverified")'
okfctl search "gateway timeout" --format yaml
```

`search` results carry each hit's area (`dumps`, `drafts`, or `corpus`) and trust tier
(§5.3) alongside its score, in both table and structured output, so a caller can tell how
settled a match is without opening it. Ranking applies a soft trust-tier boost on top of
relevance — enough to break a near-tie toward the more-trusted result, never enough to let
trust tier alone bury a clearly stronger match.

## The dumps and drafts areas

OKF already distinguishes trust not yet earned — that is `status: draft`. `dumps/` and
`drafts/` carry a different axis: **placement and shape not yet decided**. A stable decision
is placed, typed and shaped, and only its trust is pending; a captured dump's type is a
guess and its directory is a parking space. Different backlog, different verbs.

The two areas are two stages of the same axis, not two names for one thing:

- **`dumps/`** — raw, low-ceremony captures. `okfctl capture` writes here. Placement, type,
  and shape are all still undecided; the type is a provisional placeholder.
- **`drafts/`** — refined, typed, titled entries that are not yet placed in the corpus.
  `okfctl refine` writes here, from one or more `dumps/` concepts, citing what it drew from.
  Placement is still undecided, but type and shape no longer are.

Everything in both is a real concept: each conforms to §11 on the first write, appears in
the index, and can be cited. What changes is that `okfctl status` reports each as its own
**inbox** rather than in the attention list — every entry in either is draft and unverified
on arrival, so leaving them there would bury whatever is actually rotting. Each inbox line
always names its count and the age of its oldest entry, so nothing is hidden, only moved —
and the two are never merged into one figure, since they are different backlogs.

The spec names neither directory. Both are ours, and both are a convention: a bundle whose
`dumps/` or `drafts/` holds ordinary concepts is still perfectly conformant.

> **Migrating from before `okfctl refine` existed:** `drafts/` used to be the raw capture
> area (what `dumps/` is now). If you have a bundle with a populated `drafts/` predating
> this change, run `mv drafts dumps` at the bundle root — or pass `--dumps-dir drafts` to
> keep the old path without renaming, though a directory named `drafts/` holding raw,
> unrefined material is exactly the confusion this rename exists to remove.

## Agent hooks

`okfctl init --agent <host>` installs the capture workflow into a coding agent's
**user-level** configuration, so it applies in every repository — not just the bundle's own.

It installs at **two scopes**, because the workflows are not used in the same place.
`okf-capture` goes to user scope so it works in every repository; the six curation
workflows — triage, refine, ingest, promote, review, deprecate — go **into the bundle**, so
they load when you open your knowledge base and nowhere else.

| | Claude Code | Codex |
|---|---|---|
| **user** — capture | `~/.claude/skills/`, `~/.claude/commands/okf/` | `~/.agents/skills/` |
| **project** — curation | `<bundle>/.claude/skills/`, `<bundle>/.claude/commands/okf/` | `<bundle>/.agents/skills/` |
| hook | `~/.claude/settings.json` | `~/.codex/hooks.json` |

| Host | Event hook | Notes |
|---|---|---|
| `claude-code` | yes — `Stop` | skills and slash commands at both scopes |
| `codex` | yes — `Stop` | skills at both scopes plus `~/.codex/AGENTS.md`; no slash-command equivalent |
| `copilot` | no | `~/.github/copilot-instructions.md` only — the host has no equivalent mechanism |
| `agents-md` | no | `~/AGENTS.md` only |

A bundle's `.claude/` and `.agents/` directories are dotfiles, which the bundle walk skips —
so installing into a bundle adds no concepts and no conformance errors.

**The hook prompts; it does not capture.** A hook is a shell command with no model, so it
cannot summarize a session. One that tried would write garbage under an agent's provenance,
which is a false claim in the sense §7 cares about. It asks; the agent decides and writes.

**It fires on `Stop`, not `SessionEnd`.** On both hosts, session-end hook output is
discarded and cannot reach the model, which makes it useless for prompting. `Stop` fires at
turn completion and its output is injected into the model's context.

**It holds the turn open.** Emitting context without blocking would surface the prompt only
on the *next* turn, and if the session ends there the knowledge is gone. So it blocks — which
costs a model round-trip every time it fires. `--capture-every <n>` is the knob; the default
is every turn, and the installed interval is reported back to you.

It blocks by writing `{"decision": "block", "reason": …}` to stdout and **always exits 0**.
Exit 2 blocks too, but it is the error channel — the host renders it as a hook failure, and
an advisory prompt is not a failure.

Blocking terminates by two independent guards: Codex's own `stop_hook_active`, and — for
hosts that do not report their own continuations — an arm-on-user-input marker. A session
circuit breaker bounds the worst case, and every error path lets the turn end. A hook that
can hold a user in a conversation may only ever fail open.

`init --agent` is the only thing `okfctl` writes outside a bundle. It is opt-in, previewable
with `-n`, additive, idempotent, never destructive, and removable with `--remove` — which
takes back both scopes, deletes files that existed only to hold what it installed, prunes
the directories it created, and leaves your own settings and the bundle itself alone.

Run `okfctl <command> --help` for the full flag list, and see
[docs/design.md](docs/design.md) for what each command writes and why.

## The catalog

`index.md` answers "what is in this directory". `okfctl catalog` answers "what is in this
bundle": one document listing every concept, grouped by `type` rather than by directory, so
a Decision filed under `guides/` sits with the other Decisions. Entries carry a bracketed
marker when the concept is not settled — `[draft, unverified]`, `[drifted]` — so the
catalog says what exists *and* how far to trust it.

It prints to stdout by default and touches nothing. `--write` keeps a copy at
`catalog.md`, `--check` gates it in CI. Two details are deliberate:

- **The rendering is a pure function of the bundle's bytes.** Nothing derived from today
  reaches it — which is why staleness is *not* a marker. A `stale_after` passing would
  otherwise drift a checked-in catalog on a morning nobody changed anything, with no commit
  to explain it. `okfctl status --stale` is where a question whose answer depends on when
  you ask belongs. For the same reason `generated.at` is carried across untouched whenever
  the body is unchanged.
- **The written file carries real frontmatter** — `type: Index`, a title, a description,
  and `generated`. SPEC §3.1 reserves only `index.md` and `log.md`, so a bare `catalog.md`
  would be a concept missing `type`: a §11 error to every consumer but this one. `Index` is
  our convention, not a value the spec names. `okfctl` itself treats a bundle-root
  `catalog.md` as output rather than corpus, so it never lists itself and never shows up in
  `status` as unverified knowledge.

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
- run: okfctl catalog --check  # only if you keep a catalog.md
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

The CLI knows *how* to make each change. The skills in [`skills/`](skills/), with their
slash-command wrappers in [`commands/okf/`](commands/okf/), know *when*. Each is host-neutral —
one `SKILL.md` per skill, placed into a host's own directory layout at install time — and
invocable in Claude Code by name as `/okf:<name>`, or selected from its description.
`okfctl init --agent <host>` installs them — capture at user scope, the rest into your bundle.

| Skill | For |
|---|---|
| `okf-capture` | A session produced something worth keeping. Summarizes it into the dumps area — or declines, which is the right answer more often than not. |
| `okf-triage` | "How is this bundle doing?" Reports health, names the workflow each finding needs, and writes nothing. |
| `okf-refine` | The dumps inbox. Turns raw dumps into typed, titled entries in the drafts area — one dump split into several, or several consolidated into one — citing what each drew from. |
| `okf-ingest` | New knowledge arriving. Matches the bundle's own types and placement, creates through `new`, then writes the body. |
| `okf-promote` | A draft that has earned trust. Reads it first, establishes a real actor, sets a horizon. |
| `okf-review` | The stale and drifted backlog, and the drafts inbox. Checks each concept against its `sources[]`, routes to the outcome it actually found, and empties drafts by relocating or merging them. |
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
