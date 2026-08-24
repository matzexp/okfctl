/**
 * `.okf/policy/` — a bundle's own judgment on what to capture, what makes a
 * citation good enough, and what frontmatter it expects per type. Distinct from
 * `dumps.ts`/`drafts.ts`'s holding areas: those hold knowledge, this holds how
 * the bundle wants knowledge judged.
 *
 * `.okf/` is dotfile-prefixed, so it is already excluded from `loadBundle`'s
 * walk by the same rule that already excludes `.claude/` and `.agents/` — no
 * frontmatter, never a concept, never subject to SPEC §11.
 */
export const POLICY_DIR = '.okf/policy';

export const CONTENT_POLICY_FILE = `${POLICY_DIR}/content-policy.md`;
export const SOURCE_POLICY_FILE = `${POLICY_DIR}/source-policy.md`;
export const FIELD_POLICY_FILE = `${POLICY_DIR}/field-policy.md`;

/**
 * Seeded starter content, not a blank template. Restates `okf-capture`'s
 * built-in "what counts as durable" categories as editable bundle policy, so a
 * fresh bundle's policy already encodes today's generic judgment and editing it
 * is narrowing or extending a real starting point rather than writing one from
 * nothing.
 */
export function contentPolicyTemplate(): string {
  return [
    '# Content policy',
    '',
    'What is worth capturing and refining in this bundle, and what is not. Read by',
    '`okf-capture` (deciding whether a session produced anything worth keeping) and',
    '`okf-refine` (deciding what shape a dump should take once refined). Edit this file',
    'freely — narrow it, extend it, add bundle-specific categories. It can make the bar',
    'stricter than the defaults below; it cannot license inventing an actor, claiming a',
    "human's authorship of agent-written content, or writing something the agent is not",
    'confident is true. Those guardrails do not come from this file and are not this',
    "file's to relax.",
    '',
    '## Worth capturing',
    '',
    'The default bar, inherited from `okf-capture`\'s built-in criteria (see that skill\'s',
    '`worth-capturing.md` for the full description of each): a decision and why, a root',
    'cause, a non-obvious constraint or gotcha, a correction to a standing belief, a',
    'measurement, a reusable procedure, a negative result, or a mistake caused by this',
    'local setup or this org\'s own conventions.',
    '',
    'Add this bundle\'s own categories below, if it has any beyond the default:',
    '',
    '## Not worth capturing',
    '',
    'The test: is this bundle the only place this fact would exist, or could a reader get',
    'it back for free by reading the code, the dependency, or upstream docs?',
    '',
    '## Staleness horizons (optional)',
    '',
    'If this bundle wants a convention for how long different kinds of knowledge stay',
    'trusted without review, state it here — `okf-promote` and `okf-review` ask for a',
    'horizon per concept, but a per-type default saves relitigating it every time.',
    'Example:',
    '',
    '<!--',
    '| Type          | Horizon |',
    '|---------------|---------|',
    '| Runbook       | 90d     |',
    '| Decision      | 1y      |',
    '-->',
  ].join('\n');
}

/**
 * Seeded from `okf-review`'s existing source-checking guidance and
 * `okf-capture`'s "be specific" guidance.
 */
export function sourcePolicyTemplate(): string {
  return [
    '# Source policy',
    '',
    'What makes a citation good enough in this bundle, and how sources should be',
    'checked during review. Read by `okf-ingest` (writing citations),',
    '`okf-refine` (citing what a refined entry drew from), and `okf-review`',
    '(checking a concept against its sources). Edit this file freely — it can raise the',
    "bar for what counts as a sufficient check; it cannot license skipping a citation",
    "a concept owes, or recording a verification (`--confirm`) without actually",
    'checking against something real.',
    '',
    '## What a good citation names',
    '',
    'Be specific rather than general. Name the exact component, version, file, flag,',
    'error message, or command involved — "the CSI driver" is weaker than',
    '"truenas-csi-iscsi v1.0.2". Where a claim rests on something checkable — a',
    'command, a query, a log window, a file — name it exactly enough that someone',
    'could rerun it.',
    '',
    '## How review checks a source',
    '',
    'The default approach, inherited from `okf-review`:',
    '',
    '- `sources[]` entries — follow the `resource` to the file, repo, or URL and read',
    '  it.',
    '- Links in the body to other concepts, or out to the system being described.',
    '- The system itself, when the bundle describes something inspectable and there are',
    '  means to inspect it — a repo, a config file, a cluster.',
    '',
    'A concept with no sources and nothing inspectable is the hard case — report it',
    'rather than guessing at whether it is still accurate.',
    '',
    '## Bundle-specific source conventions (optional)',
    '',
    'State here anything specific to this bundle: which repositories or systems are the',
    'canonical sources for which kinds of claims, any source type this bundle trusts',
    'less than another, or a citation format this bundle prefers beyond the SPEC §5.1',
    'minimum.',
  ].join('\n');
}

/**
 * Seeded from SPEC §11's baseline plus `okf-ingest`'s existing type/placement
 * guidance. Left mostly as a template for the first `okf-ingest` run (or the
 * user) to fill in, since a fresh bundle has no corpus to derive conventions
 * from yet — this is the file `okf-ingest`'s no-corpus fallback now records
 * its answer into, instead of filing it as a concept.
 */
export function fieldPolicyTemplate(): string {
  return [
    '# Field policy',
    '',
    "This bundle's required or recommended frontmatter per type, beyond what SPEC §11",
    'requires of every concept. Read by `okf-ingest` (deciding placement and type) and',
    '`okf-refine` (deciding a refined entry\'s type and title). Nothing in `okfctl`',
    'validates a concept against this file or fails `okfctl check` over it — SPEC §11',
    'forbids a conformance rule beyond its three, and per-type field conventions are',
    'exactly the kind of bundle-specific judgment that stays advisory on purpose.',
    '',
    '## Always required (SPEC §11, every concept, every bundle)',
    '',
    '- `type` — a non-empty string. The vocabulary is open (SPEC §4.1); this bundle\'s',
    '  own vocabulary is the table below, once it has one.',
    '- `title` — recommended everywhere `okfctl` falls back to a filename stem when',
    '  absent.',
    '',
    'Never hand-edit `status`, `generated`, or `verified` — the CLI writes these, and a',
    'direct edit bypasses actor validation, the conformance gate, and the log entry.',
    '',
    '## This bundle\'s types (fill in as they emerge)',
    '',
    'A bundle with no corpus yet has no convention to match — `okf-ingest` proposes one',
    'on first use and records the agreed answer here, rather than guessing silently or',
    'filing the decision as a corpus concept. Once populated, treat this table as the',
    'convention every later `okf-ingest`/`okf-refine` run matches against:',
    '',
    '<!--',
    '| Type     | Directory     | Required fields beyond type/title | Notes |',
    '|----------|---------------|------------------------------------|-------|',
    '| Decision | decisions/    | tags                               |       |',
    '| Incident | incidents/    | sources                            |       |',
    '| Runbook  | operations/   |                                     |       |',
    '-->',
  ].join('\n');
}
