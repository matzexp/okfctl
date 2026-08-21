## Why

A bundle's cross-links are the only thing making it navigable, and nothing watches them.
An agent renames or moves a concept, every link pointing at it dies silently, and `check`
and `refs` both report the bundle clean. `refs` already holds one reference join together
— footnote to `sources[].id` — and this is the other one, breaking the same way for the
same reason.

## What Changes

- `okfctl refs` gains a second join: internal Markdown links between files in the bundle,
  reported alongside footnote citations rather than in a separate command. Both answer
  "does this reference resolve"; splitting them would mean two commands and two CI steps
  for one question.
- Link targets are classified `resolved` or `unresolved`. Root-absolute (`/guides/x.md`),
  relative (`../decisions/y.md`), and bare-fragment (`#section`) forms are all read;
  external schemes (`http`, `https`, `mailto`) are out of scope, since verifying those is
  a network check, not a bundle check.
- Directories (`guides/`) and reserved files (`index.md`, `log.md`) count as valid
  targets. `okfctl index` generates `* [guides](guides/)` links itself, so excluding them
  would have the tool flag its own output.
- `check` reports unresolved links as **warnings** under a new `link-unresolved` rule.
  SPEC §11 forbids rejecting a bundle for broken cross-links, so this cannot be an error,
  and `refs` keeps exiting zero on breakage unless `--strict` is given.
- Anchor fragments are not verified by default: matching `#label-shape` to a heading means
  inventing a slug algorithm OKF does not define, so a mismatch might be our bug rather
  than the bundle's. `--anchors` turns that verification on, and `--strict` implies it —
  a caller gating CI has opted into the stricter reading.
- `refs --broken` and `--json` extend to cover links, and the summary line gains link
  counts.

## Capabilities

### New Capabilities

<!-- none: this extends an existing capability rather than introducing one -->

### Modified Capabilities

- `citation-refs`: gains link extraction, link resolution against the bundle, optional
  anchor verification, and the `--anchors` flag; its existing join-state vocabulary and
  advisory-reporting requirements extend to cover link findings.
- `conformance-check`: the advisory lint tier gains the `link-unresolved` warning.

## Impact

- `src/core/refs.ts` — link extraction and resolution beside the existing footnote join.
- `src/core/check.ts` — one added advisory rule.
- `src/commands/refs.ts` — `--anchors` flag, link rows, extended summary and JSON shape.
- `src/cli.ts` — flag registration.
- `README.md` — the `refs` section documents one join today and will document two.
- `test/fixtures/bundle/` — needs a broken link and a broken anchor to exercise.
- No new dependencies. Resolution is `node:fs` existence checks against paths already
  loaded by `bundle-model`.
- **Not breaking** for `check` exit codes: a bundle with broken links stays conformant.
  It **is** a behavior change for `refs --strict`, which will now fail on broken links in
  bundles it previously passed.
