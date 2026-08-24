## MODIFIED Requirements

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

- **WHEN** a body is supplied to a fresh (non-`--extend`) refine
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

- **WHEN** the target path already names an existing concept and `--extend` naming that
  same concept was not passed
- **THEN** the command refuses, naming the existing concept, and nothing is written

### Requirement: Sources Are Consumed Only On Request

The system SHALL leave every source concept in place after a refine unless the caller
passes an explicit consume flag, SHALL remove exactly the sources named in that
invocation when it is passed and the write succeeds, and SHALL refuse the consume flag
outright if any named source is not in the dumps area.

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

#### Scenario: Consume refuses a source outside the dumps area

- **WHEN** the consume flag is passed and any named source is a drafts-area or corpus
  concept rather than a dumps-area one
- **THEN** the command refuses, naming the offending source, and writes nothing — citing
  an already-refined or already-promoted concept as a source must never risk deleting it

### Requirement: Preview Before Writing

The system SHALL support previewing a refine, reporting the resolved path, the frontmatter
that would be written, and — when the consume flag is passed — which source files would be
removed, without touching the bundle. When previewing an extend, the full resulting body
SHALL be shown, not only the frontmatter, because an extend overwrites content that
already exists.

#### Scenario: Dry run writes nothing

- **WHEN** the caller previews a refine
- **THEN** the resolved path, frontmatter, and any sources that would be consumed are
  printed, and no file is created, removed, or modified

#### Scenario: Dry run on an extend shows the complete resulting file

- **WHEN** the caller previews an `--extend`
- **THEN** the full body that would replace the existing draft's content is printed in
  addition to the frontmatter, so the caller can see exactly what is being overwritten
  before it happens

## ADDED Requirements

### Requirement: Extending An Existing Draft In Place

The system SHALL provide an extend mode that updates an existing drafts-area concept's
file with a full-replacement body and a merged `sources[]`, rather than refusing because
the target already exists, and SHALL restrict this mode to drafts-area targets only.

#### Scenario: Extending a draft in place

- **WHEN** the caller passes `--extend <existing-drafts-id>` with one or more new sources,
  a body, and an actor
- **THEN** that drafts-area concept's file is overwritten with the given body, and the
  command reports it as extended rather than newly refined

#### Scenario: Type and title default to the existing entry's values

- **WHEN** `--extend` is passed without `--type` or `--title`
- **THEN** the existing entry's current `type` and `title` are kept unless the caller
  explicitly overrides either

#### Scenario: Prior sources are never dropped

- **WHEN** an extend adds new source citations
- **THEN** the resulting `sources[]` contains every citation the entry already had, plus
  one for each newly-named source — none of the prior citations are removed

#### Scenario: A corpus concept is refused as an extend target

- **WHEN** `--extend` names a concept outside the drafts area
- **THEN** the command refuses, stating that a corpus (or any non-drafts) concept is never
  edited in place, and writes nothing — the caller instead cites it as an ordinary
  `<source...>` on a ordinary (non-`--extend`) refine, which produces a new drafts-area
  entry without touching the corpus file

#### Scenario: A missing extend target is refused

- **WHEN** `--extend` names a concept that does not exist
- **THEN** the command refuses, naming the missing target, and writes nothing

#### Scenario: Extending is logged distinctly from refining

- **WHEN** an extend completes
- **THEN** the log entry records it as an extension of the existing concept, naming the
  concept, the newly-added source(s), the actor, and the consume outcome — distinct from
  a fresh refine's "added" wording
