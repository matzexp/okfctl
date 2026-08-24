## MODIFIED Requirements

### Requirement: Skills Install At The Scope That Matches Their Use

The system SHALL install the capture and recall workflows at user scope, so each is
available in every repository, and the curation workflows into the bundle itself, so they
load when someone works in the knowledge base — and SHALL place both in the directories
the host actually reads. A skill that ships more than one file SHALL have every file
installed together, at the same scope, so a workflow file and the resource file(s) it
reads are never split across an install.

#### Scenario: Capture is available everywhere

- **WHEN** a hook-capable host is installed
- **THEN** the capture workflow is written to that host's user-scope skills directory, so a
  session in any repository can run it

#### Scenario: Recall is available everywhere

- **WHEN** a host that supports skills is installed
- **THEN** the recall workflow is written to that host's user-scope skills directory
  alongside capture, so a session in any repository can search the registered bundle
  before investigating from scratch

#### Scenario: Curation lives with the knowledge

- **WHEN** a host is installed for a bundle
- **THEN** the triage, ingest, promotion, review and deprecation workflows are written into
  that bundle, and are not written at user scope, because an inbox is emptied where the
  knowledge lives rather than in whatever repository produced it

#### Scenario: Host-specific directories

- **WHEN** two hosts that both support skills are installed
- **THEN** each workflow is written to the directory that host loads skills from, rather
  than to one shared location

#### Scenario: A host without slash commands gets none

- **WHEN** a host has no slash-command mechanism
- **THEN** only skills are written for it, and no command files are created

#### Scenario: Installed workflows are the packaged ones

- **WHEN** a workflow is installed
- **THEN** its content is the copy shipped with the tool, so there is no second version
  that can drift from the source

#### Scenario: Workflows installed into a bundle are not corpus

- **WHEN** workflows are installed into a bundle
- **THEN** the bundle's concept count is unchanged, the conformance check reports no new
  errors, and no generated index lists them

#### Scenario: Reinstalling refreshes a stale copy

- **WHEN** a bundle holds an out-of-date copy of a workflow and installation runs again
- **THEN** it is replaced with the packaged version

### Requirement: Writing Outside The Bundle Is Additive And Reversible

The system SHALL treat every path outside the bundle as one it does not own: creating files
that are absent, merging additively into files that exist, never removing or replacing
content it did not write, and never modifying a configuration file it could not parse. A
file that holds more than one independently-managed section SHALL treat each section as
separately addressable: writing, upserting, or removing one SHALL NOT disturb another.

#### Scenario: An existing agent configuration is preserved

- **WHEN** the host's configuration file already exists and contains unrelated settings
- **THEN** those settings are present and unchanged after installation, and only the
  capture entry is added

#### Scenario: Reinstalling changes nothing

- **WHEN** installation runs a second time against an already-installed host
- **THEN** no file gains a duplicate entry and the command reports that nothing was needed

#### Scenario: An unparseable configuration is not rewritten

- **WHEN** the host's configuration file exists but cannot be parsed
- **THEN** the command fails without writing to it, and reports what the user must do by
  hand

#### Scenario: An existing hook on the same event survives

- **WHEN** the host already has hooks registered on the turn-completion event
- **THEN** they remain registered alongside the installed one

#### Scenario: Two sections in one instructions file are independent

- **WHEN** an instructions-only host's single instructions file carries both a capture
  section and a recall section
- **THEN** installing, updating, or removing one section leaves the other's content
  exactly as it was, because each is bounded by its own markers

#### Scenario: A pre-existing capture-only install gains a recall section additively

- **WHEN** an instructions file already holds a capture section installed before recall
  existed, and the host is updated
- **THEN** a recall section is added to the same file without altering the existing
  capture section or anything the user added outside either section's markers

## ADDED Requirements

### Requirement: A Section Marker Is Parameterized By Section Identity

The system SHALL identify each managed section in an instructions file by a stable,
distinct marker derived from that section's identity, so a file can carry more than one
independently-managed section without one section's install or removal logic being able
to match another's.

#### Scenario: Existing installs remain readable

- **WHEN** the marker mechanism is extended to support more than one section
- **THEN** the marker text an already-installed capture section carries on disk is
  unchanged, and it continues to be found, upserted, and removed correctly

#### Scenario: A new section gets its own marker

- **WHEN** a new managed section is introduced
- **THEN** it is identified by a marker distinct from every other section's, derived from
  its own identity rather than reusing another section's
