/**
 * League night schedule: the running order of one league night — check-in,
 * players meeting, tee times, break, scoring, payouts. Stored as a JSONB array
 * on `leagues.agenda`. Times are local 24h clock times (HH:MM); the same
 * template is reused every week, so items carry no date.
 */

export type NightItemKind =
  | "check_in"
  | "players_meeting"
  | "round"
  | "break"
  | "lunch"
  | "scoring"
  | "payouts"
  | "awards"
  | "social"
  | "other";

export interface NightItem {
  /** Stable id for React keys and editing. */
  id: string;
  /** Local 24h start time (HH:MM). */
  time: string;
  /** Minutes from start until end. */
  duration_min: number;
  kind: NightItemKind;
  label: string;
  notes?: string;
}

export const NIGHT_KIND_LABEL: Record<NightItemKind, string> = {
  check_in: "Check-in",
  players_meeting: "Players meeting",
  round: "Round",
  break: "Break",
  lunch: "Lunch",
  scoring: "Scoring & cards in",
  payouts: "Payouts",
  awards: "Awards & CTP",
  social: "Social",
  other: "Other",
};

export const NIGHT_KIND_ORDER: NightItemKind[] = [
  "check_in",
  "players_meeting",
  "round",
  "break",
  "lunch",
  "scoring",
  "payouts",
  "awards",
  "social",
  "other",
];

function rid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function addMinutes(time: string, min: number): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = (h * 60 + m + min + 24 * 60 * 7) % (24 * 60);
  return `${Math.floor(total / 60)
    .toString()
    .padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Rough play time: ~9 minutes a hole per card, minimum 45 minutes. */
export function roundMinutesForHoles(holes: number): number {
  return Math.max(45, Math.round((holes * 9) / 5) * 5);
}

/**
 * Default running order for a league night:
 *   check-in (30m) → players meeting (10m) → Round 1 → [break (15m) → Round 2]
 *   → cards in & scoring (15m) → payouts, CTP & ace pot (20m).
 */
export function buildDefaultNightAgenda(opts: {
  startTime?: string | null;
  holes?: number | null;
  rounds?: number;
}): NightItem[] {
  const teeTime = opts.startTime?.slice(0, 5) || "17:30";
  const holes = Math.max(1, opts.holes ?? 18);
  const rounds = Math.max(1, Math.min(4, opts.rounds ?? 1));
  const roundLen = roundMinutesForHoles(holes);
  const items: NightItem[] = [
    {
      id: rid(),
      time: addMinutes(teeTime, -40),
      duration_min: 30,
      kind: "check_in",
      label: "Check-in, dues & warm-up",
    },
    {
      id: rid(),
      time: addMinutes(teeTime, -10),
      duration_min: 10,
      kind: "players_meeting",
      label: "Players meeting",
      notes: "Layout, pin positions, CTP hole, pace of play.",
    },
  ];
  let cursor = teeTime;
  for (let r = 1; r <= rounds; r++) {
    items.push({
      id: rid(),
      time: cursor,
      duration_min: roundLen,
      kind: "round",
      label: rounds === 1 ? `Tee off — ${holes} holes` : `Round ${r} tee time — ${holes} holes`,
    });
    cursor = addMinutes(cursor, roundLen);
    if (r < rounds) {
      items.push({
        id: rid(),
        time: cursor,
        duration_min: 15,
        kind: "break",
        label: "Break between rounds",
      });
      cursor = addMinutes(cursor, 15);
    }
  }
  items.push({
    id: rid(),
    time: cursor,
    duration_min: 15,
    kind: "scoring",
    label: "Cards in & scores posted",
  });
  cursor = addMinutes(cursor, 15);
  items.push({
    id: rid(),
    time: cursor,
    duration_min: 20,
    kind: "awards",
    label: "Payouts, CTP & ace pot",
  });
  return items;
}

export function newNightItem(afterTime?: string): NightItem {
  return {
    id: rid(),
    time: afterTime ? addMinutes(afterTime, 30) : "18:00",
    duration_min: 30,
    kind: "other",
    label: "",
  };
}

/** Parse an agenda blob out of a database row, dropping malformed rows. */
export function parseNightAgenda(raw: unknown): NightItem[] {
  if (!Array.isArray(raw)) return [];
  const out: NightItem[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const row = x as Record<string, unknown>;
    if (typeof row.time !== "string") continue;
    const kind = (
      NIGHT_KIND_ORDER as string[]
    ).includes(String(row.kind))
      ? (row.kind as NightItemKind)
      : "other";
    out.push({
      id: typeof row.id === "string" ? row.id : rid(),
      time: row.time.slice(0, 5),
      duration_min: Number(row.duration_min) > 0 ? Number(row.duration_min) : 30,
      kind,
      label: typeof row.label === "string" ? row.label : "",
      notes: typeof row.notes === "string" && row.notes ? row.notes : undefined,
    });
  }
  return sortNightAgenda(out);
}

export function sortNightAgenda(items: NightItem[]): NightItem[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time));
}

/** Total on-site window in minutes, first start to last end. */
export function nightWindowMinutes(items: NightItem[]): number {
  if (!items.length) return 0;
  const sorted = sortNightAgenda(items);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const mins = (t: string) => {
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return h * 60 + m;
  };
  return Math.max(0, mins(last.time) + last.duration_min - mins(first.time));
}
