## ADDED Requirements

### Requirement: The Dumps Inbox

The system SHALL report the dumps area as its own group, naming how many concepts it
holds and the age of the oldest one, on every run that is not narrowed by a filter.

#### Scenario: The dumps inbox is always visible

- **WHEN** the dumps area holds captured concepts
- **THEN** the summary names the count and the age of the oldest capture, so an inbox that
  is never emptied cannot become invisible

#### Scenario: An empty dumps inbox

- **WHEN** the dumps area is empty or absent
- **THEN** no dumps inbox line is printed

## MODIFIED Requirements

### Requirement: Health Summary

The system SHALL print, for a whole bundle, the distribution of trust tiers and lifecycle
statuses along with the count of stale and drifted concepts, and the dumps inbox and drafts
inbox counts.

#### Scenario: Default summary

- **WHEN** the command runs with no filters
- **THEN** it prints trust tier counts, lifecycle status counts, stale and drifted counts,
  the dumps inbox line, the drafts inbox line, followed by the concepts that carry at
  least one attention flag

#### Scenario: A clean bundle

- **WHEN** no concept is stale, drifted, draft, or unverified
- **THEN** the command reports that nothing needs attention

#### Scenario: Drafts still count in the census

- **WHEN** the bundle holds concepts in the dumps area, the drafts area, or both
- **THEN** they are counted in the trust tier and lifecycle status distributions, because
  those figures describe the whole bundle and omitting them would misreport it

### Requirement: Attention Flags

The system SHALL flag a concept as needing attention when it is stale, drifted, in draft,
or unverified, and SHALL name the `stale_after` date on a stale concept — except for
concepts in the dumps area or the drafts area, which are reported through their
respective inboxes instead, so that captured or refined material cannot drown the signal
the attention list exists to carry.

#### Scenario: Stale flag names its date

- **WHEN** a concept is past its `stale_after`
- **THEN** its flag reads `stale (<date>)` rather than a bare `stale`

#### Scenario: Drafts-area concepts are not in the attention list

- **WHEN** the dumps area holds concepts that are draft and unverified
- **THEN** they do not appear in the default attention list, and the dumps inbox line
  reports them instead

#### Scenario: A draft outside the drafts area still needs attention

- **WHEN** a concept with `status: draft` lives outside the dumps area and the drafts area
- **THEN** it appears in the attention list as before

#### Scenario: Refined entries are not in the attention list

- **WHEN** the drafts area holds concepts that are draft and unverified
- **THEN** they do not appear in the default attention list, and the drafts inbox line
  reports them instead

### Requirement: Filters

The system SHALL support narrowing output to stale, drifted, draft, or unverified
concepts, combining multiple filters as a union, and SHALL support listing the dumps
inbox, listing the drafts inbox, and restoring the unsegregated view.

#### Scenario: Multiple filters union rather than intersect

- **WHEN** the caller passes both `--stale` and `--drifted`
- **THEN** concepts matching either condition are listed

#### Scenario: No matches

- **WHEN** filters are given and no concept matches
- **THEN** the command reports that nothing matched and exits zero

#### Scenario: Drilling into the inbox

- **WHEN** the caller asks for the dumps inbox
- **THEN** the concepts in the dumps area are listed with their capture dates and their
  titles, because a captured concept's id is generated rather than descriptive and a
  listing of ids alone could not be read

#### Scenario: A concept with no title

- **WHEN** a listed concept declares no title
- **THEN** the listing falls back to its filename stem rather than leaving the column empty
  (SPEC §4.1)

#### Scenario: Restoring the unsegregated view

- **WHEN** the caller asks for everything
- **THEN** dumps-area and drafts-area concepts appear in the attention list alongside
  every other flagged concept

#### Scenario: Drilling into the drafts inbox

- **WHEN** the caller asks for the drafts inbox
- **THEN** the concepts in the drafts area are listed with their refined dates, their
  titles, and the source(s) each cites

### Requirement: Machine-Readable Output

The system SHALL emit the per-concept health records as JSON on request, marking which
concepts are in the dumps area and which are in the drafts area.

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root and each concept's id, title, type, status, trust tier,
  staleness, drift, `stale_after`, and flags are printed as JSON, honoring any filters

#### Scenario: Drafts are identifiable in JSON

- **WHEN** the caller passes `--json` on a bundle with a populated dumps area
- **THEN** each record carries whether that concept is in the dumps area, and the dumps
  area's path is reported alongside the bundle root

#### Scenario: Refined entries are identifiable in JSON

- **WHEN** the caller passes `--json` on a bundle with a populated drafts area
- **THEN** each record carries whether that concept is in the drafts area, and the drafts
  area's path is reported alongside the bundle root

### Requirement: The Drafts Inbox

The system SHALL report the drafts area as its own group, naming how many concepts it
holds and the age of the oldest one, on every run that is not narrowed by a filter,
independently of the dumps inbox.

#### Scenario: The inbox is always visible

- **WHEN** the drafts area holds refined concepts
- **THEN** the summary names the count and the age of the oldest refined entry, so a
  drafts backlog that is never placed cannot become invisible

#### Scenario: An empty inbox

- **WHEN** the drafts area is empty or absent
- **THEN** no drafts inbox line is printed

#### Scenario: The two inboxes are reported separately

- **WHEN** both the dumps area and the drafts area hold concepts
- **THEN** each is named on its own line with its own count and age, never combined into
  one figure
