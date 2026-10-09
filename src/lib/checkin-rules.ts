/**
 * Pure check-in rules shared by the server functions and the UI.
 *
 * Kept free of Supabase imports so both sides — and the unit tests — can use
 * the exact same window and eligibility logic.
 */

export type CheckInMethod = "scan" | "manual" | "self";

export type CheckInWindowInput = {
  /** ISO timestamp when the director opened check-in, when set. */
  checkInOpens?: string | null;
  /** ISO date (or timestamp) the event starts. */
  startDate: string;
  /** ISO date (or timestamp) the event ends. Defaults to the start date. */
  endDate?: string | null;
  /** Current time, injected so tests are deterministic. */
  now: Date;
};

export type CheckInWindow = {
  opensAt: Date;
  closesAt: Date;
  isOpen: boolean;
  /** Player-facing reason when the window is not open. */
  reason: string | null;
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Hours before the first tee that check-in opens when no explicit time is set. */
export const DEFAULT_CHECKIN_LEAD_HOURS = 4;

function atStartOfDay(value: string): Date {
  // Date-only strings ("2026-08-31") parse as UTC midnight, which is what we
  // want as a stable anchor for a multi-day event.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
}

export function resolveCheckInWindow(input: CheckInWindowInput): CheckInWindow {
  const start = atStartOfDay(input.startDate);
  const end = atStartOfDay(input.endDate ?? input.startDate);
  const opensAt = input.checkInOpens
    ? new Date(input.checkInOpens)
    : new Date(start.getTime() - DEFAULT_CHECKIN_LEAD_HOURS * HOUR);
  // Stay open through the final day so a late arrival can still be signed in.
  const closesAt = new Date(end.getTime() + DAY);
  const now = input.now;

  if (now < opensAt) {
    return { opensAt, closesAt, isOpen: false, reason: "Check-in hasn't opened yet." };
  }
  if (now > closesAt) {
    return { opensAt, closesAt, isOpen: false, reason: "Check-in for this event has closed." };
  }
  return { opensAt, closesAt, isOpen: true, reason: null };
}

export type RegistrationLike = {
  status: string;
  checkedInAt?: string | null;
};

export type CheckInVerdict =
  | { outcome: "checked_in" }
  | { outcome: "already"; message: string }
  | { outcome: "blocked"; message: string };

/**
 * Decides what a scan should do for an existing registration. Idempotent by
 * design: a second scan reports "already checked in" instead of writing again.
 */
export function evaluateRegistrationCheckIn(
  reg: RegistrationLike,
  options: { windowOpen: boolean; override: boolean },
): CheckInVerdict {
  if (reg.status === "withdrawn") {
    return { outcome: "blocked", message: "This player withdrew from the event." };
  }
  if (reg.status === "checked_in") {
    return { outcome: "already", message: "Already checked in." };
  }
  if (!options.windowOpen && !options.override) {
    return { outcome: "blocked", message: "Check-in isn't open for this event yet." };
  }
  return { outcome: "checked_in" };
}

/** Normalizes typed player codes: trims, uppercases, strips spaces and dashes. */
export function normalizePlayerCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

/**
 * A scanned QR payload is either the raw token or a `dgd:player:<token>` URI.
 * Player codes are 8 characters from a Crockford-style alphabet.
 */
export function parseScanPayload(raw: string): string {
  const value = raw.trim();
  const uri = /^dgd:player:(.+)$/i.exec(value);
  if (uri?.[1]) return uri[1].trim();
  try {
    const url = new URL(value);
    const token = url.searchParams.get("pass");
    if (token) return token.trim();
  } catch {
    /* not a URL — fall through */
  }
  return value;
}

export function playerPassPayload(token: string): string {
  return `dgd:player:${token}`;
}
