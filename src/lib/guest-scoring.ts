/**
 * Guest scoring — shared types and browser-side session helpers.
 *
 * A guest scorekeeper never signs in. They hold a session token in
 * localStorage, keyed by join code, and every server call carries it.
 */

export type JoinTargetKind = "tournament_round" | "league_event" | "round";

export type GuestHole = {
  number: number;
  par: number;
  distance_ft: number | null;
  nickname: string | null;
  notes: string | null;
  caddy_notes: string | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
};

export type GuestCardSummary = {
  round_id: string;
  players: { id: string; name: string }[];
  scorekeepers: number;
};

export type JoinCodeInfo = {
  code: string;
  target_kind: JoinTargetKind;
  event_name: string;
  round_label: string | null;
  course_name: string | null;
  layout_name: string | null;
  hole_count: number;
  par_total: number | null;
  requires_pin: boolean;
  allow_guest_cards: boolean;
  allow_caddy: boolean;
  divisions: string[];
  cards: GuestCardSummary[];
  status: "open" | "closed" | "expired" | "full";
};

export type GuestSessionPlayer = { id: string; name: string; is_me: boolean };

export type GuestSession = {
  token: string;
  code: string;
  scorer_id: string;
  round_id: string;
  display_name: string;
  players: GuestSessionPlayer[];
  holes: GuestHole[];
  event_name: string;
  course_name: string | null;
  layout_name: string | null;
  allow_caddy: boolean;
  ai_remaining: number;
};

export type GuestScoreEntry = {
  round_player_id: string;
  hole_number: number;
  strokes: number | null;
  penalties?: number;
};

export type GuestCardState = {
  entries: GuestScoreEntry[];
  scorekeeper_count: number;
  scores_verified: boolean;
  conflicts: { round_player_id: string; hole_number: number }[];
};

const TOKEN_PREFIX = "dgd:guest-token:";
const PENDING_PREFIX = "dgd:guest-pending:";

export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/** Codes avoid look-alike characters so they read cleanly on a tee sign. */
const CODE_ALPHABET = "ACDEFGHJKLMNPQRTUVWXY34679";

export function generateCode(length = 6): string {
  // Cryptographic randomness with rejection sampling, so codes can't be predicted.
  const n = CODE_ALPHABET.length;
  const limit = 256 - (256 % n);
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0]! < limit) out += CODE_ALPHABET[buf[0]! % n];
  }
  return out;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

export function saveGuestToken(code: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_PREFIX + normalizeCode(code), token);
  } catch {
    /* private browsing */
  }
}

export function loadGuestToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_PREFIX + normalizeCode(code));
  } catch {
    return null;
  }
}

export function clearGuestToken(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_PREFIX + normalizeCode(code));
  } catch {
    /* ignore */
  }
}

/** Offline queue: unsent hole entries survive a refresh or lost signal. */
export function savePendingEntries(code: string, entries: GuestScoreEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PENDING_PREFIX + normalizeCode(code),
      JSON.stringify(entries),
    );
  } catch {
    /* ignore */
  }
}

export function loadPendingEntries(code: string): GuestScoreEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_PREFIX + normalizeCode(code));
    return raw ? (JSON.parse(raw) as GuestScoreEntry[]) : [];
  } catch {
    return [];
  }
}

export function clearPendingEntries(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_PREFIX + normalizeCode(code));
  } catch {
    /* ignore */
  }
}

export function scoreLabel(strokes: number, par: number): string {
  const diff = strokes - par;
  if (strokes === 1) return "Ace";
  if (diff <= -3) return "Albatross";
  if (diff === -2) return "Eagle";
  if (diff === -1) return "Birdie";
  if (diff === 0) return "Par";
  if (diff === 1) return "Bogey";
  if (diff === 2) return "Double bogey";
  return `+${diff}`;
}

export function toParText(toPar: number): string {
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : String(toPar);
}
