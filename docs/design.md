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

## `capture`

```bash
okfctl capture --title "Timeouts are per route" --by claude-code/2.1 --stdin
```

`new` requires `--type` because §11 does. `capture` still writes one — it defaults to a
provisional `Note` when the caller has no better answer. Defaulting rather than requiring is
the whole difference between the two verbs, and it is justified because the type is
*explicitly provisional*: the document sits in the drafts area precisely to have that answer
revisited.

Rejected: writing frontmatter-less scratch files. They fail §11 rule one on every file, so
`check` would need an exemption for a directory the spec has never heard of — and every other
OKF consumer, which will not have that exemption, reads the bundle as broken. It is the same
constraint that shaped `catalog.md`: **writing a file must not make the bundle
non-conformant.** It also makes the dumps unusable in exactly the way they are meant to stay
usable — no `type` means no index entry, no catalog row, no citation target.

"Raw" is carried instead by signals that already exist: `status: draft`, an empty `verified`
so the trust tier reads `unverified` (§5.3), a `generated.by` naming the agent rather than a
human, and residence in the drafts area.

`capture` writes the body, which `new` does not. That is the one place a CLI verb authors
content, and it does so only by copying bytes it was handed — no templating, no inference.

**`--by` is required and never defaulted.** The existing skills already hold this line, but
capture is frequent and automatic, so a wrong default would be wrong at scale rather than
once.

**Origin goes in `sources[]`.** A bundle collecting knowledge out of a dozen repositories
loses the context a reader most needs without it, and §5.1 is where provenance already goes.
Outside a repository the remote and commit are omitted rather than guessed; capturing from
inside the target bundle records nothing, because a concept does not cite the bundle it
lives in.

### The drafts area

`drafts/` at the bundle root, overridable with `--drafts-dir`, matched by path prefix.

Rejected: a marker file or a bundle-level config, both of which invent a format to hold one
value that has a good default. Rejected also: inferring the area from `type: Draft`, which
would overload §4.1's open vocabulary with a lifecycle signal that `status` already carries.

What the directory adds over `status: draft` is a *different axis*. A draft decision is
placed, typed and shaped; only its trust is pending, and `promote` settles it. A dump is none
of those — its type is a guess, its directory is a parking space, and its body may be three
bullets. Different backlog, different verb.

`status` reports it as an inbox rather than in the attention list: every dump is draft and
unverified on arrival, so twenty of them bury whatever is actually rotting. The inbox line is
printed on every unfiltered run with the age of the oldest capture, so nothing is hidden —
only moved. `--all` restores the old output. Trust-tier and lifecycle distributions still
count them, because those are census figures about the bundle and excluding them would
misreport it.

Rejected: hiding drafts from `index` and `catalog` too. Both answer "what is in this
bundle", a dump is in the bundle, and hiding it is how it gets forgotten.

## `move`

```bash
okfctl move drafts/envoy-gateway decisions/envoy-gateway --by human:matze
```

A concept's id *is* its bundle-relative path (§2), so relocating one renames the thing every
link points at. `move` refuses an existing or reserved target, moves the file, rewrites every
internal link that **resolved to the old id**, regenerates the source and target indexes, and
logs both ids (§9).

Only links that already resolved. A link that was broken beforehand is not this command's to
guess at, and rewriting it would hide a defect `refs` exists to report. The rewrite works
from link-target offsets in the body, and `stripCode` blanks code with spaces rather than
removing it — so offsets stay true and a path inside a shell sample or an inline span is
never touched.

The author's form survives: root-absolute stays root-absolute, relative is recomputed from
the linking document's directory, and the fragment rides along untouched.

**`status`, `verified` and `stale_after` are left alone.** A relocated draft is still a
draft; `promote` is still the act that says someone vouched for it. This is the same
reasoning as `review --outdated`: a command that writes a trust field as a side effect of a
non-trust operation makes the trust field a lie.

Every write is staged and rolled back together, because a relocation that half-happened
leaves a bundle whose links point at a file that is neither here nor there. `--dry-run`
lists the destination, every link rewrite with its file, and every index — not a
convenience, given that the command edits files the user did not name.

Merging a draft into an existing concept stays a skill. Folding prose together is a
judgement, and the same reason `new` leaves content "to whoever has it" applies here.

## `init`

```bash
okfctl init --register
okfctl init --agent claude-code --agent codex --capture-every 5
```

The bundle is not where you work. Registration writes the bundle's absolute path to a
user-level config, because a hook firing in an unrelated repository has no other way to know
where knowledge goes. Bundle resolution then follows a precedence: `--bundle`, then the
nearest enclosing bundle root, then the registered one.

The middle step is the important one. Making capture *always* target the registered bundle
would mean that editing a bundle in one terminal and capturing in another silently writes to
whichever was registered — exactly the class of surprise a knowledge tool cannot afford.
Reads still fall back to the working directory, so nothing changes for anyone who has
registered nothing; writes fail naming the registration command rather than creating a bundle
somewhere unexpected.

### What a hook can and cannot be

A hook is a shell command fired on an event. It has no model, so it cannot summarize a
conversation — one that tried would write garbage into the bundle under an agent's
provenance, a false claim in the sense §7 cares about. So the hook does not capture. It
*prompts*, and the agent decides.

**The event is `Stop`, not `SessionEnd`**, verified against both hosts' documentation rather
than assumed. Claude Code discards session-end hook output except a terminal escape; Codex
calls session-end hooks advisory and says their output "won't steer Codex". Neither can reach
the model. `Stop` fires at turn completion on both, and on both, stdout
`hookSpecificOutput.additionalContext` is injected into the model's context.

**The hook blocks, and that is the point.** Exiting 0 does not give the agent a chance to act
before the turn ends — the context is seen on the *next* turn, and if the session ends there
the knowledge is gone. Holding the turn open is the only way to document what a turn produced
before control returns to the user.

**Blocking must terminate, and the hosts differ.** Codex documents `stop_hook_active` —
"whether this turn was already continued by `Stop`" — so the guard is exact. Claude Code
documents no such flag, and `prompt_id` *changes* on the continuation a block produces, so it
cannot recognize one. There the guard is built: `UserPromptSubmit` arms the session, `Stop`
blocks only when armed and disarms as it blocks, so a continuation finds the session
disarmed. Because that rests on behavior the host does not document, a session circuit
breaker bounds both, and every failure path — unreadable state, unresolvable bundle, an
internal error — ends the turn. A hook that can hold a user in a conversation may only ever
fail open.

**The interval is the user's.** Holding a turn open costs a model round-trip, so
`--capture-every <n>` decides how often, counted per session, defaulting to every turn. The
count lives in user-level state, never in the bundle, which holds knowledge and not scratch.

### Two scopes

Capture must work wherever you happen to be; curation happens where the knowledge lives. So
`okf-capture` installs at user scope and the five curation workflows install **into the
bundle** — `<bundle>/.claude/skills/` for Claude Code, `<bundle>/.agents/skills/` for Codex,
which reads the same `SKILL.md` standard from its own directories.

Putting the curation suite at user scope would load five skills into every session on the
machine to serve work that happens in one repository. Putting capture at project scope would
defeat the feature. A bundle's dotdirs are skipped by the bundle walk, so neither adds a
concept or a conformance error.

The skills are read from the package rather than generated by the installer: they are real
files under `.claude/`, reviewable in a diff and loaded when working on okfctl itself, and a
generated second copy would drift.

### Two hosts, one hook program

Claude Code and Codex converged on the same design: same event names, the same
`event → matcher group → hooks[]` config shape, one JSON object on stdin, and exit 2 to
block. So this is not two adapters — it is **one hook program plus one config writer per
host**, and adding a further host is a config writer, not a new design.

`init --agent` is the only thing `okfctl` writes outside a bundle, and it writes at *user*
level, changing behavior in every repository. That earns a narrow contract: additive,
idempotent, previewable, never destructive, never a rewrite of a config it could not parse,
and removable with `--remove`. Writing into a user's global agent config without an exit is
not a contract, it is a squat.

Hosts with no event mechanism — `copilot`, `agents-md` — receive instructions only, and the
adapter says so. An adapter may not claim a wiring it does not perform.

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

## `catalog`

```bash
okfctl catalog                 # print
okfctl catalog --write         # keep catalog.md at the bundle root
okfctl catalog --check         # CI
```

`index` and `catalog` render the same SPEC §8 entry shape and differ only in scope, so the
entry, the grouping, the pluralization, and the collation live in `core/render.ts` and both
commands call them. What `catalog` adds is one thing `index` cannot say: the bundle as a
whole, grouped by `type` rather than by directory.

Three constraints shaped it.

**Determinism is the whole feature.** `--check` is only worth a CI step if a failure means
someone changed the corpus. So every marker is a function of frontmatter — `draft`,
`deprecated`, `unverified`, `drifted` — and staleness, which is a function of *today*, is
excluded even though `status` computes it and it would be genuinely useful here. A checked-in
catalog that drifts overnight teaches maintainers to ignore the check. `generated.at` is
carried across whenever the rendered body is unchanged, for the same reason the root
`index.md` carries `okf_version` across: a value that moves on every run fails tomorrow and
tells nobody anything. Collation is pinned to `en` rather than the ambient locale, or
generated output would differ between machines.

**Writing a file must not make the bundle non-conformant.** SPEC §3.1 reserves exactly
`index.md` and `log.md`. A bare `catalog.md` at the root is therefore a concept with no
`type` — a §11 error to every consumer that is not us. So the written file carries real
frontmatter (`type: Index`, title, description, `generated`). `Index` is our convention; §4.1
leaves the vocabulary open and §11 forbids rejecting an unknown value, so this is legal, and
the README says plainly that the spec does not name it.

**Generated output is not corpus.** `bundle-model` classifies a bundle-root `catalog.md`
beside `index.md` and `log.md`, so it is not loaded as a concept. Otherwise the catalog lists
itself, the root index lists it twice, and `status` reports okfctl's own output as unverified
knowledge needing review. The exclusion is scoped to the root path — a `guides/catalog.md` is
someone's concept and stays one.

The default is stdout, unlike `index`, which writes. `index` maintains files SPEC §8 already
expects to exist; `catalog.md` is a file we invented, and a bundle should only take on the
obligation to keep one current by choosing to.
