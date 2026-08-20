# corpus-status Specification

## Purpose

Summarize the health of a bundle — trust tiers, lifecycle states, staleness, and drift —
and narrow that summary to the concepts that need a maintainer's attention.

## Requirements

### Requirement: Health Summary

The system SHALL print, for a whole bundle, the distribution of trust tiers and lifecycle
statuses along with the count of stale and drifted concepts.

#### Scenario: Default summary

- **WHEN** the command runs with no filters
- **THEN** it prints trust tier counts, lifecycle status counts, stale and drifted counts,
  followed by the concepts that carry at least one attention flag

#### Scenario: A clean bundle

- **WHEN** no concept is stale, drifted, draft, or unverified
- **THEN** the command reports that nothing needs attention

### Requirement: Attention Flags

The system SHALL flag a concept as needing attention when it is stale, drifted, in draft,
or unverified, and SHALL name the `stale_after` date on a stale concept.

#### Scenario: Stale flag names its date

- **WHEN** a concept is past its `stale_after`
- **THEN** its flag reads `stale (<date>)` rather than a bare `stale`

### Requirement: Filters

The system SHALL support narrowing output to stale, drifted, draft, or unverified
concepts, combining multiple filters as a union.

#### Scenario: Multiple filters union rather than intersect

- **WHEN** the caller passes both `--stale` and `--drifted`
- **THEN** concepts matching either condition are listed

#### Scenario: No matches

- **WHEN** filters are given and no concept matches
- **THEN** the command reports that nothing matched and exits zero

### Requirement: Machine-Readable Output

The system SHALL emit the per-concept health records as JSON on request.

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root and each concept's id, title, type, status, trust tier,
  staleness, drift, `stale_after`, and flags are printed as JSON, honoring any filters

### Requirement: Advisory Exit Code

The system SHALL exit zero regardless of what it finds, because reporting corpus health is
not a conformance judgement.

#### Scenario: An unhealthy bundle still exits zero

- **WHEN** every concept in the bundle is stale, drifted, and unverified
- **THEN** the command exits zero
