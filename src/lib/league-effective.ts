/**
 * One resolver for a league night's effective settings.
 * effective = night override (when set) → league default → system default.
 * Course and layout never inherit: they belong to the night (NULL = Course TBD).
 */
export type Source = "event" | "series" | "system";
export type Resolved<T> = { value: T; source: Source };

export type LeagueDefaults = {
  entry_fee_cents: number | null;
  start_time: string | null;
  holes_played: number | null;
};

export type NightRow = {
  entry_fee_cents: number | null;
  start_time: string | null;
  holes_played: number | null;
  course_id: string | null;
  layout_id: string | null;
  status?: string | null;
  format?: string | null;
  payout_notes?: string | null;
};

function pick<T>(night: T | null, series: T | null, system: T): Resolved<T> {
  if (night != null) return { value: night, source: "event" };
  if (series != null) return { value: series, source: "series" };
  return { value: system, source: "system" };
}

export function resolveNight(league: LeagueDefaults, night: NightRow) {
  return {
    entryFeeCents: pick(night.entry_fee_cents, league.entry_fee_cents, 0),
    startTime: pick(night.start_time?.slice(0, 5) ?? null, league.start_time?.slice(0, 5) ?? null, ""),
    holes: pick(night.holes_played, league.holes_played, 18),
    courseId: night.course_id,
    layoutId: night.layout_id,
  };
}

export type NightReadiness = "ready" | "needs_course" | "needs_layout" | "done" | "cancelled";

export function nightReadiness(night: NightRow): NightReadiness {
  if (night.status === "cancelled") return "cancelled";
  if (night.status === "completed") return "done";
  if (!night.course_id) return "needs_course";
  if (!night.layout_id) return "needs_layout";
  return "ready";
}

export const READINESS_LABEL: Record<NightReadiness, string> = {
  ready: "Ready",
  needs_course: "Course TBD",
  needs_layout: "Needs layout",
  done: "Complete",
  cancelled: "Cancelled",
};

/** Which nights a league-default change would touch: unstarted nights that still inherit. */
export function previewDefaultChange(
  nights: (NightRow & { id: string })[],
  field: "entry_fee_cents" | "start_time" | "holes_played" | "format" | "payout_notes",
) {
  const open = nights.filter((n) => n.status !== "completed" && n.status !== "cancelled");
  const overridden = open.filter((n) => n[field] != null);
  return {
    future: open.length,
    willUpdate: open.length - overridden.length,
    keepOverride: overridden.map((n) => n.id),
  };
}

/** Distinct courses across nights, for "Multiple courses" vs a derived primary venue. */
export function venueSummary(nights: NightRow[]): { kind: "none" | "single" | "multiple"; courseIds: string[] } {
  const ids = [...new Set(nights.map((n) => n.course_id).filter((x): x is string => !!x))];
  return { kind: ids.length === 0 ? "none" : ids.length === 1 ? "single" : "multiple", courseIds: ids };
}

/** A night's title: its own name when set, otherwise inherited from the league ("Tuesday Singles · Week 3"). */
export function nightTitle(leagueName: string, night: { name: string | null; week_number: number }): Resolved<string> {
  const own = night.name?.trim();
  if (own) return { value: own, source: "event" };
  return { value: `${leagueName} · Week ${night.week_number}`, source: "series" };
}

/** Format and payout note: night override → league default. */
export function resolveNightText(
  league: { format?: string | null; payout_notes?: string | null },
  night: { format?: string | null; payout_notes?: string | null },
) {
  return {
    format: pick(night.format?.trim() || null, league.format ?? null, ""),
    payoutNotes: pick(night.payout_notes?.trim() || null, league.payout_notes ?? null, ""),
  };
}

export const LEAGUE_FORMAT_LABEL: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
  random_draw_doubles: "Random draw doubles",
  handicap: "Handicap",
};
export const formatLabel = (f: string | null | undefined) => (f ? (LEAGUE_FORMAT_LABEL[f] ?? f) : "");
