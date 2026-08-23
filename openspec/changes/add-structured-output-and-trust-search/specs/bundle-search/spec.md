## MODIFIED Requirements

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

## ADDED Requirements

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
