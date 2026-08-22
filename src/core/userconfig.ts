import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * State that belongs to the machine rather than to any bundle: which bundle is
 * the registered knowledge base, and what the capture hook has already done in
 * a given session.
 *
 * None of this is OKF. A bundle holds knowledge; a hook's session bookkeeping is
 * scratch, and writing scratch into a bundle would put it in `status`, in the
 * index, and in the catalog. So it lives here, outside every bundle.
 */

export interface UserConfig {
  /** Absolute path to the registered bundle, when one has been registered. */
  registeredBundle?: string;
}

export function configDir(): string {
  const xdg = process.env.OKFCTL_CONFIG_HOME ?? process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, 'okfctl') : join(homedir(), '.config', 'okfctl');
}

export function configFile(): string {
  return join(configDir(), 'config.json');
}

export function stateDir(): string {
  const xdg = process.env.OKFCTL_STATE_HOME ?? process.env.XDG_STATE_HOME;
  return xdg ? join(xdg, 'okfctl') : join(homedir(), '.local', 'state', 'okfctl');
}

export function readConfig(): UserConfig {
  const file = configFile();
  if (!existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as UserConfig) : {};
  } catch {
    // A config we cannot read is not a config we may overwrite.
    throw new Error(`cannot parse ${file}; fix or remove it`);
  }
}

export function writeConfig(config: UserConfig): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(configFile(), `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * A bundle root, as opposed to any directory that happens to hold an `index.md`.
 * SPEC §12 puts `okf_version` on the bundle-root index and nowhere else, which
 * is the strongest signal available; `init` also writes a root `log.md`, so the
 * pair is accepted for bundles that predate the version key.
 */
export function isBundleRoot(dir: string): boolean {
  const index = join(dir, 'index.md');
  if (!existsSync(index)) return false;
  try {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(index, 'utf8'));
    if (match && /^okf_version:/m.test(match[1])) return true;
  } catch {
    return false;
  }
  return existsSync(join(dir, 'log.md'));
}

/** The nearest bundle root at or above `from`, or null. */
export function enclosingBundle(from = process.cwd()): string | null {
  let dir = resolve(from);
  while (true) {
    if (isBundleRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function registeredBundle(): string | null {
  return readConfig().registeredBundle ?? null;
}

/**
 * Which bundle a command acts on when no `--bundle` was given: the one you are
 * standing in, then the registered one. Working *on* a bundle must never write
 * into a different one, which is why the enclosing bundle outranks registration.
 * Falls back to the working directory so behavior is unchanged for anyone who
 * has registered nothing.
 */
export function resolveBundleDir(from = process.cwd()): string {
  return enclosingBundle(from) ?? registeredBundle() ?? '.';
}

/**
 * The same chain, for a command that is going to write. Here there is no safe
 * fallback: creating a bundle in whatever directory the user happened to be in
 * is exactly the surprise a knowledge tool cannot afford.
 */
export function requireBundleDir(from = process.cwd()): string {
  const enclosing = enclosingBundle(from);
  if (enclosing) return enclosing;

  const registered = registeredBundle();
  if (!registered) {
    throw new Error(
      'no bundle here and none registered; run `okfctl init --register` in your knowledge base',
    );
  }
  if (!isBundleRoot(registered)) {
    throw new Error(
      `registered bundle ${registered} is missing or is no longer a bundle; ` +
      're-register with `okfctl init --register`',
    );
  }
  return registered;
}

// --- hook session state -----------------------------------------------------

export interface SessionState {
  /** Completed turns seen in this session. */
  turns: number;
  /** Turns already answered with a block. */
  blocks: number;
  /** Epoch milliseconds of each block, for the circuit breaker window. */
  blockTimes: number[];
  /** Set by UserPromptSubmit, cleared by a block: genuine user input pending. */
  armed: boolean;
  /** Set once the breaker has tripped; no further blocks in this session. */
  tripped?: boolean;
  updated: number;
}

const EMPTY: SessionState = { turns: 0, blocks: 0, blockTimes: [], armed: false, updated: 0 };

function sessionFile(sessionId: string): string {
  return join(stateDir(), 'sessions', `${sessionId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

export function readSession(sessionId: string): SessionState {
  const file = sessionFile(sessionId);
  if (!existsSync(file)) return { ...EMPTY, blockTimes: [] };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<SessionState>;
    return {
      turns: typeof parsed.turns === 'number' ? parsed.turns : 0,
      blocks: typeof parsed.blocks === 'number' ? parsed.blocks : 0,
      blockTimes: Array.isArray(parsed.blockTimes) ? parsed.blockTimes.filter((n) => typeof n === 'number') : [],
      armed: parsed.armed === true,
      tripped: parsed.tripped === true,
      updated: typeof parsed.updated === 'number' ? parsed.updated : 0,
    };
  } catch {
    // Unreadable state must not trap the user in a conversation: fail open.
    return { ...EMPTY, blockTimes: [] };
  }
}

export function writeSession(sessionId: string, state: SessionState): void {
  const file = sessionFile(sessionId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...state, updated: Date.now() })}\n`);
}

/** Drop session files untouched for a day, so the state directory cannot grow forever. */
export function pruneSessions(maxAgeMs = 24 * 60 * 60 * 1000, now = Date.now()): void {
  const dir = join(stateDir(), 'sessions');
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    try {
      if (now - statSync(file).mtimeMs > maxAgeMs) rmSync(file, { force: true });
    } catch {
      // Pruning is housekeeping; it may never be the reason a hook fails.
    }
  }
}
