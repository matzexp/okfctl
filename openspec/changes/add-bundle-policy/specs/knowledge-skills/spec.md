## ADDED Requirements

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
