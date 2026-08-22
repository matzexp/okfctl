# index-generation Specification

## Purpose

Regenerate `index.md` from the frontmatter it describes, so that derived data stops being
maintained by hand, and detect when a checked-in index has fallen out of sync.

## Requirements

### Requirement: Index Rendering

The system SHALL render each `index.md` as SPEC §8 sections of
`* [Title](url) - description`, grouping concepts by their `type`.

#### Scenario: Concepts grouped and pluralized by type

- **WHEN** a directory holds concepts of type `Metric`
- **THEN** they are listed under a `# Metrics` heading, with type sections in alphabetical
  order

#### Scenario: Concepts with no usable type

- **WHEN** a concept's `type` is absent or empty
- **THEN** it is listed under a `# Concepts` heading rather than omitted

#### Scenario: Title and description fall back cleanly

- **WHEN** a concept has no `title`
- **THEN** its filename stem is used; when it has no `description`, the entry carries no
  ` - ` suffix

#### Scenario: Subdirectories are linked

- **WHEN** a directory has child directories containing concepts
- **THEN** a `# Subdirectories` section links each child

### Requirement: Frontmatter Rules

The system SHALL write no frontmatter into any `index.md` except the bundle-root one,
where it SHALL carry across an existing `okf_version` rather than dropping it.

#### Scenario: Root index keeps its version

- **WHEN** the bundle-root `index.md` already declares `okf_version`
- **THEN** the regenerated file opens with a frontmatter block carrying only that key
  (SPEC §12)

#### Scenario: Nested indexes carry none

- **WHEN** an `index.md` below the root is regenerated
- **THEN** it contains no frontmatter block

### Requirement: Deprecated Concepts

The system SHALL omit deprecated concepts from generated indexes unless the caller asks
for them.

#### Scenario: Deprecated omitted by default

- **WHEN** a concept has `status: deprecated`
- **THEN** it does not appear in the regenerated index

#### Scenario: Included on request

- **WHEN** the caller passes `--include-deprecated`
- **THEN** it appears alongside the rest

### Requirement: Drift Detection

The system SHALL support checking generated output against what is on disk without
writing, exiting non-zero when any index differs or is missing.

#### Scenario: Check reports drift

- **WHEN** the caller passes `--check` and a checked-in `index.md` differs from what would
  be generated
- **THEN** each differing file is named, the command exits non-zero, and no file is written

#### Scenario: Check passes

- **WHEN** every index matches
- **THEN** the command reports them up to date and exits zero

### Requirement: Scope Control

The system SHALL regenerate every directory holding concepts, or only the bundle root on
request, and SHALL skip directories that would yield an empty index.

#### Scenario: Root only

- **WHEN** the caller passes `--root-only`
- **THEN** only the bundle-root `index.md` is considered

#### Scenario: Empty directory produces no file

- **WHEN** a directory holds neither concepts nor child directories with concepts
- **THEN** no `index.md` is generated for it

### Requirement: Catalog Link

The system SHALL link the whole-bundle catalog from the regenerated bundle-root
`index.md` when a catalog file exists on disk, and SHALL link nothing when it does not, so
that the root index stays generated from what is actually there.

#### Scenario: Catalog present

- **WHEN** `catalog.md` exists at the bundle root and the root `index.md` is regenerated
- **THEN** the root index carries a link to it, ahead of the `# Subdirectories` section

#### Scenario: Catalog absent

- **WHEN** no catalog file exists at the bundle root
- **THEN** the regenerated root index carries no catalog link and is byte-identical to
  what it would have been before this change

#### Scenario: Nested indexes are unaffected

- **WHEN** an `index.md` below the root is regenerated
- **THEN** it carries no catalog link

### Requirement: Targeted Regeneration

The system SHALL support regenerating a named subset of a bundle's `index.md` files rather
than all of them, so that an operation affecting two directories does not rewrite every
index in the bundle.

#### Scenario: Only the named directories are rewritten

- **WHEN** regeneration is requested for two directories
- **THEN** those directories' `index.md` files are rewritten and every other `index.md` in
  the bundle is byte-for-byte unchanged

#### Scenario: A directory with no index yet

- **WHEN** a named directory holds concepts but no `index.md`
- **THEN** one is generated for it

### Requirement: Relocation Is Reflected

The system SHALL render a relocated concept under its new path, so that a generated index
never points at a path the concept has left.

#### Scenario: The entry follows the file

- **WHEN** a concept has moved from one directory to another and both indexes are
  regenerated
- **THEN** the source index carries no entry for it and the target index links it at its
  new path
