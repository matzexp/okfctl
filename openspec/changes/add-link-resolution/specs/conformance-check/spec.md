## MODIFIED Requirements

### Requirement: Advisory Lint

The system SHALL report warnings for conventions that improve a bundle without being
required by it, and these SHALL never fail a bundle.

#### Scenario: Recommended fields

- **WHEN** a concept has no `description`, no `generated`, a malformed `generated`, or a
  `generated` without a `by`
- **THEN** a warning is reported for each

#### Scenario: Unrecognized status

- **WHEN** a concept's `status` is present but is not draft, stable, or deprecated
- **THEN** a warning is reported naming the value (SPEC §5.4)

#### Scenario: Source entry without a resource

- **WHEN** a `sources[]` entry has no `resource`
- **THEN** a warning is reported naming its index (SPEC §5.1)

#### Scenario: Freshness signals surface as warnings

- **WHEN** a concept is stale or drifted
- **THEN** a warning is reported for each condition

#### Scenario: Unresolved internal links

- **WHEN** a concept links to a path that does not exist in the bundle
- **THEN** a warning is reported naming the link target, and the bundle stays conformant,
  because SPEC §11 forbids rejecting a bundle for broken cross-links
