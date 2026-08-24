## Context

See proposal.md - Why. Today, `src/core/agents/sources.ts`'s `readSkill(name)` reads
exactly one file — `skills/<name>/SKILL.md` — and `hosts.ts`'s `skillEdits()` writes
exactly that one file per skill, per host, per scope, via a single `put(...)` call per
skill inside its loop. `isWiredToThisBundle()` (the basis for `isInstalled`, which
`update` depends on) already keys off `SKILL.md` specifically — the capture skill's
`SKILL.md` at user scope, the first curation skill's `SKILL.md` at project scope — so
adding resource files does not change what "installed" means, only what else comes along
with an install.

## Goals / Non-Goals

**Goals:**
- A skill can ship a resource file read only at its judgment step, without a second
  packaging mechanism per skill.
- Capture's and refine's criteria each live in exactly one file, referenced rather than
  duplicated by `content-policy.md`'s seeded template and by the other skill.
- No change to `SkillLayout`, to per-host directory choices, or to how many scopes a skill
  installs at — resources ride along with the workflow file they belong to, nothing more.

**Non-Goals:**
- Not a general-purpose asset system (images, scripts, multiple resource files with
  cross-references between them). Each of the two skills in scope gets exactly one
  resource file. A skill needing more later can extend the same convention; this change
  does not need to design for that case now.
- Not changing `okf-ingest`'s or any other lifecycle skill's SKILL.md. Only capture and
  refine are in scope — the two whose criteria are duplicated or borrowed today.
- Not touching `--capture-every`, hook installation, or anything in `jsonHookPlan`. This
  change is scoped to `skillEdits()` and the two skill files.

## Decisions

### Resource files: directory convention, not an explicit manifest

A skill's resource files are every file under `skills/<name>/` other than `SKILL.md`
itself, discovered by reading the directory rather than declared in a manifest list in
`sources.ts`.

Considered an explicit manifest instead — e.g. a `resources: string[]` field added
per-skill somewhere in `sources.ts`, alongside `CAPTURE_SKILL`/`LIFECYCLE_SKILLS`.
Rejected: it is one more place to remember to update when a resource file is added or
renamed, for no benefit here — nothing in this change needs to select a subset of a
skill's files or exclude one conditionally. A directory convention means adding
`skills/okf-capture/worth-capturing.md` to the repository is the entire authoring step;
nothing in `sources.ts` needs to change to pick it up. If a future skill needs to ship a
file that is not a resource for installation (a fixture, a design note kept alongside the
skill for editors), that is the point to introduce an exclusion — not before.

`readSkillResources(name): { relPath: string; contents: string }[]` reads every file in
`skills/<name>/` except `SKILL.md`, non-recursively (neither skill in scope needs nested
resource directories; recursing is easy to add later without a signature change if a skill
ever does).

### Installation: one more `put()` per resource, same path shape as `SKILL.md`

`skillEdits()` currently writes `SKILL.md` with `put(at(base, [...scopeDirs, skillName,
'SKILL.md']), readSkill(skillName), ...)`. Resource files get the same treatment, one call
per resource, at `at(base, [...scopeDirs, skillName, relPath])` — sibling to `SKILL.md`
inside the same per-skill directory, at every scope that skill already installs to. No new
concept for callers of `skillEdits()`: the function's contract ("install everything this
skill needs, at this scope") is unchanged, it just now does slightly more per skill.

Removal is symmetric: the same loop that finds a skill's resources for install finds them
for removal, and `put(path, remove ? null : contents, ...)` already handles deletion via
`applyPlan`'s existing null-contents-means-delete convention.

### `isWiredToThisBundle` and `isInstalled` are unaffected

Both already check for `SKILL.md` at a specific path, not "does this skill's directory
exist." A resource file appearing or disappearing next to `SKILL.md` does not change
either check. Considered strengthening the check to also verify resource files are
present — rejected: `isInstalled` answers "is this host wired at all," and a resource file
missing while `SKILL.md` is present is a corrupted install, not an uninstalled one;
`update` already re-installs (overwrites) everything for a detected host regardless, which
self-heals that case without a new check.

### `worth-capturing.md` and `refining-standard.md`: same shape, different content

Both resource files open with one sentence naming what they are for and are read at
exactly one step of their SKILL.md (capture's step 1, refine's steps 4-5), so a workflow
that never reaches that step never needs to open them. `SKILL.md` keeps the short test
that decides *whether* to read the resource: capture's "if an agent picked this bundle up
cold in a week, would they need to be told this, and could they not get it any other way,"
and refine's "does this dump map to one entry, several, or does it overlap another dump."

`refining-standard.md` states, on its own terms: match type and directory against what
`okfctl status --json` already shows the bundle uses (not "same as ingest" — the actual
instruction, restated so refine does not depend on ingest's file existing or its wording
staying stable); write a title a reader would recognize in an index, not a restated
capture title; when a dump cannot be confidently refined, leave it and say why. This is
extracted from refine's existing steps 4-5, not new judgment — the change is that it is
now named and stated in refine's own file instead of only implied by the procedure.

### `contentPolicyTemplate()` becomes a pointer with room to extend

New shape for the "Worth capturing" section: one paragraph naming the eight categories
by name (decision+why, root cause, gotcha, corrected belief, measurement, procedure,
negative result, local-setup mistake) as `okf-capture`'s built-in default, followed by a
blank space/prompt for the bundle to add its own categories — not the full multi-sentence
description of each one. This keeps the file self-contained enough to be read on its own
(a bundle owner should not have to go find `skills/okf-capture/worth-capturing.md` just to
know what the eight categories are called) while removing the maintenance burden of two
full descriptions stayed in sync. The "Not worth capturing" section is similarly
shortened to its one-sentence test rather than the current full paragraph.

`test/policy.test.ts`'s `content.length > 500` assertion needs rechecking against the
shortened text — the design intends the file to stay comfortably over 500 characters
(it retains the purpose paragraph, all three section headers, the staleness-horizons
section, and the eight named categories), but this is confirmed in `tasks.md`, not
asserted here.

## Risks / Trade-offs

- **A resource file with a name that collides with something a host or another skill
  writes at the same path** → scoped low: resource files live inside a skill's own
  per-skill directory (`.../skills/okf-capture/worth-capturing.md`), the same isolation
  `SKILL.md` already has from other skills' files.
- **A shortened `content-policy.md` reads as less complete to a bundle owner who never
  opens the skill's own file** → mitigated by keeping the category names and the
  one-sentence test in the template itself; only the multi-sentence elaboration of each
  category moves out, not the names.
- **Two files to keep mentally in sync per skill (workflow + resource) where there was
  one** → accepted; this is the direct cost of the goal (shrinking what loads on every
  invocation) and is bounded to two files per skill, not an open-ended set.

## Migration Plan

Additive to the packaging mechanism; existing installs pick up the new files on the next
`init --agent`/`update` for a host, the same way any other packaged-content change already
propagates. No bundle-format or CLI-verb change. `content-policy.md` files already
scaffolded into existing bundles are untouched — the shortened template only affects newly
scaffolded bundles, per the existing "seeded once, never overwritten" bundle-policy
requirement.
