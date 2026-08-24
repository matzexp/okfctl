## MODIFIED Requirements

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

## ADDED Requirements

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
