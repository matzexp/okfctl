import { readFileSync } from 'node:fs';
import { pruneSessions, readSession, registeredBundle, writeSession } from '../core/userconfig.ts';

/**
 * The capture hook, shared by every hook-capable host.
 *
 * It has no model, so it cannot summarize a session. A hook that tried would
 * write garbage into the bundle under a producer's provenance, which is a false
 * claim in the sense SPEC §7 cares about. So it does not capture — it *prompts*,
 * and the agent, which does have the transcript and a model, decides.
 *
 * It prompts by blocking the turn. Emitting context without blocking does not
 * give the agent a chance to act: the context is seen on the *next* turn, and if
 * the session ends there the knowledge is gone. Holding the turn open is the
 * only way to document what a turn produced before control returns to the user.
 *
 * It blocks with `{ decision: "block", reason }` on stdout and **always exits 0**,
 * on both supported hosts. Exit 2 blocks too, but it is the error channel: the
 * host renders stderr as a hook failure, and an advisory prompt is not a failure.
 * Always exiting 0 also means no exit code can ever hold a user in a conversation.
 */

/** Blocks allowed in one session inside the window before the breaker trips. */
export const BREAKER_LIMIT = 5;
export const BREAKER_WINDOW_MS = 2 * 60 * 1000;

export interface HookOptions {
  /** Prompt on every nth completed turn. */
  every?: number;
  /** Read the payload from here instead of stdin. Tests only. */
  payload?: string;
}

export interface HookOutcome {
  /** Always 0. Blocking is a decision on stdout, never an exit status. */
  code: number;
  /** True when the turn is held open. */
  blocking: boolean;
  /** What the agent or user is told, when anything is. */
  message: string | null;
  reason: 'blocked' | 'not-due' | 'continuation' | 'unarmed' | 'breaker' | 'no-bundle' | 'ignored';
}

/** The JSON a host reads on stdout, or null when there is nothing to say. */
export function payloadFor(outcome: HookOutcome): string | null {
  if (outcome.blocking) {
    return JSON.stringify({ decision: 'block', reason: outcome.message });
  }
  if (outcome.message) return JSON.stringify({ systemMessage: outcome.message });
  return null;
}

interface Payload {
  session_id?: string;
  hook_event_name?: string;
  transcript_path?: string;
  cwd?: string;
  /** Codex: whether this turn was already continued by Stop. Its own loop guard. */
  stop_hook_active?: boolean;
}

export function runHook(options: HookOptions): number {
  const outcome = decide(options);
  const payload = payloadFor(outcome);
  if (payload) process.stdout.write(`${payload}\n`);
  return outcome.code;
}

export function decide(options: HookOptions, now = Date.now()): HookOutcome {
  // Every failure path ends the turn. A hook that can hold a user in a
  // conversation may only ever fail open.
  try {
    return evaluate(options, now);
  } catch {
    return { code: 0, blocking: false, message: null, reason: 'ignored' };
  }
}

function evaluate(options: HookOptions, now: number): HookOutcome {
  const raw = options.payload ?? readStdin();
  let payload: Payload;
  try {
    payload = JSON.parse(raw) as Payload;
  } catch {
    return { code: 0, blocking: false, message: null, reason: 'ignored' };
  }

  const sessionId = typeof payload.session_id === 'string' && payload.session_id
    ? payload.session_id
    : null;
  if (!sessionId) return { code: 0, blocking: false, message: null, reason: 'ignored' };

  const event = payload.hook_event_name ?? '';
  const state = readSession(sessionId);

  // Genuine user input arms the session. This is what lets the Stop hook tell a
  // real turn from the continuation its own block produced, on a host that does
  // not report continuations itself.
  if (event === 'UserPromptSubmit') {
    writeSession(sessionId, { ...state, armed: true });
    return { code: 0, blocking: false, message: null, reason: 'ignored' };
  }

  if (event !== 'Stop') return { code: 0, blocking: false, message: null, reason: 'ignored' };

  // Codex reports its own continuations. Where that signal exists it is exact,
  // and it is checked before anything else.
  if (payload.stop_hook_active === true) {
    return { code: 0, blocking: false, message: null, reason: 'continuation' };
  }

  const turns = state.turns + 1;
  const recent = state.blockTimes.filter((time) => now - time < BREAKER_WINDOW_MS);

  if (state.tripped) {
    writeSession(sessionId, { ...state, turns, blockTimes: recent });
    return { code: 0, blocking: false, message: null, reason: 'breaker' };
  }

  if (recent.length >= BREAKER_LIMIT) {
    writeSession(sessionId, { ...state, turns, blockTimes: recent, tripped: true, armed: false });
    return {
      code: 0,
      blocking: false,
      message: `okfctl: capture prompts disabled for this session after ${BREAKER_LIMIT} in ` +
        `${Math.round(BREAKER_WINDOW_MS / 1000)}s. Run \`okfctl capture\` by hand if needed.`,
      reason: 'breaker',
    };
  }

  // A continuation this hook caused finds the session disarmed.
  if (!state.armed) {
    writeSession(sessionId, { ...state, turns, blockTimes: recent });
    return { code: 0, blocking: false, message: null, reason: 'continuation' };
  }

  const every = Math.max(1, Math.floor(options.every ?? 1));
  if (turns % every !== 0) {
    writeSession(sessionId, { ...state, turns, blockTimes: recent });
    return { code: 0, blocking: false, message: null, reason: 'not-due' };
  }

  // Nothing to capture into is not a reason to hold the user in a conversation.
  const bundle = registeredBundle();
  if (!bundle) {
    writeSession(sessionId, { ...state, turns, blockTimes: recent, armed: false });
    return { code: 0, blocking: false, message: null, reason: 'no-bundle' };
  }

  pruneSessions();
  writeSession(sessionId, {
    ...state,
    turns,
    blocks: state.blocks + 1,
    blockTimes: [...recent, now],
    armed: false,
  });

  return { code: 0, blocking: true, message: prompt(bundle), reason: 'blocked' };
}

/**
 * The prompt. Advisory even though it blocks: declining is a valid answer, and
 * an inbox of noise is worse than an empty one.
 */
export function prompt(bundle: string): string {
  return [
    'okfctl: before this turn ends, consider whether it produced knowledge worth keeping.',
    '',
    `If it did, run the okf-capture workflow to write it into the knowledge base at ${bundle}.`,
    'Summarize what was established so a reader who was not here can act on it — do not',
    'paste the transcript. Record yourself as the producer, not the user.',
    '',
    'If nothing durable came out of this turn, say so in one line and stop. Declining is',
    'the right answer more often than not.',
  ].join('\n');
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}
