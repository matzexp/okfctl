## Why

`skills/okf-capture/SKILL.md` step 1 carries a ~50-line "worth capturing" criteria list
(eight categories plus a "not durable" list). `src/core/policy.ts`'s
`contentPolicyTemplate()` restates the same list nearly verbatim as the seeded starter
content for every bundle's `.okf/policy/content-policy.md` — the template even opens that
section with "The default bar, inherited from `okf-capture`," which is the tell that it
was meant to point at the skill's judgment, not carry a second copy of it. Two copies of
the same criteria will drift the first time either is edited without the other.

Separately, `skills/okf-refine/SKILL.md` never states its own criteria for "what makes a
well-refined entry" — it borrows discipline by pointing at a different skill ("Same
discipline as `okf-ingest`: read what the bundle's existing types and directories are..."),
leaving refine's actual standard implicit across steps 4-7 rather than named the way
capture's list is.

Both problems share a fix: every invocation of `okf-capture` or `okf-refine` currently
re-reads the full judgment criteria inline as part of the mandatory SKILL.md body, whether
or not the judgment call in front of the agent is close enough to need it. Moving the long
criteria into a sibling reference file — read only at the step that needs it — shrinks what
loads on every invocation, gives each skill's standard a place to live once (ending the
capture/policy duplication) and its own name (ending refine's cross-reference to ingest).

## What Changes

- Extend the skill-packaging mechanism (`src/core/agents/sources.ts`,
  `src/core/agents/hosts.ts`) so a packaged skill can ship more than one file. Convention:
  every file under `skills/<name>/` other than `SKILL.md` itself is a resource, installed
  alongside it at the same path, detected and removed the same way `SKILL.md` already is.
  No change to the per-skill, per-host, per-scope directory layout `SkillLayout` already
  describes — resources land next to the `SKILL.md` that references them.
- Add `skills/okf-capture/worth-capturing.md`: the canonical, standalone version of the
  eight-category "worth capturing" / "not worth capturing" criteria, moved out of
  `SKILL.md` step 1. `SKILL.md` keeps a short summary of the test ("if an agent picked
  this bundle up cold in a week, would they need to be told this, and could they not get
  it any other way?") and points to the resource file for the full list.
- Add `skills/okf-refine/refining-standard.md`: refine's own explicit criteria for shape
  (one-to-one / split / consolidate), type/title discipline against the bundle's existing
  conventions, and when a dump cannot be confidently refined — self-contained, not a
  pointer at `okf-ingest`. `SKILL.md` keeps the procedural steps (read the inbox, preview,
  decide `--consume`, report) and points to the resource file for the judgment itself.
- Shrink `contentPolicyTemplate()`'s "Worth capturing" section from a full restatement to
  a pointer at `okf-capture`'s built-in list, with room to add bundle-specific categories
  underneath — still real, non-empty starter content, per the existing bundle-policy
  requirement that seeded content restate the tool's generic guidance (not verbatim
  duplicate it).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `knowledge-skills`: capture and refine's judgment criteria move to a named, dedicated
  resource file each, read at the point of judgment rather than embedded in the
  always-loaded SKILL.md; refine's standard becomes self-contained rather than deferring
  to ingest's.
- `agent-integration`: skill installation, detection, and removal extend from "exactly one
  `SKILL.md` file per skill" to "a `SKILL.md` plus whatever resource files that skill
  ships," at every scope and host that already installs skills.

## Impact

- `src/core/agents/sources.ts`: `readSkill` gains a sibling that lists/reads a skill's
  resource files; likely a `readSkillResources(name)` alongside the existing
  `readSkill(name)`.
- `src/core/agents/hosts.ts`: `skillEdits()` installs resource files alongside each
  `SKILL.md`; removal deletes them; `isWiredToThisBundle`'s existing check (capture-skill
  file existence at user scope, first-curation-skill file existence at project scope)
  is unaffected since it already keys off `SKILL.md` specifically.
- `skills/okf-capture/SKILL.md`, `skills/okf-refine/SKILL.md`: shortened; two new sibling
  files added.
- `src/core/policy.ts`: `contentPolicyTemplate()` shortened.
- `test/agents.test.ts`: skill install/removal assertions extend to cover resource files.
- `test/policy.test.ts`: existing assertions already derive expectations from
  `contentPolicyTemplate()` itself rather than a hardcoded string, so they keep passing
  once the template is updated; the `length > 500` and skill-name-mention assertions need
  rechecking against the shortened content.
- No change to any CLI verb, any conformance rule, or the bundle format.
