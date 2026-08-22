## ADDED Requirements

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

- **WHEN** a caller directs a capture outside the drafts area
- **THEN** the generated id has the same form, because a naming rule with an exception is a
  rule callers get wrong

#### Scenario: Different sessions on one day

- **WHEN** two different sessions capture on the same date
- **THEN** their ids differ in the session label and each sequence starts again from the
  first

### Requirement: A Missing Session Is Labelled, Not Invented

The system SHALL accept a capture with no session supplied, using a fixed stand-in label in
the generated id and recording no session as provenance, because a fabricated identifier in
a field other tools read is a false claim.

#### Scenario: No session supplied

- **WHEN** a capture runs without a session
- **THEN** the generated id carries a fixed stand-in label rather than a generated
  identifier presented as a session

#### Scenario: Nothing is claimed about the session

- **WHEN** a capture runs without a session
- **THEN** the concept records no session provenance at all

#### Scenario: Sessionless captures still cannot collide

- **WHEN** several captures run without a session on the same date
- **THEN** each receives the next sequence and all are written

### Requirement: The Producing Session Is Recorded As Provenance

The system SHALL record the full session identifier on the captured concept as a `sources[]`
entry (SPEC §5.1) when one is supplied, so that the conversation which produced the
knowledge stays answerable after the concept is renamed and filed into the corpus.

#### Scenario: Session recorded alongside the origin

- **WHEN** a capture is given a session
- **THEN** the concept carries a `sources[]` entry identifying that session, alongside the
  entry recording the working directory and commit

#### Scenario: The record outlives the filename

- **WHEN** a captured concept is later relocated and renamed
- **THEN** its session provenance is unchanged, because it lives in frontmatter rather than
  in the id

#### Scenario: Supplied sources are not displaced

- **WHEN** the caller supplies sources of their own
- **THEN** the session entry is added alongside them rather than replacing them

## MODIFIED Requirements

### Requirement: Low-Ceremony Capture

The system SHALL provide a capture verb that requires only a title, an actor, and a body,
defaulting the target to the drafts area, the type to a provisional value, and the id to the
generated scheme, and SHALL accept the body on standard input.

#### Scenario: Minimal invocation

- **WHEN** the caller supplies a title, an actor, and a body on standard input
- **THEN** a concept is written into the drafts area with a generated id, a provisional
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
- **THEN** the dump is written there instead, and the drafts area is not involved

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
