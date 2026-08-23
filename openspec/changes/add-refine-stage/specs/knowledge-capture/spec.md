## REMOVED Requirements

### Requirement: The Drafts Area

**Reason**: The directory holding raw, unrefined captures is renamed from `drafts/` to
`dumps/`, freeing `drafts/` for a new meaning introduced by the `knowledge-refinement`
capability: refined, typed entries that are not yet placed in the corpus. See
`add-refine-stage`'s design.md for the naming rationale and the migration note for existing
bundles. Replaced by the "The Dumps Area" requirement below.

**Migration**: A bundle with an existing populated `drafts/` directory (today's meaning)
should rename it to `dumps/` (`mv drafts dumps`), or pass `--dumps-dir drafts` to keep the
old path without renaming. See design.md, Migration Plan.

## ADDED Requirements

### Requirement: The Dumps Area

The system SHALL treat one directory in a bundle as the dumps area, defaulting to `dumps/`
at the bundle root and overridable by the caller, and SHALL identify membership by path
prefix.

#### Scenario: Default location

- **WHEN** no dumps directory is specified
- **THEN** `dumps/` relative to the bundle root is the dumps area

#### Scenario: Nested concepts are in the area

- **WHEN** a concept's id is `dumps/infra/gateway` and the dumps area is `dumps`
- **THEN** that concept is in the dumps area

#### Scenario: An overridden area

- **WHEN** the caller names a different directory
- **THEN** that directory is the dumps area for every command in the invocation, and
  `dumps/` carries no special meaning

#### Scenario: A bundle with no dumps area

- **WHEN** the dumps directory does not exist
- **THEN** commands that only read report an empty area rather than an error, and no
  directory is created until something is captured

## MODIFIED Requirements

### Requirement: A Captured Dump Is A Conformant Concept

The system SHALL write every captured dump as a document that satisfies SPEC §11 on its
first write, carrying `type`, `title`, `status: draft`, and a `generated` entry, and
SHALL NOT write a document that any OKF consumer would read as non-conformant.

#### Scenario: Conformance on the first write

- **WHEN** a dump is captured into an otherwise clean bundle
- **THEN** the conformance check reports zero new errors

#### Scenario: A dump is untrusted

- **WHEN** a dump is captured
- **THEN** it carries no `verified` entry, so its trust tier is `unverified` (SPEC §5.3)
  and its status is `draft` (SPEC §5.4)

#### Scenario: A dump is findable

- **WHEN** an index is regenerated after a capture
- **THEN** the dump appears in the dumps area's `index.md` like any other concept

### Requirement: Low-Ceremony Capture

The system SHALL provide a capture verb that requires only a title, an actor, and a body,
defaulting the target to the dumps area, the type to a provisional value, and the id to the
generated scheme, and SHALL accept the body on standard input.

#### Scenario: Minimal invocation

- **WHEN** the caller supplies a title, an actor, and a body on standard input
- **THEN** a concept is written into the dumps area with a generated id, a provisional
  type, and the supplied body as its content

#### Scenario: The title names the concept without identifying it

- **WHEN** a capture is written
- **THEN** the supplied title is recorded as the concept's `title`, and the id is generated
  rather than derived from it, because an id is a path every reference will use (SPEC §2)
  and a title chosen in one line is a poor thing to harden into one

#### Scenario: The type is provisional, not absent

- **WHEN** the caller supplies no type
- **THEN** a provisional type is written rather than the field being omitted, because
  SPEC §11 requires the key

#### Scenario: A known type is honored

- **WHEN** the caller supplies a type
- **THEN** that value is written unchanged and no provisional default is applied

#### Scenario: An explicit target outside the drafts area

- **WHEN** the caller names a target directory
- **THEN** the dump is written there instead, and the dumps area is not involved

#### Scenario: An explicit id is honored

- **WHEN** the caller supplies an id
- **THEN** it is used in place of the generated one, normalized to the bundle's id style
  without truncating a word

#### Scenario: Body is copied, never transformed

- **WHEN** a body is supplied
- **THEN** it is written verbatim below the frontmatter, with no templating, reformatting,
  or inferred structure

#### Scenario: A generated id never refuses

- **WHEN** a capture uses the generated scheme
- **THEN** it is written without a collision refusal, because losing a summary an agent has
  already produced is a worse outcome than any naming accident it could avoid

#### Scenario: An id collision does not overwrite

- **WHEN** the caller supplies an id that is already taken
- **THEN** the command refuses rather than overwriting, and names the existing concept,
  because there the caller named a specific concept and overwriting one is never right

### Requirement: Generated Ids Are Dated, Grouped And Sequenced

The system SHALL generate a captured concept's id as a date, a short session label, and a
per-session sequence, so that captures sort chronologically, captures from one conversation
group together, and no generated id can collide with one already present.

#### Scenario: The generated form

- **WHEN** a capture is written with no explicit id
- **THEN** its id is the capture date, a short label derived from the session, and a
  sequence number, in that order

#### Scenario: A second capture in the same session

- **WHEN** a session captures twice on the same day
- **THEN** the second carries the next sequence number and both remain present

#### Scenario: The sequence is read from the bundle

- **WHEN** a capture runs in a session where no earlier capture is recorded anywhere but the
  bundle already holds captures for that date and session
- **THEN** the sequence continues from what is in the bundle, because the bundle is the only
  thing that has to be correct for the id to be free

#### Scenario: The scheme does not depend on the directory

- **WHEN** a caller directs a capture outside the dumps area
- **THEN** the generated id has the same form, because a naming rule with an exception is a
  rule callers get wrong

#### Scenario: Different sessions on one day

- **WHEN** two different sessions capture on the same date
- **THEN** their ids differ in the session label and each sequence starts again from the
  first
