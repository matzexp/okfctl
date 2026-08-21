# Design notes

Why `okfctl` draws its boundaries where it does, and what each command actually writes.
The [README](../README.md) is the user-facing surface; this is the reasoning behind it.

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
- **No strictness by default.** SPEC §11 forbids rejecting a bundle for unknown `type`
  values, unknown frontmatter keys, broken cross-links, or missing `index.md`. A tool that
  errors on that soft tier produces bundles that are "valid" only to itself. This is a hard
  constraint, not a preference.

## `refs`

A bundle has two kinds of reference, and neither is held together by anything: **citations**
join a Markdown footnote label to an `id` in `sources[]` (§5.1), and **links** point from one
file to another. Body, frontmatter, and filenames are all edited independently, so a rename
on any side leaves a reference pointing at nothing. `refs` reads both and reports them
together — it is one question, so it is one command and one CI step.

### Citations

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

### Links

Internal Markdown links are resolved against the bundle's own contents — no network, no git:

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

## `new`

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

## `review`

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

## `promote`

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

`deprecate` is the same shape of write for the stable→deprecated transition.
