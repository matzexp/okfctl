# bundle-model Specification

## Purpose

Read an OKF v0.2 bundle off disk into the concept records every `okfctl` command
operates on, and write concepts back without disturbing content the tool does not
understand. Every other capability builds on this one.

## Requirements

### Requirement: Bundle Discovery

The system SHALL walk a bundle root recursively and classify every `.md` file it finds
as either a reserved file or a concept, sorting concepts by id.

#### Scenario: Reserved filenames are separated from concepts

- **WHEN** a bundle contains `index.md` or `log.md` at any level of the hierarchy
- **THEN** those files are recorded as reserved files rather than concepts (SPEC §3.1)

#### Scenario: Build directories and dotfiles are skipped

- **WHEN** the walk encounters a directory named `node_modules`, `.git`, `dist`, `.next`,
  or `build`, or any entry whose name begins with `.`
- **THEN** the walk does not descend into it and its contents contribute no concepts

#### Scenario: A missing root is rejected

- **WHEN** the given bundle path does not exist or is not a directory
- **THEN** the system raises an error naming the resolved path, rather than reporting an
  empty bundle

### Requirement: Concept Identity

The system SHALL derive a concept's id from its bundle-relative path with the `.md`
suffix removed, using `/` as the separator on every platform.

#### Scenario: Path becomes id

- **WHEN** a concept lives at `<root>/metrics/revenue.md`
- **THEN** its id is `metrics/revenue`

### Requirement: Frontmatter Parsing

The system SHALL parse a leading `---` delimited YAML block as frontmatter, exposing both
an editable YAML document and a plain-JS view, and SHALL distinguish an absent block from
an unparseable one.

#### Scenario: A document with no frontmatter block

- **WHEN** a `.md` file does not open with a `---` delimited block
- **THEN** the concept carries no YAML document, an empty data view, the whole file as its
  body, and no parse error

#### Scenario: A document whose YAML does not parse

- **WHEN** the delimiters are present but the YAML inside them is invalid
- **THEN** the concept records the parser's message as a parse error and carries no YAML
  document

### Requirement: Round-Trip Preservation

The system SHALL rewrite frontmatter through the YAML document model rather than
re-serializing a plain object, so that key order, comments, and producer-defined keys the
tool does not understand all survive a write (SPEC §4.1).

#### Scenario: An unknown key survives an edit

- **WHEN** a command edits one frontmatter field on a concept that also carries a
  producer-defined key the tool has no meaning for
- **THEN** the rewritten file still carries that key with its original value

#### Scenario: Flow sequences are not churned

- **WHEN** frontmatter contains a flow sequence of plain scalars such as `tags: [a, b]`
- **THEN** the rewritten file keeps it tight rather than padding it to `[ a, b ]`, matching
  the form OKF's own examples use

### Requirement: Concept Reference Resolution

The system SHALL resolve a user-supplied concept reference to exactly one concept,
accepting a full id, a leading `/` or `./`, a trailing `.md`, or a unique trailing path
segment — and SHALL refuse rather than guess when a reference is ambiguous.

#### Scenario: A unique suffix resolves

- **WHEN** the user passes `income-statement` and only `metrics/income-statement` ends with
  that segment
- **THEN** that concept is returned

#### Scenario: An ambiguous suffix is rejected

- **WHEN** the user passes `revenue` and both `metrics/revenue` and `computations/revenue`
  match
- **THEN** the system raises an error listing every matching id

#### Scenario: An exact id wins over suffix matching

- **WHEN** the reference exactly equals one concept's id
- **THEN** that concept is returned without considering suffix matches

### Requirement: Derived Lifecycle Signals

The system SHALL compute trust tier, status, staleness, and drift from frontmatter on
every read, and SHALL NOT store any of them.

#### Scenario: Trust tier from verified actors

- **WHEN** a concept has no `verified` key
- **THEN** its trust tier is `unverified`; with `verified` entries by non-`human:` actors
  only it is `machine-confirmed`; with any `human:<id>` actor it is `human-reviewed`
  (SPEC §5.3)

#### Scenario: A bare verified mapping is read as a one-element list

- **WHEN** `verified` is written as a single mapping rather than a list
- **THEN** it is read as a list of one event, which SPEC §5.2 requires of consumers

#### Scenario: Absent status means stable

- **WHEN** a concept carries no `status` key, or one outside draft/stable/deprecated
- **THEN** its status is treated as `stable` (SPEC §5.4)

#### Scenario: Staleness is an absolute date comparison

- **WHEN** today is on or after a concept's `stale_after` date
- **THEN** the concept is stale, with no reference to when it was last read (SPEC §5.5)

#### Scenario: Drift is verification older than generation

- **WHEN** a concept's latest `verified[].at` is earlier than its `generated.at`
- **THEN** the concept is drifted: the content changed after its last confirmation, so its
  trust tier is nominally intact but no longer earned

#### Scenario: v0.1 timestamp fallback

- **WHEN** a concept has no `generated.at` but carries a v0.1 `timestamp` field
- **THEN** that field is used as the generation time (SPEC §13.1)
