## MODIFIED Requirements

### Requirement: Filters

The system SHALL support narrowing output to stale, drifted, draft, or unverified
concepts, combining multiple filters as a union, and SHALL support listing the drafts
inbox and restoring the unsegregated view.

#### Scenario: Multiple filters union rather than intersect

- **WHEN** the caller passes both `--stale` and `--drifted`
- **THEN** concepts matching either condition are listed

#### Scenario: No matches

- **WHEN** filters are given and no concept matches
- **THEN** the command reports that nothing matched and exits zero

#### Scenario: Drilling into the inbox

- **WHEN** the caller asks for the drafts inbox
- **THEN** the concepts in the drafts area are listed with their capture dates and their
  titles, because a captured concept's id is generated rather than descriptive and a
  listing of ids alone could not be read

#### Scenario: A concept with no title

- **WHEN** a listed concept declares no title
- **THEN** the listing falls back to its filename stem rather than leaving the column empty
  (SPEC §4.1)

#### Scenario: Restoring the unsegregated view

- **WHEN** the caller asks for everything
- **THEN** drafts-area concepts appear in the attention list alongside every other flagged
  concept
