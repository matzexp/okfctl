# agent-integration Specification

## Purpose

Scaffold a bundle, register it as the machine's knowledge base, and wire the capture
workflow into the coding agents the user actually works in, so that knowledge produced in
any repository has a path into that bundle without anyone remembering a command — while
writing outside the bundle only under a contract narrow enough to be safe and reversible.

## Requirements

### Requirement: Bundle Initialization

The system SHALL provide an init verb that scaffolds a minimal conformant bundle at a
given path, creating a root `index.md`, a `log.md`, the dumps area, and the drafts area,
and SHALL register that bundle as the machine's knowledge base on request.

#### Scenario: A new bundle

- **WHEN** init runs against an empty directory
- **THEN** a root `index.md` carrying `okf_version`, a `log.md`, the dumps area, and the
  drafts area all exist, and the conformance check passes

#### Scenario: An existing bundle is not clobbered

- **WHEN** init runs against a directory that already holds a bundle
- **THEN** existing files are left as they are, the command reports what it skipped, and
  only genuinely missing scaffolding is created

#### Scenario: Scaffolding and registration are separable

- **WHEN** init runs without asking for registration
- **THEN** the bundle is scaffolded and no user-level configuration is written

### Requirement: Bundle Registration

The system SHALL record one registered bundle per machine in user-level configuration, and
SHALL report which bundle is registered on request.

#### Scenario: Registering a bundle

- **WHEN** the caller registers a bundle
- **THEN** that bundle's absolute path is stored in user-level configuration, outside every
  bundle, and is reported back

#### Scenario: Registering a second bundle replaces the first

- **WHEN** a bundle is registered while another already is
- **THEN** the new one replaces it and the command states which bundle was displaced

#### Scenario: Registering a path that is not a bundle

- **WHEN** the named path holds no bundle
- **THEN** the command fails naming the path, and no registration is recorded

### Requirement: Bundle Resolution By Precedence

The system SHALL resolve which bundle a command acts on by an explicit precedence: an
explicit path argument, then the nearest bundle root found by walking up from the working
directory, then the registered bundle.

#### Scenario: An explicit path wins

- **WHEN** the caller names a bundle path
- **THEN** that bundle is used regardless of the working directory or the registration

#### Scenario: The bundle you are standing in wins over the registered one

- **WHEN** the working directory is inside a bundle that is not the registered one
- **THEN** the enclosing bundle is used, because working on one bundle must never write
  into another

#### Scenario: The registered bundle is the fallback

- **WHEN** the working directory is not inside any bundle and a bundle is registered
- **THEN** the registered bundle is used

#### Scenario: Nothing to resolve to

- **WHEN** the working directory is not inside a bundle and none is registered
- **THEN** a command that would write fails, naming the registration command, rather than
  creating a bundle somewhere unexpected

#### Scenario: A registered bundle that no longer exists

- **WHEN** the registered path no longer holds a bundle
- **THEN** the command fails naming the missing path and how to re-register, and does not
  recreate it

### Requirement: Agent Host Installation

The system SHALL install the capture workflow into a named coding-agent host on request,
writing to that host's user-level configuration so that sessions in any repository are
covered, and SHALL support at least two hosts that receive an event hook and at least one
that does not.

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

### Requirement: Writing Outside The Bundle Is Additive And Reversible

The system SHALL treat every path outside the bundle as one it does not own: creating files
that are absent, merging additively into files that exist, never removing or replacing
content it did not write, and never modifying a configuration file it could not parse.

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

### Requirement: Installation Is Previewable

The system SHALL support previewing an installation or a removal, listing every path it
would write, every edit it would make to an existing file, and every entry it would delete,
without writing anything.

#### Scenario: Dry run enumerates every path

- **WHEN** the caller previews an installation
- **THEN** each file to be created and each existing file to be edited is named, and no
  file is created or modified

#### Scenario: Dry run on a removal

- **WHEN** the caller previews a removal
- **THEN** each entry and file that would be deleted is named, and nothing is deleted

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

### Requirement: Adapters Claim Only What They Install

An adapter SHALL report exactly the files it wrote and the capabilities the host does not
support, and SHALL NOT describe a wiring it did not perform.

#### Scenario: Honest reporting

- **WHEN** an adapter installs instructions but no hook
- **THEN** its output does not say the host will capture automatically

#### Scenario: Scope is stated

- **WHEN** an adapter installs into user-level configuration
- **THEN** it reports that the change affects every session on the machine, not only the
  current repository

### Requirement: The Hook Prompts, It Does Not Capture

An installed event hook SHALL do no more than prompt the agent to run the capture
workflow, and SHALL NOT itself write a concept, because a hook has no model and cannot
summarize a session — writing one under a producer's provenance would be a false claim
about how the content was produced (SPEC §7).

#### Scenario: The hook writes no knowledge

- **WHEN** the installed hook fires
- **THEN** the bundle is unchanged by the hook itself, and the agent decides whether any
  capture is warranted

#### Scenario: Capture stays under the agent's judgment

- **WHEN** a session produced nothing worth keeping
- **THEN** nothing is written, because the prompt is advisory and the agent may decline

### Requirement: Skills Install At The Scope That Matches Their Use

The system SHALL install the capture workflow at user scope, so it is available in every
repository, and the curation workflows into the bundle itself, so they load when someone
works in the knowledge base — and SHALL place both in the directories the host actually
reads.

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

### Requirement: The Hook Fires At Turn Completion

An installed event hook SHALL be triggered by the host's turn-completion event rather than
its session-end event, because on every supported host the output of a session-end hook
cannot reach the agent and so cannot prompt anything.

#### Scenario: Turn completion carries the prompt

- **WHEN** the agent finishes responding
- **THEN** the hook runs and its output is delivered to the agent as additional context

#### Scenario: Session end is not used

- **WHEN** an adapter installs a hook
- **THEN** it does not register one on an event whose output the host discards

### Requirement: The Hook Blocks Until The Turn Is Documented

The system SHALL hold the turn open when the capture prompt fires, using the host's
ability to refuse the end of a turn, so that knowledge from the turn is documented before
control returns to the user rather than being carried into a turn that may never come.

#### Scenario: The prompt is delivered before control returns

- **WHEN** the agent finishes responding and the hook decides to prompt
- **THEN** the turn is held open and the prompt is delivered to the agent, so any capture
  happens before the user regains control

#### Scenario: The agent may still decline

- **WHEN** the held-open turn produced nothing worth keeping
- **THEN** the agent writes nothing and the turn ends, because the prompt is advisory even
  though it is blocking

### Requirement: The Prompt Interval Is Configurable

The system SHALL accept a prompt interval at install time, expressed as a number of
completed turns between prompts, and SHALL record it in the installed hook's configuration
so that the cost of holding turns open is the user's choice rather than the tool's.

#### Scenario: An interval is chosen at install

- **WHEN** the caller installs a host with an interval of five
- **THEN** the hook prompts on every fifth completed turn of a session and lets the four
  in between end untouched

#### Scenario: The default is stated

- **WHEN** the caller installs a host without naming an interval
- **THEN** the default interval is applied and the command reports which interval was
  installed, because the interval determines how often a turn is held open

#### Scenario: Changing the interval

- **WHEN** a host is reinstalled with a different interval
- **THEN** the installed configuration carries the new interval and no duplicate entry is
  added

#### Scenario: An invalid interval is refused

- **WHEN** the interval is zero, negative, or not a whole number
- **THEN** the command fails naming the constraint, and no configuration is written

#### Scenario: Counting is per session

- **WHEN** a new session begins
- **THEN** the count restarts, so the interval describes turns within a session rather than
  turns since installation

### Requirement: Blocking Terminates

The system SHALL NOT block the continuation that its own block produced, and SHALL
guarantee termination on every supported host regardless of whether that host documents a
loop guard.

#### Scenario: A host that reports its own continuations

- **WHEN** the host's turn-completion event reports that the turn was already continued by
  a previous block
- **THEN** the hook does not block again and the turn ends

#### Scenario: A host that does not report its own continuations

- **WHEN** the host offers no such signal
- **THEN** the hook arms itself on genuine user input and disarms on blocking, so a
  continuation it caused is not itself blocked

#### Scenario: A circuit breaker bounds every session

- **WHEN** blocks in one session exceed a fixed bound within a fixed window, by any cause
  including a host behaving differently than documented
- **THEN** the hook stops blocking for that session, reports why, and lets every turn end

#### Scenario: State never lands in the bundle

- **WHEN** the hook records what it has armed, blocked, or bounded
- **THEN** it writes to user-level state, and the bundle is unchanged, because a bundle
  holds knowledge and not scratch

#### Scenario: A failing hook never traps the user

- **WHEN** the hook errors, cannot read its state, or cannot resolve a bundle
- **THEN** the turn ends normally, because failing open is the only safe direction for a
  hook that can hold a user in a conversation

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

### Requirement: The Portable Core Is The Capture Verb

Every adapter SHALL drive capture through the same command-line verb, so that adding a
host is a new configuration writer rather than a new capture path.

#### Scenario: Hosts share one entry point

- **WHEN** two different hosts' installed instructions are compared
- **THEN** both invoke the same capture verb with the same contract, differing only in how
  the host is told to invoke it
