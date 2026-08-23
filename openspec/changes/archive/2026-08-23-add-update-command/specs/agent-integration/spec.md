## ADDED Requirements

### Requirement: Update Refreshes Exactly What Is Installed

The system SHALL provide an update verb that detects which hosts are already installed
for a bundle and re-installs exactly those, without the caller naming a host, and SHALL
NOT install a host that was not already installed.

#### Scenario: Only installed hosts are refreshed

- **WHEN** update runs against a bundle where `claude-code` is installed and `codex` is
  not
- **THEN** `claude-code`'s skills, commands, and hook configuration are refreshed, and
  nothing is written for `codex`

#### Scenario: Nothing installed is reported, not silently skipped

- **WHEN** update runs against a bundle with no host installed
- **THEN** the command reports that nothing is installed and names `init --agent` as the
  next step, and writes nothing

#### Scenario: Update never scaffolds bundle files

- **WHEN** update runs
- **THEN** it does not create `dumps/`, `drafts/`, `.okf/policy/`, or any other bundle
  scaffolding, and does not touch registration

### Requirement: Installed Detection Uses Only Artifacts `okfctl` Itself Created

The system SHALL determine whether a host is installed by checking for an artifact only
an `okfctl` install produces, and SHALL NOT infer installation from the mere existence of
a configuration file a host may already have for unrelated reasons.

#### Scenario: A pre-existing settings file is not mistaken for an install

- **WHEN** a host's configuration file exists but was never touched by `okfctl`
- **THEN** update does not treat that host as installed

#### Scenario: The distributed capture skill is the signal for hook hosts

- **WHEN** checking whether a hook-capable host is installed
- **THEN** the check is whether that host's copy of the capture skill file exists at the
  path an install would have written it

#### Scenario: The section marker is the signal for instructions-only hosts

- **WHEN** checking whether an instructions-only host is installed
- **THEN** the check is whether its instructions file exists and contains the marker an
  install upserts, not merely whether the file exists

### Requirement: The Installed Prompt Interval Is Preserved By Default

The system SHALL read a hook host's currently-installed prompt interval before
refreshing it, and SHALL reapply that same interval unless the caller supplies a new one,
rather than resetting it to the tool's default.

#### Scenario: An update with no interval flag preserves the existing one

- **WHEN** a host was installed with `--capture-every 5` and update runs without
  `--capture-every`
- **THEN** the refreshed hook is still configured to prompt every 5th turn

#### Scenario: An explicit interval overrides preservation

- **WHEN** the caller passes `--capture-every 3` to update
- **THEN** every hook host update touches is configured to prompt every 3rd turn,
  regardless of what was installed before

#### Scenario: An unparseable installed interval falls back to the default

- **WHEN** the installed hook command's interval cannot be parsed back out
- **THEN** update applies the tool's default interval rather than refusing

### Requirement: Update Is Previewable

The system SHALL support previewing an update, reporting every file it would refresh and
the interval each hook host would carry, without writing anything.

#### Scenario: Dry run enumerates every refreshed path

- **WHEN** the caller previews an update that would refresh two installed hosts
- **THEN** every path each would write is named, along with the interval each hook host
  would carry, and no file is created or modified
