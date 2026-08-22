# bundle-search Specification

## Purpose
Find concepts in a bundle by relevance to a text query, searching frontmatter and body
together, so an agent or reader can locate what a bundle already knows without reading
every file or knowing exact filenames in advance.

## Requirements

### Requirement: Query Search

The system SHALL accept a free-text query and return concepts ranked by relevance,
matching against each concept's `title`, `description`, `tags` (when present), and body
text.

#### Scenario: Query matches title or body

- **WHEN** the query text appears in a concept's `title`, `description`, `tags`, or body
- **THEN** that concept appears in the results

#### Scenario: Results are ranked

- **WHEN** a query matches more than one concept
- **THEN** results are ordered with the most relevant match first, where a match in
  `title` or `description` ranks above a match found only in body text

#### Scenario: No matches

- **WHEN** no concept matches the query
- **THEN** the command reports zero results and exits zero, rather than treating an empty
  result as an error

#### Scenario: Empty bundle

- **WHEN** the bundle holds no concepts
- **THEN** the command reports zero results and exits zero

### Requirement: Bundle Resolution

The system SHALL resolve the bundle to search the same way other okfctl commands do: an
explicit `--bundle` flag, else the bundle enclosing the current working directory, else
the machine's registered bundle.

#### Scenario: Explicit bundle

- **WHEN** `--bundle <path>` is given
- **THEN** the search runs against the bundle at that path

#### Scenario: No bundle resolvable

- **WHEN** no `--bundle` is given, the cwd is not inside a bundle, and no bundle is
  registered
- **THEN** the command reports that no bundle could be resolved and exits non-zero,
  naming `okfctl init --register`

### Requirement: Fresh Index, No Persisted State

The system SHALL build the search index from the concepts on disk at the start of each
invocation and SHALL NOT persist that index to disk between invocations, so that search
results always reflect the current state of the bundle's Markdown files with no separate
index file that can go stale or drift from them.

#### Scenario: Edit is visible on next search

- **WHEN** a concept file is edited on disk after a previous `search` run
- **THEN** the next `search` run reflects the edited content, with no cache to clear or
  index to rebuild by hand

#### Scenario: No index artifact left behind

- **WHEN** `search` completes
- **THEN** no new file has been written to the bundle or elsewhere as a side effect

### Requirement: Result Output

The system SHALL print each result as the concept's bundle-relative path and its title (or
filename stem when `title` is absent), one per line, ordered by rank.

#### Scenario: Result line format

- **WHEN** a concept matches
- **THEN** its result line shows the path and title, in that order

#### Scenario: Missing title falls back

- **WHEN** a matching concept has no `title`
- **THEN** its filename stem is shown in place of a title, matching the fallback
  `bundle-catalog` already uses

### Requirement: Result Limit

The system SHALL cap the number of returned results to a default limit and SHALL let the
caller raise or lower it with a flag.

#### Scenario: Default cap applies

- **WHEN** more concepts match than the default limit
- **THEN** only the top-ranked results up to the default limit are shown, and the command
  reports how many more matched but were not shown

#### Scenario: Caller overrides the limit

- **WHEN** the caller passes `--limit <n>`
- **THEN** at most `n` results are shown
