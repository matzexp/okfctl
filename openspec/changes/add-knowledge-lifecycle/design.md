## Context

See proposal.md — Why. The relevant current state is mechanical:

- `src/commands/transition.ts` already holds the write path every mutating verb needs —
  actor validation, the conformance gate, the round-trip serialize, the nearest-`log.md`
  append, and `--dry-run` — but holds it as a private `commit()` inside that one file.
- `src/core/concept.ts` can edit and serialize a parsed concept, and `parseConcept` is the
  only route into a `Concept`. There is no route that starts from nothing.
- `promote` on an already-stable concept prints "Verification" and re-verifies. The
  behavior the review verb needs exists; what it lacks is a name and an outcome other than
  success.
- The `openspec-*` skills in `.claude/skills/` are the shape to copy: a description written
  for selection, `allowed-tools` scoped to one CLI, numbered steps, and a guardrails list.

The SPEC §11 constraint from the project context binds one decision here directly — see
"Outdated writes only `stale_after`" below.

## Goals / Non-Goals

**Goals:**

- One write path shared by `new`, `review`, `promote`, and `deprecate`, so a fifth verb
  cannot forget the log or the dry-run.
- Frontmatter produced by `new` that is indistinguishable in shape from the hand-written
  documents already in the development bundle.
- Skills that fail loudly when the CLI would, rather than working around it.

**Non-Goals:**

- Type-specific body templates. OKF defines an open `type` vocabulary (§4.1); shipping a
  scaffold per type would invent structure the format does not have, and be wrong for every
  producer whose types we did not guess.
- Interactive prompting inside the CLI. The skills ask the questions; the CLI stays
  non-interactive and scriptable.
- A `supersede` verb. Deferred — see the third decision below.

## Decisions

### Review is a separate verb, not a flag on `promote`

`okfctl promote --outdated` would be a verb whose name asserts the opposite of what the
flag does. Splitting gives each verb one postcondition: after `promote`, the concept is
`stable`; after `review --confirm`, the concept is verified as of now and its status is
whatever it already was.

The overlap between `promote` and `review --confirm` is real and stays: promotion still
appends a `verified` entry, and re-promoting a stable concept remains a legal way to
re-verify. Removing that would break a documented path for no gain. The README will say
plainly that `review --confirm` is the verb to reach for and re-promotion is the older
spelling.

*Alternative considered:* fold both into `verify`, and have `--stable` move the status.
Rejected — it makes the common draft→stable move the flagged case.

### Outdated writes only `stale_after`, set to today

An outdated finding needs somewhere to live in the frontmatter, and OKF v0.2 has no field
for it. Three candidates:

1. A new `review:` or `outdated:` key. Rejected: SPEC §11 tolerates unknown keys, so it
   would be *legal* — but no other OKF consumer would read it, and a signal only our tool
   understands is a signal the ecosystem cannot act on. The project's own rule against
   inventing beyond the spec applies most sharply to the frontmatter surface.
2. Flip `status` back to `draft`. Rejected: §5.4's `draft` means not yet trusted, not
   trusted-and-since-broken. It also silently discards the concept's real state.
3. Set `stale_after` to today. Chosen: §5.5 defines stale as `today >= stale_after`, so
   this makes the concept report stale immediately, through the one field that already
   means "do not rely on this without checking". `status --stale` picks it up with no new
   code, and every other OKF consumer reads it correctly.

The cost is that an outdated concept is indistinguishable from one that simply aged out.
The log entry carries that distinction, which is what §9's narrative log is for.

### `verified` is untouched on an outdated review

Tempting to append `{ by, at }` to record *that someone looked*. Wrong: §5.3 derives the
trust tier from `verified`, so appending a human actor would raise the tier of a concept
the human just found wrong. The review is recorded in the log; the frontmatter claims
nothing.

### Extract the write path into `src/core/commit.ts`

Move `commit()` out of `transition.ts` into core, taking the concept, the rendered
contents, the log entry, and the display info. `new` needs the same log-and-dry-run
handling but writes a file that does not exist yet, so the helper takes the target path
rather than reading it off a loaded concept.

The conformance gate does **not** move into the helper: `promote` blocks on errors,
`deprecate` does not (you must be able to retire a broken concept), and `new` cannot check
a file it has not written. It stays an explicit call in the verbs that want it.

### `new` builds frontmatter through the YAML document model

Not by string-concatenating a block. `serializeConcept` already renders a `Document` with
the project's flow-mapping conventions, and building a `Document` from an object and
handing it to the same serializer means `new` and `promote` produce identical formatting —
no second formatter to keep in sync.

Key order follows the bundle's existing documents: `type`, `title`, `description`, `tags`,
`status`, `generated`. Fields the caller did not supply are omitted rather than written
empty; an empty `description:` is worse than an absent one, because `check` warns on absent
and silently accepts blank.

The body is a single `# <title>` heading and nothing else.

### The bundle root, not the current directory, in skills

Every skill resolves `--bundle` explicitly before its first command. The CLI defaults to
`.`, which is right for a maintainer standing in the bundle and wrong for an agent standing
in a repo that contains one.

### Five skills, one per moment, with triage read-only

`okf-ingest`, `okf-promote`, `okf-deprecate`, `okf-review`, `okf-triage`, each with a
`/okf:<name>` command file. Triage exists because "how is this bundle doing" is the most
common question and the one most likely to be answered by an agent inventing an audit
instead of running `okfctl status`. Keeping it read-only means it can be the default entry
point without risk.

`allowed-tools: Bash(okfctl:*)` on the read-only skills. The writing skills need Read and
Edit as well, for the body-text exception in the spec.

### Deferred: supersession

`deprecate --superseded-by <concept>` would need a frontmatter field naming the successor,
and OKF v0.2 defines none — the same problem as the outdated finding, without the
`stale_after` escape hatch. The log entry and a body link cover it for now. Revisit if OKF
adds a relations field.

## Risks / Trade-offs

- **`review --confirm` and `promote` overlap, and users will ask which to use.** → README
  states the rule in one line: `promote` when the status should change, `review` when it
  should not. Both remain correct.
- **An outdated concept looks exactly like a naturally stale one in `status`.** → Accepted;
  the log distinguishes them. A `--reason` on the review makes the log entry self-explaining.
- **A skill can still bypass the CLI by editing frontmatter with Edit.** → Not enforceable
  by tooling, so it is stated as a guardrail in each skill and as a requirement in the
  spec. The body-text exception is narrow and named.
- **Extracting `commit()` touches the working `promote`/`deprecate` path.** → Pure move
  with no behavior change; the existing lifecycle tests cover it and must pass untouched.
- **`new` creating intermediate directories can silently place a concept in the wrong
  spot** (typo'd path). → `--dry-run` prints the resolved target, and the ingest skill
  previews placement against the bundle's existing structure before writing.

## Migration Plan

Additive. No existing command changes shape, no frontmatter is rewritten, and the two new
verbs are inert until called. Rollback is removing the two command registrations.
