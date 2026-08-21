## 1. Shared write path

- [x] 1.1 Move `commit()` out of `src/commands/transition.ts` into `src/core/commit.ts`,
      taking the target path, the rendered contents, the log entry, and the display info,
      so it serves a verb whose file does not exist yet
- [x] 1.2 Rewire `promote` and `deprecate` onto the extracted helper with no behavior
      change; the existing lifecycle tests must pass untouched
- [x] 1.3 Leave the conformance gate in the verbs that want it, not in the helper

## 2. Concept construction

- [x] 2.1 Add a builder to `src/core/concept.ts` that produces a `Concept` from scratch —
      a YAML `Document` plus a body — so `serializeConcept` renders it with the same flow
      conventions as an edited one
- [x] 2.2 Emit keys in the bundle's established order (`type`, `title`, `description`,
      `tags`, `status`, `generated`), omitting every field the caller did not supply
- [x] 2.3 Unit-test that a built concept round-trips: serialize, re-parse, and get back the
      same frontmatter values

## 3. `okfctl new`

- [x] 3.1 Add `src/commands/new.ts`: resolve the target path from the bundle root, tolerate
      a `.md` suffix, and create intermediate directories
- [x] 3.2 Require `--type`; accept any non-empty value, including one outside the
      conventional vocabulary (SPEC §11)
- [x] 3.3 Write `status: draft` by default and a `generated` entry from `--by`, validating
      the actor against the SPEC §7 forms before writing
- [x] 3.4 Support `--stale-after` and `--stale-in`, writing neither when both are absent
- [x] 3.5 Refuse to overwrite an existing file, exiting non-zero with the file unchanged
- [x] 3.6 Route the write through the shared helper so the log entry and `--dry-run` come
      for free
- [x] 3.7 Register the command in `src/cli.ts`

## 4. `okfctl review`

- [x] 4.1 Add `src/commands/review.ts` requiring exactly one of `--confirm` and
      `--outdated`, erroring when both or neither is given
- [x] 4.2 `--confirm`: append a `verified` entry, leave `status` untouched, and set
      `stale_after` from `--stale-after`/`--stale-in`
- [x] 4.3 `--outdated`: set `stale_after` to today, append nothing to `verified`, and leave
      `status` alone
- [x] 4.4 Validate the actor; require it for `--confirm`, since a `verified` entry cannot be
      written without a `by`
- [x] 4.5 Write a log entry naming the outcome and the `--reason` when given
- [x] 4.6 Register the command in `src/cli.ts`

## 5. Tests

- [x] 5.1 Command tests for `new`: conformant output, `--type` required, refusal to
      overwrite, directory creation, `--dry-run` writing nothing, and the log entry
- [x] 5.2 Command tests for `review`: both outcomes, the exclusivity error, `verified`
      untouched on `--outdated`, `status` untouched on both, and the drift case where a
      confirmation post-dates `generated.at`
- [x] 5.3 A test that a concept created by `new` and then promoted passes `check` with zero
      errors at every step
- [x] 5.4 Run `npm test` and `npx tsc --noEmit`

## 6. Skills

- [x] 6.1 `.claude/skills/okf-triage/SKILL.md` — read-only: run `status`, `check`, and
      `refs`, report health, and name the workflow each finding calls for
- [x] 6.2 `.claude/skills/okf-ingest/SKILL.md` — establish the bundle and the placement
      against its existing structure, preview, create through `okfctl new`, then write the
      body
- [x] 6.3 `.claude/skills/okf-promote/SKILL.md` — resolve the concept, confirm the actor,
      run `check` first, promote with a freshness horizon
- [x] 6.4 `.claude/skills/okf-deprecate/SKILL.md` — confirm the target and reason, run
      `refs` afterward to surface links now pointing at deprecated knowledge
- [x] 6.5 `.claude/skills/okf-review/SKILL.md` — work the `status --stale --drifted` list,
      check each concept against its `sources[]`, route to `--confirm`, `--outdated`, or
      report unverifiable; batch preview before the first write
- [x] 6.6 Give every skill a selection-oriented `description`, `allowed-tools` scoped to
      `Bash(okfctl:*)` plus Read/Edit only where the body-text exception applies, and a
      guardrail forbidding direct frontmatter edits
- [x] 6.7 Add `/okf:<name>` command files under `.claude/commands/okf/`

## 7. Verification and documentation

- [x] 7.1 Exercise the full loop against a scratch copy of the development bundle: ingest a
      concept, promote it, review it as confirmed, review another as outdated, deprecate
      one, and confirm `check` reports zero errors throughout
- [x] 7.2 Confirm `status --stale` lists a concept reviewed as outdated, and that its trust
      tier is unchanged by that review
- [x] 7.3 README: two new rows in the command table, the ingest end of the maintainer's
      loop, the one-line rule for `promote` versus `review --confirm`, and why an outdated
      review writes `stale_after` rather than a field of its own
- [x] 7.4 README: a short section on the skills and what each is for
