## Purpose

Give a bundle a place to state its own judgment — what is worth capturing, what makes a
citation good enough, what frontmatter a type should carry — as editable prose the skills
read and apply, distinct from both OKF concepts and CLI-managed configuration.

## ADDED Requirements

### Requirement: The Policy Directory

The system SHALL treat `.okf/policy/` at the bundle root as the policy directory, and
SHALL NOT require its files to carry frontmatter or satisfy SPEC §11, because they are
not OKF concepts.

#### Scenario: Excluded from the bundle walk

- **WHEN** the bundle is loaded
- **THEN** no file under `.okf/` is read as a concept, because it is a dotfile directory
  and the existing walk already skips those

#### Scenario: Not required to conform

- **WHEN** `okfctl check` runs on a bundle with a populated `.okf/policy/`
- **THEN** it reports no errors or warnings about those files, because they are not
  subject to SPEC §11

#### Scenario: Invisible to corpus-facing commands

- **WHEN** `okfctl status`, `okfctl index`, or `okfctl catalog` runs
- **THEN** none of them lists, counts, or reports on anything under `.okf/`

### Requirement: Three Focused Policy Files

The system SHALL scaffold exactly three files in the policy directory —
`content-policy.md`, `source-policy.md`, and `field-policy.md` — each scoped to one
question a skill asks.

#### Scenario: Content policy scope

- **WHEN** `content-policy.md` is read
- **THEN** it states what is worth capturing and refining in this bundle, what is not,
  and may state staleness horizons per type

#### Scenario: Source policy scope

- **WHEN** `source-policy.md` is read
- **THEN** it states what makes a citation good enough in this bundle and how sources
  should be checked during review

#### Scenario: Field policy scope

- **WHEN** `field-policy.md` is read
- **THEN** it states this bundle's required or recommended frontmatter per type, beyond
  what SPEC §11 requires of every concept

### Requirement: Seeded With Real Content, Never Overwritten

The system SHALL write each policy file's starter content only when that file is absent,
and SHALL NOT overwrite an existing policy file on a later scaffolding run.

#### Scenario: First scaffold seeds real guidance

- **WHEN** `.okf/policy/` does not yet exist and the bundle is scaffolded
- **THEN** each of the three files is created with starter content restating the tool's
  built-in generic guidance as editable bundle policy, not an empty template

#### Scenario: An edited policy file survives re-scaffolding

- **WHEN** a policy file already exists, edited or not, and scaffolding runs again
- **THEN** that file is left exactly as it was, and the command reports it as already
  present rather than overwriting it

#### Scenario: A partially-scaffolded policy directory is completed, not reset

- **WHEN** only some of the three policy files exist and scaffolding runs again
- **THEN** the missing files are created with their starter content, and the existing
  ones are left untouched

### Requirement: Policy Narrows Or Extends, Never Overrides The Guardrails

A workflow that reads bundle policy SHALL treat it as a refinement of what counts as
durable, sufficiently cited, or well-formed, and SHALL NOT let it weaken actor honesty,
provenance carryover, or any other guardrail that does not originate from bundle policy.

#### Scenario: Policy can be stricter

- **WHEN** `content-policy.md` narrows what this bundle considers worth capturing
- **THEN** the capture workflow declines material it would otherwise have captured,
  honoring the narrower bar

#### Scenario: Policy cannot invent an actor or claim authorship

- **WHEN** a policy file's wording could be read as licensing a human actor for
  agent-written content, or as skipping the requirement to cite a source
- **THEN** the workflow still refuses to invent an actor or omit a citation it owes,
  because those guardrails do not originate from policy and are not policy's to relax
