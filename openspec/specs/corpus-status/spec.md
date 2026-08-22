# corpus-status Specification

## Purpose

Summarize the health of a bundle — trust tiers, lifecycle states, staleness, and drift —
and narrow that summary to the concepts that need a maintainer's attention.

## Requirements

### Requirement: Health Summary

The system SHALL print, for a whole bundle, the distribution of trust tiers and lifecycle
statuses along with the count of stale and drifted concepts, and the drafts inbox count.

#### Scenario: Default summary

- **WHEN** the command runs with no filters
- **THEN** it prints trust tier counts, lifecycle status counts, stale and drifted counts,
  the drafts inbox line, followed by the concepts that carry at least one attention flag

#### Scenario: A clean bundle

- **WHEN** no concept is stale, drifted, draft, or unverified
- **THEN** the command reports that nothing needs attention

#### Scenario: Drafts still count in the census

- **WHEN** the bundle holds concepts in the drafts area
- **THEN** they are counted in the trust tier and lifecycle status distributions, because
  those figures describe the whole bundle and omitting them would misreport it

### Requirement: Attention Flags

The system SHALL flag a concept as needing attention when it is stale, drifted, in draft,
or unverified, and SHALL name the `stale_after` date on a stale concept — except for
concepts in the drafts area, which are reported through the inbox instead, so that captured
material cannot drown the signal the attention list exists to carry.

#### Scenario: Stale flag names its date

- **WHEN** a concept is past its `stale_after`
- **THEN** its flag reads `stale (<date>)` rather than a bare `stale`

#### Scenario: Drafts-area concepts are not in the attention list

- **WHEN** the drafts area holds concepts that are draft and unverified
- **THEN** they do not appear in the default attention list, and the inbox line reports
  them instead

#### Scenario: A draft outside the drafts area still needs attention

- **WHEN** a concept with `status: draft` lives outside the drafts area
- **THEN** it appears in the attention list as before

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

### Requirement: Machine-Readable Output

The system SHALL emit the per-concept health records as JSON on request, marking which
concepts are in the drafts area.

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root and each concept's id, title, type, status, trust tier,
  staleness, drift, `stale_after`, and flags are printed as JSON, honoring any filters

#### Scenario: Drafts are identifiable in JSON

- **WHEN** the caller passes `--json` on a bundle with a populated drafts area
- **THEN** each record carries whether that concept is in the drafts area, and the drafts
  area's path is reported alongside the bundle root

### Requirement: Advisory Exit Code

The system SHALL exit zero regardless of what it finds, because reporting corpus health is
not a conformance judgement.

#### Scenario: An unhealthy bundle still exits zero

- **WHEN** every concept in the bundle is stale, drifted, and unverified
- **THEN** the command exits zero

### Requirement: The Drafts Inbox

The system SHALL report the drafts area as its own group, naming how many concepts it
holds and the age of the oldest one, on every run that is not narrowed by a filter.

#### Scenario: The inbox is always visible

- **WHEN** the drafts area holds captured concepts
- **THEN** the summary names the count and the age of the oldest capture, so an inbox that
  is never emptied cannot become invisible

#### Scenario: An empty inbox

- **WHEN** the drafts area is empty or absent
- **THEN** no inbox line is printed
