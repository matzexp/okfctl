## Context

See proposal.md — Why. What shapes the approach here:

- `bundle-model` already walks the bundle and holds every concept's body and
  bundle-relative id, so resolution needs no second traversal. It does not currently record
  reserved files' or directories' presence in a form convenient for lookup — `Bundle` has
  `indexFiles` and `logFiles` as relative-path lists.
- `refs` already strips fenced code and inline code before scanning, and already
  classifies findings into states with a shared vocabulary. Links slot into that shape.
- SPEC §11 forbids rejecting a bundle for broken cross-links. Errors are off the table;
  the only question is which advisory surface reports what.
- The development bundle contains **158 internal links, 0 broken, and 0 anchor fragments** —
  but 57 of those sit in `index.md` and `log.md`, which are reserved files, not concepts.
  Scanning concepts only means **101** links are in scope. The link path therefore has
  real-world exercise; the anchor path has none, so fixtures are its only coverage.

## Goals / Non-Goals

**Goals:**

- One command answers "does every reference in this bundle resolve", covering both joins.
- Resolution is a pure function of the bundle's own contents — no network, no git.
- Anchor slug guesswork stays isolated behind a flag, so a wrong slug rule can never
  invalidate the default path.

**Non-Goals:**

- Verifying external URLs. That is a network check with its own failure modes (rate
  limits, flaky hosts, redirects) and does not belong in a command that is otherwise
  deterministic and offline.
- Fixing links. `refs` reports; it does not rewrite. A `--fix` that rewrites links on a
  rename is a separate change with its own consent question.
- Reference-style link definitions (`[text][ref]` with `[ref]: /target.md` elsewhere).
  Neither the development bundle nor the fixtures use them, and adding a second definition
  table to support a form nothing uses is unearned.

## Decisions

**Fold links into `refs` rather than add a `links` command.**
Both are the same question — does this reference resolve — and one CI step beats two. The
alternative, a sibling command, would duplicate the bundle walk, the code-stripping, the
`--strict` convention, and the JSON envelope. Cost: `refs` output gets denser, mitigated by
`--broken` being the CI-facing form.

**Resolve against the filesystem, not against the loaded concept list.**
`bundle.concepts` excludes reserved files and knows nothing of directories or non-Markdown
assets like images. Checking `existsSync` on a resolved path inside the bundle root
handles all four target kinds uniformly. The trade-off is a syscall per link, which at 158
links in the development bundle is not worth caching against.

**Guard the bundle root explicitly.**
A relative link can escape the root with enough `../`. Resolve, then confirm the result is
still inside the root before the existence check — otherwise `../../../etc/passwd` would
"resolve" and the tool would report a link outside the bundle as healthy.

**Anchors use GitHub's slug rules, behind `--anchors`, implied by `--strict`.**
Lowercase, strip anything that is not alphanumeric/space/hyphen, spaces to hyphens. This is
the de-facto convention every Markdown renderer in the ecosystem approximates, but OKF
names no algorithm, so the rule is ours and the flag says so. `--strict` implying
`--anchors` follows the user's call: a caller gating CI has asked for the strict reading,
and having to pass both flags to get it would be a papercut. This is worth noting in the
README, since `--strict` widening *what* is checked (not just the exit code) is mildly
surprising.

**`check` reports unresolved links but never anchors.**
An unresolved link is unambiguous breakage that any consumer would hit. A failed anchor
match may be our slug rule disagreeing with the bundle's renderer. Putting the first in
`check`'s warning tier and keeping the second in `refs` means the default `check` output
never accuses a bundle of a defect the tool cannot be sure about.

**Extend the existing `ConceptRefs` record rather than parallel it.**
One record per concept carrying both `joins` and `links` keeps the JSON envelope additive:
existing consumers of `refs --json` see new keys, not moved ones.

## Risks / Trade-offs

- **Slug rule disagrees with the reader's renderer** → Anchors are opt-in, `check` never
  reports them, and the states are distinct (`unresolved` vs. missing anchor) so a user can
  tell a wrong path from a slug quarrel at a glance.
- **`--strict` silently widening its scope** → Documented in the README and in `--help`;
  the failure names the anchor explicitly rather than reporting a generic broken link.
- **`refs --strict` now fails bundles it previously passed** → True and intended, but it is
  a behavior change for anyone already gating CI on it. Called out in the proposal's
  Impact. `check` exit codes are unaffected, so the conformance story does not move.
- **Anchor path has no real-world coverage** → Fixtures must carry a resolving anchor, a
  missing anchor, and a bare `#fragment` self-link, since the development bundle exercises none
  of them.
- **Duplicate headings slugify identically** → Both match; the tool reports the anchor as
  resolved. Renderers disambiguate with `-1` suffixes. Accepting the false negative is
  better than inventing suffix rules on top of an already-unspecified slug rule.
