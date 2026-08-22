## 1. Drafts area foundation

- [x] 1.1 Add `src/core/drafts.ts`: resolve the drafts area from a bundle root and an
      optional override, and answer "is this concept id in the drafts area" by path prefix
- [x] 1.2 Add a global `--drafts-dir <path>` option in `src/cli.ts`, threaded into the
      bundle context every command already receives
- [x] 1.3 Extend the bundle fixture in `test/fixtures/bundle/` with a `drafts/` directory
      holding two captured concepts, one of them old enough to exercise the oldest-capture
      age reporting
- [x] 1.4 Tests: default area, override, nested membership, absent area reports empty
      rather than erroring, and no directory is created by a read

## 2. `okfctl capture`

- [x] 2.1 Add `src/commands/capture.ts` building on the same YAML document model
      `src/commands/new.ts` writes through, so a captured and a created concept are
      formatted identically
- [x] 2.2 Derive the id from the title in kebab-case; default the target to the drafts area
      and honor `--to <dir>`; refuse on collision naming the existing concept
- [x] 2.3 Write `type` from `--type` or the provisional default, plus `title`, `status:
      draft`, and `generated`; require `--by` and fail without it, writing nothing
- [x] 2.4 Read the body from `--stdin` or `--body`, and write it verbatim below the
      frontmatter with no templating or reformatting
- [x] 2.5 Record the origin as a `sources[]` entry — working directory, plus git remote and
      commit when there is one — added alongside any caller-supplied sources, and omitted
      when capturing from inside the target bundle
- [x] 2.6 Resolve the target bundle through the section 7 precedence chain, failing with
      the registration command named when nothing resolves
- [x] 2.7 Append the log entry to the nearest `log.md` via `src/core/log.ts`
- [x] 2.8 Implement `--dry-run`: print resolved path and frontmatter, create no file, no
      directory, and no log entry
- [x] 2.9 Register the verb in `src/cli.ts`
- [x] 2.10 Tests: minimal invocation, provisional vs explicit type, explicit `--to`, body
      copied byte-for-byte, missing actor refused, collision refused, dry run inert, origin
      recorded in and out of a git repo, origin omitted when capturing into the enclosing
      bundle, and `okfctl check` reports zero new errors after a capture

## 3. Link rewriting in `core/refs.ts`

- [x] 3.1 Expose an inbound query: given a concept id, return every internal link in the
      bundle that resolves to it, with its file, offset, and raw target form
- [x] 3.2 Add a rewrite that maps a resolved link's target from an old id to a new one,
      preserving the target's original form (root-absolute vs relative) and the link text
- [x] 3.3 Confirm the existing code-fence and inline-code exclusion applies to the inbound
      query, so a path inside a shell sample is never rewritten
- [x] 3.4 Tests: root-absolute and relative targets both follow a move; an already-broken
      link is untouched; a bare id in prose, in a code fence, and in an inline span are all
      untouched; `http:`/`https:`/`mailto:` untouched

## 4. `okfctl move`

- [x] 4.1 Add `src/commands/move.ts`: resolve the source through the existing single-match
      concept resolution, refusing an ambiguous or missing reference with the candidate list
- [x] 4.2 Refuse an existing target and a reserved target (`index.md`, `log.md`); create
      intermediate directories for a valid target
- [x] 4.3 Move the file, rewrite inbound links via the section 3 API, and leave `status`,
      `verified`, `stale_after`, and unknown frontmatter keys untouched
- [x] 4.4 Regenerate the source and target directory indexes using the section 5 API
- [x] 4.5 Append the log entry naming old id, new id, and actor; require `--by`
- [x] 4.6 Implement `--dry-run` listing destination, every link rewrite with its containing
      file, and every index that would be regenerated
- [x] 4.7 Implement failure rollback: stage every write and restore the prior state if any
      step fails, so the bundle is never left partially relocated
- [x] 4.8 Register the verb in `src/cli.ts`
- [x] 4.9 Tests: id changes, both indexes updated, a draft stays a draft, unknown keys
      survive, overwrite refused, reserved target refused, dry run inert, rollback on a
      forced mid-operation failure, and `okfctl refs --broken` is clean afterward

## 5. Targeted index regeneration

- [x] 5.1 Extend `src/commands/index-gen.ts` with a directory-scoped regeneration path that
      `move` can call, generating an `index.md` for a named directory that lacks one
- [x] 5.2 Tests: only the named directories are rewritten and every other `index.md` is
      byte-for-byte unchanged; a relocated concept appears under its new path and is gone
      from the old index

## 6. `okfctl status` inbox segregation

- [x] 6.1 Print the inbox line — count plus age of the oldest capture — in the summary,
      omitting it when the drafts area is empty or absent
- [x] 6.2 Exclude drafts-area concepts from the default attention list while keeping them
      in the trust-tier and lifecycle-status census
- [x] 6.3 Add `--drafts` to list the inbox with capture dates, and `--all` to restore the
      unsegregated attention list
- [x] 6.4 Add the drafts-area path and a per-record drafts flag to `--json` output
- [x] 6.5 Tests: inbox line present and absent, a draft outside the drafts area still
      flagged, census unchanged by segregation, both new filters, and the JSON shape

## 7. `okfctl init`, registration, and bundle resolution

- [x] 7.1 Add `src/core/userconfig.ts`: read and write the user-level config at
      `$XDG_CONFIG_HOME/okfctl/config.json` (falling back to `~/.config/okfctl/`), holding
      the registered bundle path, plus a state directory for per-session hook markers
- [x] 7.2 Implement bundle resolution by precedence in `src/core/bundle.ts` — explicit
      `--bundle`, then the nearest enclosing bundle root walking up from the working
      directory, then the registered bundle — and thread it through every command
- [x] 7.3 Fail a writing command that resolves to nothing by naming the registration
      command, and fail a registered-but-missing bundle by naming the stale path; never
      recreate a bundle implicitly
- [x] 7.4 Add `src/commands/init.ts` scaffolding root `index.md` with `okf_version`,
      `log.md`, and the drafts area; verify the result passes `okfctl check`
- [x] 7.5 Add `--register`: record the bundle as the machine's knowledge base, reporting
      any bundle it displaces, and refusing a path that holds no bundle
- [x] 7.6 Make init non-destructive and idempotent: report skipped existing files, create
      only what is missing; keep scaffolding and registration separable
- [x] 7.7 Implement `--dry-run` listing every path it would create or edit
- [x] 7.8 Register the verb in `src/cli.ts`
- [x] 7.9 Tests: empty directory, existing bundle left intact, second run reports nothing
      needed, dry run inert, registration replaces and reports, non-bundle registration
      refused, and every branch of the precedence chain including the enclosing bundle
      winning over the registered one

## 8. The hook program and agent host adapters

- [x] 8.1 Write the shared hook program: reads one JSON object on stdin, takes `session_id`,
      `transcript_path` and `cwd`, and emits the capture prompt by blocking the turn —
      `exit 2` with the prompt on stderr for Claude Code, a block decision for Codex — so
      the turn is documented before control returns to the user. (Event and I/O contract
      verified; see design.md decision 7a.)
- [x] 8.2 Implement the termination guards in `src/core/userconfig.ts` state: honor Codex's
      `stop_hook_active` where present; for hosts without it, arm on `UserPromptSubmit` and
      disarm on blocking so a hook-caused continuation is never blocked; apply a session
      circuit breaker bounding blocks per window; and make every error path exit 0 so the
      hook can never trap the user
- [x] 8.2a Implement the per-session turn counter and the `--capture-every <n>` interval:
      prompt on every nth completed turn, restart the count per session, refuse a
      non-positive or non-integer interval, and report the installed interval
- [x] 8.3 Define the adapter interface in `src/core/agents/`: name, `plan()` returning the
      paths and edits for install and for removal, `apply()`, and a report of what was
      installed and what the host does not support — one hook program, one config writer
      per host
- [x] 8.3a Read the shipped skills from the package in `src/core/agents/sources.ts` rather
      than generating them, and add them to the published `files` so an installed okfctl
      can find them
- [x] 8.3b Install at two scopes: `okf-capture` at user scope, the five curation workflows
      into the bundle, each in the directory its host actually loads skills from
      (`.claude/skills` and `.claude/commands/okf`; `.agents/skills` for Codex, which has no
      slash commands)
- [x] 8.3c Removal takes back both scopes: delete files left holding nothing else, prune
      directories installation created, keep the user's own settings and the bundle itself
- [x] 8.4 Implement the `claude-code` config writer: add `Stop` and `UserPromptSubmit`
      entries under the `hooks` key of `~/.claude/settings.json` through a JSON model that
      preserves unrelated settings and any hooks already registered on those events; install
      `~/.claude/skills/okf-capture/` and `~/.claude/commands/okf/capture.md`
- [x] 8.5 Implement the `codex` config writer: add a `Stop` entry to `~/.codex/hooks.json`,
      or to the `[hooks]` table in `~/.codex/config.toml` when that is where the user's
      hooks already live; install `AGENTS.md` guidance
- [x] 8.6 Implement the `copilot` adapter: repository instructions only, reporting plainly
      that the host supports no event hook
- [x] 8.7 Implement the `agents-md` adapter: an additive `AGENTS.md` section, no hook
- [x] 8.8 Wire `init --agent <host>` (repeatable) and `init --agent <host> --remove`; fail
      on an unknown host listing the supported ones, and fail without writing when a host
      config exists but does not parse
- [x] 8.9 Have every adapter report that a user-level install affects every session on the
      machine, not just the current repository
- [x] 8.10 Tests: each config writer's planned paths; unrelated settings preserved; a
      pre-existing `Stop` hook survives; reinstall adds no duplicate; removal takes back
      exactly what was installed and reports nothing when not installed; unparseable config
      refused; unknown host refused; dry run inert on install and removal
- [x] 8.11 Tests for the hook program: a turn is blocked at the configured interval and not
      between; `stop_hook_active` suppresses a repeat block; the arm/disarm guard suppresses
      a continuation on a host without that flag; the circuit breaker bounds a runaway
      session; every error path exits 0; the count restarts per session; the bundle is
      untouched and no state is written inside any bundle
- [x] 8.12 End-to-end: with a registered bundle, run the hook program and a capture from a
      working directory in an unrelated repository, and confirm the concept lands in the
      registered bundle with that repository recorded as its origin

## 9. Agent skills

- [x] 9.1 Write `.claude/skills/okf-capture/SKILL.md` in the style of the existing suite:
      bundle root establishment, summarize-don't-transcribe, agent provenance, defer
      placement, write nothing when nothing durable happened
- [x] 9.2 Add `.claude/commands/okf/capture.md` matching the existing slash commands
- [x] 9.3 Extend `.claude/skills/okf-review/SKILL.md` with the two drafts-emptying routes:
      relocate via `move` after setting a real type, or merge into an existing concept —
      confirm before deleting the draft, log the merge, remove rather than deprecate
- [x] 9.4 Extend `.claude/skills/okf-triage/SKILL.md` to report the inbox and its oldest
      capture, naming review as the action, still writing nothing

## 10. Documentation

- [x] 10.1 Add `capture`, `move`, and `init` rows to the README command table and the
      examples block; document the drafts area convention, `--drafts-dir`, and the bundle
      resolution precedence
- [x] 10.2 Add `capture`, `move`, and `init` sections to `docs/design.md`, carrying the
      reasoning from this change's design.md — why a dump is a conformant concept, why
      relocation is not promotion, why the hook is on turn completion rather than session
      end, and what a hook can and cannot be
- [x] 10.3 Document the supported hosts — `claude-code` and `codex` with a turn-completion
      hook, `copilot` and `agents-md` with instructions only — and note that `init --agent`
      writes into user-level agent configuration, affects every repository on the machine,
      is opt-in, previewable, never destructive, and removable with `--remove`; document
      `--capture-every` and that holding a turn open costs a model round-trip
- [x] 10.4 Document the one-knowledge-base-per-machine model: `okfctl init --register` in
      the bundle repo, `--agent` to wire the hosts, and how to point elsewhere for a single
      command

## 11. Verification

- [x] 11.1 `npm test` green
- [x] 11.2 Run the full CI sequence against the fixture bundle after a capture and a move:
      `check`, `index --check`, `refs --broken --strict`, `catalog --check`
- [x] 11.3 Confirm no existing bundle without a `drafts/` directory sees any behavior
      change from this work, and that a user with no registered bundle and no installed
      host sees none either
