## Why

Every skill and hook shipped with `okfctl` changes as the tool changes — this session
alone added `okf-refine`, rewrote `okf-capture`/`okf-review`/`okf-triage`, and will soon
add three new skill files reading `.okf/policy/`. Today the only way to get an installed
host's copy current is to remember exactly which `--agent <host>` flags were used
originally and re-run `okfctl init <bundle> --agent claude-code --agent codex ...` by
hand — which also silently resets the hook's `--capture-every` interval back to the
default unless the caller remembers to pass it again. There is no command that answers
"what's installed here, and is it current" or refreshes it without re-supplying
everything from memory.

## What Changes

- New CLI verb, `okfctl update [dir]`, that detects which hosts are already installed for
  a bundle (default `.`, same positional-argument convention as `init`) and re-installs
  exactly those — refreshed skill/command files, refreshed hook config — without the
  caller naming `--agent` at all.
- Each adapter gains an `isInstalled(context)` check, based on the artifact only an
  `okfctl` install creates (the distributed capture-skill file for hook hosts; the
  upserted section marker for instructions-only hosts) — never on a config file's mere
  existence, since e.g. `~/.claude/settings.json` commonly pre-exists for unrelated
  reasons.
- `update` preserves each installed hook host's current `--capture-every` interval by
  reading it back out of the installed hook command, rather than resetting it to the
  default — unless the caller passes `--capture-every` explicitly, which applies the new
  interval to every host `update` touches.
- `update` never installs a host that was never installed, never scaffolds bundle files,
  and never touches registration — it is strictly "make what's already here current,"
  the same narrow scope `init`'s own removal already has for "take back what was
  installed."
- Supports `-n`/`--dry-run`, reporting exactly what `init` would report, before writing.
- Reports plainly when nothing is installed for the target bundle, naming `init --agent`
  as the next step, rather than silently doing nothing.

## Capabilities

### Modified Capabilities
- `agent-integration`: adds a distinct update verb and the underlying installed-detection
  and interval-preservation behavior the existing install/removal requirements do not
  cover.

## Impact

- `src/core/agents/adapter.ts`: `Adapter` interface gains `isInstalled(context): boolean`.
- `src/core/agents/hosts.ts`: each of the four adapters implements `isInstalled`; a new
  helper parses the currently-installed `--capture-every` value back out of a hook host's
  config for the two hook-capable adapters.
- New `src/commands/update.ts`: `runUpdate(dir, options)`, mirroring `init.ts`'s
  `runHosts` plumbing but driven by detection instead of an explicit `--agent` list.
- `src/cli.ts`: wires the new `update [dir]` command.
