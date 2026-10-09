/**
 * Server-only data gathering for the tracker event preview.
 *
 * Everything here is scoped to the authenticated caller: tracked-state comes
 * from the caller's own tracker groups, friend matching from accepted
 * friendships, and odds from the caller's own rating. Nothing is invented — a
 * missing course, tee time, rating, or division is reported as unknown.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { deriveRoundDates } from "@/lib/tracker-round-dates";
import {
  cashLineFor,
  fieldStrength,
  groupFieldByDivision,
  simulateOdds,
  type DivisionField,
  type FieldRow,
  type FieldStrength,
  type SimulatedOdds,
} from "@/lib/tracker/event-preview";

/** Hard read bounds so a preview can never fan out unbounded. */
export const PREVIEW_LIMITS = {
  field: 800,
  rounds: 120,
  groups: 100,
  friends: 300,
} as const;

export type PreviewRound = {
  roundNumber: number;
  label: string | null;
  date: string | null;
  /** true when the date was derived from the event's own dates, not published per round. */
  dateExpected?: boolean;
  courseName: string | null;
  courseLayout: string | null;
  pool: string | null;
  division: string | null;
  startType: string | null;
  teeWindowStart: string | null;
  teeWindowEnd: string | null;
};

export type PreviewFriend = {
  userId: string;
  displayName: string;
  username: string | null;
  pdgaNumber: string;
  division: string | null;
  rating: number | null;
};

export type PreviewStanding = {
  place: number;
  name: string;
  pdgaNumber: string;
  division: string | null;
  totalToPar: number | null;
};

export type EventPreview = {
  pdgaEventRef: string;
  name: string | null;
  tier: string | null;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  pdgaUrl: string | null;
  /** True when the caller already has this event in one of their trackers. */
  tracked: boolean;
  trackedEventId: string | null;
  trackedGroupId: string | null;
  liveStatus: string | null;
  lastSyncedAt: string | null;
  fieldSyncedAt: string | null;
  field: DivisionField[];
  fieldOverall: FieldStrength;
  rounds: PreviewRound[];
  friends: PreviewFriend[];
  standings: PreviewStanding[];
  odds: {
    divisionCode: string | null;
    divisionsAvailable: string[];
    myRating: number | null;
    opponents: number;
    cashLine: number;
    result: SimulatedOdds | null;
    /** Why odds are unavailable, when they are. */
    unavailableReason: "no_field" | "no_rating" | null;
  };
};

export function normalizeEventRef(raw: string): string {
  return raw.replace(/^pdga:/i, "").replace(/[^A-Za-z0-9-]/g, "");
}

function joinLocation(parts: Array<string | null | undefined>): string | null {
  const out = parts.map((p) => p?.trim()).filter((p): p is string => !!p);
  return out.length ? out.join(", ") : null;
}

export async function loadEventPreview(
  supabase: SupabaseClient,
  userId: string,
  input: { eventRef: string; division?: string | null },
): Promise<EventPreview> {
  const ref = normalizeEventRef(input.eventRef);
  if (!ref) throw new Error("That event reference isn't a valid PDGA event number.");

  const { data: groups } = await supabase
    .from("tracker_groups")
    .select("id")
    .eq("owner_id", userId)
    .limit(PREVIEW_LIMITS.groups);
  const groupIds = (groups ?? []).map((g) => g.id as string);

  const [{ data: trackedRows }, { data: kb }, { data: me }, { data: fieldRows }] =
    await Promise.all([
      groupIds.length
        ? supabase
            .from("tracker_group_events")
            .select(
              "id, group_id, name, tier, event_date, end_date, location, url, live_status, last_synced_at",
            )
            .in("group_id", groupIds)
            .eq("pdga_event_ref", ref)
            .limit(1)
        : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
      supabase
        .from("pdga_kb_events")
        .select("name, tier, start_date, end_date, city, state, country, pdga_url")
        .eq("pdga_event_id", ref)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("pdga_rating, pdga_number, preferred_division")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("pdga_event_field")
        .select("pdga_number, name, division, rating, place, total_to_par, synced_at")
        .eq("event_ref", ref)
        .limit(PREVIEW_LIMITS.field),
    ]);

  const tracked = (trackedRows ?? [])[0] as
    | {
        id: string;
        group_id: string;
        name: string | null;
        tier: string | null;
        event_date: string | null;
        end_date?: string | null;
        location: string | null;
        url: string | null;
        live_status: string | null;
        last_synced_at: string | null;
      }
    | undefined;

  const rawField = (fieldRows ?? []) as Array<{
    pdga_number: string;
    name: string;
    division: string | null;
    rating: number | null;
    place: number | null;
    total_to_par: number | null;
    synced_at: string | null;
  }>;
  const field: FieldRow[] = rawField.map((r) => ({
    pdgaNumber: r.pdga_number,
    name: r.name,
    division: r.division,
    rating: r.rating,
    place: r.place,
    totalToPar: r.total_to_par,
  }));
  const fieldSyncedAt = rawField.reduce<string | null>(
    (acc, r) => (r.synced_at && (!acc || r.synced_at > acc) ? r.synced_at : acc),
    null,
  );

  // Rounds only exist once the event is tracked and PDGA has published them.
  let rounds: PreviewRound[] = [];
  if (tracked) {
    const { data: roundRows } = await supabase
      .from("tracker_event_rounds")
      .select(
        "round_number, round_label, round_date, course_name, course_layout, pool, division, start_type, start_window_start, start_window_end",
      )
      .eq("event_id", tracked.id)
      .order("round_number", { ascending: true })
      .limit(PREVIEW_LIMITS.rounds);
    const seen = new Set<string>();
    rounds = ((roundRows ?? []) as Array<Record<string, unknown>>)
      .map((r) => ({
        roundNumber: (r.round_number as number) ?? 0,
        label: (r.round_label as string | null) ?? null,
        date: (r.round_date as string | null) ?? null,
        courseName: (r.course_name as string | null) ?? null,
        courseLayout: (r.course_layout as string | null) ?? null,
        pool: (r.pool as string | null) ?? null,
        division: (r.division as string | null) ?? null,
        startType: (r.start_type as string | null) ?? null,
        teeWindowStart: (r.start_window_start as string | null) ?? null,
        teeWindowEnd: (r.start_window_end as string | null) ?? null,
      }))
      .filter((r) => {
        const key = `${r.roundNumber}|${r.pool ?? ""}|${r.division ?? ""}|${r.courseName ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    // PDGA rarely publishes a date per round. Fill the blanks from the event's
    // own dates (weekly for league play, consecutive days otherwise) and mark
    // them as expected rather than published.
    if (rounds.some((r) => !r.date)) {
      const derived = deriveRoundDates({
        startDate: tracked.event_date ?? (kb?.start_date as string | null) ?? null,
        endDate: tracked.end_date ?? (kb?.end_date as string | null) ?? null,
        tier: tracked.tier ?? (kb?.tier as string | null) ?? null,
        name: tracked.name ?? (kb?.name as string | null) ?? null,
        rounds: rounds.map((r) => r.roundNumber),
      });
      rounds = rounds.map((r) =>
        r.date ? r : { ...r, date: derived[r.roundNumber] ?? null, dateExpected: true },
      );
    }
  }

  // Friends in the field: accepted friendships, matched on linked PDGA numbers.
  let friends: PreviewFriend[] = [];
  if (field.length) {
    const { data: links } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(PREVIEW_LIMITS.friends);
    const friendIds = Array.from(
      new Set(
        ((links ?? []) as Array<{ requester_id: string; addressee_id: string }>)
          .map((l) => (l.requester_id === userId ? l.addressee_id : l.requester_id))
          .filter((id) => id !== userId),
      ),
    );
    if (friendIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, pdga_number, pdga_rating")
        .in("id", friendIds)
        .not("pdga_number", "is", null)
        .limit(PREVIEW_LIMITS.friends);
      const byNumber = new Map(field.map((f) => [f.pdgaNumber, f]));
      friends = (
        (profiles ?? []) as Array<{
          id: string;
          display_name: string | null;
          username: string | null;
          pdga_number: string | null;
          pdga_rating: number | null;
        }>
      )
        .flatMap((p) => {
          const num = (p.pdga_number ?? "").replace(/\D/g, "");
          const row = num ? byNumber.get(num) : undefined;
          if (!row) return [];
          return [
            {
              userId: p.id,
              displayName: p.display_name ?? p.username ?? row.name,
              username: p.username,
              pdgaNumber: num,
              division: row.division,
              rating: row.rating ?? p.pdga_rating ?? null,
            },
          ];
        })
        .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    }
  }

  const grouped = groupFieldByDivision(field);
  const divisionsAvailable = grouped.map((g) => g.division);
  const myNumber = ((me?.pdga_number as string | null) ?? "").replace(/\D/g, "");
  const myRating = (me?.pdga_rating as number | null) ?? null;
  const myRow = myNumber ? field.find((f) => f.pdgaNumber === myNumber) : undefined;
  const divisionCode =
    (input.division && divisionsAvailable.includes(input.division) ? input.division : null) ??
    myRow?.division ??
    ((me?.preferred_division as string | null) &&
    divisionsAvailable.includes(me!.preferred_division as string)
      ? (me!.preferred_division as string)
      : null) ??
    grouped[0]?.division ??
    null;

  const divisionRows = divisionCode
    ? (grouped.find((g) => g.division === divisionCode)?.players ?? [])
    : field;
  const opponents = divisionRows
    .filter((r) => r.pdgaNumber !== myNumber)
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === "number" && r > 0);
  const cashLine = cashLineFor(divisionRows.length);
  const oddsResult =
    !opponents.length || !myRating ? null : simulateOdds(myRating, opponents, cashLine);

  const standings = field
    .filter(
      (r) =>
        typeof r.place === "number" &&
        r.place! > 0 &&
        (!divisionCode || r.division === divisionCode),
    )
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0))
    .slice(0, 10)
    .map((r) => ({
      place: r.place as number,
      name: r.name,
      pdgaNumber: r.pdgaNumber,
      division: r.division,
      totalToPar: r.totalToPar,
    }));

  return {
    pdgaEventRef: ref,
    name: tracked?.name ?? (kb?.name as string | null) ?? null,
    tier: tracked?.tier ?? (kb?.tier as string | null) ?? null,
    startDate: tracked?.event_date ?? (kb?.start_date as string | null) ?? null,
    endDate:
      (kb?.end_date as string | null) ??
      rounds.reduce<string | null>(
        (acc, r) => (r.date && (!acc || r.date > acc) ? r.date : acc),
        null,
      ) ??
      tracked?.event_date ??
      null,
    location:
      tracked?.location ??
      joinLocation([
        kb?.city as string | null,
        kb?.state as string | null,
        kb?.country as string | null,
      ]),
    pdgaUrl:
      tracked?.url ?? (kb?.pdga_url as string | null) ?? `https://www.pdga.com/tour/event/${ref}`,
    tracked: !!tracked,
    trackedEventId: tracked?.id ?? null,
    trackedGroupId: tracked?.group_id ?? null,
    liveStatus: tracked?.live_status ?? null,
    lastSyncedAt: tracked?.last_synced_at ?? null,
    fieldSyncedAt,
    field: grouped,
    fieldOverall: fieldStrength(field),
    rounds,
    friends,
    standings,
    odds: {
      divisionCode,
      divisionsAvailable,
      myRating,
      opponents: opponents.length,
      cashLine,
      result: oddsResult,
      unavailableReason: !opponents.length ? "no_field" : !myRating ? "no_rating" : null,
    },
  };
}
