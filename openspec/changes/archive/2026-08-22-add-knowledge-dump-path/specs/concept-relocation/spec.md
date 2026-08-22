## Purpose

Move a concept to a new path without breaking the bundle around it: a concept's id is its
bundle-relative path, so relocation renames the thing every internal link points at, and
the operation has to carry those links, the generated indexes, and the log with it.

## ADDED Requirements

### Requirement: Relocation Changes The Id

The system SHALL provide a move verb that relocates a concept from one bundle-relative
path to another, changing its id to match its new path.

#### Scenario: A concept moves

- **WHEN** `drafts/envoy-gateway` is moved to `decisions/envoy-gateway`
- **THEN** the file exists at the new path, no file remains at the old path, and the
  concept's id is `decisions/envoy-gateway`

#### Scenario: Intermediate directories are created

- **WHEN** the target's parent directory does not exist
- **THEN** it is created

#### Scenario: The source must resolve to exactly one concept

- **WHEN** the source reference matches more than one concept, or none
- **THEN** the command fails listing the candidates, and nothing is moved

### Requirement: Relocation Is Not Promotion

The system SHALL leave `status`, `verified`, and `stale_after` unchanged by a move, because
relocating a document makes no claim about whether anyone has verified it.

#### Scenario: A draft stays a draft

- **WHEN** a concept with `status: draft` and no `verified` entry is moved out of the
  drafts area
- **THEN** it still carries `status: draft` and no `verified` entry at its new path

#### Scenario: Unknown keys survive

- **WHEN** the moved concept carries producer-defined frontmatter keys the tool has no
  meaning for
- **THEN** those keys and their values are unchanged at the new path (SPEC §4.1)

### Requirement: No Overwrite

The system SHALL refuse to move a concept onto an existing path.

#### Scenario: The target is taken

- **WHEN** a concept already exists at the target path
- **THEN** the command fails naming that concept, and neither file is modified

#### Scenario: A reserved target is refused

- **WHEN** the target path is a reserved file such as `index.md` or `log.md` (SPEC §3.1)
- **THEN** the command fails, because those are not concepts

### Requirement: Inbound Links Are Rewritten

The system SHALL rewrite every internal link in the bundle that resolved to the moved
concept's old id so that it resolves to the new one, and SHALL leave every other link
untouched.

#### Scenario: A resolved link follows the move

- **WHEN** another concept links to the moved concept and that link resolved before the
  move
- **THEN** the link target is rewritten so it resolves after the move, and the link's text
  is unchanged

#### Scenario: An already-broken link is left alone

- **WHEN** a link in the bundle did not resolve before the move
- **THEN** it is not rewritten, because guessing at a broken link would hide a defect the
  reference check exists to report

#### Scenario: Prose is not disturbed

- **WHEN** the moved concept's id appears in body text outside a link target — in a code
  fence, an inline code span, or ordinary prose
- **THEN** that text is unchanged

#### Scenario: External targets are ignored

- **WHEN** a link's target is `http:`, `https:`, or `mailto:`
- **THEN** it is never rewritten

#### Scenario: The bundle has no broken links afterward

- **WHEN** a move completes on a bundle whose links all resolved beforehand
- **THEN** the reference check reports no unresolved internal links

### Requirement: Generated Indexes Follow The Move

The system SHALL regenerate the `index.md` of both the source and the target directory
after a move, so that neither lists the concept incorrectly.

#### Scenario: Both ends are regenerated

- **WHEN** a concept moves between two directories that each maintain an `index.md`
- **THEN** the source index no longer lists it and the target index does

### Requirement: Relocation Is Logged

The system SHALL append a dated entry to the nearest `log.md` naming both the old and the
new id and the acting actor (SPEC §9).

#### Scenario: A move is recorded

- **WHEN** a concept is moved
- **THEN** the log entry names the old id, the new id, and the actor

#### Scenario: The actor is required

- **WHEN** no actor is supplied
- **THEN** the command fails and nothing is moved

### Requirement: Preview Before Writing

The system SHALL support previewing a move, reporting the destination, every link that
would be rewritten with its containing file, and every index that would be regenerated,
without touching the bundle.

#### Scenario: Dry run enumerates the side effects

- **WHEN** the caller previews a move that would rewrite links in three other concepts
- **THEN** all three files are named along with the destination and the affected indexes,
  and no file on disk is modified

### Requirement: Failure Leaves The Bundle Unchanged

The system SHALL NOT leave a bundle partially relocated: if any step fails, the bundle
SHALL be as it was before the command ran.

#### Scenario: A failure partway through

- **WHEN** the file has moved but a link rewrite cannot be completed
- **THEN** the command reports the failure and the bundle is restored to its prior state
