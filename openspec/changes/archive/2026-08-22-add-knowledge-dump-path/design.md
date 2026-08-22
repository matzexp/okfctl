## Context

See proposal.md — Why. What matters for the approach:

- A concept's **id is its bundle-relative path** (`bundle-model`). Nothing else identifies
  a concept, so moving a file is a rename of the thing every link points at.
- `core/refs.ts` already resolves internal links against the bundle's own contents and
  classifies them `resolved` / `unresolved` / `anchor-missing`. It reads them; it has never
  rewritten one.
- **SPEC §11 is a hard ceiling** (openspec/config.yaml). Conformance is three rules; a
  document missing `type` is an error *to every consumer*, not just to us. Anything this
  change writes has to clear that bar on the first write.
- `docs/design.md` — "Writing a file must not make the bundle non-conformant" — already
  settled this shape once, for `catalog.md`.
- `okfctl` has no bundle-level configuration file and no concept of a host toolchain. Both
  are introduced, or avoided, by this change.

## Goals / Non-Goals

**Goals:**

- Capture costs one command and no decisions the author cannot yet make.
- A captured dump is legible to consumers that have never heard of `drafts/`.
- Emptying the drafts area is a first-class, logged operation rather than a `git mv` and a
  hope.
- An agent host is wired up by `init` only to the extent `okfctl` can actually wire it.

**Non-Goals:**

- **No summarization inside `okfctl`.** The CLI never reads a transcript and never calls a
  model. Summarizing is the agent's job; `capture` receives prose and writes a file.
- **No new conformance error tier.** Nothing in this change can make `check` fail on a
  bundle that passed before.
- **No merge engine.** Folding a draft into an existing concept is a prose judgement
  (design.md, `new`: "the content [is left] to whoever has it"). It stays a skill.
- **No bundle-level configuration format.** A *user-level* config now exists (decision 7)
  to record the registered bundle, but nothing is written inside a bundle to configure it.

## Decisions

### 1. A dump is a conformant concept, not a scratch file

The user described these as "scratch files". They are stored as fully-formed OKF concepts
anyway — `type`, `title`, `status: draft`, `generated`, no `verified`.

Rejected: frontmatter-less Markdown in `drafts/`. It fails SPEC §11 rule one on every file,
so `okfctl check` would have to grow an exemption for a directory the spec has never heard
of, and every other OKF consumer — which will not have that exemption — reads the bundle as
broken. That trades a real, portable property for a few saved keystrokes. It also makes the
dumps unusable in exactly the way the user asked them to remain usable: no `type` means no
index entry, no catalog row, no citation target, no `status` line.

"Raw" is therefore carried by three signals that already exist and one that is new:
`status: draft`, an empty `verified` (so trust tier reads `unverified`, SPEC §5.3), a
`generated.by` naming the agent rather than a human, and residence in the drafts area.

**What the directory adds that `status: draft` does not.** A `drafts/` concept and a
`decisions/` draft are both untrusted, but they differ in *what is undecided*. A draft
decision is placed, typed and shaped; only its trust is pending, and `promote` settles it.
A dump is none of those things — its type is a guess, its directory is a parking space, and
its body may be three bullet points. That is a different backlog worked by a different
verb, which is the whole justification for both the directory and `move`.

### 2. The drafts area is a convention, overridable by a flag

`drafts/` at the bundle root, changeable with a global `--drafts-dir <path>`. It is
identified by path prefix, so `drafts/infra/gateway` is in the area.

Rejected: a marker file or a bundle config. Both invent a format to hold one value that has
a good default. Rejected also: inferring it from `type: Draft` — that overloads §4.1's open
type vocabulary with a lifecycle signal, and `status` already carries lifecycle.

Consequence: `drafts/` is a directory `okfctl` treats specially. That is stated in the
README rather than enforced — a bundle that has a `drafts/` full of ordinary concepts is
still conformant, still checked, and still indexed. The only behavior the area changes is
`status` grouping and the `capture` default target.

### 3. `capture` is `new` with the placement questions deferred

```bash
okfctl capture --title "Envoy replaces Traefik at the edge" --by claude-code/2.1 --stdin
okfctl capture --title "..." --type Decision --to decisions/    # placement already known
```

`new` requires `--type` because §11 does. `capture` still writes a `type` — it defaults to
a bundle-level `Note` when the caller has no better answer, and accepts `--type` when it
does. Defaulting rather than requiring is the difference between the two verbs, and it is
justified because the type is *explicitly provisional*: the dump sits in the drafts area
precisely to have that answer revisited.

`capture` writes the body, which `new` does not. This is the one place a CLI verb authors
content, and it does so only by copying bytes it was handed on stdin — no formatting, no
templating, no inference.

Rejected: `okfctl new drafts/x --type Note` with skill guidance and no new verb. It works
today, and it is what the ingest skill would do. But it makes the low-ceremony path the
*longer* command, and it gives the hook nothing stable to call.

### 4. `move` relocates and nothing else

```bash
okfctl move drafts/envoy-gateway decisions/envoy-gateway --by human:matze
```

1. Resolve both ends. Refuse if the target exists — same no-overwrite rule as `new`, same
   reason: an overwrite here destroys knowledge silently.
2. Move the file. The id changes with it.
3. Rewrite every internal link in the bundle that **resolved to the old id**, to the new
   one. Only resolved links: a link that was already broken is not this command's to guess
   at, and rewriting it would hide a defect `refs` is there to report.
4. Regenerate the `index.md` of the source and target directories.
5. Append a log entry to the nearest `log.md` (SPEC §9), naming both ids.

`status`, `verified` and `stale_after` are untouched. A relocated draft is still a draft;
`promote` is still the act that says someone vouched for it. This mirrors the reasoning in
docs/design.md for `review --outdated`: a command that writes a trust field as a side
effect of a non-trust operation makes the trust field a lie.

**Frontmatter is rewritten through the YAML document model**, as every other writing verb
is, so a `move` that changes nothing in frontmatter still preserves unknown keys.

`--dry-run` reports the destination, the link rewrites, and the index regenerations without
writing. Given that step 3 edits files the user did not name, the preview is not a
convenience.

### 5. Merge is a skill, not a verb

`okf-review` grows a third route for drafts: relocate (`move`), or merge — read the draft,
read the target concept, fold the content in by hand, log it, delete the draft. The CLI's
part is `move`, the log entry, and `refs --broken` to catch what the deletion orphaned.

The merge path deletes a concept without deprecating it. That is correct: a dump folded
into `decisions/envoy-gateway` was never knowledge in its own right, and `deprecate` is for
knowledge that was true and stopped being so. The skill must confirm before deleting, and
the log entry is what preserves the fact that it happened.

### 6. `status` reports drafts as an inbox, not as attention

Today `status` flags a concept when it is stale, drifted, draft, or unverified. Every
captured dump is two of those on arrival, so twenty dumps bury whatever is actually rotting.

The drafts area becomes its own line — `inbox: 14 captured` — and its concepts leave the
default attention list. `--drafts` lists them; `--all` restores the pre-change behavior for
anyone who wants it. Trust-tier and status distributions still count them, because those
are census figures about the bundle and excluding them would misreport the bundle.

Rejected: excluding drafts from `index` and `catalog` as well. `catalog --check` is a CI
gate whose value is determinism, and both documents answer "what is in this bundle" — a
dump is in the bundle, and hiding it is how it gets forgotten. The user chose segregation
in `status` only.

### 7. One registered bundle, wired into the agent globally

The bundle is not where you work. You work in a dozen repositories and the knowledge from
all of them belongs in one place. So `init` does two separable things:

```bash
okfctl init                 # scaffold a bundle here
okfctl init --register      # ...and make it *the* knowledge base for this machine
okfctl init --agent claude-code --agent codex   # ...and wire the hosts to reach it
```

**Registration** writes the bundle's absolute path to a user-level config
(`$XDG_CONFIG_HOME/okfctl/config.json`, falling back to `~/.config/okfctl/config.json`).
That file holds one setting today. It exists because a hook firing in an unrelated
repository has no other way to know where knowledge goes.

**Bundle resolution** therefore gains a precedence chain, and every command follows it:

1. `--bundle <path>`, when given.
2. The nearest bundle root walking up from the working directory — so inside a bundle, the
   bundle you are standing in wins. Working *on* a bundle must never write into a different
   one.
3. The registered bundle.
4. No bundle: commands that read report it, and `capture` fails telling you to run
   `okfctl init --register`.

Rejected: making capture always target the registered bundle. It would mean that editing a
bundle in one terminal and capturing in another silently writes to whichever was registered,
which is exactly the class of surprise a knowledge tool cannot afford.

Registering a second bundle replaces the first and says so. There is one knowledge base per
machine by design — a chooser is a feature for a user who has asked for it.

**A dump records where it came from.** Capturing from `~/work/payments-api` into a central
bundle loses the one piece of context the reader most needs. So a captured concept records
the originating working directory, and its git remote and commit when there is one, in
`sources[]` (SPEC §5.1). That is what `sources[]` is for, and it costs nothing at capture
time.

### 7a. `init --agent` writes outside the bundle, under an explicit contract

`--agent <host>` installs the capture workflow into a coding agent's **user-level**
configuration, because the point is to capture from every repository, not from the bundle's
own. This is the first time `okfctl` writes to a path it does not own, so the contract is
narrow:

- **Never destructive.** Files are created; existing files are merged additively or left
  alone with a message. A host config is read, one hook entry added, written back through a
  model that preserves everything else.
- **`--dry-run` prints every path and every edit.** It is the documented way to run it.
- **Idempotent.** Re-running installs nothing twice.
- **Adapters may not claim a wiring they do not perform.** Each adapter reports exactly
  what it installed and what the host does not support.
- **Uninstallable.** `init --agent <host> --remove` takes back exactly what was installed,
  at both scopes. "Exactly" includes the husks: a config or instructions file left with
  nothing in it existed only to hold what we put there, so it is deleted rather than left
  empty, and directories installation created are pruned when they empty. A file still
  holding the user's own settings keeps the file alive. Writing into a user's global agent
  config without an exit is not a contract, it is a squat.
- **It unwires agents, not knowledge.** Removal never touches the bundle's own files.

**What a hook can and cannot be.** A hook is a shell command fired on an event. It has no
model, so it cannot summarize a conversation — a hook that tried would write garbage into
the bundle under an agent's provenance, which is a false claim in the sense SPEC §7 cares
about. So the hook does not capture. It *prompts*: it emits text asking the agent to run the
capture workflow if the session produced anything durable, and the agent — which does have a
model and does have the transcript — decides and writes.

**The event is `Stop`, not `SessionEnd`.** This was verified against both hosts' current
documentation rather than assumed. On Claude Code, `SessionEnd` output is discarded except
for a terminal escape sequence; on Codex, session-end hooks are explicitly advisory and
"won't steer Codex". Neither can reach the model, which makes both useless for prompting.
`Stop` fires at turn completion on both, and on both, stdout JSON
`hookSpecificOutput.additionalContext` is injected into the model's context. So `Stop` it is.

**The hook blocks, and that is the point.** Exiting 0 with `additionalContext` does not
give the agent a chance to act before the turn ends — the context is seen on the *next*
turn, and if the session ends there the knowledge is gone. Holding the turn open is the
only way to document what a turn produced before control returns to the user. So the hook
blocks: `exit 2` on Claude Code, a block decision on Codex.

**Blocking must terminate, and the hosts differ.** A hook that blocks every turn otherwise
loops forever, because the block produces a continuation that itself ends in a turn.

- **Codex** documents `stop_hook_active` on the `Stop` payload — "whether this turn was
  already continued by `Stop`". The guard is exact: block only when it is false.
- **Claude Code** documents no such flag, and `prompt_id` *changes* on the continuation a
  block produces, so it cannot be used to recognize one. The guard is therefore built: a
  `UserPromptSubmit` hook arms the session on genuine user input, and the `Stop` hook blocks
  only when armed, disarming as it blocks. A continuation the hook caused finds the session
  disarmed and lets the turn end.

Because the second guard rests on behavior the host does not document, a **circuit breaker**
bounds both: more than a fixed number of blocks within a fixed window in one session and the
hook stops blocking for that session and says why. Every failure path — unreadable state,
unresolvable bundle, an internal error — ends the turn. A hook that can hold a user in a
conversation may only ever fail open.

**The interval is the user's, not ours.** Holding a turn open costs a model round-trip, so
how often that happens is configured at install time: `--capture-every <n>` prompts on every
nth completed turn, counted per session, defaulting to every turn. The count lives in the
same user-level state as the arming marker — never in the bundle, which holds knowledge and
not scratch.

**Two hosts, one hook program.** Claude Code and Codex converged on the same design: same
event names, the same three-level `event → matcher group → hooks[]` config shape, one JSON
object on stdin, `hookSpecificOutput.additionalContext` on stdout, exit 2 to block. So this
is not two adapters. It is **one hook program plus one config writer per host**, and the
adapter interface is shaped accordingly — a `plan()` returning paths and edits, over a
shared hook binary.

### Two scopes, because the workflows are not used in the same place

Capture must work wherever you happen to be; curation happens where the knowledge lives. So
installation writes to two scopes, not one:

| | Claude Code | Codex |
|---|---|---|
| **user** — `okf-capture` | `~/.claude/skills/`, `~/.claude/commands/okf/` | `~/.agents/skills/` |
| **project** — triage, ingest, promote, review, deprecate | `<bundle>/.claude/skills/`, `<bundle>/.claude/commands/okf/` | `<bundle>/.agents/skills/` |
| hook | `~/.claude/settings.json` | `~/.codex/hooks.json` |

Putting the curation suite at user scope instead would load five skills into every session
on the machine to serve work that only happens in one repository. Putting capture at project
scope would defeat the whole feature.

Codex loads skills from `.agents/skills` at repository scope and `~/.agents/skills` at user
scope, and reads the same `SKILL.md` standard, so the suite is authored once and placed
twice. It has no slash-command equivalent, so it gets skills only and the adapter says so.

A bundle's `.claude/` and `.agents/` directories are invisible to `loadBundle`, which skips
dotfiles — so installing into a bundle adds no concepts, no index entries, and no
conformance errors.

The skills are **read from the package**, not generated by the installer. They are real
files under `.claude/` in the repository, which is what makes them reviewable in a diff and
loaded when working on okfctl itself; generating a second copy inside the installer would
give the suite two sources that drift apart.

| Host | Installs | Event hook |
|---|---|---|
| `claude-code` | hook entries, capture at user scope, the curation suite in the bundle | yes — `Stop` |
| `codex` | hook entry, `AGENTS.md` guidance, capture at user scope, the curation suite in the bundle | yes — `Stop` |
| `copilot` | instructions describing the capture workflow | no — the host has no equivalent event mechanism, and the adapter says so |
| `agents-md` | an `AGENTS.md` section, for any host that reads it | no |

The portable core is `okfctl capture` plus the prompt contract; adapters are thin. Adding a
host later is a config writer, not a new design.

### 8. Provenance on a dump is the agent, always

`generated.by` on a captured concept names the producer that wrote it — `claude-code/2.1`,
never `human:matze`, even when the human said the thing being captured. The existing skills
hold this line already ("Never invent an actor"); the difference here is that capture is
frequent and automatic, so a wrong default would be wrong at scale. `capture` requires
`--by` and does not guess it; the adapters fill it in with the host's own identifier.

## Risks / Trade-offs

- **The drafts area becomes a landfill.** Capture is cheap, review is not, and an inbox
  that is never emptied is worse than no inbox because it launders "we wrote it down" into
  "we know it". → `status` names the inbox count on every run so it cannot be invisible;
  the triage skill treats a growing inbox as a finding.
- **`move` edits files the user did not name.** A wrong link rewrite corrupts prose. →
  Only links that already resolved to the old id are touched, the rewrite is textual and
  scoped to link targets, `--dry-run` lists every file, and the operation is a git diff away
  from being reviewed.
- **Segregating drafts from attention hides real problems.** A concept parked in `drafts/`
  for a year is a problem the default view no longer shows. → The inbox count is always
  printed; the drafts spec requires the oldest capture's age alongside it, so an aging
  inbox is visible without a filter.
- **Host adapters rot.** Agent configuration formats change faster than this tool will. →
  Adapters are additive and idempotent, so a stale adapter fails to install rather than
  corrupting a config; the hook contract is a prompt, which no format change invalidates.
- **`init --agent` surprises someone.** Writing into a user's global agent configuration
  from a knowledge tool is unexpected, and it changes behavior in every repository they
  open. → It is opt-in behind a flag, previewed by `--dry-run`, never destructive, and
  removable with `--remove`.
- **The hook fires in repositories that have nothing to do with knowledge.** A global
  install means every session in every repo gets the prompt. → The agent declines silently
  when a turn produced nothing; the workflow's own rule is that an empty inbox beats a noisy
  one. `--capture-every` sets how often it is even asked.
- **Blocking costs tokens on every prompt.** Holding a turn open spends a model round-trip
  whether or not anything is captured. → `--capture-every <n>` is the knob, reported at
  install so the cost is never a surprise; the circuit breaker bounds the worst case.
- **A blocking hook can trap the user.** This is the one failure in this change that a user
  cannot easily escape. → Two independent guards — per-host loop detection and a session
  circuit breaker — plus an absolute rule that every error path ends the turn.
- **Knowledge leaks between contexts.** Capturing from a client repository into a central
  personal bundle can move material that should not move. → The dump records its origin, so
  a misplaced capture is visible rather than anonymous, and `--bundle` scopes any single
  capture elsewhere. Anything stronger is the user's policy, not this tool's.
- **The registered bundle is stale or gone.** A path in a user-level config outlives the
  directory it names. → Capture fails naming the missing path and the command to re-register
  rather than recreating a bundle somewhere unexpected.
- **`type` defaulting weakens the one field §11 requires.** A bundle of `Note` teaches
  nothing. → The default applies only inside the drafts area, and `move` is the moment the
  type is reconsidered; the review skill is required to set a real type before relocating.

## Migration Plan

Additive throughout. Existing bundles gain nothing until `init` or `capture` runs; existing
verbs are unchanged; no on-disk format changes inside a bundle.

Bundle resolution gains steps 2 and 3 of decision 7's precedence chain. Both are additive:
an explicit `--bundle` behaves exactly as it does today, and a user with no registered
bundle sees no change.

`init --agent` writes into user-level agent configuration. It is opt-in, previewable, and
reversed by `init --agent <host> --remove`.

The one behavior change to an existing command is `status` dropping drafts-area concepts
from the default attention list. It affects only bundles that already have a `drafts/`
directory, and `--all` restores the old output.

## Open Questions

- Whether `capture` should accept a `--tags` free-form list that the review step is expected
  to normalize, or refuse tags until placement is decided. Deferrable — it changes one flag.
