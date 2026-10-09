/**
 * "What is this player doing right now?" — the top of a player profile.
 *
 * Live PDGA scores are keyed by PDGA number, but plenty of members never link
 * theirs. When the profile has no number we fall back to a single exact
 * name match in the PDGA player table and label it as unconfirmed, so the
 * profile can still show tonight's event without inventing anything.
 */
import { normalizeAlias } from "@/lib/player-aliases";

export type PlayerLiveRound = {
  roundNumber: number;
  thru: number;
  holeCount: number | null;
  roundToPar: number | null;
  total: number | null;
  toPar: number | null;
  place: number | null;
  teeTime: string | null;
  cardNumber: string | null;
  completed: boolean;
  roundStarted: boolean;
  lastSyncedAt: string | null;
};

export type PlayerLiveEvent = {
  eventRef: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tier: string | null;
  division: string | null;
  pdgaUrl: string;
  /** Round in progress right now, if the field has teed off. */
  current: PlayerLiveRound | null;
  /** Rounds already finished at this event, newest first. */
  finished: PlayerLiveRound[];
};

export type PlayerNextEvent = {
  eventRef: string;
  name: string;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  division: string | null;
  pdgaUrl: string;
};

export type PlayerNowNext = {
  pdgaNumber: string | null;
  /** How we tied the profile to PDGA results. */
  pdgaMatch: "linked" | "name" | null;
  live: PlayerLiveEvent | null;
  next: PlayerNextEvent | null;
};

type Admin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

const EMPTY: PlayerNowNext = { pdgaNumber: null, pdgaMatch: null, live: null, next: null };

function pdgaValues(num: string): string[] {
  const digits = num.replace(/\D/g, "");
  return Array.from(new Set([num, digits, `#${digits}`])).filter(Boolean);
}

/** Unique exact-name match only — anything ambiguous stays unmatched. */
async function resolveByName(admin: Admin, displayName: string): Promise<string | null> {
  const key = normalizeAlias(displayName);
  if (!key || key.split(" ").length < 2) return null;
  const { data } = await admin
    .from("pdga_players")
    .select("pdga_number, name")
    .ilike("name", displayName.trim())
    .limit(3);
  const exact = (data ?? []).filter((r) => normalizeAlias(r.name ?? "") === key);
  if (exact.length !== 1) return null;
  return String(exact[0].pdga_number);
}

export async function loadPlayerNowNext(
  admin: Admin,
  profile: { pdga_number: string | null; display_name: string | null },
  options: { today?: string } = {},
): Promise<PlayerNowNext> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);

  let pdgaNumber = profile.pdga_number ? String(profile.pdga_number) : null;
  let pdgaMatch: PlayerNowNext["pdgaMatch"] = pdgaNumber ? "linked" : null;
  if (!pdgaNumber && profile.display_name) {
    pdgaNumber = await resolveByName(admin, profile.display_name);
    if (pdgaNumber) pdgaMatch = "name";
  }
  if (!pdgaNumber) return EMPTY;

  const values = pdgaValues(pdgaNumber);

  const [{ data: scoreRows }, { data: fieldRows }] = await Promise.all([
    admin
      .from("live_event_scores")
      .select(
        "event_ref, division, round_number, place, running_place, round_to_par, total, to_par, thru, tee_time, card_number, completed, round_started, hole_pars, hole_scores, last_synced_at",
      )
      .in("pdga_number", values)
      .order("last_synced_at", { ascending: false })
      .limit(60),
    admin
      .from("pdga_event_field")
      .select("event_ref, division")
      .in("pdga_number", values)
      .limit(120),
  ]);

  const refs = new Set<string>();
  for (const r of scoreRows ?? []) refs.add(String(r.event_ref));
  for (const r of fieldRows ?? []) refs.add(String(r.event_ref));
  if (!refs.size) return { pdgaNumber, pdgaMatch, live: null, next: null };

  const { data: eventRows } = await admin
    .from("pdga_tour_events")
    .select("pdga_event_id, name, location, city, state, country, start_date, end_date, tier, url")
    .in("pdga_event_id", [...refs])
    .limit(400);

  const events = new Map(
    (eventRows ?? []).map((e) => [
      String(e.pdga_event_id),
      {
        ref: String(e.pdga_event_id),
        name: e.name ?? `PDGA event ${e.pdga_event_id}`,
        location:
          e.location ?? [e.city, e.state, e.country].filter(Boolean).join(", ") ?? null,
        startDate: e.start_date ? String(e.start_date).slice(0, 10) : null,
        endDate: e.end_date ? String(e.end_date).slice(0, 10) : null,
        tier: e.tier ?? null,
        url: e.url ?? `https://www.pdga.com/tour/event/${e.pdga_event_id}`,
      },
    ]),
  );

  const divisionByRef = new Map<string, string | null>();
  for (const r of fieldRows ?? []) {
    if (r.division) divisionByRef.set(String(r.event_ref), r.division);
  }

  const toRound = (r: {
    round_number: number | null;
    thru: number | null;
    hole_pars: unknown;
    hole_scores: unknown;
    round_to_par: number | null;
    total: number | null;
    to_par: number | null;
    place: number | null;
    running_place: number | null;
    tee_time: string | null;
    card_number: string | null;
    completed: boolean | null;
    round_started: boolean | null;
    last_synced_at: string | null;
  }): PlayerLiveRound => ({
    roundNumber: r.round_number ?? 1,
    thru: r.thru ?? 0,
    holeCount: Array.isArray(r.hole_pars)
      ? r.hole_pars.length
      : Array.isArray(r.hole_scores)
        ? r.hole_scores.length
        : null,
    roundToPar: r.round_to_par,
    total: r.total,
    toPar: r.to_par,
    place: r.place ?? r.running_place ?? null,
    teeTime: r.tee_time,
    cardNumber: r.card_number,
    completed: !!r.completed,
    roundStarted: !!r.round_started,
    lastSyncedAt: r.last_synced_at,
  });

  // ---- Playing now ---------------------------------------------------------
  // A multi-week league session spans today too, so a window match alone is not
  // enough. Rank candidates: a round still in progress wins, then the freshest
  // sync, then the tightest date window.
  const dayMs = 86_400_000;
  const candidates = [...refs]
    .map((ref) => {
      const e = events.get(ref);
      if (!e?.startDate) return null;
      const end = e.endDate ?? e.startDate;
      if (!(e.startDate <= today && today <= end)) return null;
      const rows = (scoreRows ?? []).filter((r) => String(r.event_ref) === ref);
      const active = rows.some((r) => r.round_started && !r.completed);
      const syncedToday = rows.some(
        (r) => typeof r.last_synced_at === "string" && r.last_synced_at.slice(0, 10) === today,
      );
      const freshest = rows.reduce(
        (max, r) => (typeof r.last_synced_at === "string" && r.last_synced_at > max ? r.last_synced_at : max),
        "",
      );
      const span = Math.max(
        1,
        Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${e.startDate}T00:00:00Z`)) / dayMs) + 1,
      );
      // A long season only counts as "playing now" when it synced today.
      if (span > 8 && !syncedToday && !active) return null;
      // A round still to play means the event is not behind them yet.
      const pending = rows.some((r) => !r.completed);
      return { ref, active, pending, freshest, span };
    })
    .filter((c): c is NonNullable<typeof c> => !!c)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        Number(b.pending) - Number(a.pending) ||
        a.span - b.span ||
        b.freshest.localeCompare(a.freshest),
    );
  const liveRef = candidates[0]?.ref;

  let live: PlayerLiveEvent | null = null;
  if (liveRef) {
    const e = events.get(liveRef)!;
    const rounds = (scoreRows ?? [])
      .filter((r) => String(r.event_ref) === liveRef)
      .map(toRound)
      .sort((a, b) => b.roundNumber - a.roundNumber);
    const current = rounds.find((r) => !r.completed) ?? null;
    live = {
      eventRef: e.ref,
      name: e.name,
      location: e.location,
      startDate: e.startDate,
      endDate: e.endDate,
      tier: e.tier,
      division:
        (scoreRows ?? []).find((r) => String(r.event_ref) === liveRef)?.division ??
        divisionByRef.get(liveRef) ??
        null,
      pdgaUrl: e.url,
      current,
      finished: rounds.filter((r) => r.completed),
    };
  }

  // ---- Next up: soonest event starting after today -------------------------
  const upcoming = [...refs]
    .map((ref) => events.get(ref))
    .filter((e): e is NonNullable<typeof e> => !!e?.startDate && e.startDate > today)
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  const nextEvent = upcoming[0];

  return {
    pdgaNumber,
    pdgaMatch,
    live,
    next: nextEvent
      ? {
          eventRef: nextEvent.ref,
          name: nextEvent.name,
          location: nextEvent.location,
          startDate: nextEvent.startDate,
          endDate: nextEvent.endDate,
          division: divisionByRef.get(nextEvent.ref) ?? null,
          pdgaUrl: nextEvent.url,
        }
      : null,
  };
}
