## 1. Resource-file packaging

- [x] 1.1 Add `readSkillResources(name): { relPath: string; contents: string }[]` to
      `src/core/agents/sources.ts`, reading every file in `skills/<name>/` except
      `SKILL.md` (non-recursive), and verify with a unit test against a temp skill
      directory containing `SKILL.md` plus one extra file
- [x] 1.2 Extend `skillEdits()` in `src/core/agents/hosts.ts` to call
      `readSkillResources()` per skill and `put()` each resource at
      `at(base, [...scopeDirs, skillName, relPath])`, for both the capture skill (user
      scope) and each curation skill (project scope), mirroring the existing `SKILL.md`
      `put()` call
- [x] 1.3 Verify removal deletes resource files the same way it deletes `SKILL.md` —
      extend the existing remove-loop coverage in `skillEdits()` and confirm via a unit
      test that installing then removing a skill with a resource file leaves neither file
      on disk

## 2. Capture: extract `worth-capturing.md`

- [x] 2.1 Create `skills/okf-capture/worth-capturing.md` with the eight-category "worth
      capturing" list and the "not worth capturing" list, moved verbatim in substance from
      the current `SKILL.md` step 1 (see design.md's "same shape, different content"
      decision for the opening-sentence convention)
- [x] 2.2 Rewrite `skills/okf-capture/SKILL.md` step 1 to state the short test ("if an
      agent picked this bundle up cold in a week...") and instruct reading
      `worth-capturing.md` for the full criteria before deciding, and verify the file no
      longer contains the eight full category descriptions inline
- [x] 2.3 Verify the shortened `SKILL.md` still contains every other step (2-6) and every
      guardrail unchanged, by diffing against the pre-change file for everything outside
      step 1

## 3. Refine: extract `refining-standard.md`

- [x] 3.1 Create `skills/okf-refine/refining-standard.md` stating, self-contained: the
      shape decision (one-to-one / split / consolidate) currently in step 4; the type/title
      discipline currently in step 5, restated as refine's own instruction rather than "same
      discipline as `okf-ingest`"; and when a dump cannot be confidently refined
- [x] 3.2 Rewrite `skills/okf-refine/SKILL.md` steps 4-5 to state the short test that
      decides when to consult `refining-standard.md`, deferring the full criteria to that
      file, and verify the rewritten steps no longer reference `okf-ingest`'s discipline
      by name
- [x] 3.3 Verify the shortened `SKILL.md` still contains every other step (1-3, 6-8) and
      every guardrail unchanged

## 4. `content-policy.md` template

- [x] 4.1 Shorten `contentPolicyTemplate()`'s "Worth capturing" section in
      `src/core/policy.ts` to name the eight categories and point at `okf-capture`'s
      built-in list, per design.md, keeping the "add bundle-specific categories" framing
- [x] 4.2 Shorten the "Not worth capturing" section to its one-sentence test
- [x] 4.3 Run `test/policy.test.ts` and confirm `content.length > 500` and the
      `okf-capture`/`okf-refine` name-mention assertions still pass against the shortened
      template; adjust the template's wording (not the test) if either fails

## 5. Tests

- [x] 5.1 Extend `test/agents.test.ts`'s install assertions (around the existing
      `SKILL.md` existence checks for `okf-capture` and `okf-refine`) to also assert
      `worth-capturing.md` and `refining-standard.md` exist at the matching path, for both
      `claude-code` and `codex` layouts
- [x] 5.2 Extend the existing removal test to assert both new resource files are gone
      after `--remove`
- [x] 5.3 Extend the "installed content matches the packaged source" test (the one
      comparing `readFileSync(...)` against `readSkill(...)`) to also compare each
      resource file's installed content against `readSkillResources(...)`
- [x] 5.4 Run `npm test` and confirm the full suite passes

## 6. Docs

- [x] 6.1 Check `README.md` and `docs/design.md` for any description of skill packaging
      as "one `SKILL.md` file per skill" and update it to mention resource files, only if
      such a description exists
- [x] 6.2 `npm run build` (or equivalent) to confirm `dist/` regenerates cleanly if this
      project ships compiled output
