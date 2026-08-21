## Purpose

Give an agent the judgment layer the CLI does not carry: a set of skills that recognize
which moment in a bundle's life is in front of them — new knowledge arriving, a draft
earning trust, a stale concept needing a decision — and drive the matching `okfctl` verb,
so the lifecycle is exercised rather than merely available.

## ADDED Requirements

### Requirement: Workflow Coverage

The system SHALL ship one skill per lifecycle moment, covering ingest, promotion,
deprecation, review, and triage, each discoverable by an agent from its description alone
without the user naming the file.

#### Scenario: Ingest

- **WHEN** the user asks to capture, record, or add knowledge to a bundle
- **THEN** the ingest workflow is selected, and it creates the concept through the CLI's
  creation verb rather than by writing frontmatter by hand

#### Scenario: Promotion

- **WHEN** the user asks to mark a concept stable, verified, or reviewed-and-trusted
- **THEN** the promotion workflow is selected

#### Scenario: Deprecation

- **WHEN** the user asks to retire, deprecate, or supersede a concept
- **THEN** the deprecation workflow is selected

#### Scenario: Review

- **WHEN** the user asks to review stale, drifted, or unverified knowledge
- **THEN** the review workflow is selected, and it works from the corpus health report
  rather than from a guess at which concepts are affected

#### Scenario: Triage

- **WHEN** the user asks how a bundle is doing, or what needs attention, without naming a
  concept
- **THEN** the triage workflow is selected; it reports health and names the workflow each
  finding calls for, without performing those workflows itself

### Requirement: The CLI Is The Only Writer

Each skill SHALL make every frontmatter change by invoking an `okfctl` verb, and SHALL NOT
edit a concept's frontmatter directly, so that actor validation, the conformance gate, the
log entry, and the round-trip preservation of unknown keys apply to every change an agent
makes.

#### Scenario: No direct frontmatter edits

- **WHEN** a skill needs to change `status`, `verified`, or `stale_after`
- **THEN** it runs the corresponding command, and does not rewrite the file itself

#### Scenario: Body text is the exception

- **WHEN** a skill needs to write or revise the prose body of a concept
- **THEN** it edits the file directly, because no CLI verb authors content and the
  frontmatter block is left untouched by that edit

### Requirement: Confirmation Before Writing

Each skill that writes SHALL establish the target concept and the acting actor before it
writes, and SHALL preview rather than guess when either is ambiguous.

#### Scenario: Ambiguous target

- **WHEN** the user's reference matches more than one concept, or none
- **THEN** the skill reports the candidates and asks, rather than picking one

#### Scenario: Actor is never invented

- **WHEN** no acting actor is known for a verb that requires one
- **THEN** the skill asks for it, because the actor is a provenance claim about a real
  person or process (SPEC §7)

#### Scenario: Preview on a batch

- **WHEN** a workflow would change more than one concept in a single pass
- **THEN** it shows what each change would be and confirms before the first write

### Requirement: Review Routes On The Finding

The review workflow SHALL treat "still accurate" and "no longer accurate" as different
outcomes with different commands, and SHALL NOT record a verification for a concept it has
not actually checked against its sources.

#### Scenario: Confirmed

- **WHEN** review finds the concept still accurate
- **THEN** the confirmed outcome is recorded with a new freshness horizon

#### Scenario: Outdated

- **WHEN** review finds the concept no longer accurate
- **THEN** the outdated outcome is recorded, and the workflow offers the rewrite and
  deprecate paths as the next step rather than choosing between them silently

#### Scenario: Unverifiable

- **WHEN** the concept's accuracy cannot be established from the bundle or its sources
- **THEN** the workflow reports that and records neither outcome

### Requirement: Read-Only Entry Point

The triage workflow SHALL NOT write. It reports and recommends.

#### Scenario: Triage changes nothing

- **WHEN** triage runs against a bundle with stale, drifted, and draft concepts
- **THEN** the bundle is unchanged on disk, and the output names which workflow to run for
  each group

### Requirement: Invocation Surface

The suite SHALL be invocable both by description-based selection and by explicit slash
command, matching how the change-workflow skills already present in this repository are
invoked.

#### Scenario: Explicit invocation

- **WHEN** the user types the slash command for a workflow
- **THEN** that workflow runs, overriding description-based selection

#### Scenario: Bundle location

- **WHEN** the working directory is not itself a bundle root
- **THEN** the skill establishes the bundle path before running any command, rather than
  defaulting silently to the current directory
