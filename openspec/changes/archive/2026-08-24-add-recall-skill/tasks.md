## 1. Marker mechanism: parameterize by section id

- [x] 1.1 In `src/core/agents/adapter.ts`, replace the module-level `MARK_START`/`MARK_END`
      constants with a `sectionMarkers(id)` function returning `{ start, end }`, and update
      `upsertSection`/`removeSection` to take a section id and use that function
- [x] 1.2 Verify the `capture` section id produces marker text identical to the current
      hardcoded constants (`<!-- okfctl:capture -->` / `<!-- /okfctl:capture -->`), with a
      unit test asserting a pre-change-format capture section is still found, upserted, and
      removed correctly
- [x] 1.3 Update every existing call site of `upsertSection`/`removeSection`/`MARK_START`
      (in `hosts.ts`'s `instructionsOnly()` and anywhere else it's referenced) to pass
      `'capture'` explicitly

## 2. Recall instructions and skill content

- [x] 2.1 Add `recallInstructions(command)` to `src/core/agents/adapter.ts`, paired with
      `captureInstructions(command)`: what `okfctl search` does, when to reach for it, and
      how to read area/trust-tier in its output
- [x] 2.2 Write `skills/okf-recall/SKILL.md`: when to search (before non-trivial
      investigation, or when asked "have we seen this before"), how to run
      `okfctl search`, and the trust-tier/area interpretation rule from design.md (corpus +
      stable/human-reviewed is citable; dumps/drafts or unverified is a lead) — matching
      `okf-capture/SKILL.md`'s shape and tone
- [x] 2.3 Write `commands/okf/recall.md`, mirroring `commands/okf/capture.md`'s frontmatter
      and structure

## 3. Installation: user-scope skill list and dual-section instructions

- [x] 3.1 In `src/core/agents/sources.ts`, add `RECALL_SKILL = 'okf-recall'` and a
      `USER_SCOPE_SKILLS = [CAPTURE_SKILL, RECALL_SKILL]` list
- [x] 3.2 In `src/core/agents/hosts.ts`'s `skillEdits()`, replace the single hardcoded
      capture `put()` call (skill + optional command) with a loop over
      `USER_SCOPE_SKILLS`, and verify capture's installed path/content is byte-identical to
      before this change (no regression via existing capture-focused tests)
- [x] 3.3 Update `instructionsOnly()`'s `plan()`/`planRemoval()` to upsert/remove both the
      capture and recall sections in the target instructions file, using the parameterized
      marker mechanism from task 1
- [x] 3.4 Verify `isWiredToThisBundle`/`isInstalled` still resolve correctly with two
      user-scope skills present — confirm the existing check (capture skill file existence)
      is unaffected by recall's presence, since it does not key off recall

## 4. Tests

- [x] 4.1 Extend `test/agents.test.ts` to assert `okf-recall`'s `SKILL.md` (and command
      file, where the host supports commands) installs at user scope for every
      skill-capable host, alongside the existing capture assertions
- [x] 4.2 Extend the removal test to assert recall's files are gone after `--remove`,
      without asserting anything about capture's presence/absence changing
- [x] 4.3 Add a test for instructions-only hosts: both the capture and recall sections are
      present after install; removing recall leaves the capture section's content
      unchanged (and vice versa); a file with a hand-edited capture section installed
      before this change still gains a correct recall section on `update`
- [x] 4.4 Run `npm test` and confirm the full suite passes

## 5. Docs

- [x] 5.1 Update `README.md` to mention `okf-recall` wherever the skill suite or
      `okf-capture` is currently described, if such a description exists
- [x] 5.2 `npm run build` (or equivalent) to confirm `dist/` regenerates cleanly if this
      project ships compiled output
