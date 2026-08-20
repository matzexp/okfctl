# conformance-check Specification

## Purpose

Report whether a bundle conforms to OKF v0.2, keeping the three conformance rules SPEC §11
actually states strictly separate from advisory conventions, so that a bundle this tool
calls valid is valid to every other consumer too.

## Requirements

### Requirement: Two-Tier Diagnostics

The system SHALL classify every finding as either an error or a warning, where errors are
exactly the SPEC §11 conformance rules and everything else is a warning.

#### Scenario: Only conformance failures are errors

- **WHEN** a bundle has an unknown `type` value, an unknown frontmatter key, a broken
  cross-link, or no `index.md`
- **THEN** none of these produce an error, because SPEC §11 forbids rejecting a bundle for
  any of them

#### Scenario: Every finding carries a stable rule id

- **WHEN** any diagnostic is produced
- **THEN** it names the file it belongs to and a short stable rule id, so output can be
  filtered and suppressed

### Requirement: Conformance Rules

The system SHALL report an error when, and only when, a non-reserved `.md` file lacks
parseable YAML frontmatter, lacks a non-empty `type`, or a reserved file is malformed.

#### Scenario: Unparseable frontmatter

- **WHEN** a concept's frontmatter delimiters are present but the YAML is invalid
- **THEN** an error is reported and no further checks run against that concept

#### Scenario: Missing type

- **WHEN** a concept's `type` is absent, not a string, or empty
- **THEN** an error is reported (SPEC §4.1)

#### Scenario: Frontmatter outside the bundle-root index

- **WHEN** an `index.md` below the bundle root carries a frontmatter block
- **THEN** an error is reported, because only a bundle-root `index.md` may carry one
  (SPEC §12)

#### Scenario: Extra keys in the root index frontmatter

- **WHEN** the bundle-root `index.md` carries frontmatter keys other than `okf_version`
- **THEN** an error is reported naming the offending keys

#### Scenario: Non-ISO log headings

- **WHEN** a `log.md` contains a `## ` heading that is not a `YYYY-MM-DD` date
- **THEN** an error is reported (SPEC §9)

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

### Requirement: Opt-In Strictness

The system SHALL exit non-zero when a bundle has errors, and SHALL exit zero on warnings
alone unless the caller explicitly asks for strictness.

#### Scenario: Warnings do not fail by default

- **WHEN** a bundle has warnings and no errors
- **THEN** the command exits zero and reports the bundle as conformant with OKF v0.2

#### Scenario: Strict mode is opt-in

- **WHEN** the caller passes `--strict` and the bundle has at least one warning
- **THEN** the command exits non-zero, and this is presented as a caller preference rather
  than as spec conformance

### Requirement: Machine-Readable Output

The system SHALL emit the full diagnostic list as JSON on request.

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root, concept count, and every diagnostic with its level, file, rule,
  and message are printed as JSON, and the exit code is unchanged
