## 1. Installed detection

- [x] 1.1 Add `isInstalled(context: InstallContext): boolean` to the `Adapter` interface
      in `src/core/agents/adapter.ts`.
- [x] 1.2 Implement `isInstalled` for `claudeCode`/`codex` in `src/core/agents/hosts.ts`:
      `existsSync` on the capture-skill path built from that host's `userSkills` layout
      (reuse `CLAUDE_LAYOUT`/`CODEX_LAYOUT`), matching exactly the path `skillEdits`
      writes.
- [x] 1.3 Implement `isInstalled` for `copilot`/`agents-md` (the `instructionsOnly`
      factory): the target file exists and its content includes `MARK_START`.
- [x] 1.4 `test/agents.test.ts`: `isInstalled` is false before any install, true after
      `init --agent <host>`, and false again after `--remove`, for all four adapters.
      Also cover the pre-existing-but-untouched-file case (write a `settings.json`/
      `AGENTS.md` by hand with unrelated content, assert `isInstalled` is still false).

## 2. Interval preservation

- [x] 2.1 Add `installedInterval(configPath: string, host: string): number | null` in
      `src/core/agents/hosts.ts`: read the JSON config, find the entry `isOurs()`
      recognizes, extract the digits after `--every ` from its `command` with a regex;
      `null` when the config is absent, unparseable, or no matching entry is found.
- [x] 2.2 `test/agents.test.ts`: `installedInterval` returns the installed value after
      `init --agent <host> --capture-every 5`; returns `null` before any install; returns
      `null` against a hand-written config with an unrelated hooks entry.

## 3. `okfctl update`

- [x] 3.1 Add `src/commands/update.ts`: `runUpdate(dir, options)` — resolve the bundle
      path (same as `init`'s positional `[dir]`, defaulting to `.`), iterate `ADAPTERS`,
      call `isInstalled(context)` for each; for hook hosts found installed, resolve the
      interval via `installedInterval(...)` unless `options.captureEvery` is set, then
      build `context.every` accordingly.
- [x] 3.2 For each installed host, call `adapter.plan(context)` (same as `init`'s
      non-removal path) and report/apply exactly as `runHosts` in `init.ts` already does
      — reuse that reporting logic rather than duplicating it (factor the shared part out
      of `init.ts` if that is the cleaner path; do not fork two copies of the same
      preview/apply loop).
- [x] 3.3 When no host is installed for the target bundle, print that plainly and name
      `okfctl init --agent <host>` as the next step; exit 0 (this is a report, not a
      failure).
- [x] 3.4 Support `-n`/`--dry-run`, matching `init`'s contract exactly (nothing written,
      every path and interval named).
- [x] 3.5 Never touch registration, never scaffold `dumps/`/`drafts/`/`.okf/policy/` —
      `runUpdate` must not call any of `init.ts`'s scaffolding logic, only its host-plan
      machinery.
- [x] 3.6 Wire `update [dir]` into `src/cli.ts`: `--capture-every <n>` (optional, no
      default — presence vs. absence is the signal to override vs. preserve),
      `-n, --dry-run`.

## 4. Tests

- [x] 4.1 `test/update.test.ts`: only installed hosts are touched; nothing-installed
      reports and exits 0 without writing; dry run writes nothing; interval preserved by
      default; `--capture-every` overrides preservation for every touched host; no
      `dumps/`/`drafts/`/`.okf/policy/` scaffolding occurs; registration is untouched.
- [x] 4.2 `npm test` passes end to end.

## 5. Docs

- [x] 5.1 Update `README.md`'s command reference and Agent hooks section: document
      `okfctl update`, when to reach for it versus `init --agent`, and the interval
      preservation behavior.
- [x] 5.2 Update `docs/design.md`: a short section on `update`'s detection and interval
      preservation design, mirroring the style of existing command sections there.

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` passes.
- [x] 6.2 `npm test` passes end to end.
- [x] 6.3 Manually run `okfctl update` against `/home/matze/okf-knowledge` (already has
      both `claude-code` and `codex` installed from this session) and confirm it reports
      both as refreshed with `--dry-run`, then for real, and that the resulting skill
      files match the packaged copies byte for byte.
