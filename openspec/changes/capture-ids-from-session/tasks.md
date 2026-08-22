## 1. Id generation

- [ ] 1.1 Add id generation to `src/commands/capture.ts`: `<YYYY-MM-DD>-<session8>-<n>`,
      where `session8` is the first eight characters of the session id reduced to the
      bundle's id style, and `n` starts at 1
- [ ] 1.2 Derive the sequence from the target directory on disk — scan for ids already
      matching `<date>-<session8>-` and take the highest plus one — so capture works with no
      hook state and stays correct under retry
- [ ] 1.3 Use the fixed stand-in label when no session is supplied, and never generate an
      identifier that could be mistaken for a real session id
- [ ] 1.4 Apply the scheme regardless of `--to`, and let `--id` override it
- [ ] 1.5 Split the collision rule: a generated id advances the sequence rather than
      refusing; an explicit `--id` that is taken still refuses naming the existing concept
- [ ] 1.6 Tests: the generated form; a second capture in one session; sequence read from the
      bundle rather than from state; two sessions on one day; `--to` does not change the
      form; `--id` overrides; a generated id never refuses; an explicit id collision does

## 2. Session provenance

- [ ] 2.1 Add `--session <id>` to `capture` in `src/cli.ts` and `CaptureOptions`
- [ ] 2.2 Record the full session id as a `sources[]` entry in `src/core/origin.ts`,
      alongside the existing origin entry and without displacing caller-supplied sources
- [ ] 2.3 Record no session entry at all when none is supplied
- [ ] 2.4 Tests: session recorded alongside origin; absent when not supplied; supplied
      sources preserved; the entry survives an `okfctl move` unchanged

## 3. `slugify` keeps one job

- [ ] 3.1 Stop deriving ids from titles; keep `slugify` for normalizing an explicit `--id`
- [ ] 3.2 Fix the truncation to cut on a hyphen boundary rather than mid-word — the bug that
      produced `...-and-histogra`
- [ ] 3.3 Tests: a long `--id` is cut at a word boundary; spaces and punctuation normalize;
      no title is ever turned into an id

## 4. Readable inbox

- [ ] 4.1 Print each concept's title in the `--drafts` listing in `src/commands/status.ts`,
      falling back to the filename stem when a concept declares none (SPEC §4.1)
- [ ] 4.2 Leave the main attention list unchanged — the column is added only where ids are
      generated
- [ ] 4.3 Tests: titles appear under `--drafts`; the fallback renders; the default listing
      is unchanged

## 5. The capture workflow

- [ ] 5.1 Update `.claude/skills/okf-capture/SKILL.md`: pass `--session` when the host
      reports one, and stop reaching for `--id` — the generated id is the expected case now,
      and the title is what carries meaning
- [ ] 5.2 Confirm the installed copy is the packaged one, so a wired agent picks the change
      up by reinstalling rather than by hand-editing

## 6. Documentation

- [ ] 6.1 Rewrite the id paragraph in the `capture` section of `docs/design.md`: the scheme,
      why the sequence comes off the disk, why a missing session is labelled rather than
      invented, and why the session lives in `sources[]` and not a top-level key
- [ ] 6.2 Update the drafts-area section of the README with the id form and `--session`
- [ ] 6.3 State plainly that existing concepts keep their ids and nothing is rewritten

## 7. Verification

- [ ] 7.1 `npm test` green
- [ ] 7.2 Capture twice in one session against the fixture bundle and confirm both land,
      then run `check`, `index --check`, `refs --broken --strict`
- [ ] 7.3 Confirm a bundle holding both old title-derived ids and new generated ids reports
      and resolves correctly, since no migration rewrites the old ones
