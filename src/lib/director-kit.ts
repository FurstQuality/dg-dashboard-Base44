/**
 * Event kit source data: everything the tee-sign sheets, caddy guide booklet,
 * and player pack print from. Lives outside the server-function module so the
 * server-fn file stays a thin wrapper, and so the pure helpers stay testable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DirectorRegistrationCounts } from "@/lib/director-alerts";

export type KitHole = {
  number: number;
  par: number;
  distanceFt: number | null;
  nickname: string | null;
  caddyNotes: string | null;
  hazards: string[];
  /** Derived from the mapped layout (mandos, OB lines/areas, hazard areas). */
  mappedFeatures: string[];
  teeName: string | null;
};

/** Human labels for mapped features on one hole, e.g. "2 mandatories", "OB line". */
export function describeMappedFeatures(types: string[]): string[] {
  const labels: Record<string, [string, string]> = {
    mando: ["mandatory", "mandatories"],
    ob_line: ["OB line", "OB lines"],
    ob_area: ["OB area", "OB areas"],
    hazard: ["hazard area", "hazard areas"],
    water: ["water carry", "water carries"],
    dropzone: ["drop zone", "drop zones"],
  };
  const counts = new Map<string, number>();
  for (const t of types) if (labels[t]) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => {
    const [one, many] = labels[t]!;
    return n === 1 ? one : `${n} ${many}`;
  });
};


export type KitLayout = {
  id: string;
  name: string;
  courseName: string;
  holeCount: number;
  parTotal: number | null;
  distanceTotal: number | null;
  holes: KitHole[];
};

export type KitRound = {
  id: string;
  roundNumber: number;
  status: string;
  courseName: string | null;
  layoutId: string | null;
  layoutName: string | null;
  startsAt: string | null;
  teeTimeStart: string | null;
  shotgunTime: string | null;
  teeTimeType: string | null;
  holesPlayed: number | null;
  notes: string | null;
};

export type KitDivision = {
  id: string;
  code: string;
  name: string;
  entryFeeCents: number;
  maxPlayers: number | null;
  minRating: number | null;
  maxRating: number | null;
  players: number;
};

export type EventKit = {
  event: {
    id: string;
    name: string;
    slug: string;
    status: string;
    startDate: string;
    endDate: string;
    location: string | null;
    pdgaSanctioned: boolean;
    pdgaTier: string | null;
    pdgaEventNumber: string | null;
    entryFeeCents: number;
    playersPackCents: number;
    playerPackNotes: string | null;
    playersMeetingAt: string | null;
    checkInOpens: string | null;
    refundPolicy: string | null;
    rulesUrl: string | null;
    websiteUrl: string | null;
    tdName: string | null;
    tdEmail: string | null;
    tdPhone: string | null;
    acePot: boolean;
    ctp: boolean;
    timeZone: string | null;
  };
  rounds: KitRound[];
  divisions: KitDivision[];
  layouts: KitLayout[];
  counts: DirectorRegistrationCounts;
  /** Human-readable gaps that would print as blanks. */
  warnings: string[];
};

export function emptyCounts(): DirectorRegistrationCounts {
  return {
    total: 0,
    pending: 0,
    confirmed: 0,
    waitlist: 0,
    checkedIn: 0,
    withdrawn: 0,
    paid: 0,
    unpaid: 0,
  };
}

/** Whole days from today (UTC date part) to a yyyy-mm-dd date. Negative when past. */
export function daysUntil(dateStr: string): number {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const then = new Date(dateStr.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((then - today) / 864e5);
}

/** Sanctioned-event task template applied on demand from the checklist card. */
export function pdgaChecklistTemplate(): { label: string; phase: string }[] {
  return [
    { label: "Submit event to PDGA for sanctioning", phase: "prep" },
    { label: "Confirm course reservation and permits", phase: "prep" },
    { label: "Publish divisions and entry fees", phase: "prep" },
    { label: "Open registration and set the close date", phase: "prep" },
    { label: "Order player pack items and trophies", phase: "prep" },
    { label: "Assign co-director, scorekeepers, and spotters", phase: "prep" },
    { label: "Build layouts and print tee signs", phase: "week_of" },
    { label: "Post tee times and card assignments", phase: "week_of" },
    { label: "Publish caddy guide and local rules", phase: "week_of" },
    { label: "Confirm OB lines, drop zones, and mandos on course", phase: "week_of" },
    { label: "Set up check-in table and players meeting script", phase: "event_day" },
    { label: "Collect outstanding entry fees", phase: "event_day" },
    { label: "Verify scorecards and post live scores", phase: "event_day" },
    { label: "Run payouts and CTP/ace pot", phase: "wrap_up" },
    { label: "Submit results to the PDGA", phase: "wrap_up" },
    { label: "Post recap and thank sponsors", phase: "wrap_up" },
  ];
}

/** Formats cents as plain dollars for print output. */
export function money(cents: number | null | undefined): string {
  if (!cents) return "$0";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Loads every input the print kit needs for one event, using the caller's
 * RLS-scoped client. The caller must already have verified director access.
 */
export async function buildEventKit(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<EventKit> {
  const { data: t, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, slug, status, start_date, end_date, location, course_id, layout_id, pdga_sanctioned, pdga_tier, pdga_event_number, entry_fee_cents, players_pack_cents, player_pack_notes, players_meeting_at, check_in_opens, refund_policy, rules_url, website_url, td_name, td_email, td_phone, ace_pot_enabled, ctp_enabled, time_zone",
    )
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  if (!t) throw new Error("That event no longer exists.");

  const [roundRows, divisionRows, regRows] = await Promise.all([
    supabase
      .from("tournament_rounds")
      .select(
        "id, round_number, status, course_id, layout_id, starts_at, tee_time_start, shotgun_time, tee_time_type, holes_played, notes",
      )
      .eq("tournament_id", tournamentId)
      .order("round_number", { ascending: true }),
    supabase
      .from("tournament_divisions")
      .select("id, code, name, entry_fee_cents, max_players, min_rating, max_rating")
      .eq("tournament_id", tournamentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("tournament_registrations")
      .select("division_id, status, payment_status")
      .eq("tournament_id", tournamentId)
      .limit(2000),
  ]);

  const rounds = roundRows.data ?? [];
  const layoutIds = [
    ...new Set([t.layout_id, ...rounds.map((r) => r.layout_id)].filter((v): v is string => !!v)),
  ];
  const courseIds = [
    ...new Set([t.course_id, ...rounds.map((r) => r.course_id)].filter((v): v is string => !!v)),
  ];

  const [layoutRows, courseRows] = await Promise.all([
    layoutIds.length
      ? supabase
          .from("course_layouts")
          .select("id, name, course_id, hole_count, par_total, distance_total")
          .in("id", layoutIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            name: string;
            course_id: string;
            hole_count: number;
            par_total: number | null;
            distance_total: number | null;
          }[],
        }),
    courseIds.length
      ? supabase.from("courses").select("id, name").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const courseName = new Map((courseRows.data ?? []).map((c) => [c.id, c.name]));
  const holeRows = layoutIds.length
    ? await supabase
        .from("holes")
        .select("id, layout_id, number, par, distance_ft, nickname, caddy_notes, hazards, tee_name")
        .in("layout_id", layoutIds)
        .order("number", { ascending: true })
    : {
        data: [] as {
          id: string;
          layout_id: string;
          number: number;
          par: number;
          distance_ft: number | null;
          nickname: string | null;
          caddy_notes: string | null;
          hazards: string[] | null;
          tee_name: string | null;
        }[],
      };

  const featureRows = layoutIds.length
    ? await supabase
        .from("course_features")
        .select("layout_id, type, hole_number, hole_numbers")
        .neq("publish_state", "draft")
        .neq("layer", "event")
        .in("layout_id", layoutIds)
        .limit(2000)
    : {
        data: [] as {
          layout_id: string | null;
          type: string;
          hole_number: number | null;
          hole_numbers: number[] | null;
        }[],
      };

  /** layoutId -> holeNumber -> feature types */
  const featuresByHole = new Map<string, Map<number, string[]>>();
  for (const f of featureRows.data ?? []) {
    if (!f.layout_id) continue;
    const holes = f.hole_numbers?.length
      ? f.hole_numbers
      : f.hole_number != null
        ? [f.hole_number]
        : [];
    if (!holes.length) continue;
    const perLayout = featuresByHole.get(f.layout_id) ?? new Map<number, string[]>();
    for (const n of holes) perLayout.set(n, [...(perLayout.get(n) ?? []), f.type]);
    featuresByHole.set(f.layout_id, perLayout);
  }

  const layouts: KitLayout[] = (layoutRows.data ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    courseName: courseName.get(l.course_id) ?? "Course",
    holeCount: l.hole_count,
    parTotal: l.par_total,
    distanceTotal: l.distance_total,
    holes: (holeRows.data ?? [])
      .filter((h) => h.layout_id === l.id)
      .map((h) => ({
        number: h.number,
        par: h.par,
        distanceFt: h.distance_ft,
        nickname: h.nickname,
        caddyNotes: h.caddy_notes,
        hazards: h.hazards ?? [],
        mappedFeatures: describeMappedFeatures(featuresByHole.get(l.id)?.get(h.number) ?? []),
        teeName: h.tee_name,
      })),
  }));


  const layoutName = new Map(layouts.map((l) => [l.id, l.name]));
  const counts = emptyCounts();
  const perDivision = new Map<string, number>();
  for (const r of regRows.data ?? []) {
    counts.total += 1;
    if (r.status === "pending") counts.pending += 1;
    if (r.status === "confirmed") counts.confirmed += 1;
    if (r.status === "waitlist") counts.waitlist += 1;
    if (r.status === "checked_in") counts.checkedIn += 1;
    if (r.status === "withdrawn") counts.withdrawn += 1;
    if (r.payment_status === "paid") counts.paid += 1;
    else if (r.payment_status === "unpaid" && r.status !== "withdrawn") counts.unpaid += 1;
    if (r.division_id && r.status !== "withdrawn") {
      perDivision.set(r.division_id, (perDivision.get(r.division_id) ?? 0) + 1);
    }
  }

  const kitRounds: KitRound[] = rounds.map((r) => ({
    id: r.id,
    roundNumber: r.round_number,
    status: r.status,
    courseName: r.course_id ? (courseName.get(r.course_id) ?? null) : null,
    layoutId: r.layout_id,
    layoutName: r.layout_id ? (layoutName.get(r.layout_id) ?? null) : null,
    startsAt: r.starts_at,
    teeTimeStart: r.tee_time_start,
    shotgunTime: r.shotgun_time,
    teeTimeType: r.tee_time_type,
    holesPlayed: r.holes_played,
    notes: r.notes,
  }));

  const divisions: KitDivision[] = (divisionRows.data ?? []).map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    entryFeeCents: d.entry_fee_cents ?? 0,
    maxPlayers: d.max_players,
    minRating: d.min_rating,
    maxRating: d.max_rating,
    players: perDivision.get(d.id) ?? 0,
  }));

  return {
    event: {
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      startDate: t.start_date,
      endDate: t.end_date,
      location: t.location,
      pdgaSanctioned: !!t.pdga_sanctioned,
      pdgaTier: t.pdga_tier,
      pdgaEventNumber: t.pdga_event_number,
      entryFeeCents: t.entry_fee_cents ?? 0,
      playersPackCents: t.players_pack_cents ?? 0,
      playerPackNotes: t.player_pack_notes,
      playersMeetingAt: t.players_meeting_at,
      checkInOpens: t.check_in_opens,
      refundPolicy: t.refund_policy,
      rulesUrl: t.rules_url,
      websiteUrl: t.website_url,
      tdName: t.td_name,
      tdEmail: t.td_email,
      tdPhone: t.td_phone,
      acePot: !!t.ace_pot_enabled,
      ctp: !!t.ctp_enabled,
      timeZone: t.time_zone,
    },
    rounds: kitRounds,
    divisions,
    layouts,
    counts,
    warnings: kitWarnings({ rounds: kitRounds, divisions, layouts }),
  };
}

/** Gaps that would otherwise print as blank cells. Pure, so it is unit-tested. */
export function kitWarnings(input: {
  rounds: KitRound[];
  divisions: KitDivision[];
  layouts: KitLayout[];
}): string[] {
  const out: string[] = [];
  if (input.layouts.length === 0) {
    out.push(
      "No layout attached — tee signs and hole notes have nothing to print. Pick a layout on the event.",
    );
  }
  for (const l of input.layouts) {
    if (l.holes.length === 0) {
      out.push(`${l.courseName} · ${l.name} has no holes yet — build it in the Course Builder.`);
      continue;
    }
    const missingDistance = l.holes.filter((h) => !h.distanceFt).length;
    if (missingDistance > 0) {
      const label = missingDistance === l.holes.length ? "All" : String(missingDistance);
      out.push(
        `${label} hole(s) on ${l.name} are missing distance — add them in the Course Builder.`,
      );
    }
    const missingNotes = l.holes.filter((h) => !h.caddyNotes).length;
    if (missingNotes === l.holes.length) {
      out.push(`${l.name} has no caddy notes yet — the guide will print pars and distances only.`);
    }
    if (l.holes.length !== l.holeCount) {
      out.push(`${l.name} lists ${l.holeCount} holes but ${l.holes.length} are built.`);
    }
  }
  if (input.rounds.length === 0)
    out.push("No rounds scheduled — the schedule page of the pack will be empty.");
  for (const r of input.rounds) {
    if (!r.courseName) out.push(`Round ${r.roundNumber} has no course assigned.`);
    if (!r.teeTimeStart && !r.shotgunTime)
      out.push(`Round ${r.roundNumber} has no tee time or shotgun start.`);
  }
  if (input.divisions.length === 0)
    out.push("No divisions set up — the pack can't list fields or entry fees.");
  return out;
}
