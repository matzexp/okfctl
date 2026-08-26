# What makes a well-refined entry

The full criteria `okf-refine` applies when deciding shape, type, and title for a dump
moving into the drafts area, once it has been checked against existing knowledge and
found unrelated to anything already there. A dump found to extend or contradict an
existing entry does not go through this shape decision at all — see `okf-refine`'s own
steps for that case.

Refining is not re-filing. A dump is one session's account of one thing that happened;
a refined entry is knowledge the next reader can find, recognize as applying to them,
and act on. The shape decision below is the filing half. The three sections after it —
findability, applicability, connection — are what turn a captured incident into
something reusable, and they are the half most easily skipped, because an entry that
skips them still looks finished.

## Shape: one-to-one, split, or consolidate

Read each dump and ask what it actually contains:

- **One clear finding** → refine it into exactly one drafts-area entry.
- **Several distinct findings sharing one dump** (a session's end-of-turn capture often
  does this) → refine it into one entry per finding. Check that literally: a split that
  quietly drops the third paragraph is the failure mode here, and nothing will report it.
- **Several dumps that substantially overlap** → refine them together into one entry,
  citing all of them. Do not create near-duplicate entries that will just have to be
  merged again in review.

When in doubt, prefer more, smaller entries over one that bundles unrelated things — an
`okf-review` split later has to redo this judgment with less context than you have now.

## Type and title: against the bundle, not from habit

Read what the bundle's existing types and directories are before choosing
(`okfctl status --json`), and match them. Refine has no provisional type — `--type` and
`--title` are required, because assigning them for real is the whole point of this step.
A vague or restated capture title ("test finding", "gateway thing") is not a title; write
one a reader would recognize in an index.

## Findability: write for the search that will look for this

A refined entry is only reusable if the next session finds it, and the next session will
be searching with the words it has at the time — an error string, a symptom, a command
that failed — not the words you have now, having already understood the problem. An entry
titled "Mitigate gateway timeout defaults" is invisible to someone searching
`504 upstream request timeout`.

So carry the searchable surface deliberately:

- **`--description` is required in practice.** One line saying what the entry establishes.
  It is what a reader sees in `okfctl search` and in `index.md` without opening the file,
  and it is weighted heavily in ranking. An entry without one makes every reader open it
  to find out whether it is relevant.
- **`--tags` carry the vocabulary the title cannot.** The component, the technology, the
  subsystem, the failure mode. Match tags the bundle already uses (`okfctl status --json`
  shows them) rather than inventing near-synonyms — `networking` and `network` splitting a
  corpus in half helps nobody.
- **Put the literal symptom in the body**, when the finding has one: the exact error
  message, the exit code, the log line, the command that produced it. Quote it rather than
  paraphrasing. This is the single highest-value thing for retrieval, and paraphrasing is
  what destroys it.

## Applicability: say when this applies and when it stops

A dump records what happened once. A reusable entry says what it means in general, and —
just as importantly — where the generalization stops. Both halves matter: an entry that
overclaims sends the next reader down a path that does not fit their case, and one that
never generalizes at all is a diary entry.

State, where the finding supports it:

- **When this applies** — the conditions under which a reader should act on it. The
  versions, the configuration, the environment, the shape of the problem.
- **What would invalidate it** — the version bump, the config default, the upstream fix
  that would make this wrong. A finding whose expiry conditions are written down can be
  reviewed against reality later; one without them can only be re-derived.
- **What was actually verified** versus what is inference. Carry the dump's caveats
  forward rather than smoothing them away — a refined entry reads as more settled than a
  raw capture, so any confidence it gains in refinement had better be earned.

Do not invent any of this. If the dump does not establish the boundary, say the boundary
is unknown; that is a fact about the knowledge, and it is useful.

## Connection: attach the entry to what is already there

Step 4 of `okf-refine` already searched for related knowledge to decide whether this dump
extends or contradicts something. Even when the answer was "unrelated", what that search
turned up is usually worth linking to — a corpus of disconnected notes is searchable but
not navigable, and nothing in the tooling will ever report that a concept is isolated
except `okfctl status --orphan` counting it.

- **Link out to the concepts a reader of this one would need next**, in the body, using
  the bundle's existing link style. `okfctl refs` will verify the links resolve; nothing
  creates them for you.
- **`okfctl related <id>`** on a neighbouring concept is a fast way to see what the
  entry should sit beside.
- Do not manufacture links for their own sake. Two or three that a reader would actually
  follow beat a list of everything sharing a tag.

## When a dump cannot be confidently refined

If a dumps-area concept is unintelligible, or you cannot establish what it is actually
claiming, leave it in the dumps area and report why — do not file a guess into the drafts
area. A wrong type or an invented shape is worse than an entry that stays in the inbox one
more cycle.

The same applies to the sections above, one at a time: if you cannot establish a real
description, a real symptom, or a real applicability boundary from the dump, leave that
part out and say so, rather than writing a plausible-sounding one. An invented boundary is
worse than an absent one, because the next reader will trust it.
