## 1. Link extraction

- [x] 1.1 Add a `Link` record to `src/core/refs.ts` carrying the raw target, the path part,
      the fragment, and the resolution state
- [x] 1.2 Extract Markdown links and images from a body, reusing the existing code-stripping
      pass so fenced blocks and inline spans are excluded
- [x] 1.3 Discard `http:`, `https:`, and `mailto:` targets and empty targets; keep
      root-absolute, relative, and bare-fragment forms
- [x] 1.4 Unit-test extraction against each form, including a link inside a fenced block and
      one inside an inline code span

## 2. Resolution

- [x] 2.1 Resolve root-absolute targets from the bundle root and relative targets from the
      linking concept's directory
- [x] 2.2 Reject a resolved path that escapes the bundle root before touching the
      filesystem, classifying it `unresolved`
- [x] 2.3 Classify a target as resolved when it exists as a file or a directory, so
      reserved files, directories, and image assets all count
- [x] 2.4 Treat a bare `#fragment` as addressing the linking concept itself
- [x] 2.5 Unit-test each case, including `../../escape.md` and a link to `guides/`

## 3. Anchors

- [x] 3.1 Add heading slugification (lowercase, drop non-alphanumeric/space/hyphen, spaces
      to hyphens) and collect slugs from a target document's headings
- [x] 3.2 Verify fragments only when anchor checking is enabled; add the missing-anchor
      state distinct from `unresolved`
- [x] 3.3 Unit-test a resolving anchor, a missing anchor, a self-link fragment, and that
      fragments are ignored when the flag is off

## 4. Wiring

- [x] 4.1 Extend `conceptRefs` to return links alongside the existing footnote joins,
      keeping the JSON shape additive
- [x] 4.2 Add the `link-unresolved` advisory rule to `src/core/check.ts`; confirm anchors
      never reach `check`
- [x] 4.3 Add `--anchors` to `okfctl refs` in `src/cli.ts`, and make `--strict` imply it
- [x] 4.4 Render link rows in `src/commands/refs.ts`, extend the summary line with link
      counts, and honor `--broken` for links

## 5. Fixtures and verification

- [x] 5.1 Add to the fixture bundle: a resolving link, a broken link, a link to a
      directory, a link to a reserved file, a resolving anchor, and a missing anchor
- [x] 5.2 Add command-level tests for `refs` exit codes with and without `--strict`, and for
      `check` reporting `link-unresolved` as a warning while the bundle stays conformant
- [x] 5.3 Run `npm test` and `npx tsc --noEmit`
- [x] 5.4 Run `okfctl refs` and `okfctl check` against the development bundle; confirm every
      in-scope link resolves, 0 break, and the bundle still reports 0 errors. Verified: 101
      links across concepts, all resolving. The 57 remaining links of the bundle's 158 live
      in `index.md`/`log.md`, which are reserved files and out of scope for concept scanning

## 6. Documentation

- [x] 6.1 Update the README `refs` section to describe both joins, the link states, and the
      target kinds that count as valid
- [x] 6.2 Document that `--strict` implies `--anchors`, since it widens what is checked
      rather than only changing the exit code
- [x] 6.3 Update the README development-bundle line if the link count it cites is now verified
      rather than hand-counted
