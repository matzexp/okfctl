# bundle-catalog Specification

## Purpose
Render one whole-bundle catalog of every concept in the corpus, grouped by type and
independent of directory layout, so that an agent or reader can learn what a bundle holds
and how far it can be trusted from a single deterministic document.

## Requirements

### Requirement: Whole-Bundle Rendering

The system SHALL render every concept in the bundle into a single document, grouping
concepts by their `type` regardless of which directory they live in, as sections of
`* [Title](path) - description` entries whose links are bundle-root-relative.

#### Scenario: Concepts grouped across directories

- **WHEN** concepts of type `Decision` exist in both `decisions/` and `guides/`
- **THEN** both are listed under one `# Decisions` heading, each linked by its
  bundle-root-relative path

#### Scenario: Type sections are ordered and pluralized

- **WHEN** the bundle holds several distinct types
- **THEN** sections appear in alphabetical order by heading, pluralized the same way
  `okfctl index` pluralizes them

#### Scenario: Concepts with no usable type

- **WHEN** a concept's `type` is absent or empty
- **THEN** it is listed under a `# Concepts` heading rather than omitted

#### Scenario: Title and description fall back cleanly

- **WHEN** a concept has no `title`
- **THEN** its filename stem is used; when it has no `description`, the entry carries no
  ` - ` suffix

#### Scenario: An empty bundle still renders

- **WHEN** the bundle holds no concepts
- **THEN** the document renders its heading and no type sections, rather than failing

### Requirement: Deterministic Output

The system SHALL produce byte-identical output for a given bundle state, ordering entries
within a section by title and breaking ties by concept id, and SHALL let no clock reading,
filesystem ordering, or environment detail reach the rendered body.

#### Scenario: Repeated runs agree

- **WHEN** the catalog is rendered twice against an unchanged bundle
- **THEN** both renderings are byte-identical

#### Scenario: Entries are ordered by title

- **WHEN** a type section holds several concepts
- **THEN** they appear ordered by title, case-insensitively, with concept id breaking ties

#### Scenario: Nothing in the body derives from today

- **WHEN** the bundle contains stale or recently verified concepts
- **THEN** no part of the rendered body is computed from the current date, so that a run
  tomorrow against an unchanged bundle produces the same bytes

### Requirement: Lifecycle Annotations

The system SHALL annotate each entry whose concept is not settled with a bracketed,
comma-separated marker list placed between the link and the description, SHALL derive
every marker from frontmatter alone, and SHALL omit the brackets entirely for a stable,
verified, undrifted concept.

#### Scenario: Draft concept is marked

- **WHEN** a concept has `status: draft`
- **THEN** its entry reads `* [Title](path) [draft] - description`

#### Scenario: Unverified concept is marked

- **WHEN** a concept carries no `verified` entry
- **THEN** its entry carries an `unverified` marker

#### Scenario: Drifted concept is marked

- **WHEN** a concept has been edited since its last verification
- **THEN** its entry carries a `drifted` marker (drift is okfctl's signal, not the spec's)

#### Scenario: Multiple markers combine

- **WHEN** a concept is both a draft and unverified
- **THEN** both markers appear in one bracketed list, in a fixed order

#### Scenario: Settled concepts carry nothing

- **WHEN** a concept is `stable`, verified, and not drifted
- **THEN** its entry carries no bracket group

#### Scenario: Staleness is not a marker

- **WHEN** a concept is past its `stale_after`
- **THEN** no marker is rendered for that, because staleness is a function of today and
  would drift a checked-in catalog on a day nothing changed; `okfctl status` answers it

### Requirement: Deprecated Concepts

The system SHALL omit deprecated concepts from the catalog unless the caller asks for
them, matching the behavior of generated indexes.

#### Scenario: Deprecated omitted by default

- **WHEN** a concept has `status: deprecated`
- **THEN** it does not appear in the catalog

#### Scenario: Included on request

- **WHEN** the caller passes `--include-deprecated`
- **THEN** it appears in its type section carrying a `deprecated` marker

### Requirement: Output Modes

The system SHALL print the catalog to standard output by default, write it to a file only
when asked, and support comparing against what is on disk without writing.

#### Scenario: Default prints without writing

- **WHEN** the caller runs the command with no output flags
- **THEN** the rendered document is written to standard output, no file on disk is
  created or modified, and the command exits zero

#### Scenario: Written to the bundle root

- **WHEN** the caller passes `--write`
- **THEN** the document is written to `catalog.md` at the bundle root and the path written
  is reported

#### Scenario: Written elsewhere

- **WHEN** the caller passes `--out <path>`
- **THEN** the document is written to that bundle-relative path instead

#### Scenario: Check reports drift

- **WHEN** the caller passes `--check` and the target file is missing or its rendered body
  differs from what would be generated
- **THEN** the difference is reported, the command exits non-zero, and no file is written

#### Scenario: Check passes

- **WHEN** the target file's rendered body matches
- **THEN** the command reports it up to date and exits zero

### Requirement: Written Frontmatter

The system SHALL write the catalog file as a conformant concept document, carrying a
non-empty `type`, a `title`, a `description`, and a `generated` block naming the producing
actor, so that generating a catalog never makes a bundle non-conformant to another OKF
consumer (SPEC §11).

#### Scenario: Frontmatter present on write

- **WHEN** the catalog is written to disk
- **THEN** the file opens with a frontmatter block carrying `type`, `title`,
  `description`, and `generated` with a `by`

#### Scenario: Generated timestamp is carried across

- **WHEN** the catalog is rewritten and the rendered body is unchanged from the file on
  disk
- **THEN** the existing `generated.at` is preserved rather than advanced to today

#### Scenario: Generated timestamp advances on change

- **WHEN** the rendered body differs from the file on disk
- **THEN** the written `generated.at` is the current timestamp

#### Scenario: Standard output carries no frontmatter

- **WHEN** the catalog is printed rather than written
- **THEN** the output is the rendered body alone
