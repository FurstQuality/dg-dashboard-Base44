/**
 * Kiosk mode helpers — pure, browser-safe logic for the tournament-central
 * tablet experience. No server access here.
 */

export type KioskTargetKind = "tournament" | "league_event";

export type KioskOptions = {
  /** Use the tablet camera to read player passes. */
  cameraScanning: boolean;
  /** Let players who aren't on the roster check in as walk-ups. */
  allowWalkUps: boolean;
  /** Let players without a DG Dashboard account fill out the form. */
  allowGuests: boolean;
  /** Mark the entry fee paid when a player confirms they paid on site. */
  allowPaymentCapture: boolean;
};

export type KioskSession = {
  target: { kind: KioskTargetKind; id: string };
  eventName: string;
  pinHash: string;
  pinSalt: string;
  options: KioskOptions;
  startedAt: string;
};

export const KIOSK_STORAGE_KEY = "dgd:kiosk-session";

export const DEFAULT_KIOSK_OPTIONS: KioskOptions = {
  cameraScanning: true,
  allowWalkUps: true,
  allowGuests: true,
  allowPaymentCapture: true,
};

/** Seconds of inactivity before the kiosk returns to its idle screen. */
export const KIOSK_IDLE_RESET_MS = 25_000;
/** How long a confirmation card stays on screen. */
export const KIOSK_CONFIRM_MS = 6_000;
/** Long-press duration required to reveal the exit dialog. */
export const KIOSK_EXIT_HOLD_MS = 3_000;

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash at the table" },
  { value: "card", label: "Card / tap at the table" },
  { value: "online", label: "Already paid online" },
  { value: "owed", label: "I'll settle up later" },
] as const;

export type KioskPaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export function isPaidMethod(method: KioskPaymentMethod): boolean {
  return method === "cash" || method === "card" || method === "online";
}

/** A 4-digit PIN, digits only. */
export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin.trim());
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function createPinSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

/** Salted SHA-256 digest — the raw PIN is never stored. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`dgd-kiosk:${salt}:${pin.trim()}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  return (await hashPin(pin, salt)) === hash;
}

/** Trims and upper-cases a typed player code without touching emails. */
export function normalizeLookupTerm(term: string): string {
  const trimmed = term.trim();
  if (trimmed.includes("@")) return trimmed.toLowerCase();
  return trimmed.replace(/\s+/g, " ");
}

export function loadKioskSession(): KioskSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KIOSK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KioskSession;
    if (!parsed?.target?.id || !parsed?.pinHash || !parsed?.pinSalt) return null;
    return { ...parsed, options: { ...DEFAULT_KIOSK_OPTIONS, ...parsed.options } };
  } catch {
    return null;
  }
}

export function saveKioskSession(session: KioskSession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KIOSK_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* storage unavailable — kiosk still runs for this page view */
  }
}

export function clearKioskSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KIOSK_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
