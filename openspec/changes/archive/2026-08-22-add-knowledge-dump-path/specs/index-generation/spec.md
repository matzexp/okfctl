## ADDED Requirements

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
