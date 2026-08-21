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

#### Scenario: Unresolved links warn

- **WHEN** a concept contains an internal link whose target does not exist in the bundle
- **THEN** `check` reports a warning naming the target, and never an error, because SPEC
  §11 forbids rejecting a bundle for broken cross-links

#### Scenario: Anchors never warn through check

- **WHEN** a link resolves to an existing file but its fragment matches no heading
- **THEN** `check` reports nothing, because anchor verification depends on a slug
  algorithm the format does not define and stays opt-in to `refs`

### Requirement: Refs Command

The system SHALL report both reference joins — footnote to `sources[].id`, and internal
link to bundle file — per concept, with an opt-in non-zero exit for callers that want it to
gate CI.

#### Scenario: Full report

- **WHEN** the command runs with no flags
- **THEN** every concept carrying footnotes, sources, or internal links is listed with each
  label's join state and each link's resolution state, followed by totals for joined,
  broken, uncited, and links resolved and unresolved

#### Scenario: Broken only

- **WHEN** the caller passes `--broken`
- **THEN** only concepts with an unjoined or undefined label, or an unresolved link, are
  listed, and only their broken entries are shown

#### Scenario: Advisory by default

- **WHEN** broken citations or unresolved links exist and `--strict` is not given
- **THEN** the command exits zero

#### Scenario: Strict gating

- **WHEN** the caller passes `--strict` and at least one citation is unjoined or undefined,
  or at least one link is unresolved or has a missing anchor
- **THEN** the command exits non-zero

#### Scenario: JSON output

- **WHEN** the caller passes `--json`
- **THEN** the bundle root, the state counts, and each concept's footnotes, sources, joins,
  undefined labels, and links with their targets and resolution states are printed as JSON

### Requirement: Internal Link Extraction

The system SHALL collect Markdown links from a concept's body, keeping those that address
something inside the bundle and discarding those that address the network.

#### Scenario: Internal forms are collected

- **WHEN** the body contains a root-absolute link `[x](/guides/x.md)`, a relative link
  `[y](../decisions/y.md)`, or a bare-fragment link `[z](#section)`
- **THEN** each is collected as an internal link

#### Scenario: External schemes are out of scope

- **WHEN** a link target begins with `http:`, `https:`, or `mailto:`
- **THEN** it is ignored, because confirming it would be a network check rather than a
  bundle check

#### Scenario: Code is not scanned

- **WHEN** a Markdown link appears inside a fenced code block or an inline code span
- **THEN** it is ignored, matching how footnote labels are already treated

#### Scenario: Reference-style and image links

- **WHEN** the body uses an image `![alt](diagram.png)` or a link whose target is empty
- **THEN** an image is collected and resolved like any other internal link, and an empty
  target is ignored

### Requirement: Link Resolution

The system SHALL resolve every internal link against the files and directories actually
present in the bundle, classifying each as `resolved` or `unresolved`.

#### Scenario: Root-absolute targets resolve from the bundle root

- **WHEN** a link targets `/guides/x.md`
- **THEN** it resolves against `<bundle root>/guides/x.md`, not against the filesystem root

#### Scenario: Relative targets resolve from the linking file

- **WHEN** a concept at `decisions/a.md` links to `../guides/x.md`
- **THEN** it resolves against `<bundle root>/guides/x.md`

#### Scenario: A missing target is unresolved

- **WHEN** a link targets a path that does not exist in the bundle
- **THEN** it is classified `unresolved` and the target is reported verbatim

#### Scenario: Directories and reserved files are valid targets

- **WHEN** a link targets a directory such as `guides/`, or a reserved file such as
  `index.md` or `../log.md`
- **THEN** it resolves, because `okfctl index` generates directory links itself and would
  otherwise flag its own output

#### Scenario: A target outside the bundle is unresolved

- **WHEN** a relative link escapes the bundle root, such as `../../elsewhere.md`
- **THEN** it is classified `unresolved` rather than resolved against a file outside the
  bundle

#### Scenario: A bare fragment addresses its own document

- **WHEN** a link targets only `#section` with no path
- **THEN** its target document is the linking concept itself

### Requirement: Anchor Verification

The system SHALL verify a link's `#fragment` against the headings of its target document
only when the caller asks for it, and SHALL treat the fragment as unexamined otherwise.

#### Scenario: Fragments are ignored by default

- **WHEN** a link targets `/guides/x.md#label-shape` and `guides/x.md` exists
- **THEN** the link is `resolved` regardless of whether any heading matches the fragment,
  because OKF defines no heading-slug algorithm and a mismatch could be the tool's fault
  rather than the bundle's

#### Scenario: Opting into anchor checks

- **WHEN** the caller passes `--anchors` and no heading in the target document slugifies to
  the fragment
- **THEN** the link is reported as having a missing anchor, distinctly from a missing file

#### Scenario: Strict implies anchors

- **WHEN** the caller passes `--strict` without `--anchors`
- **THEN** anchor verification runs anyway, because a caller gating CI has opted into the
  stricter reading

#### Scenario: A resolved anchor

- **WHEN** `--anchors` is in effect and the target document has a heading that slugifies to
  the fragment
- **THEN** the link is `resolved`
