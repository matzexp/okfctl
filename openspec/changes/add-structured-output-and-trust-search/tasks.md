## 1. Shared renderer

- [ ] 1.1 Add `OutputFormat = 'table' | 'json' | 'yaml'` and
      `renderOutput(data: unknown, format: OutputFormat): string` to `src/core/render.ts`,
      using the existing `yaml` dependency for the yaml branch and
      `JSON.stringify(data, null, 2)` for json.
- [ ] 1.2 Add a shared CLI option helper in `src/cli.ts` (mirroring the existing
      `draftsDir`/`dumpsDir` accessor pattern) that resolves `--format`, defaulting to
      `table`, with `--json` mapped to `format: 'json'` when `--format` is not also given,
      and `--format` winning when both are given.
- [ ] 1.3 Refuse an unrecognized `--format` value with an error naming the accepted values,
      before any command-specific logic runs.
- [ ] 1.4 Ensure every command's error/diagnostic output goes to `stderr`, never `stdout`,
      so `--format json`/`yaml` output can be piped without filtering (audit `check.ts`,
      `refs.ts`, `status.ts`, `search.ts` for any `console.log` used for a warning).

## 2. Adopt `--format` on existing `--json` commands

- [ ] 2.1 `src/commands/status.ts`: replace the inline `JSON.stringify` branch with
      `renderOutput`; keep the exact same data shape (no behavior change, only the
      rendering path).
- [ ] 2.2 `src/commands/check.ts`: same swap.
- [ ] 2.3 `src/commands/refs.ts`: same swap.
- [ ] 2.4 `src/cli.ts`: add `--format <table|json|yaml>` alongside the existing `--json` on
      the `status`, `check`, and `refs` commands.
- [ ] 2.5 Extend `test/commands.test.ts` (or the relevant per-command test files) to cover
      `--format json` producing output identical to today's `--json`, `--format yaml`
      producing parseable YAML with the same data, and an invalid `--format` value being
      refused.

## 3. Search: area, trust tier, ranking boost, structured output

- [ ] 3.1 `src/core/search.ts`: compute each hit's area (dumps / drafts / corpus, via the
      existing `inDumps`/`inDrafts` helpers) and trust tier (via `health()` from
      `lifecycle.ts`, as `status.ts` already does per concept) alongside `score`.
- [ ] 3.2 Apply the trust-tier boost to each hit's score before ranking: `human-reviewed`
      ×1.5, `machine-confirmed` ×1.2, `unverified` ×1.0 — as constants next to the existing
      `BOOST` table, tunable independently of it.
- [ ] 3.3 `src/commands/search.ts`: add area and trust tier as trailing columns in the
      existing table output.
- [ ] 3.4 `src/commands/search.ts`: add `--format json`/`yaml` support via `renderOutput`,
      each result object carrying `{ id, title, area, tier, score }`; respect `--limit` in
      structured output exactly as table output does; print a valid empty list (not an
      error) when there are no matches.
- [ ] 3.5 `src/cli.ts`: add `--format <table|json|yaml>` to the `search` command.
- [ ] 3.6 Extend `test/search.test.ts`: area and trust tier appear correctly per hit; a
      near-tied lower-trust vs. higher-trust pair ranks the higher-trust one first; a
      strongly-relevant lower-trust hit still outranks a weakly-relevant higher-trust one;
      dumps/drafts concepts appear in results with their area labeled; `--format json`
      output shape and `--limit` interaction; `--format json` on zero matches.

## 4. Docs

- [ ] 4.1 Update `README.md`'s command reference for `search`'s new columns/flags and the
      shared `--format` flag wherever `--json` is currently documented.
- [ ] 4.2 Update `docs/design.md` if it documents command output shapes.

## 5. Verification

- [ ] 5.1 `npm test` passes end to end.
- [ ] 5.2 Manually pipe `okfctl search <query> --format json` into `jq` against the test
      fixture bundle to confirm the shape is actually convenient to filter with, not just
      schema-valid.
