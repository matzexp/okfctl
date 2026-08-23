## 1. Rename the raw capture area: `drafts/` → `dumps/`

- [x] 1.1 Rename `src/core/drafts.ts` to `src/core/dumps.ts`: `DEFAULT_DRAFTS_DIR` →
      `DEFAULT_DUMPS_DIR = 'dumps'`, `resolveDraftsDir` → `resolveDumpsDir`, `inDrafts` →
      `inDumps`, `draftConcepts` → `dumpConcepts`. Same escapes-the-bundle guard, unchanged.
- [x] 1.2 Update `src/commands/capture.ts` to import from `dumps.ts` and use the renamed
      identifiers; its own behavior (provisional type, generated-id scheme, actor
      requirement, origin/session provenance) does not otherwise change.
- [x] 1.3 Update `src/cli.ts`: rename the global `--drafts-dir` option to `--dumps-dir`
      (used by `capture`); update the `draftsDir(command)` accessor to `dumpsDir(command)`.
- [x] 1.4 Update `src/commands/init.ts` to scaffold `dumps/` instead of `drafts/`.
- [x] 1.5 Rename `test/drafts.test.ts` to `test/dumps.test.ts` and update it for the
      renamed identifiers; update `test/capture.test.ts` and `test/init.test.ts` for the
      new default directory and flag name.
- [x] 1.6 Update `src/core/agents/adapter.ts`'s reference to "the drafts area" (capture's
      guidance text) to say "the dumps area".

## 2. New drafts area for refined entries

- [x] 2.1 Add a new `src/core/drafts.ts` (the old file having moved to `dumps.ts` in task
      1.1) with the same shape as before but for the new meaning:
      `DEFAULT_DRAFTS_DIR = 'drafts'`, `resolveDraftsDir`, `inDrafts`, `draftConcepts`.
- [x] 2.2 Wire `--drafts-dir` as a new global CLI option (now scoped to `refine`/`status`,
      not `capture`) in `src/cli.ts`, with a `draftsDir(command)` accessor.
- [x] 2.3 `okfctl init` creates `drafts/` alongside `dumps/` when scaffolding a new bundle
      (`src/commands/init.ts`).
- [x] 2.4 `test/drafts.test.ts` (new file, new meaning): mirror the old drafts tests
      (now in `dumps.test.ts`) for `resolveDraftsDir`, `inDrafts`, `draftConcepts`,
      including the escapes-the-bundle refusal.

## 3. `okfctl refine`

- [x] 3.1 Add `src/commands/refine.ts`: `runRefine(sources, options)` resolving each
      source via the existing concept-reference resolution (`findConcept`, as `move` and
      `promote` already use), requiring `--type`, `--title`, `--by`, and a body
      (`--body`/`--stdin`, copied verbatim per `readBody` in `capture.ts`).
- [x] 3.2 Write the target concept into the drafts area (or `--to` override) via
      `createConcept`/`serializeConcept`, with `status: draft`, `generated: { by, at }`,
      and no provisional-type fallback — missing `--type` or `--title` is a hard refusal.
- [x] 3.3 Build `sources[]` on the written concept: one entry per resolved source naming
      its id and title (SPEC §5.1 shape), appended after any sources the caller supplies
      directly — do not copy a source's own `sources[]`/`generated` forward (design.md,
      "Provenance carryover").
- [x] 3.4 Refuse to overwrite an existing target path; refuse a target outside the bundle;
      refuse a reserved filename (`index.md`, `log.md`) — matching `new`/`capture`/`move`.
- [x] 3.5 Implement `--consume`: after a successful write, remove exactly the source files
      named in this invocation (not a broader "everything referencing this dump" sweep),
      then regenerate the affected directories' `index.md` the same way `move` does.
- [x] 3.6 Implement `--dry-run`: print the resolved target path, the frontmatter that
      would be written, and (when `--consume` is set) which source files would be
      removed — write nothing.
- [x] 3.7 Log to the nearest `log.md`: the new concept, its type, its source ids, the
      actor, and whether sources were consumed.
- [x] 3.8 Stage all writes/removals and roll back on partial failure, following the same
      staged-write/rollback pattern `runMove` already uses.
- [x] 3.9 Wire the `refine` verb into `src/cli.ts` (source args, `--type`, `--title`,
      `--by`, `--description`, `--tags`, `--body`/`--stdin`, `--to`, `--consume`,
      `--dry-run`, `--no-log`), following the existing verb option conventions.

## 4. `okfctl status`: two independent inboxes

- [x] 4.1 Rename `Row.inDrafts` to `inDumps` in `src/commands/status.ts`, computed via
      `inDumps(concept.id, dumpsDir)`; add a new `inDrafts: boolean` computed via
      `inDrafts(concept.id, draftsDir)` for the new meaning.
- [x] 4.2 Rename the `--drafts` CLI filter to `--dumps`; add a new `--drafts` filter for
      the new meaning. Both are included in `--all`'s unsegregated view; an entry is never
      counted in both inboxes.
- [x] 4.3 Rename the existing `printInbox` output to the dumps inbox line; add a second,
      independent drafts inbox line, both shown by default when non-empty.
- [x] 4.4 Rename `draftsDir`/`inDrafts` in `--json` output to `dumpsDir`/`inDumps`; add
      new `draftsDir`/`inDrafts` fields for the new meaning.

## 5. Tests

- [x] 5.1 `test/refine.test.ts`: minimal invocation; missing `--type`/`--title`/`--by`
      refusals; single-source and multi-source (consolidate) writes; two calls against one
      source with `--consume` only on the second (split); `--consume` removing only the
      named sources; no-overwrite; reserved-filename refusal; `--dry-run` writes nothing;
      log entry content; index regeneration after `--consume`; partial-failure rollback.
- [x] 5.2 Extend `test/status-inbox.test.ts` for both inbox lines under their new names,
      `--dumps`/`--drafts` filtering, `--all` behavior, and the renamed/new JSON fields.
- [x] 5.3 Extend `test/init.test.ts` to assert both `dumps/` and `drafts/` are scaffolded.
- [x] 5.4 Update `test/hook.test.ts`, `test/move.test.ts`, and any other test referencing
      `drafts/` in its old meaning to use `dumps/` instead.
- [x] 5.5 `npm test` passes end to end.

## 6. Skills

- [x] 6.1 Edit `skills/okf-capture/SKILL.md`: every reference to "the drafts area" becomes
      "the dumps area"; `--drafts-dir` references become `--dumps-dir`.
- [x] 6.2 Add `skills/okf-refine/SKILL.md`: establish bundle root; read the dumps inbox
      (`okfctl status --dumps --json`); for each candidate, decide split vs. one-to-one
      vs. consolidate, draft type/title/body per the bundle's existing conventions (same
      "match the bundle, not habit" guidance `okf-ingest` already gives); run
      `okfctl refine --dry-run` then for real; decide `--consume` only once every part of
      a split source has a home. Document both modes (gated default, automatic opt-in) per
      design.md, and the guardrails against inventing actors/sources and against filing a
      dump it cannot confidently refine.
- [x] 6.3 Edit `skills/okf-review/SKILL.md` step 7: keep "Emptying the drafts inbox" as the
      section name (it still operates on `drafts/`), but state plainly that `drafts/` now
      holds refined entries, not raw dumps; narrow relocate/merge to be the common path,
      noting split/consolidate are the exception now that refine owns them upstream.
- [x] 6.4 Edit `skills/okf-triage/SKILL.md`: report both inboxes under their (possibly
      swapped) names, and point a stagnant dumps inbox at `okf-refine` (previously
      implicitly `okf-review`) and a stagnant drafts inbox at `okf-review`.
- [x] 6.5 Add `commands/okf/refine.md`, matching the format of `commands/okf/capture.md`.
- [x] 6.6 Update `commands/okf/capture.md`'s description ("into an OKF bundle's drafts
      area") to say "dumps area".

## 7. Docs and migration

- [x] 7.1 Update `README.md` wherever it documents the drafts-area lifecycle: rename the
      raw capture area to `dumps/`, and show the three-stage path: capture (dumps) →
      refine (drafts) → review/promote (corpus). Include a migration note (`mv drafts
      dumps`) for existing bundles, per design.md's Migration Plan.
- [x] 7.2 Update `docs/design.md` if it diagrams or narrates the current two-stage model.
- [ ] 7.3 Note the breaking rename prominently in the changelog/release notes when this
      ships — this is not a compatible change for any bundle relying on `okfctl capture`'s
      default target directory.
- [ ] 7.4 At archive time, retitle the "An explicit target outside the drafts area"
      scenario in `knowledge-capture` to "An explicit target outside the dumps area" in the
      main spec — the delta kept the stale title because OpenSpec's delta matching is by
      exact original scenario name, but the body already correctly says "dumps area" and
      the archived main spec should not carry the mismatch forward.
