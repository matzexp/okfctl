# knowledge-skills Specification

## Purpose
Give an agent the judgment layer the CLI does not carry: a set of skills that recognize
which moment in a bundle's life is in front of them — new knowledge arriving, a draft
earning trust, a stale concept needing a decision — and drive the matching `okfctl` verb,
so the lifecycle is exercised rather than merely available.

## Requirements

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

### Requirement: Skills Apply Bundle Policy

The capture, refine, ingest, and review workflows SHALL read `.okf/policy/` (SPEC
`bundle-policy`) when it exists, immediately after establishing the bundle root, and
SHALL apply it as a refinement of their built-in judgment.

#### Scenario: Policy is read after the bundle root is known

- **WHEN** capture, refine, ingest, or review establishes the bundle root
- **THEN** it next checks for `.okf/policy/` and reads any of the three files that exist,
  before making a judgment call the corresponding file would inform

#### Scenario: No policy directory is not an error

- **WHEN** `.okf/policy/` does not exist
- **THEN** the workflow proceeds using its built-in generic guidance, exactly as it did
  before this capability existed

#### Scenario: Ingest's no-corpus fallback records to field policy, not a concept

- **WHEN** the ingest workflow proposes a placement or type convention for a bundle with
  no existing corpus to match against
- **THEN** it records the agreed answer in `field-policy.md`, not as a corpus concept,
  because the answer describes how the bundle organizes itself rather than something true
  about the world the bundle describes

#### Scenario: Policy never licenses inventing an actor or skipping a citation

- **WHEN** a workflow reads bundle policy that could be construed as loosening actor
  honesty or citation requirements
- **THEN** it still refuses to invent an actor or omit a citation it owes, because those
  guardrails do not originate from policy

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
- **THEN** the dump goes to the dumps area with a provisional type rather than being
  filed into the corpus on a guess

#### Scenario: The durability criteria live in a dedicated resource

- **WHEN** the capture workflow judges whether something is worth keeping
- **THEN** it applies the full criteria from its own reference file, not a copy embedded
  in the always-loaded workflow file, so the same criteria is not maintained twice

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

### Requirement: Refine Turns Dumps Into Typed Entries

The refine workflow SHALL convert one or more dumps-area concepts into a typed, titled,
well-formed concept in the drafts area through the CLI's refine verb, carrying the
original producer and source forward as citations rather than claiming first-hand
authorship of restated findings.

#### Scenario: A single dump becomes one entry

- **WHEN** a dumps-area concept clearly states one piece of knowledge
- **THEN** the workflow assigns it a real type and title, matching the bundle's existing
  conventions for that kind of knowledge, and writes it into the drafts area

#### Scenario: A dump carrying several findings is split

- **WHEN** a dumps-area concept bundles more than one distinct finding
- **THEN** the workflow writes one drafts-area concept per finding, checks that every part
  of the source has a home, and only then offers to mark the source consumed

#### Scenario: Several dumps that overlap are consolidated

- **WHEN** more than one dumps-area concept substantially addresses the same question
- **THEN** the workflow writes one drafts-area concept drawing from all of them, citing
  each, rather than one entry per dump

#### Scenario: Provenance is never claimed as the refiner's own

- **WHEN** the workflow refines a dump whose findings came from a different producer,
  session, or measurement it has not reproduced
- **THEN** the resulting drafts-area concept's body says plainly that the content was
  refined or restated from that source, and the source is cited in `sources[]`

#### Scenario: A dump that cannot be confidently refined

- **WHEN** a dumps-area concept is unintelligible, or the workflow cannot establish what
  it is claiming
- **THEN** the workflow leaves it in the dumps area and reports why, rather than filing
  a guess into the drafts area

#### Scenario: Refine's standard is self-contained

- **WHEN** the refine workflow judges shape, type, and title
- **THEN** it applies criteria stated in its own reference file, not a cross-reference to
  another workflow's judgment, so refine's standard can be read, and changed, on its own

### Requirement: Judgment Criteria Live In A Reference File, Read At The Point Of Use

A workflow whose judgment call rests on a long, enumerable criteria list SHALL ship that
list as a resource file separate from its always-loaded workflow file, and SHALL read it
when the workflow reaches the step that judgment informs, rather than embedding the full
list in text loaded on every invocation regardless of whether that step is reached.

#### Scenario: The workflow file stays short

- **WHEN** a skill's workflow file is loaded to begin a run
- **THEN** it states the procedure and a short test for the judgment call, and defers the
  enumerated criteria to its reference file rather than inlining them

#### Scenario: The reference file is read when the judgment is made

- **WHEN** the workflow reaches the step that needs the full criteria
- **THEN** it reads the reference file at that point, and applies it exactly as it would
  if the criteria had been inline

#### Scenario: One skill's criteria is not another's default

- **WHEN** two workflows each have their own judgment call
- **THEN** each has its own reference file, and neither is defined by pointing at the
  other's file

### Requirement: Refine Supports A Gated And An Automatic Mode

The refine workflow SHALL support both writing only after the user approves each proposed
entry or the batch, and writing directly without per-item approval when the user has asked
for that, and SHALL default to the gated mode when the user has not stated a preference.

#### Scenario: Gated mode is the default

- **WHEN** the user asks to refine the dumps inbox without specifying a mode
- **THEN** the workflow proposes each refined entry — its type, title, body, sources, and
  whether it would consume them — and writes only after approval

#### Scenario: Automatic mode is opt-in

- **WHEN** the user explicitly asks for refinement to run automatically, without per-item
  confirmation
- **THEN** the workflow writes each refined entry directly, applying the same judgment as
  gated mode, and reports the full batch once finished

#### Scenario: Automatic mode does not relax provenance or type discipline

- **WHEN** the workflow runs in automatic mode
- **THEN** it still never invents an actor or a source, still cites what it drew from, and
  still declines a dump it cannot confidently refine rather than filing it

### Requirement: Emptying The Drafts Inbox

The review workflow SHALL offer, for a concept in the drafts area, the two outcomes that
empty it — relocate it into the corpus, or merge it into an existing concept — and SHALL
NOT choose between them silently. Split and consolidate, as operations on raw dumps, are
the refine workflow's responsibility; the review workflow performs them on a drafts-area
entry only when review itself finds that entry still miscoped after refinement.

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

#### Scenario: A draft still needs splitting or consolidating

- **WHEN** review finds a draft still bundles more than one finding, or several drafts
  still overlap
- **THEN** the workflow may split or consolidate them as `okf-refine` would, but this is
  the exception path — the common path resolves this during refinement, before the entry
  reaches the drafts area

### Requirement: A Growing Inbox Is A Finding

The triage workflow SHALL report both the dumps inbox and the drafts inbox, each with the
age of its oldest entry, and SHALL name the refine workflow when the dumps inbox is not
being emptied and the review workflow when the drafts inbox is not being emptied.

#### Scenario: A stagnant inbox

- **WHEN** the dumps area holds captures older than the bundle's other attention items
- **THEN** triage names it as something needing attention and points at the refine
  workflow, while still writing nothing itself

#### Scenario: A stagnant drafts inbox

- **WHEN** the drafts area holds refined entries older than the bundle's other attention
  items
- **THEN** triage names it as something needing attention and points at the review
  workflow, while still writing nothing itself

#### Scenario: Both inboxes are reported independently

- **WHEN** both the dumps and drafts areas hold material needing attention
- **THEN** triage names both, with their own counts and ages, rather than collapsing them
  into a single figure
