## Context

See proposal.md - Why. Two existing facts shape this design:

1. `src/core/bundle.ts`'s walk already skips any directory "whose name begins with `.`"
   (`SKIP_DIRS` plus the dotfile check) — the same rule that already excludes `.claude/`
   and `.agents/`, the directories `okfctl init --agent` writes skills into. `.okf/policy/`
   needs no new exclusion rule; it rides the existing one.
2. `okf-ingest`'s current guidance for a bundle with no corpus — "propose a layout, ask,
   and then record the answer as a concept, so the next agent can infer the rule" — is a
   process decision wearing knowledge's clothes: a concept in the corpus that says nothing
   about *the world*, only about *how this bundle is organized*. `field-policy.md` is a more
   honest home for it.

## Goals / Non-Goals

**Goals:**
- Give each bundle a place to state its own judgment on what to capture, what a good
  citation looks like, and what frontmatter it expects per type — editable prose, not a
  CLI-managed format.
- Seed real, useful starter content at `init`, not an empty file a user has to write from
  nothing — the starting point should already reflect the generic guidance the skills use
  today, so editing it is refinement, not a blank-page problem.
- Make the files invisible to everything that treats `.md` as corpus (`status`, `index`,
  `catalog`, `check`) — they are not knowledge, they are how the bundle wants knowledge
  judged.
- Have every relevant skill actually read and apply them, not just scaffold them and leave
  them unread.

**Non-Goals:**
- Not a machine-enforced schema. `field-policy.md` states what this bundle expects; nothing
  in `okfctl` validates a concept against it or fails `check` over it. SPEC §11 forbids
  adding a conformance rule beyond its three, and per-type field requirements are exactly
  the kind of bundle-specific convention §11 keeps out of conformance on purpose.
- Not a new CLI verb. Reading `.okf/policy/*.md` is a skill-level step (`Read`/`Glob`), not
  a command — there is nothing here that needs actor validation, a log entry, or a dry-run
  preview, because nothing here is a frontmatter change.
- Not touching `okf-promote`/`okf-deprecate`. Their behavior (verification, staleness
  horizon, retirement) is governed by SPEC's lifecycle fields, not by bundle policy; if
  `content-policy.md` states a horizon convention, `okf-promote` already asks the user for
  one and can be told about it in conversation — no new mechanism is added there.

## Decisions

### Location: `.okf/policy/`, not `policy/`

A plain top-level `policy/` would put three `.md` files inside the bundle walk, where
`bundle-model` requires every non-reserved `.md` to carry `type`/`title` on pain of a
conformance error (SPEC §11) — either these files grow frontmatter they do not need (and
show up in `status` as permanently-unverified draft concepts, which they are not), or
`check` reports errors on a bundle that scaffolded them correctly. `.okf/` sidesteps this
entirely: it is dotfile-prefixed, already excluded from the walk by the rule that already
protects `.claude/` and `.agents/`, so these files are free-form prose with no frontmatter
requirement at all — the same freedom `.claude/`'s installed `SKILL.md` files already have.

`.okf/` (not `.claude/` or `.agents/`) because this content belongs to the bundle and its
lifecycle, not to any one agent host — a Codex session and a Claude Code session both need
to read the same policy, and neither's own dotfile directory is the right shared home.

### Three files, not one

Considered a single `POLICY.md`. Rejected: capture/refine's "what's worth saving" question,
review's "what's a good citation" question, and ingest's "what fields does this type need"
question are different enough in scope and audience that one file either grows unwieldy or
one skill has to skip past sections meant for another. Three focused files are each short
enough to read in full on every invocation, which is the point — a skill should not need to
grep a policy file for its relevant section.

### Seeded with real content, never overwritten

`init` writes each file's starter content only when the file is absent — identical to how
`index.md`/`log.md`/`dumps/`/`drafts/` already behave. The starter content for
`content-policy.md` is drawn directly from `okf-capture`'s existing "what counts as
durable" categories (decision-and-why, root cause, gotcha, correction, measurement,
procedure, negative result, the local-setup/org-convention category) restated as bundle
policy rather than skill instructions — so a fresh bundle's policy already encodes
today's generic judgment, and editing it means narrowing or extending a real starting
point, not inventing one from a blank file. `source-policy.md` and `field-policy.md` are
seeded the same way, drawing from `okf-review`'s existing source-checking guidance and
`okf-ingest`'s existing type/placement-matching guidance respectively.

### Skills read policy first, but it never overrides the hard guardrails

Each skill's step 1 (establish the bundle root) gains a follow-up: read `.okf/policy/`
when it exists, and apply it. What policy can *narrow* or *extend*: what counts as durable
enough to capture, how strict a citation needs to be, which fields a type should carry.
What policy cannot touch: actor honesty (never inventing an actor, never claiming a
human's authorship), the CLI-is-the-only-writer rule, or any of the provenance-carryover
guarantees `okf-refine`/`okf-review` already enforce. A bundle's policy is welcome to be
stricter about what to keep; it is never a way to launder over guardrails that exist for
SPEC §7's reasons. Skills say this explicitly rather than leaving it implied, since a
user-editable file is exactly the kind of thing a future edit could accidentally weaken.

### `okf-ingest`'s no-corpus fallback moves to `field-policy.md`

Today: "propose a layout, ask, and then record the answer as a concept." After this
change: propose, ask, and record the answer in `field-policy.md` (placement/type
conventions) — the file that exists precisely to hold "how this bundle organizes itself,"
rather than a corpus concept that answers a question about the bundle's own shape instead
of about the world the bundle describes.

## Risks / Trade-offs

- **A user's policy edit could unintentionally loosen a guardrail** (e.g. "always cite
  yourself as human: even when you didn't review it") → mitigated by the explicit
  "policy narrows/extends, never overrides the guardrails" rule stated in each skill, not
  by any technical enforcement — this is a documentation boundary, consistent with every
  other guardrail in these skills already being prompt-level rather than code-enforced.
- **Three more files for `init` to explain** → mitigated by seeding them with content
  useful enough to read once and mostly leave alone; a user who never touches them still
  gets the current generic behavior, since the seeded content restates it.
- **Skills reading three more files on every invocation** → small, fixed cost (a few KB of
  `Read` calls), paid once per skill invocation, not per concept.

## Migration Plan

Additive only for existing bundles: `.okf/policy/` is created lazily, the same way
`drafts/`/`dumps/` already are — running `okfctl init` again on an existing bundle adds the
three files without touching anything else. A bundle that never runs `init` again keeps
working exactly as before; the skills simply find no `.okf/policy/` to read and fall back
to their built-in generic guidance, unchanged.
