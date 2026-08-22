## 1. Dependency

- [x] 1.1 Add `minisearch` to `package.json` dependencies and run `npm install`
- [x] 1.2 Confirmed: `minisearch@7.2.0` ships its own declarations, no `@types/*` needed

## 2. Search core

- [x] 2.1 Add `src/core/search.ts` exporting a function that takes a `Bundle` (from
      `loadBundle`) and a query string, builds a MiniSearch index over `id`, `title`,
      `description`, `tags`, and `body` for every concept (falling back to the filename
      stem per `conceptTitle` when `title` is absent, matching `bundle-catalog`'s
      convention), boosts `title` and `description` above `body`/`tags`, and returns
      ranked `{ concept, score }` results
- [x] 2.2 Handle the empty-bundle case (`bundle.concepts.length === 0`) by returning an
      empty result list without invoking MiniSearch

## 3. CLI command

- [x] 3.1 Add `src/commands/search.ts` exporting `runSearch(options)` — options carry
      `bundle: string`, `query: string`, and `limit?: number`
- [x] 3.2 Resolve the bundle via the same pattern `catalog`/`status` use
      (`loadBundle(options.bundle)`, with `options.bundle` already resolved upstream by
      `resolveBundleDir` per existing CLI wiring); on a resolution failure, print the
      "no bundle could be resolved" message naming `okfctl init --register` and return
      non-zero
- [x] 3.3 Print one result line per match as `<path>  <title>`, ordered by score
      descending, capped at `--limit` (default 10)
- [x] 3.4 When results are truncated by the limit, print a trailing line reporting how
      many additional matches were not shown
- [x] 3.5 When there are zero matches, print a "no matches" line and return 0
- [x] 3.6 Wire the `search <query>` command into `src/cli.ts` (mirroring how `catalog` is
      registered), with a `--bundle <dir>`, `--limit <n>` option

## 4. Tests

- [x] 4.1 Add `test/search.test.ts` against the existing fixture bundle (see
      `test/fixtures`, used by `commands.test.ts`), covering: a query matching by title,
      a query matching only in body, a query with no matches, an empty-bundle case, and
      `--limit` truncation with the "N more" line
- [x] 4.2 Assert ranking: a concept matching in `title` sorts above one matching only in
      `body` for the same query term

## 5. Performance validation

- [x] 5.1 Build a throwaway ~2,000-concept fixture bundle (script, not checked in) sized
      like real OKF concepts (frontmatter + a few paragraphs of body each)
- [x] 5.2 Measured at 1k/2k/10k concepts; design.md's Performance section now carries the
      real table. End-to-end: 375 ms / 565 ms / 2,237 ms. Query against a built index is
      ~0.07 ms and flat; the cost is bundle loading plus indexing, both linear

## 6. Docs

- [x] 6.1 Add `okfctl search` to the command list in `README.md` alongside `status`,
      `check`, `refs`, `capture`
