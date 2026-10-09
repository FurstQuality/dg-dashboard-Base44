/**
 * Series results — turns real scoring data from linked events into the
 * finish-order results a series points race is built from.
 *
 * Tournament stops rank players inside their own division by total strokes
 * (including penalties) across every round of that tournament. League stops
 * rank players by their scoring average across the league nights they played,
 * because a league season resolves to a single series stop.
 *
 * Server-only: takes an already-authorized Supabase client from the caller.
 */

import type { SeriesResultInput } from "@/lib/competition-model";

/** Structural client type so both the authenticated and publishable clients fit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (table: string) => any };

type RegRow = {
  id: string;
  tournament_id: string;
  user_id: string | null;
  division_id: string | null;
  status: string;
};
type IdRow = { id: string; tournament_id?: string; name?: string };
type TourScoreRow = { registration_id: string; round_id: string; hole_number: number; strokes: number | null; penalties: number | null };
type LeagueEventRow = { id: string; league_id: string; status: string };
type LeagueRegRow = { league_id: string; user_id: string | null; status: string };
type LeagueRoundRow = { id: string; league_event_id: string | null };
type RoundPlayerRow = { id: string; round_id: string; user_id: string | null };
type RoundScoreRow = { round_player_id: string; strokes: number | null; penalties: number | null };
type ProfileRow = { id: string; display_name: string | null };

export type SeriesStopStats = {
  id: string;
  kind: "tournament" | "league";
  name: string;
  slug: string;
  date: string | null;
  status: string;
  /** Registered entries on the books for this stop. */
  entries: number;
  /** Players who produced a scored result that earns series points. */
  scored_players: number;
  /** Divisions represented in the scored results (tournament stops only). */
  divisions: number;
  /** Points awarded at this stop under the series points table. */
  points_awarded: number;
};

export type EventRef = {
  id: string;
  name: string;
  slug: string;
  date: string | null;
  status: string;
};

function rank<T>(rows: T[], value: (row: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => value(a) - value(b));
  const out = new Map<T, number>();
  let position = 0;
  let lastValue: number | null = null;
  let lastPosition = 1;
  for (const row of sorted) {
    position += 1;
    const v = value(row);
    if (lastValue !== null && v === lastValue) {
      out.set(row, lastPosition);
    } else {
      out.set(row, position);
      lastPosition = position;
      lastValue = v;
    }
  }
  return out;
}

/**
 * Builds series results plus per-stop reporting numbers for the given stops.
 */
export async function computeSeriesResults(
  supabase: AnyClient,
  tournaments: EventRef[],
  leagues: EventRef[],
): Promise<{ results: SeriesResultInput[]; stops: SeriesStopStats[] }> {
  const results: SeriesResultInput[] = [];
  const stops: SeriesStopStats[] = [];
  const playerNames = new Map<string, string>();
  const playerIds = new Set<string>();

  // ---- Tournament stops -------------------------------------------------
  const tourIds = tournaments.map((t) => t.id);
  if (tourIds.length) {
    const [{ data: regs }, { data: rounds }, { data: divisions }] = await Promise.all([
      supabase
        .from("tournament_registrations")
        .select("id, tournament_id, user_id, division_id, status")
        .in("tournament_id", tourIds),
      supabase.from("tournament_rounds").select("id, tournament_id, layout_id").in("tournament_id", tourIds),
      supabase.from("tournament_divisions").select("id, name").in("tournament_id", tourIds),
    ]);

    const roundToTournament = new Map<string, string>();
    for (const r of (rounds ?? []) as IdRow[]) roundToTournament.set(r.id, r.tournament_id ?? "");
    const divisionName = new Map<string, string>();
    for (const d of (divisions ?? []) as IdRow[]) divisionName.set(d.id, d.name ?? "Division");

    const regRows = ((regs ?? []) as RegRow[]).filter((r) => r.status !== "withdrawn");

    const totals = new Map<string, number>();
    // Par of the holes each entry actually played; null once any hole lacks a known par.
    const parTotals = new Map<string, number | null>();
    if (regRows.length) {
      const roundIds = [...roundToTournament.keys()];
      if (roundIds.length) {
        const layoutByRound = new Map<string, string>();
        for (const r of (rounds ?? []) as { id: string; layout_id: string | null }[])
          if (r.layout_id) layoutByRound.set(r.id, r.layout_id);
        const layoutIds = [...new Set(layoutByRound.values())];
        const [{ data: scores }, { data: holes }] = await Promise.all([
          supabase
            .from("tournament_scores")
            .select("registration_id, round_id, hole_number, strokes, penalties")
            .in("round_id", roundIds),
          layoutIds.length
            ? supabase.from("holes").select("layout_id, number, par").in("layout_id", layoutIds)
            : Promise.resolve({ data: [] }),
        ]);
        const parByLayoutHole = new Map<string, number>();
        for (const h of (holes ?? []) as { layout_id: string; number: number; par: number | null }[])
          if (h.par != null && h.par > 0) parByLayoutHole.set(`${h.layout_id}:${h.number}`, h.par);
        for (const s of (scores ?? []) as TourScoreRow[]) {
          const key = s.registration_id;
          totals.set(key, (totals.get(key) ?? 0) + (s.strokes ?? 0) + (s.penalties ?? 0));
          const layout = layoutByRound.get(s.round_id);
          const par = layout ? parByLayoutHole.get(`${layout}:${s.hole_number}`) : undefined;
          const prev = parTotals.has(key) ? parTotals.get(key)! : 0;
          parTotals.set(key, prev == null || par == null ? null : prev + par);
        }
      }
    }

    for (const tour of tournaments) {
      const entries = regRows.filter((r) => r.tournament_id === tour.id);
      const scoredEntries = entries.filter(
        (r) => r.user_id && (totals.get(r.id) ?? 0) > 0,
      );
      const byDivision = new Map<string, RegRow[]>();
      for (const r of scoredEntries) {
        const key = r.division_id ?? "open";
        const list = byDivision.get(key) ?? [];
        list.push(r);
        byDivision.set(key, list);
      }
      for (const [divisionId, list] of byDivision) {
        const positions = rank(list, (r) => totals.get(r.id) ?? Number.MAX_SAFE_INTEGER);
        const divLabel = divisionName.get(divisionId);
        for (const r of list) {
          const userId = r.user_id!;
          playerIds.add(userId);
          results.push({
            event_id: tour.id,
            event_name: divLabel ? `${tour.name} · ${divLabel}` : tour.name,
            player_id: userId,
            player_name: userId,
            position: positions.get(r) ?? 1,
            division: divLabel ?? null,
            field_size: list.length,
            strokes: totals.get(r.id) ?? null,
            par: parTotals.get(r.id) ?? null,
          });
        }
      }
      stops.push({
        id: tour.id,
        kind: "tournament",
        name: tour.name,
        slug: tour.slug,
        date: tour.date,
        status: tour.status,
        entries: entries.length,
        scored_players: scoredEntries.length,
        divisions: byDivision.size,
        points_awarded: 0,
      });
    }
  }

  // ---- League stops -----------------------------------------------------
  const leagueIds = leagues.map((l) => l.id);
  if (leagueIds.length) {
    const [{ data: leagueEvents }, { data: leagueRegs }] = await Promise.all([
      supabase.from("league_events").select("id, league_id, status").in("league_id", leagueIds),
      supabase.from("league_registrations").select("league_id, user_id, status").in("league_id", leagueIds),
    ]);

    const eventToLeague = new Map<string, string>();
    for (const e of (leagueEvents ?? []) as LeagueEventRow[]) eventToLeague.set(e.id, e.league_id);

    // league -> player -> { strokes, nights }
    const perLeague = new Map<string, Map<string, { strokes: number; nights: number }>>();
    const eventIds = [...eventToLeague.keys()];
    if (eventIds.length) {
      const { data: rounds } = await supabase
        .from("rounds")
        .select("id, league_event_id")
        .in("league_event_id", eventIds);
      const roundRows = (rounds ?? []) as LeagueRoundRow[];
      const roundIds = roundRows.map((r) => r.id);
      const roundToLeague = new Map<string, string>();
      for (const r of roundRows) {
        const leagueId = eventToLeague.get(r.league_event_id ?? "");
        if (leagueId) roundToLeague.set(r.id, leagueId);
      }
      if (roundIds.length) {
        const { data: players } = await supabase
          .from("round_players")
          .select("id, round_id, user_id")
          .in("round_id", roundIds);
        const rpRows = ((players ?? []) as RoundPlayerRow[]).filter((p) => p.user_id);
        const rpIds = rpRows.map((p) => p.id);
        const strokesByPlayerRow = new Map<string, number>();
        if (rpIds.length) {
          const { data: scores } = await supabase
            .from("round_scores")
            .select("round_player_id, strokes, penalties")
            .in("round_player_id", rpIds);
          for (const s of (scores ?? []) as RoundScoreRow[]) {
            const key = s.round_player_id;
            strokesByPlayerRow.set(
              key,
              (strokesByPlayerRow.get(key) ?? 0) + (s.strokes ?? 0) + (s.penalties ?? 0),
            );
          }
        }
        for (const p of rpRows) {
          const leagueId = roundToLeague.get(p.round_id);
          const total = strokesByPlayerRow.get(p.id) ?? 0;
          if (!leagueId || total <= 0) continue;
          const bucket = perLeague.get(leagueId) ?? new Map();
          const userId = p.user_id!;
          const prior = bucket.get(userId) ?? { strokes: 0, nights: 0 };
          bucket.set(userId, { strokes: prior.strokes + total, nights: prior.nights + 1 });
          perLeague.set(leagueId, bucket);
        }
      }
    }

    for (const league of leagues) {
      const bucket = perLeague.get(league.id) ?? new Map<string, { strokes: number; nights: number }>();
      const rows = [...bucket.entries()].map(([userId, agg]) => ({
        userId,
        average: agg.strokes / Math.max(1, agg.nights),
      }));
      const positions = rank(rows, (r) => r.average);
      for (const r of rows) {
        playerIds.add(r.userId);
        results.push({
          event_id: league.id,
          event_name: league.name,
          player_id: r.userId,
          player_name: r.userId,
          position: positions.get(r) ?? 1,
          field_size: rows.length,
        });
      }
      stops.push({
        id: league.id,
        kind: "league",
        name: league.name,
        slug: league.slug,
        date: league.date,
        status: league.status,
        entries: ((leagueRegs ?? []) as LeagueRegRow[]).filter(
          (r) => r.league_id === league.id && r.status !== "withdrawn",
        ).length,
        scored_players: rows.length,
        divisions: 0,
        points_awarded: 0,
      });
    }
  }

  // ---- Names ------------------------------------------------------------
  if (playerIds.size) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [...playerIds]);
    for (const p of (profiles ?? []) as ProfileRow[]) {
      playerNames.set(p.id, p.display_name ?? "Player");
    }
    for (const r of results) {
      const rawId = r.player_name;
      r.player_name = playerNames.get(rawId) ?? "Player";
    }
  }

  // ---- Official results (PDGA / Disc Golf Scene) --------------------------
  // A stop with imported official places is scored from those, never doubled
  // with in-app scoring.
  const allIds = [...tournaments.map((t) => t.id), ...leagues.map((l) => l.id)];
  if (allIds.length) {
    const { data: official } = await supabase
      .from("series_official_results")
      .select("event_id, division, place, field_size, player_name, player_key, user_id")
      .in("event_id", allIds);
    const rows = (official ?? []) as Array<{
      event_id: string; division: string; place: number; field_size: number;
      player_name: string; player_key: string; user_id: string | null;
    }>;
    if (rows.length) {
      const officialEvents = new Set(rows.map((r) => r.event_id));
      const nameOf = new Map([...tournaments, ...leagues].map((e) => [e.id, e.name]));
      for (let i = results.length - 1; i >= 0; i--) {
        if (officialEvents.has(results[i]!.event_id)) results.splice(i, 1);
      }
      for (const r of rows) {
        results.push({
          event_id: r.event_id,
          event_name: `${nameOf.get(r.event_id) ?? "Event"} · ${r.division}`,
          player_id: r.user_id ?? r.player_key,
          player_name: r.player_name,
          position: r.place,
          division: r.division,
          field_size: r.field_size,
        });
      }
      for (const s of stops) {
        if (!officialEvents.has(s.id)) continue;
        const mine = rows.filter((r) => r.event_id === s.id);
        s.scored_players = mine.length;
        s.entries = Math.max(s.entries, mine.length);
        s.divisions = new Set(mine.map((r) => r.division)).size;
      }
    }
  }

  stops.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  return { results, stops };
}
