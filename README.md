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
- Footnote labels break their join to `sources[].id` the moment an agent rewrites a document.

None of that is visible without tooling, and all of it is fixable with it.

## Scope

`okfctl` deliberately covers the **maintainer's** loop, not the producer's. It does not
generate knowledge — the OKF reference agent and a dozen ecosystem adapters already do that.

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
| `okfctl promote <concept>` | The draft→stable transition: record verification, flip status, set freshness, log it. |
| `okfctl deprecate <concept>` | The stable→deprecated transition, logged the same way. |
| `okfctl index` | Regenerate `index.md` from frontmatter (§8). `--check` for CI. |

### Derived signals

Nothing below is stored. Each is computed on read, exactly as the spec intends.

**Trust tier** (§5.3), lowest to highest:

- no `verified` key → `unverified`
- `verified` by non-`human:` actors only → `machine-confirmed`
- any `human:<id>` actor → `human-reviewed`

**Stale** (§5.5): `today >= stale_after`. An absolute date comparison, no reference to read time.

**Drifted** (ours): latest `verified.at` is older than `generated.at`. The definition changed
after someone last confirmed it, so the trust tier is nominally intact but no longer earned.

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
okfctl promote <id> --by human:me
okfctl deprecate <id> --by human:me --reason "superseded by /metrics/revenue-v2"
okfctl index --check             # CI: fail when index.md has drifted
```

All commands take an optional bundle path (default `.`) via `--bundle <dir>`.

## Development bundle

the development bundle is a real bundle converted from a homelab GitOps repository — its ADRs,
repo-root guides, and operational notes — plus the agent-skill repository used to operate it.
49 concepts, 101 resolving cross-links, with genuinely deprecated, draft, stale, and drifted
states to run the commands against. See its README.

## Status

Early. `check`, `status`, `promote`, `deprecate`, and `index` are the first slice.
Footnote↔`sources[].id` join integrity (`okfctl refs`) and `/okf:*` agent slash commands
are next.

Targets OKF **v0.2**.
