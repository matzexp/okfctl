# citation-refs Specification

## Purpose

Hold together the join OKF uses to cite evidence — a Markdown footnote label in the body
matched to an `id` in `sources[]` — which nothing in the format itself enforces, so that a
rename on either side stops producing a citation that silently points at nothing.

## Requirements

### Requirement: Footnote Extraction

The system SHALL collect footnote definitions and uses from a concept's body, counting
uses per label and identifying labels used without a definition.

#### Scenario: Definitions and uses are distinguished

- **WHEN** the body contains `[^a]` in prose and `[^a]: Source A` at the start of a line
- **THEN** the label is recorded once with one use, and the definition line is not counted
  as a use of itself

#### Scenario: Code is not scanned

- **WHEN** a `[^label]` appears inside a fenced code block or an inline code span
- **THEN** it is ignored, so a bracket in a SQL or shell sample is not mistaken for a
  citation

#### Scenario: Used but never defined

- **WHEN** the body uses `[^ghost]` and no `[^ghost]:` line exists
- **THEN** the label is reported as undefined

### Requirement: Join Classification

The system SHALL classify every footnote label and every `sources[].id` into exactly one
join state.

#### Scenario: Joined

- **WHEN** a footnote label equals a `sources[].id` in the same concept
- **THEN** the join state is `joined`

#### Scenario: Unjoined

- **WHEN** a concept declares `sources[]` and a defined footnote label matches no `id` in
  it
- **THEN** the join state is `unjoined` — the rename case

#### Scenario: Uncited

- **WHEN** a `sources[].id` is matched by no footnote label
- **THEN** the join state is `uncited`

#### Scenario: Plain

- **WHEN** a concept declares no `sources[]` at all and its body carries footnotes
- **THEN** those footnotes are `plain` Markdown, and no join is considered broken

#### Scenario: First entry wins on a duplicate id

- **WHEN** two `sources[]` entries share an `id`
- **THEN** the footnote joins the first of them

### Requirement: Advisory Reporting

The system SHALL report only genuine breakage through `conformance-check`, as warnings,
and SHALL leave states that are not defects out of the advisory tier entirely.

#### Scenario: Breakage warns

- **WHEN** a concept has an unjoined or undefined footnote, or duplicate `sources[].id`
  values
- **THEN** `check` reports a warning for each, and never an error, because SPEC §11 forbids
  rejecting a bundle over links

#### Scenario: Uncited sources do not warn

- **WHEN** a concept declares sources that no footnote cites
- **THEN** `check` reports nothing, because a source may back a concept without being
  footnoted, and demanding otherwise would invent a rule SPEC §5.1 does not state

#### Scenario: An undefined label is one defect, not two

- **WHEN** a label is used without a definition and also matches no `sources[].id`
- **THEN** only the undefined finding is reported

#### Scenario: Defined, joined, but never cited in the body

- **WHEN** a footnote is defined and has a matching source, but the body never references
  it
- **THEN** a warning reports the unused definition

### Requirement: Refs Command

The system SHALL report the join in both directions per concept, with an opt-in
non-zero exit for callers that want it to gate CI.

#### Scenario: Full report

- **WHEN** the command runs with no flags
- **THEN** every concept carrying footnotes or sources is listed with each label's join
  state, followed by totals for joined, broken, and uncited

#### Scenario: Broken only

- **WHEN** the caller passes `--broken`
- **THEN** only concepts with an unjoined or undefined label are listed

#### Scenario: Advisory by default

- **WHEN** broken citations exist and `--strict` is not given
- **THEN** the command exits zero

#### Scenario: Strict gating

- **WHEN** the caller passes `--strict` and at least one citation is unjoined or undefined
- **THEN** the command exits non-zero

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root, the state counts, and each concept's footnotes, sources, joins,
  and undefined labels are printed as JSON
