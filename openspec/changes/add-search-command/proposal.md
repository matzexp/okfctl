## Why

A bundle's only way to find a concept today is `index.md`, the generated catalog, or an
agent grepping the filesystem directly. None of those rank by relevance, tolerate typos, or
search frontmatter (tags, type, description) and body together. As a bundle grows past a
few dozen concepts, "where did we write about X" becomes a real cost paid on every session
that starts cold. A `search` command gives agents and humans a fast, ranked way to answer
that without reading the whole corpus.

## What Changes

- Add `okfctl search <query>` — full-text search across a bundle's concepts (frontmatter
  fields and body), ranked by relevance.
- Index is built in memory on every invocation, not persisted to disk. This is a deliberate
  choice: a persisted index is a second copy of the truth that can drift from the Markdown
  files exactly the way `index.md` can, and okfctl's whole design is built around treating
  the Markdown as the only source of truth (SPEC 11 forbids requiring anything beyond it
  for conformance). At the corpus sizes this tool targets (hundreds to low thousands of
  concepts), in-memory indexing per invocation is fast enough that persistence buys nothing
  but a staleness risk.
- No new native dependency — search runs on a pure-JS/TS library, so `npm install` stays
  simple across platforms.

## Capabilities

### New Capabilities

- `bundle-search`: full-text search over a bundle's concepts, in-memory indexing per
  invocation, ranked results, CLI surface (`okfctl search`).

### Modified Capabilities

(none — no existing capability's requirements change)

## Impact

- New file `src/commands/search.ts` (CLI verb, following the one-file-per-verb convention).
- New dependency: a lightweight pure-JS full-text search library (evaluated in design.md).
- Reuses `src/core/` bundle-loading (the same concept enumeration `bundle-catalog` and
  `corpus-status` already use) — no changes to the bundle model itself.
- `package.json` gains one new runtime dependency.
