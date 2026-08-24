## MODIFIED Requirements

### Requirement: Workflow Coverage

The system SHALL ship one skill per lifecycle moment, covering capture, recall, refine,
ingest, promotion, deprecation, review, and triage, each discoverable by an agent from its
description alone without the user naming the file.

#### Scenario: Capture

- **WHEN** a session produces knowledge worth keeping and the user asks to capture, dump,
  or save it, or an installed host prompt asks the agent to do so
- **THEN** the capture workflow is selected, and it writes into the dumps area through the
  CLI's capture verb rather than by writing frontmatter by hand

#### Scenario: Recall

- **WHEN** the user asks whether something is already known, or the agent is about to
  begin non-trivial investigation that a knowledge base might already answer
- **THEN** the recall workflow is selected, and it searches the registered bundle through
  the CLI's search verb rather than proceeding on the assumption that nothing is known yet

#### Scenario: Refine

- **WHEN** the user asks to refine, clean up, or turn raw dumps into proper entries, or
  asks what is sitting unrefined in the dumps area
- **THEN** the refine workflow is selected, and it writes into the drafts area through the
  CLI's refine verb rather than by writing frontmatter by hand

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
  already decided and the dumps area exists only to hold what is not

#### Scenario: Capture and refine are distinguishable

- **WHEN** the user's request is about summarizing session knowledge into the dumps area,
  versus turning what is already in the dumps area into typed entries
- **THEN** capture is selected for the former and refine for the latter, because they act
  on different backlogs — raw dumps arriving, and raw dumps becoming structured entries

#### Scenario: Recall and search are distinguishable from capture

- **WHEN** the user's request is about finding out what a bundle already knows, rather
  than writing something new into it
- **THEN** the recall workflow is selected rather than capture, because recall reads the
  bundle and capture writes to it

## ADDED Requirements

### Requirement: Recall Interprets Trust Before Acting On It

The recall workflow SHALL search the registered bundle through the CLI's search verb, and
SHALL treat a result's area and trust tier as part of the finding, never presenting an
unreviewed or unverified match with the same confidence as a human-reviewed, stable one.

#### Scenario: A stable, human-reviewed hit is citable

- **WHEN** a search result comes from the corpus with `status: stable` and
  `trust: human-reviewed`
- **THEN** the workflow may present it as established, citing the concept directly

#### Scenario: A dumps- or drafts-area hit is a lead, not a fact

- **WHEN** a search result comes from the dumps or drafts area, or carries
  `trust: unverified`
- **THEN** the workflow presents it as unverified material worth checking, not as
  settled knowledge, and says so plainly if it is surfaced to the user

#### Scenario: No policy file governs recall

- **WHEN** the recall workflow runs against a bundle with `.okf/policy/` populated
- **THEN** it does not read any of the three policy files, because none of them scopes
  how search results should be interpreted — that judgment is generic to OKF's trust-tier
  model, not a bundle-specific convention

#### Scenario: Recall never writes

- **WHEN** the recall workflow finds relevant existing knowledge
- **THEN** the bundle is unchanged by the search itself, and any follow-up write is a
  separate, explicit act through capture, refine, ingest, or review
