## Purpose

Create a new concept document that conforms on the first write, so that ingesting knowledge
into a bundle starts from a valid frontmatter block with recorded provenance rather than
from a hand-guessed one that `check` then rejects.

## ADDED Requirements

### Requirement: Concept Creation

The system SHALL create a new concept file at a caller-supplied bundle-relative path,
writing frontmatter that satisfies every SPEC §11 conformance rule: a parseable block, and
a non-empty `type`.

#### Scenario: A new concept is written

- **WHEN** the caller creates `decisions/gateway-api` with `--type decision`
- **THEN** a file exists at `decisions/gateway-api.md` in the bundle, carrying a
  frontmatter block whose `type` is `decision`

#### Scenario: The result is conformant

- **WHEN** a concept is created and `check` is then run over the bundle
- **THEN** the new concept contributes zero conformance errors

#### Scenario: Extension is optional in the path

- **WHEN** the caller supplies the path with a `.md` suffix
- **THEN** the suffix is not doubled, and the concept id is the same as for the bare form

#### Scenario: Intermediate directories

- **WHEN** the path names a directory that does not exist in the bundle
- **THEN** the directory is created

### Requirement: Type Is Required

The system SHALL require a `type` and SHALL NOT guess one, since `type` is the one
frontmatter value SPEC §11 makes mandatory and §4.1 leaves open-vocabulary.

#### Scenario: Missing type refused

- **WHEN** no `--type` is given
- **THEN** the command exits non-zero and writes nothing

#### Scenario: Unknown type accepted

- **WHEN** `--type` names a value outside the conventional set
- **THEN** the concept is created without complaint, because SPEC §11 forbids rejecting an
  unknown `type`

### Requirement: Provenance And Initial State

The system SHALL record who produced the concept and when, and SHALL open it in the
lifecycle state that has not yet been verified.

#### Scenario: Generated entry recorded

- **WHEN** the caller passes `--by okfctl/0.1.0`
- **THEN** the frontmatter carries a `generated` entry naming that actor and the creation
  instant (SPEC §5.2)

#### Scenario: Draft by default

- **WHEN** a concept is created without an explicit status
- **THEN** its `status` is `draft`, and it carries no `verified` entry, so its trust tier
  reads `unverified` (SPEC §5.3, §5.4)

#### Scenario: Actor form validated

- **WHEN** `--by` is not one of the SPEC §7 forms
- **THEN** the command exits non-zero naming the accepted forms, and writes nothing

#### Scenario: Freshness horizon is optional

- **WHEN** the caller passes a `stale_after` date or a relative duration
- **THEN** the field is set accordingly; absent both, no `stale_after` is written, because
  SPEC §5.5 makes the field optional and a guessed horizon is a false claim

### Requirement: Refusal To Overwrite

The system SHALL NOT overwrite an existing file.

#### Scenario: Path already occupied

- **WHEN** a file already exists at the target path
- **THEN** the command exits non-zero, reports the conflict, and leaves the existing file
  byte-for-byte unchanged

### Requirement: Creation Is Logged

The system SHALL record the creation in the bundle's narrative log on the same terms as a
lifecycle transition.

#### Scenario: Entry appended

- **WHEN** a concept is created
- **THEN** a dated entry naming it is appended to the nearest `log.md`, walking up from the
  new concept toward the bundle root (SPEC §9)

#### Scenario: Opting out

- **WHEN** the caller passes `--no-log`
- **THEN** the concept is written and no log entry is made

### Requirement: Dry Run

The system SHALL support previewing a creation without writing anything.

#### Scenario: Nothing is written

- **WHEN** the caller passes `--dry-run`
- **THEN** the target path and the frontmatter that would be written are printed, and
  neither the concept file nor any `log.md` is created or modified
