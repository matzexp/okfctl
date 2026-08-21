# okfctl

Lifecycle tooling for [Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (OKF) v0.2 bundles.

OKF says a knowledge corpus is *continuously written and maintained by agents*, and puts
trust, provenance, freshness, and lifecycle in frontmatter to make that tractable. What it
does not provide is any way to **operate** on those fields once they exist. `okfctl` is that
missing half: the commands that keep a bundle honest as it ages.

## The problem this solves

A bundle rots in specific, mechanically detectable ways:

- `stale_after` dates pass, with nothing watching.
- `status: draft` concepts are never promoted, because promotion is a fiddly multi-field edit.
- `verified.at` drifts older than `generated.at` — the content changed after its last
  confirmation. The spec implies this defect but never names it. We call it **drifted**.
- `index.md` falls out of sync with the concepts it lists, because it is derived data
  maintained by hand.
- Footnote labels break their join to `sources[].id`, and cross-links break their join to
  the files they point at, the moment an agent renames or rewrites a document.

None of that is visible without tooling, and all of it is fixable with it.

## Scope

`okfctl` deliberately covers the **maintainer's** loop, not the producer's. It does not
generate knowledge — the OKF reference agent and a dozen ecosystem adapters already do that.
`new` is not an exception: it writes a conformant, empty shell with recorded provenance and
leaves the content to whoever has it.

### Non-goals

- **No attestation runtime.** SPEC §12 explicitly defers receipt/verdict wire formats, the
  attester ABI, portability, and sandboxing. Building an executor now means inventing the
  unspecified part and being superseded by it. We validate §10 *contract fields* and stop.
- **No change-proposal workflow.** OpenSpec needs `proposal.md`/`tasks.md` because spec and
  code are separate artifacts requiring reconciliation. In OKF the knowledge *is* the
  artifact; git supplies diffs and history, and `log.md` supplies the narrative.
- **No strictness.** See below — this is a hard constraint, not a preference.

## Conformance is two-tier, by design

SPEC §11 *forbids* rejecting a bundle for unknown `type` values, unknown frontmatter keys,
broken cross-links, or missing `index.md`. Conformance is exactly three rules: parseable
frontmatter on every non-reserved `.md`, a non-empty `type` in each, and well-formed
reserved files.

So `okfctl` separates:

- **errors** — the three conformance rules. These fail CI and block `promote`.
- **warnings** — advisory conventions (missing `description`, absent `generated`, unresolved
  footnote joins). These never fail a bundle.

A tool that errors on the soft tier produces bundles that are "valid" only to itself. We
don't do that.

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

### Derived signals

Nothing below is stored. Each is computed on read, exactly as the spec intends.

**Trust tier** (§5.3), lowest to highest:

- no `verified` key → `unverified`
- `verified` by non-`human:` actors only → `machine-confirmed`
- any `human:<id>` actor → `human-reviewed`

**Stale** (§5.5): `today >= stale_after`. An absolute date comparison, no reference to read time.

**Drifted** (ours): latest `verified.at` is older than `generated.at`. The definition changed
after someone last confirmed it, so the trust tier is nominally intact but no longer earned.

### `refs` in detail

A bundle has two kinds of reference, and neither is held together by anything: **citations**
join a Markdown footnote label to an `id` in `sources[]` (§5.1), and **links** point from one
file to another. Body, frontmatter, and filenames are all edited independently, so a rename
on any side leaves a reference pointing at nothing. `refs` reads both and reports them
together — it is one question, so it is one command and one CI step.

#### Citations

The footnote ↔ `sources[].id` join, read in both directions:

| State | Meaning |
|---|---|
| `joined` | The footnote resolves to a `sources[]` entry. |
| `unjoined` | A defined footnote with no `sources[].id` to match. The rename case. |
| `undefined` | `[^label]` used in the body with no `[^label]:` definition anywhere. |
| `uncited` | A `sources[].id` no footnote references. |
| `plain` | A footnote in a document that declares no `sources[]` at all. |

`unjoined` and `undefined` are breakage, and `check` reports them as warnings.
`uncited` and `plain` are not: a source may back a concept without being footnoted, and a
document with no `sources[]` is using footnotes as plain Markdown. Treating either as a
defect would invent a rule §5.1 does not state, so `refs` reports them and `check` does not.

#### Links

Internal Markdown links are resolved against the bundle's own contents — no network, no
git:

| State | Meaning |
|---|---|
| `resolved` | Something exists in the bundle at that path. |
| `unresolved` | Nothing does, or the path escapes the bundle root. |
| `anchor-missing` | The file exists but no heading matches the `#fragment`. Only with `--anchors`. |

Root-absolute (`/guides/x.md`), relative (`../decisions/y.md`), and bare-fragment
(`#section`) forms are all read; a bare fragment addresses the document it sits in.
`http:`, `https:`, and `mailto:` targets are out of scope — verifying those is a network
check, not a bundle check.

Directories (`guides/`) and reserved files (`index.md`, `log.md`) count as valid targets,
because `okfctl index` generates `* [guides](guides/)` itself and the tool should not flag
its own output. Links are read from concepts; `index.md` and `log.md` are not scanned.

`unresolved` is reported by `check` as a warning. `anchor-missing` never is: matching a
fragment to a heading needs a slug algorithm OKF does not define, so a mismatch may be this
tool's rule disagreeing with your renderer rather than a defect in your bundle. That check
is opt-in via `--anchors`.

**`--strict` implies `--anchors`.** It widens what is checked, not just the exit code — a
caller gating CI has asked for the stricter reading.

Code fences and inline code spans are excluded before scanning, so neither a `[^` inside a
SQL block nor a link in a shell sample is mistaken for a reference.

### `new` in detail

```bash
okfctl new decisions/envoy-gateway --type Decision --by human:matze \
  --title "Envoy Gateway replaces Traefik" --description "..." --tags networking,gateway
```

Writes `type`, `title`, `description`, `tags`, `status`, `generated` in the order the
format's own examples use, through the same YAML document model `promote` writes through —
so a created concept and an edited one are formatted identically.

`--type` is required and unconstrained. It is the one value §11 makes mandatory, and §4.1
leaves its vocabulary open, so the tool insists on having one and never questions which.
Fields you do not supply are omitted rather than written blank: an absent `description`
draws a warning, and a blank one draws nothing, which makes blank the worse of the two.
`stale_after` is written only when asked for — a guessed freshness horizon is a false claim.

New concepts open as `status: draft` with no `verified` entry, so they read `unverified`
(§5.3, §5.4). Nothing is overwritten, ever: if the path is taken, the command refuses.

### `review` in detail

A review has two outcomes, and they are not the same write.

```bash
okfctl review metrics/revenue --confirm  --by human:matze --stale-in 90d
okfctl review metrics/revenue --outdated --by human:matze --reason "FY26 restatement"
```

`--confirm` appends a `verified` entry and moves `stale_after` forward. It leaves `status`
alone — saying content is still accurate is not a claim about its lifecycle state.

`--outdated` sets `stale_after` to today, so §5.5 reports the concept stale from that
moment, and writes **nothing** to `verified`. That omission is the point: §5.3 derives the
trust tier from `verified`, so recording that a human looked would *raise* the tier of a
concept that human just found wrong. `status` is left alone too — choosing between a
rewrite and a deprecation is a separate decision with a separate verb.

`stale_after` is also the only field it writes. OKF v0.2 has no field for "reviewed and
found wrong", and §11's tolerance for unknown keys would have made one legal — but a key
only `okfctl` reads is a signal no other consumer can act on. The narrative goes in
`log.md`, which is what §9 is for.

**`promote` or `review --confirm`?** `promote` when the status should change,
`review --confirm` when it should not. Re-promoting a stable concept still re-verifies it;
that path is older and stays valid.

### `promote` in detail

```bash
okfctl promote metrics/revenue --by human:matze --stale-in 90d
```

1. Runs conformance on the target. Refuses on errors.
2. Appends `{ by, at: <now> }` to `verified`, normalizing a bare mapping into a
   one-element list first (§5.2 requires consumers to accept both forms).
3. Sets `status: stable`.
4. Sets `stale_after` when `--stale-in`/`--stale-after` is given.
5. Appends a dated entry to the nearest `log.md`, walking up from the concept to the bundle
   root (§9).

Frontmatter is rewritten through the YAML document model, so key order, comments, and
unknown producer-defined keys survive — §4.1 asks consumers to preserve unknown keys when
round-tripping, and `promote` is a round-trip.

## Install

```bash
npm install -g okfctl
```

## Usage

```bash
okfctl check                     # conformance + lint over ./
okfctl check --strict            # treat warnings as errors (opt-in only)
okfctl status                    # health summary
okfctl status --stale --drifted  # filter to what needs attention
okfctl status --json             # machine-readable
okfctl new decisions/x --type Decision --by human:me
okfctl new decisions/x --type Decision --dry-run   # preview the frontmatter
okfctl promote <id> --by human:me
okfctl review <id> --confirm --by human:me --stale-in 90d
okfctl review <id> --outdated --by human:me --reason "..."
okfctl deprecate <id> --by human:me --reason "superseded by /metrics/revenue-v2"
okfctl index --check             # CI: fail when index.md has drifted
okfctl refs                      # citations and links, both directions
okfctl refs --anchors            # also verify #fragments against target headings
okfctl refs --broken --strict    # CI: fail on any broken reference (implies --anchors)
```

All commands take an optional bundle path (default `.`) via `--bundle <dir>`.

## Development bundle

the development bundle is a real bundle converted from a homelab GitOps repository — its ADRs,
repo-root guides, and operational notes — plus the agent-skill repository used to operate it.
49 concepts, with 101 internal links and 11 footnote citations that all resolve — verified
by `okfctl refs`, not counted by hand — plus genuinely deprecated, draft, stale, and
drifted states to run the commands against. See its README.

## Agent skills

The CLI knows *how* to make each change. The skills in [`.claude/skills/`](.claude/skills/)
know *when* — they are what makes the lifecycle get exercised rather than merely be
available. Each is invocable by name as `/okf:<name>`, or selected from its description.

| Skill | For |
|---|---|
| `okf-triage` | "How is this bundle doing?" Reports health, names the workflow each finding needs, and writes nothing. |
| `okf-ingest` | New knowledge arriving. Matches the bundle's own types and placement, creates through `new`, then writes the body. |
| `okf-promote` | A draft that has earned trust. Reads it first, establishes a real actor, sets a horizon. |
| `okf-review` | The stale and drifted backlog. Checks each concept against its `sources[]` and routes to the outcome it actually found. |
| `okf-deprecate` | Retiring knowledge — and finding the live concepts still pointing at it, which `refs` cannot flag because the file is still there. |

Two rules hold the set together. **The CLI is the only writer**: no skill edits a
frontmatter block by hand, so actor validation, the conformance gate, the log entry, and
the preservation of unknown keys apply to every change an agent makes. Body prose is the
one exception, because no verb authors content. And **nothing is invented**: an actor, a
source, or a freshness horizon that the agent cannot establish is asked for, not guessed —
each is a durable claim that other tools will read.

`okf-review` carries the sharpest version of that: a concept it cannot verify gets neither
outcome recorded. An unverifiable concept is a real finding, and a fabricated confirmation
is the one failure the trust tier exists to prevent.

## Status

Early. `check`, `status`, `new`, `review`, `promote`, `deprecate`, `index`, and `refs` are
the shipped surface, with the `/okf:*` skills driving them.

Targets OKF **v0.2**.
