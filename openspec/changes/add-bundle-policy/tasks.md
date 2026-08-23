## 1. Policy directory scaffolding

- [ ] 1.1 Add `src/core/policy.ts`: `POLICY_DIR = '.okf/policy'`, and three functions
      (`contentPolicyTemplate()`, `sourcePolicyTemplate()`, `fieldPolicyTemplate()`)
      returning each file's seed content as a string, following the same
      template-function pattern `init.ts` already uses for `rootIndex()`/`rootLog()`.
- [ ] 1.2 Write `contentPolicyTemplate()`'s content: restate `okf-capture`'s existing
      "what counts as durable" categories (decision-and-why, root cause, gotcha,
      correction, measurement, procedure, negative result, local-setup/org-convention
      mistakes) as editable bundle policy, plus a section inviting per-type staleness
      horizon conventions, plus a short note at the top explaining this file is read by
      `okf-capture`/`okf-refine` and is meant to be edited.
- [ ] 1.3 Write `sourcePolicyTemplate()`'s content: restate `okf-review`'s existing
      source-checking guidance (follow `sources[]` to the file/repo/URL; check links;
      check the system itself when inspectable; the "cannot tell" case) and
      `okf-capture`'s "be specific, name exact components/versions/commands" guidance, as
      editable bundle policy on what makes a citation good enough here.
- [ ] 1.4 Write `fieldPolicyTemplate()`'s content: explain SPEC §11's baseline (`type`,
      `title` always required; `status`/`generated`/`verified` are CLI-managed, never
      hand-edited) and leave a per-type requirements section as a table template the
      first `okf-ingest` run (or the user) fills in, replacing today's "record the answer
      as a concept" fallback.
- [ ] 1.5 Update `src/commands/init.ts`: add `.okf/policy/content-policy.md`,
      `.okf/policy/source-policy.md`, `.okf/policy/field-policy.md` to the `planned`
      array, each as a `file` entry with its template content — following the exact
      missing-vs-existing reporting the rest of `planned` already uses. No new
      `InitOptions` field needed; these are not overridable paths like `--drafts-dir`.
- [ ] 1.6 Confirm (via a test, not by inspection) that `.okf/` is excluded from
      `loadBundle`'s walk with no changes to `src/core/bundle.ts` — it already skips any
      dotfile-prefixed entry.

## 2. Tests

- [ ] 2.1 `test/policy.test.ts`: `okfctl init` on an empty directory creates all three
      policy files with non-empty content; a second `init` run leaves an edited policy
      file untouched (write custom content, re-run init, assert unchanged); a directory
      with only one of the three files present gets the other two created and the
      existing one left alone.
- [ ] 2.2 Extend `test/init.test.ts`'s "init scaffolds a conformant bundle" test to assert
      the three policy files exist and `okfctl check`/`loadBundle` report zero concepts
      contributed by `.okf/` (bundle concept count unaffected by policy files existing).
- [ ] 2.3 `npm test` passes end to end.

## 3. Skills read and apply policy

- [ ] 3.1 Edit `skills/okf-capture/SKILL.md`: after "Establish the target bundle," add a
      step reading `.okf/policy/content-policy.md` if present, applying it as a
      refinement to the "decide whether there is anything to capture" judgment. State
      explicitly that policy can narrow the bar but never license inventing an actor or
      skipping the "write nothing rather than something uncertain" guardrail.
- [ ] 3.2 Edit `skills/okf-refine/SKILL.md`: same pattern — read
      `content-policy.md`/`field-policy.md` after establishing the bundle root, apply to
      the shape/type/title judgment in steps 3-4. State the same non-override boundary
      for provenance carryover and actor honesty.
- [ ] 3.3 Edit `skills/okf-ingest/SKILL.md`: read `field-policy.md` when deciding
      placement and type (step 2); change the no-corpus fallback from "record the answer
      as a concept" to "record the answer in `field-policy.md`." Read `source-policy.md`
      when writing citations (step 5).
- [ ] 3.4 Edit `skills/okf-review/SKILL.md`: read `source-policy.md` before step 3 ("check
      it against something real"), applying it to what counts as a sufficient check.
      State the same non-override boundary for the "never `--confirm` without actually
      checking" guardrail.
- [ ] 3.5 Update each edited skill's guardrails section with one line: policy narrows or
      extends judgment calls, never overrides an actor/provenance/citation guardrail.

## 4. Docs

- [ ] 4.1 Update `README.md`: document `.okf/policy/` alongside "The dumps and drafts
      areas" section — what each file is for, that it's scaffolded once and never
      overwritten, and that it's excluded from the bundle walk like `.claude/`/`.agents/`.
- [ ] 4.2 Update `docs/design.md`: add a short section on the policy directory design
      (why `.okf/` not a plain top-level dir, why three files not one), mirroring the
      style of the existing "The dumps and drafts areas" section there.

## 5. Verification

- [ ] 5.1 `npx tsc --noEmit` passes.
- [ ] 5.2 `npm test` passes end to end.
- [ ] 5.3 Manually run `okfctl init` against a scratch directory and read the three
      seeded files to confirm they read as genuinely useful starting guidance, not
      boilerplate — this is the one task in this change that can't be verified by a test
      assertion alone.
