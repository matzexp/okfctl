## 1. `--extend`: in-place update path

- [x] 1.1 Add `--extend <id>` to `RefineOptions`/CLI parsing in `src/commands/refine.ts`,
      and verify `okfctl refine --help` documents it
- [x] 1.2 Resolve the extend target via `findConcept`; refuse with the concept's actual
      area named if it resolves outside the drafts area, and verify with a unit test
      against a corpus-area target
- [x] 1.3 Refuse if the extend target does not resolve at all, naming it, and verify
      nothing is written
- [x] 1.4 When `--type`/`--title` are omitted with `--extend`, default to the existing
      entry's current values; verify an explicit override still wins
- [x] 1.5 Implement the in-place write: full-replacement body from `--body`/`--stdin`,
      preserving the existing `id`/file path, and verify the file's `generated.by`
      updates to the extending actor
- [x] 1.6 Merge `sources[]`: union of the existing entries and newly-named sources, keyed
      by id, never dropping a prior citation; verify with a unit test that re-extending
      with an already-cited source produces no duplicate
- [x] 1.7 Log an "extended" entry distinct from "refined" wording, naming the concept, the
      newly-added source(s), the actor, and the consume outcome; verify against
      `nearestLog`

## 2. `--consume` safety guard

- [x] 2.1 Before any write, check every resolved source's area membership; refuse the
      whole invocation (writing nothing) if any named source is outside the dumps area,
      naming the offending source
- [x] 2.2 Verify the guard applies to both a fresh refine and an `--extend`, and that a
      plain refine with no `--consume` is unaffected (citing a corpus/drafts source
      without consuming still works)

## 3. Preview

- [x] 3.1 Extend `--dry-run` handling so an `--extend` preview prints the full resulting
      body, not only frontmatter, and verify nothing is written
- [x] 3.2 Verify a fresh (non-`--extend`) refine's dry-run output is unchanged

## 4. Skill: check existing knowledge before treating a dump as new

- [x] 4.1 Add a step to `skills/okf-refine/SKILL.md` (before the existing shape decision)
      that searches drafts and corpus concepts for a relationship to the dump via
      `okfctl search`, and verify the step names `okf-recall`'s mechanism rather than
      describing a separate search behavior
- [x] 4.2 On a plausible match, the skill asks the user whether it is unrelated, an
      extension, or a contradiction, before writing anything — verify this is written as
      a decision point inside the existing gated-mode pause, not a new mode
- [x] 4.3 Update `skills/okf-refine/refining-standard.md` with the extend/contradiction
      case, alongside the existing one-to-one/split/consolidate cases

## 5. Skill: extend and contradiction outcomes

- [x] 5.1 On a confirmed extension: if the target is a draft, use `--extend`; if the
      target is a corpus concept, run an ordinary refine citing it as a source (new
      drafts-area entry, corpus untouched) — verify both paths are documented in the
      skill with which CLI invocation each uses
- [x] 5.2 On a confirmed contradiction: the composed body keeps both statements, each
      cited, explicitly marked as conflicting; verify the skill states this applies
      whether the target is a draft (`--extend`) or a corpus concept (new entry)
- [x] 5.3 Verify the skill's guardrails section states the full-replacement-body
      requirement (never drop prior content or a prior citation) and the
      dry-run-before-real-write requirement for both extend and corpus-citing paths

## 6. Tests

- [x] 6.1 Add `--extend` coverage to `test/refine.test.ts`: in-place update, sources
      merge, type/title defaulting, refusal on a corpus target, refusal on a missing
      target
- [x] 6.2 Add `--consume` guard coverage: refusal when a named source is outside the
      dumps area, for both a fresh refine and an `--extend`
- [x] 6.3 Add dry-run coverage: `--extend` preview shows the full resulting body and
      writes nothing
- [x] 6.4 Run `npm test` and confirm the full suite passes

## 7. Docs

- [x] 7.1 Update `README.md`'s `okfctl refine` documentation with `--extend` and the
      `--consume` guard, if such documentation exists
- [x] 7.2 `npm run build` (or equivalent) to confirm `dist/` regenerates cleanly if this
      project ships compiled output
