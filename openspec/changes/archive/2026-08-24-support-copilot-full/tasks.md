## 1. Flat hook config writer

- [x] 1.1 Add `upsertFlatHook`/`removeFlatHook` helpers in `src/core/agents/hosts.ts`
      operating on `Record<string, FlatHookEntry[]>`, reusing the existing `isOurs()`
      check, and verify with a unit test that upserting twice produces one entry, not two
- [x] 1.2 Add `flatHookPlan(host, configPath, event, context, extra, remove)` producing a
      `Plan` for a dedicated (non-shared) JSON hook file — parses with the existing
      `readJson`, refuses to write when unparseable (same contract as `jsonHookPlan`),
      deletes the file on removal when nothing but `version`/empty `hooks` remains, and
      verify with a unit test covering install, reinstall (no duplicate), and removal
      (file deleted) against a fresh temp directory

## 2. Copilot adapter

- [x] 2.1 Define `COPILOT_LAYOUT: SkillLayout` with `userSkills: ['.copilot', 'skills']`
      and `projectSkills: ['.github', 'skills']`, no command directories, and verify
      `skillEdits(context, COPILOT_LAYOUT, false)` produces the capture skill at
      `~/.copilot/skills/okf-capture/SKILL.md` and each curation skill under the bundle's
      `.github/skills/`
- [x] 2.2 Replace the `copilot` adapter definition (currently
      `instructionsOnly('copilot', ...)`) with a full `Adapter`: `hook: true`; `plan()`
      calls `flatHookPlan('copilot', join(context.home, '.copilot', 'hooks',
      'okfctl.json'), 'Stop', context, [...instructions edit, ...skillEdits(...)], false)`;
      `planRemoval()` mirrors with `remove: true`; capture instructions upserted into
      `join(context.home, '.copilot', 'copilot-instructions.md')` (corrected from
      `.github/copilot-instructions.md`) using the existing `upsertSection`/`removeSection`
      helpers
- [x] 2.3 Implement `isInstalled` for `copilot` as `isWiredToThisBundle(context,
      COPILOT_LAYOUT)`, matching `claudeCode`/`codex`, and verify it returns `false` before
      install and `true` after
- [x] 2.4 Verify `ADAPTERS` still lists `copilot` and `findAdapter('copilot')` resolves to
      the new definition (no rename — `agents-md` remains the only `instructionsOnly` host)

## 3. Tests

- [x] 3.1 Update `test/agents.test.ts` assertions that currently expect `copilot` at
      `~/.github/copilot-instructions.md` with no hook — replace with assertions for the
      corrected instructions path, the installed `~/.copilot/hooks/okfctl.json` content
      (`Stop` event, correct command string), and skill files at both scopes
- [x] 3.2 Add a removal test: installing then removing `copilot` deletes
      `~/.copilot/hooks/okfctl.json`, the corrected instructions file (when emptied), and
      every installed skill file, leaving unrelated content in any of those paths intact
- [x] 3.3 Add a preview (dry-run) test for `copilot` install and removal, asserting every
      path from task 2.2 is named and nothing is written
- [x] 3.4 Run `npm test` and confirm the full suite passes, including the existing
      cross-host tests that iterate `ADAPTERS`/`['claude-code', 'codex', 'copilot',
      'agents-md']`

## 4. Docs

- [x] 4.1 Update `README.md`'s host support table so the `copilot` row shows hook support
      and the corrected instructions path (see line ~287 in the current file)
- [x] 4.2 Update `docs/design.md`'s line describing `copilot`/`agents-md` as the
      instructions-only hosts so it names only `agents-md`
- [x] 4.3 `npm run build` (or equivalent) to confirm `dist/` regenerates cleanly if this
      project ships compiled output

## 5. Existing-install migration note

- [x] 5.1 Add a line to `README.md`'s Copilot section (or wherever host installation is
      documented) noting that a `copilot` host installed before this change should be
      re-installed (`okfctl init --agent copilot` or `okfctl update`), and that the stale
      `~/.github/copilot-instructions.md` from the old path is not removed automatically
      and should be deleted by hand
