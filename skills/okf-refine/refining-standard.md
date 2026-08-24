# What makes a well-refined entry

The full criteria `okf-refine` applies when deciding shape, type, and title for a dump
moving into the drafts area, once it has been checked against existing knowledge and
found unrelated to anything already there. A dump found to extend or contradict an
existing entry does not go through this shape decision at all — see `okf-refine`'s own
steps for that case.

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

## When a dump cannot be confidently refined

If a dumps-area concept is unintelligible, or you cannot establish what it is actually
claiming, leave it in the dumps area and report why — do not file a guess into the drafts
area. A wrong type or an invented shape is worse than an entry that stays in the inbox one
more cycle.
