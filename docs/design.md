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
*explicitly provisional*: the document sits in the dumps area precisely to have that answer
revisited, by `refine` or by a human.

Rejected: writing frontmatter-less scratch files. They fail §11 rule one on every file, so
`check` would need an exemption for a directory the spec has never heard of — and every other
OKF consumer, which will not have that exemption, reads the bundle as broken. It is the same
constraint that shaped `catalog.md`: **writing a file must not make the bundle
non-conformant.** It also makes the dumps unusable in exactly the way they are meant to stay
usable — no `type` means no index entry, no catalog row, no citation target.

"Raw" is carried instead by signals that already exist: `status: draft`, an empty `verified`
so the trust tier reads `unverified` (§5.3), a `generated.by` naming the agent rather than a
human, and residence in the dumps area.

`capture` writes the body, which `new` does not. That is the one place a CLI verb authors
content, and it does so only by copying bytes it was handed — no templating, no inference.

**`--by` is required and never defaulted.** The existing skills already hold this line, but
capture is frequent and automatic, so a wrong default would be wrong at scale rather than
once.

### The id is generated, not derived from the title

```
dumps/2026-08-22-45fcb979-1.md
```

The date sorts, the session prefix groups a conversation's captures, and the sequence makes
a collision arithmetically impossible.

Deriving the id from the title looked obvious and was wrong three ways. It is **discarded**:
of the first ten captures filed out of a real bundle, nine were renamed on the way into the
corpus. It **throws away work**: a second capture whose title slugified the same was refused,
so the agent lost the summary it had just written — refusing is right for `new`, which is
protecting an existing concept, but here there is nothing to protect. And it **hardens a
guess**: a concept's id is its bundle-relative path (SPEC §2), so a title chosen in one line
became the string every link and index entry referred to.

**The sequence is read off the disk**, not from the hook's per-session state. A capture run
by hand, in a session where the hook never fired, or after the state directory was pruned
would otherwise pick a sequence already taken. Reading the bundle makes the bundle the only
thing that has to be correct, which is also what makes a retry idempotent.

**A missing session is labelled, never fabricated.** Without `--session` the id reads
`2026-08-22-adhoc-1` and no session is recorded at all. Generating a random identifier and
presenting it as a session would look exactly like a real one in provenance — the specific
failure `new`'s "never invent" rule is about — and the sequence already guarantees
uniqueness, so nothing is bought by faking it.

**The scheme applies wherever the capture lands.** `--to` changes the directory, not the
naming, because a rule with an exception is a rule callers get wrong. `--id` is the single
way to say "I have decided this name", and an `--id` already taken still refuses.

Consequence: the id no longer reads as words, so `okfctl status --dumps` prints the title.
That column is added there (and on `--drafts`, for the same reason) and nowhere else — a
corpus concept's id is meaningful by construction and often says more than its title would.

**Origin goes in `sources[]`.** A bundle collecting knowledge out of a dozen repositories
loses the context a reader most needs without it, and §5.1 is where provenance already goes.
Outside a repository the remote and commit are omitted rather than guessed; capturing from
inside the target bundle records nothing, because a concept does not cite the bundle it
lives in.

The **session** goes there too, as a second entry. The filename carries eight characters of
it and the filename does not survive promotion — that is the premise of the scheme above —
so the durable record has to be in frontmatter. A top-level `session:` key would have been
legal under §11's tolerance for unknown keys, but a key only `okfctl` reads is a signal no
other consumer can act on, which is the same argument that kept `review --outdated` from
inventing a field.

### The dumps and drafts areas

`dumps/` at the bundle root, overridable with `--dumps-dir`; `drafts/` alongside it,
overridable with `--drafts-dir`; both matched by path prefix.

`drafts/` was the raw capture area before `okfctl refine` existed — what `dumps/` is now.
The rename was chosen over adding a differently-named third directory (`staging/` was the
first draft of this design) because the vocabulary was already half right: the code and
spec already called a captured artifact "a dump" throughout, only the *directory* was
misnamed `drafts/`. Reusing `drafts/` for the refined stage also lines the placement axis up
with the trust axis instead of talking past it: an entry sitting in `drafts/`,
un-placed-and-unpromoted, is a draft in both senses at once. The cost is a breaking rename
for any bundle with a populated `drafts/` predating this change — accepted deliberately, see
the README's migration note, rather than papered over with a compatibility shim.

Rejected: a marker file or a bundle-level config, both of which invent a format to hold one
value that has a good default. Rejected also: inferring either area from a `type:` value,
which would overload §4.1's open vocabulary with a lifecycle signal that `status` already
carries.

What the two directories add over `status: draft` is a *different axis*. A draft decision is
placed, typed and shaped; only its trust is pending, and `promote` settles it. A dump is none
of those — its type is a guess, its directory is a parking space, and its body may be three
bullets. A drafts-area entry is in between: `refine` has settled its type and shape, but not
its placement. Three points on one axis, a different axis from trust, and each backlog
worked by a different verb.

`status` reports each as its own inbox rather than in the attention list: every entry in
either is draft and unverified on arrival, so twenty of them bury whatever is actually
rotting. Each inbox line is printed on every unfiltered run with its own count and the age of
its oldest entry, so nothing is hidden — only moved — and the two are never merged into one
line, because collapsing them would hide which backlog is actually growing. `--all` restores
the old, unsegregated output. Trust-tier and lifecycle distributions still count both areas,
because those are census figures about the bundle and excluding them would misreport it.

Rejected: hiding either area from `index` and `catalog` too. Both answer "what is in this
bundle", a dump or a draft entry is in the bundle, and hiding it is how it gets forgotten.

## `refine`

```bash
okfctl refine dumps/gateway-timeout --type Runbook --title "Mitigate gateway timeouts" \
  --by okf-refine/1.0 --stdin --consume
```

Sits between `capture` and `move`/`promote`: it reads one or more dumps-area concepts and
writes a typed, titled concept into the drafts area, the same way `capture` writes a
provisionally-typed one into the dumps area — same "the CLI moves bytes it is handed, no
templating" contract for the body, same required-actor rule (§7).

Two differences from `capture` follow directly from what refining is *for*. First, `--type`
and `--title` are required, with no provisional fallback: capture's whole premise is that
the caller may not know these yet, refine's is that it does. Second, the id is derived from
the title (kebab-cased, matching `okf-ingest`'s convention) rather than generated from a
date and session — a refined title is a real title, not a one-line summary a human will
rename on the way into the corpus, so hardening it into the id is no longer the mistake it
would be at capture time (see "The id is generated, not derived from the title" above).

**Provenance is cited, not copied.** The written concept's `generated.by` names the refiner
— the actor that ran `refine` — never the original dump's producer, because the refiner
authored *this* document even when it is only restating someone else's finding. Each source
consumed becomes a `sources[]` entry naming its id and title (§5.1), so the join back to the
original capture — its own producer, session, and origin — survives through the file that is
still there (or was, before `--consume`). Copying the source's `sources[]` forward instead
was rejected: it denormalizes provenance into two places that can drift, when the citation
alone is a sufficient join.

**Sources are consumed only on request.** `--consume` removes the named sources after a
successful write; by default they are left in place. This was the one place a CLI-side
safeguard was considered and rejected: a raw dump can be split across several `refine`
invocations before every part of it has a home, and the tool has no way to know when a split
is "done" — that is a judgment about document content, not something inferable from
frontmatter. So completeness stays an explicit, opt-in act by the caller (mirroring
`okf-review`'s existing "never delete a draft without confirming" discipline for merges)
rather than something `refine` guesses at.

## Bundle policy

`.okf/policy/`: three user-editable files stating a bundle's own judgment on what's worth
capturing, what makes a citation good enough, and what frontmatter it expects per type —
read by `okf-capture`/`okf-refine`/`okf-ingest`/`okf-review`, never enforced by the CLI.

**Location is `.okf/`, not a plain top-level `policy/`.** `bundle-model` requires every
non-reserved `.md` outside the walk's skip rules to carry `type`/`title` on pain of a
conformance error (SPEC §11) — a plain `policy/` would force these files to either grow
frontmatter they do not need, showing up in `status` as permanently-unverified draft
concepts they are not, or trip `check` on a bundle that scaffolded correctly. `.okf/`
sidesteps this entirely: it is dotfile-prefixed, already excluded from the walk by the
same rule that already protects `.claude/` and `.agents/`, so these files get the same
frontmatter-free freedom `.claude/`'s installed `SKILL.md` files already have. Not
`.claude/` or `.agents/` themselves, because this content belongs to the bundle and its
lifecycle — a Codex session and a Claude Code session both need to read the same policy,
and neither host's own dotfile directory is the right shared home for it.

**Three files, not one.** Capture/refine's "what's worth saving" question, review's
"what's a good citation" question, and ingest's "what fields does this type need"
question are different enough in scope and audience that one file either grows unwieldy
or a skill has to skip past sections meant for another. Each of the three is short enough
to read in full on every invocation — the point, since a skill should not need to grep a
policy file for its relevant section.

**Seeded with real content, never overwritten** — the same idempotency
`index.md`/`log.md`/`dumps/`/`drafts/` already have. `content-policy.md`'s starter content
restates `okf-capture`'s existing "what counts as durable" categories as editable bundle
policy rather than skill instructions, so a fresh bundle's policy already encodes today's
generic judgment and editing it means narrowing or extending a real starting point, not
writing one from a blank file. `source-policy.md` and `field-policy.md` are seeded the
same way, from `okf-review`'s source-checking guidance and `okf-ingest`'s
type/placement-matching guidance respectively.

**Policy narrows or extends; it never overrides the hard guardrails.** Every skill that
reads `.okf/policy/` says this explicitly rather than leaving it implied: policy can make
the bar for capture stricter, raise what counts as a sufficient citation check, or add
bundle-specific field requirements. It cannot touch actor honesty, the
CLI-is-the-only-writer rule, or any provenance-carryover guarantee `okf-refine`/
`okf-review` already enforce — those guardrails do not originate from policy, and a
user-editable file is exactly the kind of thing a future edit could accidentally weaken if
the boundary were only implied.

**`okf-ingest`'s no-corpus fallback moved from a concept to `field-policy.md`.** A bundle
with no corpus yet has no convention to match, and the first concept filed invents one —
previously that answer was recorded as a corpus concept, which put a process decision
("how does this bundle organize itself") in the same place as knowledge decisions ("what
is true about the system this bundle describes"). `field-policy.md` is the more honest
home: it exists precisely to answer the first kind of question, and the next `okf-ingest`
run already checks it first.

**Not a machine-enforced schema, and not a new CLI verb.** `field-policy.md` states what a
bundle expects; nothing in `okfctl` validates a concept against it or fails `check` over
it — SPEC §11 forbids a conformance rule beyond its three, and per-type field conventions
are exactly the kind of bundle-specific judgment that stays advisory on purpose. Reading
`.okf/policy/*.md` is a skill-level `Read` call, not a command: there is no actor to
validate, no log entry, and no dry-run preview to write, because nothing here is a
frontmatter change.

## Machine-readable output

`status`, `check`, `refs`, and `search` share one rendering path, `renderOutput(data,
format)`, instead of each writing its own `JSON.stringify` branch — a new command adopts it
by calling one function. `table` is never routed through it: table format stays each
command's own hand-written human output, because a generic tabulator would be a regression
relative to a report already tuned to what that command reports.

`--json` predates `--format` and stays exactly as it was — a permanent alias for `--format
json`, not a deprecated one. Rejected: sunsetting it in favor of `--format` alone. It costs
nothing to keep both, three commands' worth of muscle memory already depends on it, and
`--format` is strictly more general (it also reaches `yaml`) rather than a replacement with
different behavior.

YAML rides along because the `yaml` package is already a dependency for frontmatter — the
marginal cost of a second serializer was low enough not to defer it to a later change, unlike
a feature that would have needed real design work of its own.

## `search`: two ways to ask

`--match all` (the default) is a lookup — every term, falling back to the best partial
overlap; `--match any` is a similarity question, ranked by how much overlaps. The mode
existed internally before it was reachable, which meant the only way to ask the second kind
of question was to not have it answered.

The default is right when the caller knows the bundle's vocabulary and wrong when it does
not, which is the usual reason to search at all. Measured on a real bundle: `CNPG Authentik
primary restart` returns the entry that answers it at rank 1; `authentik database failover
interruption` — the same question in the words someone would actually ask it — returns a
different document and no sign the right one exists. `--match any` reaches it. Search is
lexical, so a miss is weak evidence of absence, and an empty lookup names the loose mode
rather than leaving the caller to conclude the bundle is silent.

**Filters narrow the search, not its results.** Area, tier, type and tag are applied inside
the cascade rather than to whatever it settled on. Applied afterwards, an ineligible
document could end an attempt and take the whole query with it: `--tier human-reviewed`
would come back empty while a human-reviewed concept that a looser attempt would have found
sat right there — which is exactly the narrowing `okf-recall` recommends.

### Area, trust tier, and the ranking boost

Extends the `search` capability (see the `add-search-command` change this built on) with two
things every consumer asked of ranked search over a corpus that mixes raw dumps, refined
drafts, and settled corpus knowledge in one query: know which is which, and let it affect the
order.

**Area and trust tier are read at query time, from `health()` — the same function `status`
already computes per concept — and `inDumps`/`inDrafts`.** No new derivation logic, no new
stored signal: both were already computable per-concept, `search` just started reporting
them per hit, in table and structured output.

**Ranking applies a soft boost, not a hard sort key.** A hard sort key — every `human-
reviewed` result above every `unverified` one, regardless of relevance — was the first
design and was rejected: it lets a weakly relevant but well-trusted concept bury a strongly
relevant dump, which is the exact opposite failure from the one motivating this feature (a
lucky keyword match in a provisional dump outranking a human-reviewed decision on the same
query, with nothing in the output to say so). The chosen boost multiplies MiniSearch's
relevance score — `human-reviewed` ×1.5, `machine-confirmed` ×1.2, `unverified` unchanged —
the same style the existing `title`/`description`/`tags` field boost already uses. The
multipliers are implementation constants next to that existing `BOOST` table, not a spec-level
contract: the spec only requires the direction (higher trust ranks higher, all else being
equal) and that a clearly stronger relevance match can still win regardless of trust tier.

**Nothing about what `search` already returned changed.** It searched `dumps/`, `drafts/`,
and the corpus together before this change too; the only difference is that a hit's area and
trust tier are now visible in the output instead of being an undocumented fact a caller had
to already know to interpret a result correctly.

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

**Both directions, not just inbound.** A relative link is measured from the directory the
linking document sits in, so moving a document across a depth boundary breaks every one of
its *own* relative links — `move drafts/x ops/runbooks/`, the path `okf-review` is told to
use to empty the drafts inbox, wrote a concept whose links resolved before the move and not
after. The same three rules apply going out: only links that already resolved are touched, a
root-absolute target already addresses the bundle root and is left alone, and a bare
`#fragment` addresses the document itself and travels with it. A link whose recomputed form
is what is already written is not rewritten at all, so a same-depth move leaves the file
byte-identical rather than churning it. `--dry-run` counts the outbound rewrites alongside
the inbound ones.

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

**The hook blocks, and that is the point.** Emitting context without blocking does not give
the agent a chance to act before the turn ends — the context is seen on the *next* turn, and
if the session ends there the knowledge is gone. Holding the turn open is the only way to
document what a turn produced before control returns to the user.

**It blocks with a decision, not an exit code.** Both hosts accept `exit 2` with the reason
on stderr, and both also accept `{ "decision": "block", "reason": … }` on stdout. The second
is the right one: stderr is the error channel, the host renders it as a hook failure, and an
advisory prompt asking whether anything was worth writing down is not a failure. So the hook
**always exits 0** — which also means no exit status can ever hold a user in a conversation,
independent of the guards below. `"continue": false` is deliberately not used: it is stronger
than a block and halts processing entirely.

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

### Three hosts, one hook program

Claude Code, Codex, and Copilot converged on the same design: same event names (Copilot's
`Stop` registration emits the same snake_case payload shape Claude Code and Codex already
use — registering under `agentStop` instead would not), one JSON object on stdin, and the
same `decision: block` response. So this is not three adapters — it is **one hook program
plus one config writer per host**, and adding a further host is a config writer, not a new
design. The config *shape* still varies: Claude Code and Codex share the
`event → matcher group → hooks[]` nesting and a config file merged with unrelated host
settings; Copilot's is flatter (`event → hooks[]` directly) and lives in a file `okfctl`
owns outright rather than merges into, so it gets its own config writer,
`flatHookPlan`, alongside `jsonHookPlan`.

`init --agent` is the only thing `okfctl` writes outside a bundle, and it writes at *user*
level, changing behavior in every repository. That earns a narrow contract: additive,
idempotent, previewable, never destructive, never a rewrite of a config it could not parse,
and removable with `--remove`. Writing into a user's global agent config without an exit is
not a contract, it is a squat.

Hosts with no event mechanism — currently only `agents-md` — receive instructions only, and
the adapter says so. An adapter may not claim a wiring it does not perform.

## `update`

```bash
okfctl update
```

Refreshes exactly the hosts already installed for a bundle, without the caller naming
`--agent` — the gap `init` left open: every skill and hook changes as `okfctl` changes, and
the only way to pick that up before this command existed was remembering exactly which
`--agent` flags were used originally and re-running `init` by hand, which also silently
reset `--capture-every` back to the default unless the caller remembered to pass it again.

**Detection checks what only an install creates, never a config file's bare existence.**
Each adapter gained `isInstalled(context)`, checked against the distributed capture-skill
file (hook hosts) or the upserted `<!-- okfctl:capture -->` section marker
(instructions-only hosts) — never against `~/.claude/settings.json` or `~/AGENTS.md`
existing, since both commonly predate and have nothing to do with `okfctl`. For a hook
host, "installed" further requires a curation skill to exist inside *this* bundle
specifically, not merely that the host is wired somewhere on the machine — capture is
shared at user scope across every bundle, so checking only the user-scope artifact would
make `update <bundle>` write curation skills into a bundle that host was never wired to at
all, silently doing `init`'s job under `update`'s name.

**The installed interval is read back, not reset.** `--capture-every` is not stored as a
separate field anywhere; it lives only inside the hook command string
(`okfctl hook <host> --every <n>`) that `isOurs()` already recognizes for idempotent
reinstall. `installedInterval` opens the same config, finds that entry, and regexes the
digits back out — `null` when unparseable, which `update` treats as "use the tool's
default" rather than a refusal. Considered storing the interval as a second, structured
field alongside the command string: rejected, because the command string still has to
carry `--every <n>` for the hook program itself to read at runtime, and keeping two
representations of the same fact in sync is exactly the kind of drift this command exists
to close elsewhere, not introduce here.

**Scoped narrower than `init` on purpose.** `update` never scaffolds `dumps/`/`drafts/`/
`.okf/policy/`, never touches registration, and never installs a host `isInstalled` finds
false — the same "only take back what you find, nothing more" discipline `init --remove`
already applies to removal, applied here to refreshing instead. A `--refresh` flag on
`init` itself was considered and rejected: `init`'s positional `[dir]` argument already
carries scaffolding side effects that have no place in a refresh, and a flag that changes
which side effects a command has depending on what else is passed is the kind of implicit
mode-switching this tool avoids everywhere else (`review`'s `--confirm`/`--outdated` are
separate outcomes, not one command inferring which was meant).

### Removal is per bundle

Curation skills belong to the bundle they were installed into; capture, recall and the hook
are shared by every bundle on the machine. `--remove` could not tell those apart, so
removing a host in one bundle deleted the shared half out from under every other bundle
wired to it — which then looked wired, with its curation skills still in place, and silently
never captured again.

So `okfctl` records which bundles each host is wired to, in its user config. Removal drops
this bundle from that list and takes back the shared half only when the list is then empty;
otherwise it removes this bundle's curation skills and names the bundle still holding the
rest. A host wired before that record existed has no other bundle it can name, so it removes
in full, as documented — the registry can only ever make removal *less* destructive than it
was.

The interval lookup had the same shape of bug: a host list in `update`, which `copilot` was
never added to, so every refresh silently reset it to prompting on every turn. The config
path now comes off the adapter that writes it, and a test asserts every hook-capable
adapter reports one — the same reasoning as reading continuation support off the hook
payload instead of a hardcoded host list.

## The curation gap

Capture is automatic — a hook fires in every repository — and every step after it (refine,
move, review, promote) is a person invoking a workflow. Those two rates are not the same,
and nothing in the design made the difference visible: each count looks reasonable on its
own while the corpus fills with material `okf-recall` is bound to read as leads rather than
knowledge. A bundle developed this way reached 79% unplaced, with one citable concept in it.

Two changes, both small, both aimed at the ratio rather than at either count:

- **`status` prints a Backlog line** when the holding areas together outweigh the corpus,
  naming the verb that changes it. Quiet until the ratio inverts, for the same reason the
  advisory tier stays narrow: a line that always prints is a line nobody reads. It is not
  an attention-list entry — an unrefined dump is not rotting.
- **`okf-capture` searches before it writes.** One search, to catch the case where the
  bundle already holds the finding. A duplicate dump is not a tidy-up someone does later,
  it is permanent backlog, and two captures of one finding split the search results for it
  so that both are harder to find than either alone.

What was considered and not done: gating the hook on transcript size or duration. The
payload carries `transcript_path`, so a cheap "did this turn do enough to be worth asking
about" test is possible in principle — but the transcript format is the host's, undocumented,
and differs per host, and a hook that misreads one fails toward either silence or noise in
every repository at once. `--capture-every` remains the knob.

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
