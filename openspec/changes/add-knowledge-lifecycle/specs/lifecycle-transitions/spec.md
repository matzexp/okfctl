## ADDED Requirements

### Requirement: Review Outcome

The system SHALL record the outcome of reviewing a concept as one of exactly two findings —
confirmed or outdated — and SHALL require the caller to state which.

#### Scenario: Outcome is required

- **WHEN** a review is requested with neither outcome given
- **THEN** the command exits non-zero naming both, and writes nothing

#### Scenario: Outcomes are exclusive

- **WHEN** both outcomes are given at once
- **THEN** the command exits non-zero, and writes nothing

### Requirement: Confirmed Review

The system SHALL, on a confirmed review, append a `{ by, at }` entry to `verified` and
SHALL leave `status` untouched, since confirming a concept says the content is still
accurate, not that its lifecycle state has moved.

#### Scenario: Verification recorded

- **WHEN** a stable concept is confirmed by `human:matze`
- **THEN** `verified` gains an entry naming that actor and the current instant, and
  `status` still reads `stable`

#### Scenario: A draft stays a draft

- **WHEN** a concept with `status: draft` is confirmed
- **THEN** the verification is recorded and the concept remains `draft`; moving it to
  `stable` is what promotion is for

#### Scenario: Freshness horizon moves forward

- **WHEN** the caller passes an absolute date or a relative duration
- **THEN** `stale_after` is set accordingly, clearing a staleness flag the review has just
  answered

#### Scenario: Drift is answered

- **WHEN** the reviewed concept was drifted, its last `verified.at` older than its
  `generated.at`
- **THEN** the new verification entry post-dates `generated.at`, and the concept no longer
  reads as drifted

### Requirement: Outdated Review

The system SHALL, on an outdated review, set `stale_after` to the current day and SHALL NOT
append to `verified`, so that the concept reports stale under SPEC §5.5 from that moment
while its trust tier makes no claim the review has just disproved.

#### Scenario: Marked stale immediately

- **WHEN** a concept is reviewed as outdated
- **THEN** `stale_after` is set to today, and `status --stale` lists the concept

#### Scenario: No verification is claimed

- **WHEN** a concept is reviewed as outdated
- **THEN** `verified` is unchanged, and the concept's trust tier is exactly what it was
  before the review

#### Scenario: Status is left to the maintainer

- **WHEN** a concept is reviewed as outdated
- **THEN** `status` is unchanged, because the choice between rewriting the concept and
  deprecating it is a separate decision with a separate verb

#### Scenario: No invented fields

- **WHEN** an outdated review is recorded
- **THEN** the only frontmatter key written is `stale_after`; the finding's narrative lives
  in the log, not in a key OKF v0.2 does not define

### Requirement: Review Is Logged

The system SHALL append a dated entry naming the outcome, and the reason when one is given,
to the nearest `log.md` on the same terms as a lifecycle transition.

#### Scenario: Outcome named in the log

- **WHEN** a review is recorded without `--no-log`
- **THEN** the log entry states which of the two outcomes was found, and by whom

#### Scenario: Reason carried

- **WHEN** the caller passes a reason
- **THEN** it appears in the log entry

### Requirement: Review Actor And Dry Run

The system SHALL validate the reviewing actor against the SPEC §7 forms, and SHALL support
previewing a review without writing.

#### Scenario: Actor required for confirmation

- **WHEN** a confirmed review is requested with no actor
- **THEN** the command exits non-zero, because a `verified` entry cannot be written without
  a `by` value

#### Scenario: Preview writes nothing

- **WHEN** the caller passes `--dry-run`
- **THEN** the field edits are printed, and neither the concept nor any `log.md` changes
