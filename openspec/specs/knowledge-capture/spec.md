# knowledge-capture Specification

## Purpose

Give knowledge produced in a live agent session a cheap, honest way into a bundle: a
drafts area that holds captured material whose final placement and shape are not yet
decided, and a creation verb that writes into it without demanding answers the author does
not have yet.

## Requirements

### Requirement: The Drafts Area

The system SHALL treat one directory in a bundle as the drafts area, defaulting to
`drafts/` at the bundle root and overridable by the caller, and SHALL identify membership
by path prefix.

#### Scenario: Default location

- **WHEN** no drafts directory is specified
- **THEN** `drafts/` relative to the bundle root is the drafts area

#### Scenario: Nested concepts are in the area

- **WHEN** a concept's id is `drafts/infra/gateway` and the drafts area is `drafts`
- **THEN** that concept is in the drafts area

#### Scenario: An overridden area

- **WHEN** the caller names a different directory
- **THEN** that directory is the drafts area for every command in the invocation, and
  `drafts/` carries no special meaning

#### Scenario: A bundle with no drafts area

- **WHEN** the drafts directory does not exist
- **THEN** commands that only read report an empty area rather than an error, and no
  directory is created until something is captured

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
- **THEN** the dump appears in the drafts area's `index.md` like any other concept

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

### Requirement: The Actor Is Never Invented

The system SHALL require an actor on capture and SHALL NOT infer one, because the actor is
a provenance claim about a real producer (SPEC §7).

#### Scenario: Missing actor is refused

- **WHEN** no actor is supplied
- **THEN** the command fails with an error naming the missing value, and writes nothing

#### Scenario: An agent-written dump names the agent

- **WHEN** an agent captures knowledge it summarized from a session
- **THEN** `generated.by` names that producer, not the human who was in the conversation

### Requirement: Capture Is Logged

The system SHALL append a dated entry to the nearest `log.md` for each capture (SPEC §9).

#### Scenario: A capture is recorded

- **WHEN** a dump is written
- **THEN** the nearest `log.md`, found by walking up from the new file to the bundle root,
  gains an entry naming the concept and the actor

### Requirement: Preview Before Writing

The system SHALL support previewing a capture, reporting the resolved path and the
frontmatter that would be written, without touching the bundle.

#### Scenario: Dry run writes nothing

- **WHEN** the caller previews a capture
- **THEN** the resolved path and frontmatter are printed, no file is created, no directory
  is created, and no log entry is appended

### Requirement: A Dump Records Its Origin

The system SHALL record where a capture came from — the working directory, and the git
remote and commit when the origin is a git repository — as a `sources[]` entry on the
captured concept (SPEC §5.1), because a bundle collecting knowledge from many projects
loses the context a reader most needs without it.

#### Scenario: Captured from a git repository

- **WHEN** a dump is captured while the working directory is inside a git repository
- **THEN** the concept carries a `sources[]` entry naming the working directory, the
  repository's remote, and the commit it was at

#### Scenario: Captured outside a repository

- **WHEN** the working directory is not a git repository
- **THEN** the entry names the working directory alone, and no repository fields are
  invented

#### Scenario: Origin does not overwrite supplied sources

- **WHEN** the caller supplies sources of their own
- **THEN** the origin entry is added alongside them rather than replacing them

#### Scenario: Capture into the bundle it came from

- **WHEN** the working directory is inside the bundle being captured into
- **THEN** no origin entry is recorded, because a concept does not cite the bundle it
  lives in

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
