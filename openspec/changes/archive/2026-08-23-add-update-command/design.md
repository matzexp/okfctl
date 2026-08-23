## Context

See proposal.md - Why. `src/core/agents/hosts.ts` already computes an `existed` flag per
`Edit` inside `plan()`/`planRemoval()`, but that flag answers "does this path exist" not
"did `okfctl` put it there" — `~/.claude/settings.json` frequently exists for reasons that
have nothing to do with this tool, so it cannot be reused as an install-detection signal.
The one artifact that only an `okfctl` install ever creates is the distributed
`okf-capture` skill file (for hook hosts) or the `<!-- okfctl:capture -->` section marker
(for instructions-only hosts) — both already exist as concepts in the code
(`CAPTURE_SKILL`, `MARK_START`), just not exposed as a yes/no query.

The installed `--capture-every` interval is not stored anywhere structured — it lives only
inside the hook command string `${command} hook ${host} --every ${n}` written into each
host's JSON hook config, matched by `isOurs()`.

## Goals / Non-Goals

**Goals:**
- Let a caller refresh exactly the hosts already installed for a bundle without naming
  them.
- Preserve a previously-chosen `--capture-every` interval across a refresh by default.
- Keep detection honest: a host counts as installed only when an artifact `okfctl` itself
  created is present, never a config file's bare existence.

**Non-Goals:**
- Not installing a new host. `update` only ever touches what `isInstalled` already finds
  true; adding a host is still `init --agent <host>`.
- Not scaffolding bundle files (`dumps/`, `drafts/`, `.okf/policy/`) or handling
  registration — `update` is scoped to hosts/hooks/skills only, mirroring how `init
  --remove` is scoped to taking back exactly what installation added.
- Not detecting *drift* within an installed host (e.g. a hand-edited `SKILL.md`) — it
  always overwrites with the packaged copy, exactly as re-running `init --agent` already
  does today. Detecting and warning about local edits is a real future feature but a
  different one; this change only removes the need to name `--agent` and re-supply the
  interval.

## Decisions

### `isInstalled` checks what only we create, not general file existence

Added to the `Adapter` interface alongside `plan`/`planRemoval`:

```ts
isInstalled(context: InstallContext): boolean
```

- `claudeCode`/`codex` (hook hosts): `existsSync(join(context.home, ...userSkills,
  CAPTURE_SKILL, 'SKILL.md'))` — the same path `skillEdits` already writes, reusing
  `CLAUDE_LAYOUT`/`CODEX_LAYOUT`'s `userSkills`. This file is written only by an `okfctl`
  install and by nothing else, unlike the hook config file it sits alongside.
- `copilot`/`agents-md` (instructions-only hosts): the target instructions file exists
  *and* contains `MARK_START` — `readIfPresent(path)?.includes(MARK_START) ?? false`.
  These hosts write into a file (`AGENTS.md`, `copilot-instructions.md`) a user is likely
  to already have for unrelated reasons, so file existence alone is not enough; the
  section marker is the actual signal.

Rejected: deriving "installed" from `plan()`'s `existed` flags after the fact by
inspecting specific edit paths from the caller side. That works today but silently
depends on `skillEdits` always emitting the capture-skill edit first — an internal
ordering detail `update` would then be coupled to. An explicit `isInstalled` method keeps
that coupling inside each adapter, where the layout already lives.

### Interval preservation reads the installed command string back

A new helper, `installedInterval(configPath, host): number | null`, opens the same JSON
config `jsonHookPlan` already parses, finds the entry `isOurs()` already recognizes, and
extracts the digits after `--every ` from its `command` string with a plain regex. `null`
when unparseable or absent — `update` falls back to the CLI default in that case, exactly
as a fresh `init` would, rather than refusing.

Considered storing the interval as a separate, structured field instead of embedding it
only in the command string. Rejected for this change: it would mean writing a second
representation of the same fact into the hook config (the command string still has to
carry `--every <n>` for the hook program to read at runtime), and keeping the two in sync
is exactly the kind of drift risk this feature exists to avoid elsewhere. Parsing the one
existing source of truth back out is more code at the read site but no duplicated state.

### `update`'s own flag: `--capture-every` overrides preservation, does not merely default it

`okfctl update --capture-every 5` applies `5` to every hook host `update` touches, the
same as it would on `init`. Omitting the flag means "keep whatever was there," not "reset
to the tool's built-in default" — the built-in default only applies when there is nothing
installed yet to preserve (which `isInstalled` already means `update` will not touch).

### One command, not a flag on `init`

Considered `okfctl init --refresh` instead of a new verb. Rejected: `init`'s positional
`[dir]` argument and its scaffolding side effects (creating `dumps/`/`drafts/`/policy
files) do not belong in a "just refresh what's already wired" operation, and a flag that
changes which side effects `init` has depending on what else is passed is exactly the kind
of implicit-mode-switching this tool avoids elsewhere (`review`'s `--confirm`/`--outdated`
are separate, explicit outcomes rather than one command inferring which was meant). A
separate verb keeps `update`'s contract narrow and its name honest about what it does.

## Risks / Trade-offs

- **A host installed by an `okfctl` version old enough not to write the capture-skill
  file at the expected path would read as not-installed** → acceptable: the same
  situation already means `init --agent` would not report it as "keep" either; `update`
  reporting "nothing installed, run init --agent" is the correct, honest answer for a
  layout old enough to predate the marker this relies on.
- **Regex-parsing the interval back out of a command string is fragile to a hand-edited
  hook config** → mitigated by falling back to the tool's default rather than erroring,
  and by this only ever affecting an interval, not correctness of what gets installed.

## Migration Plan

Additive only. No existing command's behavior changes; `update` is new. Nothing is
scaffolded or migrated on an existing bundle by adding this verb.
