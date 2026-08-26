# bundle-search Specification

## Purpose
Find concepts in a bundle by relevance to a text query, searching frontmatter and body
together, so an agent or reader can locate what a bundle already knows without reading
every file or knowing exact filenames in advance.

## Requirements

### Requirement: Query Search

The system SHALL accept a free-text query and return concepts ranked by relevance,
matching against each concept's `title`, `description`, `tags` (when present), and body
text, and SHALL apply a trust-tier boost on top of relevance so that, all else being
equal, a more-trusted concept ranks above a less-trusted one — without letting trust tier
alone override a clearly stronger relevance match.

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

#### Scenario: Trust tier breaks a near-tie

- **WHEN** two concepts match a query with comparable relevance and different trust tiers
- **THEN** the more-trusted concept (SPEC §5.3: `human-reviewed` above
  `machine-confirmed` above `unverified`) is ranked first

#### Scenario: Strong relevance still wins over trust tier

- **WHEN** a lower-trust concept matches the query substantially more strongly than a
  higher-trust one — for example, a query term appears in its title versus only distantly
  in the other's body
- **THEN** the more relevant concept can still rank first regardless of trust tier, because
  the boost adjusts near-ties rather than overriding relevance

#### Scenario: Dumps and drafts are searched like any other concept

- **WHEN** the dumps area or the drafts area holds concepts matching the query
- **THEN** they appear in results alongside corpus concepts, ranked by the same relevance
  and trust-tier rules — search has never excluded them, and this remains true

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

The system SHALL print each result as the concept's bundle-relative path, its title (or
filename stem when `title` is absent), the area it is in (dumps, drafts, or corpus), and
its trust tier, one per line, ordered by rank.

#### Scenario: Result line format

- **WHEN** a concept matches
- **THEN** its result line shows the path and title, in that order

#### Scenario: Missing title falls back

- **WHEN** a matching concept has no `title`
- **THEN** its filename stem is shown in place of a title, matching the fallback
  `bundle-catalog` already uses

#### Scenario: Area is shown

- **WHEN** a result line is printed
- **THEN** it names whether the concept is in the dumps area, the drafts area, or the
  corpus, so a caller can judge how settled the knowledge is before reading it

#### Scenario: Trust tier is shown

- **WHEN** a result line is printed
- **THEN** it names the concept's trust tier (SPEC §5.3), alongside its area

#### Scenario: Matching context is shown on request

- **WHEN** the caller passes `--snippet`
- **THEN** a line of body text containing one of the matched terms is printed under each
  result, so triage costs one search rather than one search plus a read of every candidate

### Requirement: Result Filters

The system SHALL let the caller narrow results by area, trust tier, concept type, and
tag, refusing an unknown filter value rather than silently matching nothing. Filters
SHALL narrow the search itself rather than being applied to the result it already
settled on.

#### Scenario: Area, tier, type and tag narrow the result

- **WHEN** the caller passes `--area`, `--tier`, `--type`, or `--tag`
- **THEN** only concepts matching every filter given are returned, with `--tag` requiring
  every tag named rather than any of them, and `--type` compared case-insensitively

#### Scenario: An unknown filter value is refused

- **WHEN** the caller passes an area or tier that is not one of the defined values
- **THEN** the command reports the invalid value and the accepted ones, and exits
  non-zero, rather than returning an empty result the caller would read as "nothing known"

#### Scenario: A filter narrows the search rather than truncating its result

- **WHEN** a concept that fails the filter would have satisfied the query on its own, and
  a concept that passes the filter would be found only by a looser interpretation of the
  same query
- **THEN** the filtered concept is returned, because applying the filter after the fact
  would let an excluded document end the search and report the bundle silent about
  something it knows

### Requirement: Match Modes

The system SHALL support two ways of combining a multi-word query: a lookup that wants
every term, falling back to the best partial overlap; and a similarity mode that ranks by
how much of the query overlaps. The lookup SHALL be the default, and a lookup that finds
nothing SHALL name the similarity mode.

#### Scenario: The default is a lookup

- **WHEN** a query's terms all appear in one concept
- **THEN** that concept is the answer, rather than the top of a list also holding
  concepts carrying only some of the terms

#### Scenario: The similarity mode ranks by overlap

- **WHEN** the caller passes `--match any` and no concept carries every term
- **THEN** concepts carrying some of them are returned, ranked by relevance, rather than
  being cut to the best partial overlap the lookup would apply

#### Scenario: A query phrased in the searcher's words still reaches the answer

- **WHEN** the concept that answers a question is titled in the vocabulary of the system
  it describes, and the query is phrased the way someone would ask a colleague
- **THEN** the similarity mode reaches it, because search is lexical and the lookup can
  only match the words the concept actually carries

#### Scenario: An empty lookup names the looser mode

- **WHEN** a default search returns no results
- **THEN** the output names `--match any`, so a caller does not read a vocabulary mismatch
  as the bundle knowing nothing

#### Scenario: The suggestion is not repeated to a caller already using it

- **WHEN** a `--match any` search returns no results
- **THEN** the output does not suggest the mode that is already in use

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

### Requirement: Search Output Is Structured On Request

The system SHALL support `--format json` and `--format yaml` on the search command (SPEC
`cli-output-format`), each result carrying its path, title, area, trust tier, and score.

#### Scenario: Structured results are complete

- **WHEN** the caller requests `--format json`
- **THEN** each result object includes the concept id, title, area, trust tier, and
  relevance score, so a caller can filter or re-sort with `jq` without recomputing trust
  tier itself

#### Scenario: Structured output respects the limit

- **WHEN** `--format json` or `--format yaml` is combined with `--limit`
- **THEN** only the top-ranked results up to the limit are included, matching table
  output's behavior

#### Scenario: No matches in structured form

- **WHEN** no concept matches the query and `--format json` is requested
- **THEN** an empty result list is printed as valid JSON, not an error and not empty
  standard output
