# lifecycle-transitions Specification

## Purpose

Perform the draft to stable and stable to deprecated transitions as single commands,
recording the verification, the status change, the freshness horizon, and the narrative
log entry that a hand edit would have to get right across four places at once.

## Requirements

### Requirement: Promotion

The system SHALL, on promotion, append a `{ by, at }` entry to `verified`, set `status` to
`stable`, and optionally set `stale_after`.

#### Scenario: Draft becomes stable

- **WHEN** a concept with `status: draft` is promoted by `human:matze`
- **THEN** `verified` gains an entry naming that actor and the current instant, and
  `status` becomes `stable`

#### Scenario: A bare verified mapping is normalized before appending

- **WHEN** the concept's `verified` is a single mapping rather than a list
- **THEN** it is converted into a one-element list first, and the new entry is appended to
  it (SPEC §5.2)

#### Scenario: Re-verifying an already stable concept

- **WHEN** the concept is already `stable`
- **THEN** the promotion is recorded as a re-verification rather than as a status change

### Requirement: Freshness Horizon

The system SHALL set `stale_after` from either an absolute date or a duration relative to
today, and SHALL leave the field untouched when neither is given.

#### Scenario: Relative duration

- **WHEN** the caller passes `--stale-in 90d`
- **THEN** `stale_after` is set to the ISO day 90 days from today; `d`, `w`, `m`, and `y`
  units are accepted

#### Scenario: Invalid duration

- **WHEN** the duration does not parse
- **THEN** the command fails with an error naming the accepted forms, and writes nothing

### Requirement: Conformance Gate

The system SHALL refuse to promote a concept that has conformance errors, unless the
caller overrides.

#### Scenario: Promotion blocked

- **WHEN** the target concept has a conformance error such as a missing `type`
- **THEN** the command lists the blocking errors, exits non-zero, and leaves the file
  unchanged

#### Scenario: Override

- **WHEN** the caller passes `--force`
- **THEN** the promotion proceeds despite the errors

### Requirement: Actor Validation

The system SHALL accept only the SPEC §7 actor forms — `human:<id>`, `process:<id>`, or
`<producer>/<version>` — and SHALL reject anything else before writing.

#### Scenario: Bare name rejected

- **WHEN** the caller passes `--by matze`
- **THEN** the command exits non-zero naming the accepted forms, and the concept keeps its
  original status

### Requirement: Deprecation

The system SHALL set `status` to `deprecated`, recording an optional actor and reason, and
SHALL refuse to re-deprecate an already deprecated concept without an override.

#### Scenario: Repeat deprecation refused

- **WHEN** the target concept is already `deprecated` and `--force` is not given
- **THEN** the command exits non-zero

#### Scenario: Reason is recorded

- **WHEN** the caller passes `--reason`
- **THEN** the reason appears in the log entry

### Requirement: Log Entry

The system SHALL append a dated entry for each transition to the nearest `log.md`, walking
up from the concept toward the bundle root, unless the caller opts out.

#### Scenario: Nearest log wins

- **WHEN** a `log.md` exists in the concept's own directory and another at the bundle root
- **THEN** the entry is appended to the one in the concept's directory (SPEC §9)

#### Scenario: No log exists yet

- **WHEN** no `log.md` is found on the walk up
- **THEN** one is created at the bundle root with a `# Directory Update Log` heading

#### Scenario: Newest date section first

- **WHEN** an entry is filed under a date newer than every section already present
- **THEN** today's section is inserted above the most recent existing one (SPEC §9)

#### Scenario: Same-day entries accumulate

- **WHEN** a section for today already exists
- **THEN** the new bullet is appended after the last bullet already filed under it

#### Scenario: Opting out

- **WHEN** the caller passes `--no-log`
- **THEN** the concept is written but no log entry is made

### Requirement: Dry Run

The system SHALL support previewing a transition without writing anything.

#### Scenario: Nothing is written

- **WHEN** the caller passes `--dry-run`
- **THEN** the intended status change and field edits are printed, and neither the concept
  file nor any `log.md` is modified
