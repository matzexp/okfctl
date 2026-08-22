## ADDED Requirements

### Requirement: Capture Is Summarization, Not Transcription

The capture workflow SHALL write a summary of what was established, not a copy of the
conversation, and SHALL record the agent as the producer of that summary.

#### Scenario: A session yields a durable finding

- **WHEN** a session establishes something worth keeping
- **THEN** the workflow writes a self-contained dump that a reader who was not in the
  session can act on, rather than a transcript excerpt

#### Scenario: Provenance names the agent

- **WHEN** an agent captures knowledge it summarized
- **THEN** the recorded producer is the agent, never the human who was in the conversation,
  because the summary is the agent's claim (SPEC §7)

#### Scenario: Nothing durable happened

- **WHEN** a session produced no knowledge that outlives it
- **THEN** the workflow writes nothing, because an inbox filled with noise is worse than an
  empty one

#### Scenario: Placement is deferred, not guessed

- **WHEN** the right type or directory for the captured knowledge is not clear
- **THEN** the dump goes to the drafts area with a provisional type rather than being
  filed into the corpus on a guess

### Requirement: Emptying The Drafts Inbox

The review workflow SHALL offer, for a concept in the drafts area, the two outcomes that
empty it — relocate it into the corpus, or merge it into an existing concept — and SHALL
NOT choose between them silently.

#### Scenario: Relocation

- **WHEN** a reviewed draft is knowledge in its own right
- **THEN** the workflow sets a real type, relocates it through the relocation verb, and
  leaves promotion as a separate act

#### Scenario: Merge

- **WHEN** a reviewed draft belongs inside a concept that already exists
- **THEN** the workflow folds the content into that concept by editing its body, records
  the merge in the log, and removes the draft

#### Scenario: A merge is confirmed before the draft is removed

- **WHEN** a merge would delete the draft file
- **THEN** the workflow shows what was folded in and confirms before deleting

#### Scenario: A merged draft is not deprecated

- **WHEN** a draft has been merged into an existing concept
- **THEN** it is removed rather than deprecated, because deprecation is for knowledge that
  was true and stopped being so, and a dump folded into another document was never
  knowledge in its own right

#### Scenario: Neither outcome fits

- **WHEN** a draft is unintelligible, or its accuracy cannot be established
- **THEN** the workflow reports that and leaves it in the drafts area rather than filing
  material it cannot vouch for

### Requirement: A Growing Inbox Is A Finding

The triage workflow SHALL report the drafts inbox and the age of its oldest capture, and
SHALL name the review workflow as the action when the inbox is not being emptied.

#### Scenario: A stagnant inbox

- **WHEN** the drafts area holds captures older than the bundle's other attention items
- **THEN** triage names it as something needing attention and points at the review
  workflow, while still writing nothing itself

## MODIFIED Requirements

### Requirement: Workflow Coverage

The system SHALL ship one skill per lifecycle moment, covering capture, ingest, promotion,
deprecation, review, and triage, each discoverable by an agent from its description alone
without the user naming the file.

#### Scenario: Capture

- **WHEN** a session produces knowledge worth keeping and the user asks to capture, dump,
  or save it, or an installed host prompt asks the agent to do so
- **THEN** the capture workflow is selected, and it writes into the drafts area through the
  CLI's capture verb rather than by writing frontmatter by hand

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

#### Scenario: Capture and ingest are distinguishable

- **WHEN** the user's request states where the knowledge belongs and what it is
- **THEN** the ingest workflow is selected rather than capture, because placement is
  already decided and the drafts area exists only to hold what is not
