import type { Concept } from './concept.ts';

/** SPEC §5.4. Absent `status` means `stable`. */
export type Status = 'draft' | 'stable' | 'deprecated';
export const STATUSES: Status[] = ['draft', 'stable', 'deprecated'];

/** SPEC §5.3, lowest to highest. */
export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';

export interface Event {
  by: string;
  at: string | null;
}

export function conceptStatus(data: Record<string, unknown>): Status {
  const raw = data.status;
  if (typeof raw === 'string' && (STATUSES as string[]).includes(raw)) {
    return raw as Status;
  }
  return 'stable';
}

/** True for the `human:<id>` actor form (SPEC §7). */
export function isHumanActor(actor: string): boolean {
  return actor.startsWith('human:');
}

/**
 * Read `verified` as a list of events. A bare mapping is treated as a
 * one-element list, which SPEC §5.2 requires of consumers.
 */
export function verifiedEvents(data: Record<string, unknown>): Event[] {
  const raw = data.verified;
  if (!raw) return [];
  const entries = Array.isArray(raw) ? raw : [raw];
  const events: Event[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.by !== 'string') continue;
    events.push({ by: record.by, at: asDateString(record.at) });
  }
  return events;
}

export function trustTier(data: Record<string, unknown>): TrustTier {
  const events = verifiedEvents(data);
  if (data.verified === undefined || events.length === 0) return 'unverified';
  return events.some((event) => isHumanActor(event.by))
    ? 'human-reviewed'
    : 'machine-confirmed';
}

/** The most recent `verified[].at`, or null when none carries a usable date. */
export function lastVerifiedAt(data: Record<string, unknown>): Date | null {
  const times = verifiedEvents(data)
    .map((event) => toDate(event.at))
    .filter((date): date is Date => date !== null);
  if (times.length === 0) return null;
  return new Date(Math.max(...times.map((date) => date.getTime())));
}

export function generatedAt(data: Record<string, unknown>): Date | null {
  const generated = data.generated;
  if (generated && typeof generated === 'object') {
    const at = toDate(asDateString((generated as Record<string, unknown>).at));
    if (at) return at;
  }
  // SPEC §13.1: fall back to the v0.1 `timestamp` field.
  return toDate(asDateString(data.timestamp));
}

/** SPEC §5.5. Stale when `today >= stale_after`. */
export function isStale(data: Record<string, unknown>, today = new Date()): boolean {
  const cutoff = toDate(asDateString(data.stale_after));
  if (!cutoff) return false;
  return startOfDay(today) >= startOfDay(cutoff);
}

/**
 * Drifted: the content changed after the last verification, so the trust tier
 * is nominally intact but no longer earned. Not a spec term — SPEC §5.2 notes
 * that `verified` and `generated.at` move independently, and this is the case
 * that combination is warning about.
 */
export function isDrifted(data: Record<string, unknown>): boolean {
  const verified = lastVerifiedAt(data);
  const generated = generatedAt(data);
  if (!verified || !generated) return false;
  return verified.getTime() < generated.getTime();
}

export interface Health {
  status: Status;
  tier: TrustTier;
  stale: boolean;
  drifted: boolean;
  staleAfter: string | null;
}

export function health(concept: Concept, today = new Date()): Health {
  return {
    status: conceptStatus(concept.data),
    tier: trustTier(concept.data),
    stale: isStale(concept.data, today),
    drifted: isDrifted(concept.data),
    staleAfter: asDateString(concept.data.stale_after),
  };
}

/** YAML may hand back a Date for unquoted dates; normalize to a string. */
export function asDateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value.trim();
  return null;
}

export function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** `YYYY-MM-DD` in UTC, the form SPEC §5.5 and §9 both use. */
export function isoDay(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Parse a duration like `90d`, `12w`, `6m`, `1y` into a future ISO day. */
export function resolveStaleIn(spec: string, from = new Date()): string {
  const match = /^(\d+)\s*([dwmy])$/i.exec(spec.trim());
  if (!match) {
    throw new Error(`invalid duration "${spec}" (expected e.g. 90d, 12w, 6m, 1y)`);
  }
  const amount = Number(match[1]);
  const date = new Date(from.getTime());
  switch (match[2].toLowerCase()) {
    case 'd': date.setUTCDate(date.getUTCDate() + amount); break;
    case 'w': date.setUTCDate(date.getUTCDate() + amount * 7); break;
    case 'm': date.setUTCMonth(date.getUTCMonth() + amount); break;
    case 'y': date.setUTCFullYear(date.getUTCFullYear() + amount); break;
  }
  return isoDay(date);
}
