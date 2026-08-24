# What's worth capturing

The full criteria `okf-capture` step 1 applies when deciding whether a session produced
anything durable. Durable knowledge outlives the session because the next reader cannot
re-derive it from the repository, the ticket, or common sense.

- **A decision and why**, when "why" required weighing options a reader would otherwise
  re-litigate — not "we chose Postgres" but the constraint that ruled out the alternative.
- **A root cause**, when finding it took real investigation — the actual mechanism, named
  precisely (the component, the exact condition, the version), not "there was a bug".
- **A non-obvious constraint or gotcha**, especially one that looks like it should work
  and does not — an API contract that is narrower than it appears, an ordering requirement,
  a flag that silently changes behavior elsewhere.
- **A correction to a standing belief**, when something the team or the docs assumed
  turns out to be false, and someone will act on the old belief again if it is not written
  down.
- **A measurement**, when it took work to produce and would take the same work to
  reproduce — a benchmark, an audit count, a reduction percentage — recorded with its
  exact conditions (the window, the version, the environment), not just the headline number.
- **A reusable procedure**, when a sequence of steps was worked out under real constraints
  (ordering, rollback points, what to verify before proceeding) and getting it wrong is
  costly enough that the next person should follow the worked-out order rather than
  reinvent it.
- **A negative result**, when an approach was tried and specifically ruled out — this
  saves the next session from repeating the same dead end, and is easy to skip because it
  feels like "nothing happened."
- **A mistake caused by this local setup or this org's own conventions**, when a
  technology behaved correctly but a *company-specific* or *this-machine-specific*
  condition made the obvious approach fail — a proxy, an internal registry mirror, a
  pinned internal fork, a naming or folder convention this repo enforces that upstream
  docs know nothing about, a permission or network policy unique to this environment.
  This is the highest-value category precisely because it is invisible to generic
  documentation, generic training data, and the technology's own docs — nothing outside
  this bundle will ever record it, so if it is not captured here it will be rediscovered
  the same expensive way every time. Name the generic symptom (what upstream docs would
  lead you to expect) and the local cause that actually explains it, not just "it didn't
  work."

## Not worth capturing

What you did, which files you edited, what the user asked for, or anything the
repository already records at a glance. A restatement of code is not knowledge about
it — knowledge is the part that is not visible by reading the code. This cuts hardest
against generic technology facts: a library's public API contract, a language's own
semantics, a framework default documented in its own README, an error message that is
the technology working as designed — an agent reading the code, the dependency, or the
upstream docs gets these back for free, at no cost, whenever it needs them, so capturing
them is pure inbox noise, never a shortcut. The bar is not "is this true and useful" —
it is "is this bundle the only place this fact exists."
