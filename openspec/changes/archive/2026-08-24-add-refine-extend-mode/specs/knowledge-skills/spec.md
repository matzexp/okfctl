## MODIFIED Requirements

### Requirement: Refine Turns Dumps Into Typed Entries

The refine workflow SHALL convert one or more dumps-area concepts into a typed, titled,
well-formed concept in the drafts area through the CLI's refine verb, carrying the
original producer and source forward as citations rather than claiming first-hand
authorship of restated findings — or, when a dump relates to an already-existing entry,
extend or flag that relationship through the same verb's extend mode rather than always
producing a disconnected new entry.

#### Scenario: A single dump becomes one entry

- **WHEN** a dumps-area concept clearly states one piece of knowledge unrelated to
  anything the bundle already has
- **THEN** the workflow assigns it a real type and title, matching the bundle's existing
  conventions for that kind of knowledge, and writes it into the drafts area

#### Scenario: A dump carrying several findings is split

- **WHEN** a dumps-area concept bundles more than one distinct finding
- **THEN** the workflow writes one drafts-area concept per finding, checks that every part
  of the source has a home, and only then offers to mark the source consumed

#### Scenario: Several dumps that overlap are consolidated

- **WHEN** more than one dumps-area concept substantially addresses the same question
- **THEN** the workflow writes one drafts-area concept drawing from all of them, citing
  each, rather than one entry per dump

#### Scenario: Provenance is never claimed as the refiner's own

- **WHEN** the workflow refines a dump whose findings came from a different producer,
  session, or measurement it has not reproduced
- **THEN** the resulting drafts-area concept's body says plainly that the content was
  refined or restated from that source, and the source is cited in `sources[]`

#### Scenario: A dump that cannot be confidently refined

- **WHEN** a dumps-area concept is unintelligible, or the workflow cannot establish what
  it is claiming
- **THEN** the workflow leaves it in the dumps area and reports why, rather than filing
  a guess into the drafts area

#### Scenario: Refine's standard is self-contained

- **WHEN** the refine workflow judges shape, type, and title
- **THEN** it applies criteria stated in its own reference file, not a cross-reference to
  another workflow's judgment, so refine's standard can be read, and changed, on its own

## ADDED Requirements

### Requirement: Refine Checks Against Existing Knowledge Before Treating A Dump As New

The refine workflow SHALL search existing drafts and corpus concepts for a relationship to
each dump before deciding it is unrelated to everything the bundle already has, using the
recall workflow's search mechanism rather than a separate implementation, and SHALL ask
the user how to proceed whenever a plausible match is found.

#### Scenario: A related entry is found

- **WHEN** a dump's content plausibly extends or contradicts an existing drafts-area or
  corpus concept
- **THEN** the workflow presents the candidate match and asks the user whether it is
  unrelated, an extension, or a contradiction, before writing anything

#### Scenario: No related entry is found

- **WHEN** the search turns up nothing plausibly related
- **THEN** the workflow proceeds with the ordinary one-to-one/split/consolidate judgment,
  unchanged

#### Scenario: The check reuses recall, not a new search path

- **WHEN** the refine workflow searches for a related existing concept
- **THEN** it does so through the same search mechanism the recall workflow uses, so
  there is one search behavior across both, not two that could diverge

### Requirement: Extending Never Silently Resolves A Contradiction

When the user confirms that a dump contradicts an existing entry, the refine workflow
SHALL produce a body that keeps both the prior and the new statement, each cited, and
explicitly marked as conflicting, and SHALL NOT decide which one is correct.

#### Scenario: A contradiction is flagged, not resolved

- **WHEN** the user confirms a dump disproves or conflicts with an existing entry
- **THEN** the resulting draft states both the original claim and the new one, cites both,
  and marks them as conflicting, leaving resolution to a later `okf-review`

#### Scenario: An extension is not treated as a contradiction

- **WHEN** the user confirms a dump is additive to an existing entry rather than
  conflicting with it
- **THEN** the resulting body combines the material without a conflict marker, and the
  extend targets the existing entry when it is a draft, or a new drafts-area entry citing
  the existing one when it is a corpus concept

### Requirement: Extending Corpus Knowledge Never Edits The Corpus In Place

When the related existing entry is a promoted corpus concept, the refine workflow SHALL
produce a new drafts-area entry citing that concept as a source, and SHALL NOT modify the
corpus concept's file.

#### Scenario: A corpus concept is extended via a new draft

- **WHEN** a dump extends or contradicts a stable, promoted corpus concept
- **THEN** the workflow writes a new drafts-area entry carrying the corpus concept's
  content plus the new material (or both statements, if conflicting), citing the corpus
  concept, and the corpus file itself is unchanged

#### Scenario: Superseding the corpus stays a human decision

- **WHEN** a new draft created this way is later found accurate and complete
- **THEN** relocating or promoting it to actually supersede the original corpus concept is
  a separate, later act through `okf-review`/`okf-promote`, not performed by refine itself
