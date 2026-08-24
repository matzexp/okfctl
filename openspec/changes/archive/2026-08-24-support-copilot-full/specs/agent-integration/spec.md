## MODIFIED Requirements

### Requirement: Agent Host Installation

The system SHALL install the capture workflow into a named coding-agent host on request,
writing to that host's user-level configuration so that sessions in any repository are
covered, and SHALL support at least three hosts that receive an event hook and at least
one that does not.

#### Scenario: A host with a hook mechanism

- **WHEN** init installs for a host that supports event hooks
- **THEN** the capture workflow's agent-facing instructions and a turn-completion hook are
  installed into that host's user-level configuration, and the command reports each path it
  wrote

#### Scenario: A host with no hook mechanism

- **WHEN** init installs for a host that has no event mechanism
- **THEN** the capture workflow's instructions are installed in the form that host reads,
  no hook is installed, and the command states plainly that the host supports no hook

#### Scenario: An unknown host

- **WHEN** the caller names a host with no adapter
- **THEN** the command fails listing the supported hosts, and writes nothing

#### Scenario: A session outside the bundle reaches it

- **WHEN** an agent session runs in a repository that is not the registered bundle and the
  hook prompts a capture
- **THEN** the capture is written to the registered bundle

#### Scenario: A host whose hook configuration is a flat entry list

- **WHEN** init installs for a host whose hook configuration stores entries as a flat list
  per event, rather than grouped under a matcher
- **THEN** the installed entry is added to that event's list without disturbing any other
  entry already in it, and removal takes back only the entry it added

### Requirement: One Hook Program, One Config Writer Per Host

The system SHALL implement a single hook program shared by every hook-capable host, with
per-host code responsible only for where and in what form the configuration is written.

#### Scenario: Hosts share the hook

- **WHEN** two hook-capable hosts are installed
- **THEN** both invoke the same hook program with the same prompt contract, and differ only
  in the configuration file written

#### Scenario: Adding a host

- **WHEN** support for a further hook-capable host is added
- **THEN** it requires a configuration writer and no change to the hook program

#### Scenario: A host with a differently-shaped hook configuration

- **WHEN** the added host's hook configuration is a flat per-event entry list instead of
  the matcher-group shape existing hosts use
- **THEN** it still requires only a configuration writer for that shape, and no change to
  the shared hook program or its payload contract
