## MODIFIED Requirements

### Requirement: Bundle Initialization

The system SHALL provide an init verb that scaffolds a minimal conformant bundle at a
given path, creating a root `index.md`, a `log.md`, the drafts area, and the policy
directory (SPEC `bundle-policy`), and SHALL register that bundle as the machine's
knowledge base on request.

#### Scenario: A new bundle

- **WHEN** init runs against an empty directory
- **THEN** a root `index.md` carrying `okf_version`, a `log.md`, the drafts area, and
  `.okf/policy/` with its three seeded files all exist, and the conformance check passes

#### Scenario: An existing bundle is not clobbered

- **WHEN** init runs against a directory that already holds a bundle
- **THEN** existing files are left as they are, the command reports what it skipped, and
  only genuinely missing scaffolding is created

#### Scenario: Scaffolding and registration are separable

- **WHEN** init runs without asking for registration
- **THEN** the bundle is scaffolded and no user-level configuration is written
