# knowledge-refinement Specification

## Purpose

Turn a raw, unstructured dump into a properly typed, titled, well-formed draft entry —
carrying its provenance forward rather than claiming first-hand authorship — before it is
placed in the corpus, so refining is a visible step distinct from both raw capture and
final placement.

## Requirements

### Requirement: The Drafts Area Holds Refined Entries

The system SHALL treat one directory in a bundle as the drafts area, defaulting to
`drafts/` at the bundle root and overridable by the caller, and SHALL identify membership
by path prefix, matching the dumps area's conventions (SPEC knowledge-capture, "The Dumps
Area"). This is a distinct directory from the dumps area: the dumps area holds raw,
unrefined captures; the drafts area holds refined, typed entries that are not yet placed in
the corpus.

#### Scenario: Default location

- **WHEN** no drafts directory is specified
- **THEN** `drafts/` relative to the bundle root is the drafts area

#### Scenario: Nested concepts are in the area

- **WHEN** a concept's id is `drafts/infra/gateway` and the drafts area is `drafts`
- **THEN** that concept is in the drafts area

#### Scenario: A bundle with no drafts area

- **WHEN** the drafts directory does not exist
- **THEN** commands that only read report an empty area rather than an error, and no
  directory is created until something is refined

#### Scenario: Drafts and dumps are independent

- **WHEN** a bundle has both a dumps area and a drafts area populated
- **THEN** each is identified and reported independently; a concept is never counted as
  being in both

### Requirement: Refining Writes A Conformant, Typed Concept

The system SHALL provide a refine verb that reads one or more existing concepts as sources,
requires an explicit type and title (no provisional default), and writes a new concept into
the drafts area that satisfies SPEC §11 on its first write.

#### Scenario: Minimal invocation

- **WHEN** the caller supplies one source, a type, a title, an actor, and a body
- **THEN** a concept is written into the drafts area carrying that type, title, and body,
  with `status: draft` and a `generated` entry

#### Scenario: Type is required

- **WHEN** the caller supplies no `--type`
- **THEN** the command fails with an error naming the missing value, and writes nothing —
  unlike capture, refine has no provisional type, because assigning a real type is the
  point of the verb

#### Scenario: Title is required

- **WHEN** the caller supplies no `--title`
- **THEN** the command fails with an error naming the missing value, and writes nothing

#### Scenario: Body is copied, never transformed

- **WHEN** a body is supplied
- **THEN** it is written verbatim below the frontmatter, with no templating, reformatting,
  or inferred structure

#### Scenario: A refined concept is untrusted

- **WHEN** a concept is written by refine
- **THEN** it carries no `verified` entry, so its trust tier is `unverified` (SPEC §5.3),
  and its status is `draft` (SPEC §5.4) — refining is not verifying, and this remains true
  even though the concept now also lives in a directory named `drafts/`

#### Scenario: An explicit target outside the drafts area

- **WHEN** the caller names a target directory outside the drafts area
- **THEN** the concept is written there instead, and the drafts area is not involved

#### Scenario: No overwrite

- **WHEN** the target path already names an existing concept
- **THEN** the command refuses, naming the existing concept, and nothing is written

### Requirement: Sources Must Resolve

The system SHALL require every source passed to refine to resolve to exactly one existing
concept, using the same reference resolution as concept lookup elsewhere in the CLI, and
SHALL refuse rather than guess when a source is ambiguous or missing.

#### Scenario: A source does not resolve

- **WHEN** a given source reference matches no concept, or more than one
- **THEN** the command fails listing the candidates or reporting no match, and nothing is
  written

#### Scenario: Multiple sources consolidate

- **WHEN** the caller passes more than one source
- **THEN** the resulting drafts-area concept's `sources[]` carries an entry for each of them

### Requirement: Refined Provenance Is Carried Forward, Not Claimed

The system SHALL record the refiner as the `generated.by` of the drafts-area concept it
writes, and SHALL add a `sources[]` entry (SPEC §5.1) identifying each consumed source
concept by its id and title, so a reader can trace refined content back to what it was
drawn from without the refined document claiming first-hand authorship of the original
finding.

#### Scenario: The refiner is the producer of the refined document

- **WHEN** a concept is written by refine
- **THEN** its `generated.by` names the actor that ran refine, not the producer of the
  source concept(s)

#### Scenario: Each source is cited

- **WHEN** a drafts-area concept is written from one or more sources
- **THEN** its `sources[]` includes one entry per source naming that source's id

#### Scenario: A source's own provenance is not duplicated

- **WHEN** a source carries its own `sources[]` entries (session, origin) or a `generated`
  entry from an earlier capture
- **THEN** those are not copied onto the refined concept; the citation to the source's id is
  sufficient, since the source document (or its content, if consumed) remains the record

### Requirement: Sources Are Consumed Only On Request

The system SHALL leave every source concept in place after a refine unless the caller
passes an explicit consume flag, and SHALL remove exactly the sources named in that
invocation when it is passed and the write succeeds.

#### Scenario: Default leaves sources in place

- **WHEN** refine runs without the consume flag
- **THEN** every source named remains at its original path afterward, unchanged

#### Scenario: Consume removes only what was named

- **WHEN** refine runs with the consume flag against two of three sources it draws from
  across separate invocations
- **THEN** only those two are removed; the third remains until a later invocation consumes
  it

#### Scenario: Consume runs only after a successful write

- **WHEN** the write fails for any reason
- **THEN** no source is removed, and the bundle is left as it was before the command ran

#### Scenario: Consuming updates the indexes

- **WHEN** a source concept is consumed
- **THEN** the dumps (or other) directory's `index.md` no longer lists it, matching how
  other removal-causing verbs already refresh generated indexes

### Requirement: A Source Split Across Multiple Refined Concepts

The system SHALL allow the same source concept to be named in more than one refine
invocation before it is consumed, so that one dump's content can be distributed across
several drafts-area concepts.

#### Scenario: Two refine calls against one source

- **WHEN** a source is passed to refine twice, each time producing a different drafts-area
  concept, neither call passing the consume flag
- **THEN** both drafts-area concepts are written, each citing the same source, and the
  source itself is unaffected by either call

#### Scenario: The source is consumed once its content is fully distributed

- **WHEN** a later refine call against the same source passes the consume flag
- **THEN** the source is removed at that point, after every part of its content has a
  drafts-area concept citing it

### Requirement: Refine Is Logged

The system SHALL append a dated entry to the nearest `log.md` naming the drafts-area
concept written, its type, the source(s) it drew from, the acting actor, and whether
sources were consumed (SPEC §9).

#### Scenario: A refine is recorded

- **WHEN** a refine completes
- **THEN** the log entry names the new concept, its sources, the actor, and the consume
  outcome

### Requirement: The Actor Is Never Invented

The system SHALL require an actor on refine and SHALL NOT infer one, because the actor is a
provenance claim about a real producer (SPEC §7).

#### Scenario: Missing actor is refused

- **WHEN** no actor is supplied
- **THEN** the command fails with an error naming the missing value, and writes nothing

### Requirement: Preview Before Writing

The system SHALL support previewing a refine, reporting the resolved path, the frontmatter
that would be written, and — when the consume flag is passed — which source files would be
removed, without touching the bundle.

#### Scenario: Dry run writes nothing

- **WHEN** the caller previews a refine
- **THEN** the resolved path, frontmatter, and any sources that would be consumed are
  printed, and no file is created, removed, or modified

### Requirement: Failure Leaves The Bundle Unchanged

The system SHALL NOT leave a bundle partially refined: if any step fails, the bundle SHALL
be as it was before the command ran.

#### Scenario: A failure partway through

- **WHEN** the drafts-area concept has been written but a source removal cannot be
  completed
- **THEN** the command reports the failure and the bundle is restored to its prior state
