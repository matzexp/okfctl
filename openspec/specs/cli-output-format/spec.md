# cli-output-format Specification

## Purpose

Give every command that reports structured data one consistent way to emit it as
machine-readable output, so an agent or script can rely on the same flag and the same
shapes across commands rather than learning each command's own convention.

## Requirements

### Requirement: A Shared Format Flag

The system SHALL provide a `--format` option, accepting `table`, `json`, or `yaml`,
defaulting to `table`, on every command that reports structured data.

#### Scenario: Default is human-readable

- **WHEN** a command that supports `--format` runs with no format specified
- **THEN** it prints the same human-oriented output it always has

#### Scenario: JSON output

- **WHEN** the caller passes `--format json`
- **THEN** the command's data is printed as JSON and nothing else is written to standard
  output

#### Scenario: YAML output

- **WHEN** the caller passes `--format yaml`
- **THEN** the command's data is printed as YAML and nothing else is written to standard
  output

#### Scenario: An unrecognized format is refused

- **WHEN** the caller passes a `--format` value other than `table`, `json`, or `yaml`
- **THEN** the command fails naming the accepted values, and produces no output

### Requirement: `--json` Is A Permanent Alias

The system SHALL treat a bare `--json` flag, on every command that carries it, as
equivalent to `--format json`, and SHALL NOT remove or deprecate it.

#### Scenario: Existing invocations are unaffected

- **WHEN** a caller passes `--json` on a command that supported it before `--format` was
  introduced
- **THEN** the output is identical to what that command produced before this change

#### Scenario: Both flags agree

- **WHEN** a caller passes both `--json` and `--format json`
- **THEN** the command behaves exactly as with either alone

#### Scenario: Both flags disagree

- **WHEN** a caller passes `--json` together with `--format table` or `--format yaml`
- **THEN** `--format` wins, because it is the more specific flag

### Requirement: Table Output Is Never Generic

The system SHALL render `table` format using each command's own existing human-output
logic, and SHALL NOT route `table` output through a generic data-to-table renderer.

#### Scenario: Table output is unchanged by this capability

- **WHEN** a command's `table` output is compared before and after it adopts `--format`
- **THEN** the two are identical, because `table` format is that command's pre-existing
  output, not a new generic rendering

### Requirement: Structured Output Carries No Extra Text

The system SHALL print nothing but the serialized data on standard output when `--format
json` or `--format yaml` is used, so the output can be piped directly into a JSON or YAML
parser without stripping banners or summaries.

#### Scenario: No leading or trailing text

- **WHEN** the caller pipes `--format json` output into a JSON parser
- **THEN** parsing succeeds, because standard output carries only the serialized data

#### Scenario: Diagnostics go to standard error

- **WHEN** a command emits a warning or error alongside structured output
- **THEN** that diagnostic is written to standard error, not standard output
