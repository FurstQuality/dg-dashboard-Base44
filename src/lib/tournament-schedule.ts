/**
 * Tournament agenda: day-by-day schedule of what happens at what time
 * (check-in, rounds, lunch, awards). Stored as a JSONB array on
 * `tournaments.agenda`. Kept small and human-readable so TDs can hand-edit
 * without an admin panel and so we can render calendar blocks off of it.
 */

export type AgendaKind =
  | "check_in"
  | "players_meeting"
  | "round"
  | "lunch"
  | "break"
  | "awards"
  | "social"
  | "other";

export interface AgendaItem {
  /** Stable id for React keys / editing. */
  id: string;
  /** ISO date (YYYY-MM-DD) the item happens on. */
  date: string;
  /** Local 24h start time (HH:MM). */
  time: string;
  /** Minutes from start until end. */
  duration_min: number;
  kind: AgendaKind;
  label: string;
  /** Optional round number when kind === "round". */
  round_number?: number;
  notes?: string;
}

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  check_in: "Check-in",
  players_meeting: "Players meeting",
  round: "Round",
  lunch: "Lunch",
  break: "Break",
  awards: "Awards ceremony",
  social: "Social",
  other: "Other",
};

function rid() {
  return Math.random().toString(36).slice(2, 10);
}

function addMinutes(time: string, min: number): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  const total = (h * 60 + m + min + 24 * 60) % (24 * 60);
  const hh = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Build the default schedule for a standard 2-round one-day tournament:
 *   check-in (30m) → players meeting (15m) → Round 1 (~3h) →
 *   lunch (60m) → Round 2 (~3h) → awards (30m).
 *
 * Round start defaults to 9:00 AM if not provided.
 */
export function buildDefaultAgenda(opts: {
  date: string;
  firstRoundTime?: string | null;
  rounds?: number;
  roundDurationMin?: number;
  lunchMin?: number;
  awardsMin?: number;
  checkInMin?: number;
  playersMeetingMin?: number;
}): AgendaItem[] {
  const roundStart = opts.firstRoundTime || "09:00";
  const rounds = Math.max(1, opts.rounds ?? 2);
  const roundLen = opts.roundDurationMin ?? 180;
  const lunch = opts.lunchMin ?? 60;
  const awards = opts.awardsMin ?? 30;
  const checkIn = opts.checkInMin ?? 30;
  const pm = opts.playersMeetingMin ?? 15;

  const items: AgendaItem[] = [];
  // Check-in starts checkIn+pm minutes before Round 1
  const checkInStart = addMinutes(roundStart, -(checkIn + pm));
  const meetingStart = addMinutes(roundStart, -pm);

  items.push({
    id: rid(),
    date: opts.date,
    time: checkInStart,
    duration_min: checkIn,
    kind: "check_in",
    label: "Check-in & warm-up",
  });
  items.push({
    id: rid(),
    date: opts.date,
    time: meetingStart,
    duration_min: pm,
    kind: "players_meeting",
    label: "Players meeting",
  });

  let cursor = roundStart;
  for (let r = 1; r <= rounds; r++) {
    items.push({
      id: rid(),
      date: opts.date,
      time: cursor,
      duration_min: roundLen,
      kind: "round",
      label: `Round ${r}`,
      round_number: r,
    });
    cursor = addMinutes(cursor, roundLen);
    if (r < rounds) {
      items.push({
        id: rid(),
        date: opts.date,
        time: cursor,
        duration_min: lunch,
        kind: "lunch",
        label: "Lunch break",
      });
      cursor = addMinutes(cursor, lunch);
    }
  }

  items.push({
    id: rid(),
    date: opts.date,
    time: cursor,
    duration_min: awards,
    kind: "awards",
    label: "Awards ceremony",
  });

  return items;
}

/** Parse an agenda blob out of a Supabase row, returning [] on any bad shape. */
export function parseAgenda(raw: unknown): AgendaItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is AgendaItem =>
        !!x &&
        typeof x === "object" &&
        typeof (x as any).date === "string" &&
        typeof (x as any).time === "string" &&
        typeof (x as any).kind === "string" &&
        typeof (x as any).label === "string",
    )
    .map((x) => ({
      id: (x as any).id ?? rid(),
      date: x.date,
      time: x.time,
      duration_min: Number((x as any).duration_min ?? 60),
      kind: x.kind as AgendaKind,
      label: x.label,
      round_number: (x as any).round_number ?? undefined,
      notes: (x as any).notes ?? undefined,
    }));
}

/** Group agenda items by date and sort by time within each day. */
export function groupAgendaByDate(items: AgendaItem[]): { date: string; items: AgendaItem[] }[] {
  const map = new Map<string, AgendaItem[]>();
  for (const it of items) {
    const arr = map.get(it.date) ?? [];
    arr.push(it);
    map.set(it.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      items: [...list].sort((a, b) => a.time.localeCompare(b.time)),
    }));
}

/** Total on-site window per date, in minutes (min time to end of last item). */
export function dayWindowMinutes(items: AgendaItem[]): number {
  if (!items.length) return 0;
  const sorted = [...items].sort((a, b) => a.time.localeCompare(b.time));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const [fh, fm] = first.time.split(":").map((x) => parseInt(x, 10));
  const [lh, lm] = last.time.split(":").map((x) => parseInt(x, 10));
  const startMin = fh * 60 + fm;
  const endMin = lh * 60 + lm + last.duration_min;
  return Math.max(0, endMin - startMin);
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function newAgendaItem(date: string): AgendaItem {
  return { id: rid(), date, time: "12:00", duration_min: 60, kind: "other", label: "" };
}
