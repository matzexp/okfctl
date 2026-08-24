## MODIFIED Requirements

### Requirement: Skills Install At The Scope That Matches Their Use

The system SHALL install the capture workflow at user scope, so it is available in every
repository, and the curation workflows into the bundle itself, so they load when someone
works in the knowledge base — and SHALL place both in the directories the host actually
reads. A skill that ships more than one file SHALL have every file installed together, at
the same scope, so a workflow file and the resource file(s) it reads are never split
across an install.

#### Scenario: Capture is available everywhere

- **WHEN** a hook-capable host is installed
- **THEN** the capture workflow is written to that host's user-scope skills directory, so a
  session in any repository can run it

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

#### Scenario: A skill's resource files install alongside its workflow file

- **WHEN** a skill that ships a resource file in addition to its workflow file is
  installed
- **THEN** the resource file is written next to the workflow file, at the same path
  depth, so the workflow file's reference to it resolves at every host and scope

#### Scenario: Reinstalling refreshes a stale resource file

- **WHEN** a bundle or host holds an out-of-date copy of a skill's resource file and
  installation runs again
- **THEN** it is replaced with the packaged version, exactly as its workflow file is

### Requirement: Installation Is Removable

The system SHALL remove exactly what it installed for a host on request, leaving every
other setting in the host's configuration intact.

#### Scenario: Uninstalling a host

- **WHEN** the caller removes an installed host
- **THEN** the hook entry and the files that were installed are gone at both scopes,
  unrelated settings are unchanged, and the command reports what it removed

#### Scenario: A file emptied by removal is deleted

- **WHEN** removal strips the last of the tool's content from a configuration or
  instructions file, leaving nothing else in it
- **THEN** that file is deleted, because a file that existed only to hold what was
  installed has not been taken back while an empty copy of it remains

#### Scenario: Directories created by installation are pruned

- **WHEN** removal empties a directory that installation created
- **THEN** that directory is removed, and any directory still holding something else is
  left alone

#### Scenario: Removal unwires agents without touching the knowledge

- **WHEN** a host is removed for a bundle
- **THEN** the bundle's own files are unchanged, because removal takes back the agent
  wiring and not the knowledge base

#### Scenario: Removing what was never installed

- **WHEN** removal runs for a host that is not installed
- **THEN** the command reports that nothing was installed and changes no file

#### Scenario: Removing a skill takes its resource files with it

- **WHEN** an installed skill that ships a resource file is removed
- **THEN** the resource file is deleted along with the workflow file, and no orphaned
  resource file is left behind
