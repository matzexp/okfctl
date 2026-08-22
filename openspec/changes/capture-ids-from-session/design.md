## Context

See proposal.md — Why. What shapes the approach:

- A concept's id **is** its bundle-relative path (`bundle-model`, SPEC §2). There is no
  separate identifier, so choosing a filename is choosing the string every link, index entry
  and citation will use.
- `capture` already records provenance in `sources[]` (SPEC §5.1): the working directory,
  and the git remote and commit when there is one.
- The hook knows `session_id` — it is on the stdin payload from both hosts — but `capture`
  has never been told it, and `capture` must keep working when no hook has run at all.
- `okfctl status` prints id, status, trust tier and flags. It has never printed a title.
- `docs/design.md`, `new`: "Never invent an actor, a source, or a `stale_after` horizon.
  Absent is honest; guessed is a false claim."

## Goals / Non-Goals

**Goals:**

- A generated id that cannot collide, so capture never destroys the summary it just wrote.
- Captures from one conversation visibly belong together.
- The producing session stays answerable after the concept is renamed and filed.
- The inbox stays readable when its ids stop being words.

**Non-Goals:**

- **No migration.** Concepts already captured keep their ids. Rewriting them would change
  every link that resolves to them to fix a filename nobody is troubled by.
- **No id scheme for the corpus.** This governs what `capture` generates. `okfctl new` and
  `move` still take the path you give them, because there placement is a decision, not a
  placeholder.
- **No session tracking beyond provenance.** The session id is recorded and grouped on; it
  is not an index, a query surface, or a lifecycle signal.

## Decisions

### 1. `<YYYY-MM-DD>-<session8>-<n>`

```
drafts/2026-08-22-45fcb979-1.md
drafts/2026-08-22-45fcb979-2.md
drafts/2026-08-23-01a024e6-1.md
```

Three parts, each earning its place. The **date** is the only component a human reads at a
glance, and it makes a plain `ls` chronological. The **session prefix** groups a
conversation's captures without carrying the full 36-character uuid into the filename. The
**sequence** makes collision arithmetically impossible, which is the defect being fixed.

Eight hex characters is not a uniqueness guarantee and is not being asked to be one — the
date and the sequence do that work. It is a grouping label, and a truncated one is enough to
group by eye.

Rejected: the full session uuid, which is 36 characters of noise for a discriminator that
only has to separate one day's sessions. Rejected: a bare counter (`drafts/1.md`), which
collides across machines and tells you nothing. Rejected: a content hash, which is stable but
unreadable and groups nothing.

**The scheme applies wherever the capture lands.** `--to <dir>` changes the directory, not
the naming, because a rule with an exception is a rule people get wrong. If you want a
chosen name you pass `--id`, which is the one thing that says "I have decided this."

### 2. The sequence comes off the disk, not from state

`capture` scans the target directory for ids already matching `<date>-<session8>-` and takes
the highest sequence plus one.

This matters more than it looks. The hook keeps per-session state, and the sequence could
have lived there — but then a capture run by hand, or in a session where the hook never
fired, or after the state directory was pruned, would pick a sequence that is already taken.
Deriving it from the bundle means the bundle is the only thing that has to be right, which
is also what makes the operation idempotent under retry.

### 3. Without a session, say so

`--session` is optional, because an agent invoking `capture` by hand may genuinely not know
its session id. When it is absent the id uses a fixed stand-in — `2026-08-22-adhoc-1` — and
**no session is written to `sources[]`**.

Rejected: generating a random id and presenting it as the session. It would look exactly
like a real one in the filename and in provenance, and a fabricated identifier in a field
other tools read is the specific failure the existing "never invent" rule is about. The
sequence already guarantees uniqueness, so nothing is bought by faking it.

`adhoc` groups all sessionless captures for a day together, which is honest: they have no
session in common, and the name does not claim they do.

### 4. Session goes in `sources[]`, next to the origin

```yaml
sources:
  - id: origin
    title: /home/matze/work/payments-api
    resource: git@github.com:acme/payments-api.git@8f2c1a9
  - id: session
    title: claude-code session
    resource: 45fcb979-e08a-4717-9ef6-af46dbb42e8b
```

The filename carries eight characters of it, and the filename does not survive promotion —
the whole premise of this change is that the id gets replaced. So the durable record has to
be in frontmatter, and `sources[]` is where §5.1 already puts a claim's provenance.

Rejected: a top-level `session:` key. §11 tolerates unknown keys, so it would be legal, but
a key only `okfctl` reads is a signal no other consumer can act on — the same argument that
kept `review --outdated` from inventing a "reviewed and found wrong" field.

An uncited `sources[]` entry is not a defect: `refs` reports it and `check` does not, which
`docs/design.md` settles under Citations.

### 5. Collision splits into two rules

The generated scheme **cannot** collide, so it never refuses. If the sequence scan somehow
produced a taken id, the command advances the sequence rather than failing — losing an
agent's summary to a naming accident is the failure being designed out.

An explicit `--id` that is taken **still refuses**, unchanged. There the caller named a
specific concept, and overwriting one is never right.

### 6. `status --drafts` prints titles

The listing shows id, status, trust tier and flags. Opaque ids without a title turn the
inbox into a list of dates you would have to `cat` to read, which would make this change a
net loss however good the ids are.

Titles are added to the **drafts listing only**. The main attention list is about corpus
concepts, whose ids are meaningful by construction and often say more than a title would;
widening every row to fix a problem that only exists in one view is not worth the column.

### 7. `slugify` keeps one job

It stops deriving ids from titles. It stays for normalizing an explicit `--id`, where the
truncation is fixed to cut on a hyphen boundary rather than mid-word — the bug that produced
`...-and-histogra`.

Rejected: deleting it and validating `--id` instead. A caller passing `--id "My Thing"`
should get `my-thing`, not an error about spaces.

## Risks / Trade-offs

- **The inbox stops being scannable by filename.** You cannot tell what
  `2026-08-22-45fcb979-2` is without opening it. → `status --drafts` prints titles, which is
  the view actually used to work the inbox; a bare `ls` is not.
- **`move` needs a copy-paste rather than a typed name.** `move stop-hook-blocking` becomes
  `move 2026-08-22-45fcb979-2`. → The listing you read to choose is the listing you copy
  from, and suffix matching still resolves `45fcb979-2`.
- **Eight hex characters could repeat across days.** → The date separates them, and the
  sequence separates within a day. Grouping is the only claim being made.
- **`adhoc` captures from unrelated sessions share a prefix.** → They share it precisely
  because there is nothing to distinguish them, and the alternative was inventing something.

## Migration Plan

None required. Existing concepts keep their ids; nothing is rewritten. The scheme applies to
captures made after the change, so a bundle will hold both forms — which is correct, since
the old ids are real ids that real links may point at.

## Open Questions

None.
