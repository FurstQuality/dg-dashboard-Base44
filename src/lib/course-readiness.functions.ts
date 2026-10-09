import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { STATS_LIMITS, statsWindowStart } from "@/lib/stats-queries";
import { normalizeStateCode } from "@/lib/us-states";
import {
  buildReadinessPlan,
  buildReadinessRow,
  summarizeCourseHistory,
  type PlanHoleInput,
  type PlayerCourseHistory,
  type ReadinessLayoutInput,
  type ReadinessPlan,
  type ReadinessRow,
} from "@/lib/stats/course-readiness";

/**
 * Course Readiness — turns a target round rating into the score the player
 * needs at a specific event, plus the hole-by-hole plan that gets them there.
 *
 * Planning targets come from three places: tournaments the player is
 * registered for, their saved schedule (PDGA/UDisc imports included), and
 * upcoming tournaments in their home state. Courses are resolved from the
 * event's own course link first, then by name, then by the event's city/state
 * so a PDGA event named nothing like its course still lands on real layouts.
 */

type Client = { from: (table: string) => any };

export type ReadinessOptionGroup = "registered" | "schedule" | "local" | "course";

export type ReadinessOption = {
  kind: "event" | "course";
  group: ReadinessOptionGroup;
  /** Stable value used by the picker. */
  value: string;
  label: string;
  courseName: string;
  courseId: string | null;
  startsOn: string | null;
  location: string | null;
  /** Division or registration state, when the event knows it. */
  detail: string | null;
};

export type ReadinessCourseInfo = {
  id: string | null;
  name: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  holeCount: number | null;
  parTotal: number | null;
  distanceTotal: number | null;
  difficulty: string | null;
  pdgaRating: number | null;
  layoutCount: number;
};

export type ReadinessCourseCandidate = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  /** How this course was tied to the event. */
  match: "event-link" | "name" | "nearby";
};

export type ReadinessLayoutRow = ReadinessRow & {
  /** Hazard counts from the layout build, when measured. */
  hazards: {
    waterHoles: number | null;
    obLineFeet: number | null;
    mandos: number | null;
    dropzones: number | null;
    islandGreens: number | null;
    longestHoleFt: number | null;
  };
  plan: ReadinessPlan | null;
};

export type ReadinessResult = {
  options: ReadinessOption[];
  selected: ReadinessOption | null;
  targetRoundRating: number;
  layouts: ReadinessLayoutRow[];
  /** Course facts shown alongside the target score. */
  course: ReadinessCourseInfo | null;
  /** Other courses that could be the event's venue, for the player to pick. */
  courseCandidates: ReadinessCourseCandidate[];
  history: PlayerCourseHistory;
  /** True when we could not resolve any layout for the course. */
  noLayouts: boolean;
};

const OPTION_LIMIT = 40;

/** Strips year, tier, and sponsor noise so an event name can match a course. */
function courseNameHint(eventName: string): string {
  return eventName
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/['’]\d{2}\b/g, " ")
    .replace(/\bpresented by .*$/i, " ")
    .replace(/\b(open|classic|championships?|challenge|series|flex(?: start)?|singles|doubles|tour|qualifier|q-series|dgpt|pdga|all divisions?)\b/gi, " ")
    .replace(/[·|\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Portage, IN" / "Nashville, TN" → { city, state } */
function splitLocation(location: string | null): { city: string | null; state: string | null } {
  if (!location) return { city: null, state: null };
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, state: null };
  const state = parts.length > 1 ? normalizeStateCode(parts[parts.length - 1]!) : null;
  return { city: parts[0] ?? null, state: state ?? null };
}

type OptionSeed = ReadinessOption & { city: string | null; state: string | null };

/** Tournaments the player registered for, their schedule, and local events. */
async function loadOptions(
  supabase: Client,
  userId: string,
  homeState: string | null,
): Promise<OptionSeed[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

  const [regsRes, eventsRes, localRes, coursesRes] = await Promise.all([
    supabase
      .from("tournament_registrations")
      .select(
        "status, tournament:tournaments(id, name, start_date, location, course_id, latitude, longitude, pdga_tier), division:tournament_divisions(name)",
      )
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "waitlist", "checked_in"])
      .limit(STATS_LIMITS.plannedEvents),
    supabase
      .from("scheduled_events")
      .select(
        "id, title, city, state, location, starts_on, division, status, dgs_course_id, tournament_id",
      )
      .eq("user_id", userId)
      .gte("starts_on", today)
      .order("starts_on", { ascending: true })
      .limit(STATS_LIMITS.plannedEvents),
    homeState
      ? supabase
          .from("tournaments")
          .select("id, name, start_date, location, course_id, pdga_tier, status")
          .in("status", ["published", "registration_open", "registration_closed", "in_progress"])
          .gte("start_date", today)
          .lte("start_date", horizon)
          .order("start_date", { ascending: true })
          .limit(30)
      : Promise.resolve({ data: [] }),
    supabase
      .from("external_rounds")
      .select("course_name, played_on")
      .eq("user_id", userId)
      .not("course_name", "is", null)
      .order("played_on", { ascending: false })
      .limit(STATS_LIMITS.historyRounds),
  ]);

  const options: OptionSeed[] = [];
  const registeredTournamentIds = new Set<string>();

  for (const r of (regsRes?.data ?? []) as Array<{
    status: string;
    tournament: {
      id: string;
      name: string;
      start_date: string | null;
      location: string | null;
      course_id: string | null;
      pdga_tier: string | null;
    } | null;
    division: { name: string | null } | null;
  }>) {
    const t = r.tournament;
    if (!t) continue;
    registeredTournamentIds.add(t.id);
    const loc = splitLocation(t.location);
    options.push({
      kind: "event",
      group: "registered",
      value: `tournament:${t.id}`,
      label: `${t.name}${t.start_date ? ` · ${t.start_date}` : ""}`,
      courseName: t.name,
      courseId: t.course_id ?? null,
      startsOn: t.start_date ?? null,
      location: t.location ?? null,
      detail: [r.division?.name, r.status === "checked_in" ? "checked in" : r.status]
        .filter(Boolean)
        .join(" · "),
      city: loc.city,
      state: loc.state,
    });
  }

  for (const e of (eventsRes?.data ?? []) as Array<{
    id: string;
    title: string | null;
    city: string | null;
    state: string | null;
    location: string | null;
    starts_on: string | null;
    division: string | null;
    status: string | null;
    tournament_id: string | null;
  }>) {
    const title = (e.title ?? "").trim();
    if (!title) continue;
    if (e.tournament_id && registeredTournamentIds.has(e.tournament_id)) continue;
    const loc = splitLocation(e.location);
    options.push({
      kind: "event",
      group: "schedule",
      value: `event:${e.id}`,
      label: `${title}${e.starts_on ? ` · ${e.starts_on}` : ""}`,
      courseName: title,
      courseId: null,
      startsOn: e.starts_on,
      location: e.location ?? ([e.city, e.state].filter(Boolean).join(", ") || null),
      detail:
        [e.division, e.status === "registered" ? "registered" : null]
          .filter(Boolean)
          .join(" · ") || null,
      city: e.city ?? loc.city,
      state: normalizeStateCode(e.state) ?? loc.state,
    });
  }

  for (const t of (localRes?.data ?? []) as Array<{
    id: string;
    name: string;
    start_date: string | null;
    location: string | null;
    course_id: string | null;
    pdga_tier: string | null;
  }>) {
    if (registeredTournamentIds.has(t.id)) continue;
    const loc = splitLocation(t.location);
    if (homeState && loc.state && loc.state !== homeState) continue;
    options.push({
      kind: "event",
      group: "local",
      value: `tournament:${t.id}`,
      label: `${t.name}${t.start_date ? ` · ${t.start_date}` : ""}`,
      courseName: t.name,
      courseId: t.course_id ?? null,
      startsOn: t.start_date ?? null,
      location: t.location ?? null,
      detail: t.pdga_tier ? `${t.pdga_tier} · not registered` : "not registered",
      city: loc.city,
      state: loc.state,
    });
  }

  const seen = new Set<string>();
  for (const r of (coursesRes?.data ?? []) as Array<{ course_name: string | null }>) {
    const name = (r.course_name ?? "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    options.push({
      kind: "course",
      group: "course",
      value: `course:${key}`,
      label: name,
      courseName: name,
      courseId: null,
      startsOn: null,
      location: null,
      detail: null,
      city: null,
      state: null,
    });
    if (seen.size >= 25) break;
  }

  return options.slice(0, OPTION_LIMIT);
}

type CourseRow = {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  difficulty: string | null;
  pdga_rating: number | null;
};

const COURSE_COLUMNS = "id, name, slug, city, state, hole_count, difficulty, pdga_rating";

/** Event link → name match → courses in the event's city/state. */
async function resolveCourseCandidates(
  supabase: Client,
  seed: {
    courseId: string | null;
    courseName: string;
    city: string | null;
    state: string | null;
    kind: "event" | "course";
  },
): Promise<Array<CourseRow & { match: ReadinessCourseCandidate["match"] }>> {
  const out: Array<CourseRow & { match: ReadinessCourseCandidate["match"] }> = [];
  const push = (rows: CourseRow[], match: ReadinessCourseCandidate["match"]) => {
    for (const row of rows) {
      if (!out.some((r) => r.id === row.id)) out.push({ ...row, match });
    }
  };

  if (seed.courseId) {
    const res = await supabase.from("courses").select(COURSE_COLUMNS).eq("id", seed.courseId).limit(1);
    push((res?.data ?? []) as CourseRow[], "event-link");
  }

  const needle = seed.kind === "course" ? seed.courseName.trim() : courseNameHint(seed.courseName);
  if (needle.length >= 4) {
    const res = await supabase
      .from("courses")
      .select(COURSE_COLUMNS)
      .ilike("name", `%${needle.slice(0, 40)}%`)
      .limit(5);
    push((res?.data ?? []) as CourseRow[], "name");
  }

  // A PDGA event name rarely matches its venue, so the event's city/state is
  // the reliable path to real layouts.
  if (seed.city || seed.state) {
    let query = supabase.from("courses").select(COURSE_COLUMNS);
    if (seed.city) query = query.ilike("city", `%${seed.city}%`);
    if (seed.state) query = query.eq("state", seed.state);
    const res = await query.order("pdga_rating", { ascending: false, nullsFirst: false }).limit(8);
    let rows = (res?.data ?? []) as CourseRow[];
    if (rows.length === 0 && seed.state) {
      const wide = await supabase
        .from("courses")
        .select(COURSE_COLUMNS)
        .eq("state", seed.state)
        .order("pdga_rating", { ascending: false, nullsFirst: false })
        .limit(8);
      rows = (wide?.data ?? []) as CourseRow[];
    }
    push(rows, "nearby");
  }

  return out;
}

export const getCourseReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        /** Option value from a previous call; defaults to the first option. */
        selection: z.string().max(120).nullish(),
        /** Explicit venue pick when an event maps to several courses. */
        courseId: z.string().uuid().nullish(),
        targetRoundRating: z.number().int().min(500).max(1200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<ReadinessResult> => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };

    const profileRes = await supabase
      .from("profiles")
      .select("home_state, location")
      .eq("id", userId)
      .limit(1);
    const profile = ((profileRes?.data ?? []) as Array<{
      home_state: string | null;
      location: string | null;
    }>)[0];
    const homeState =
      normalizeStateCode(profile?.home_state) ?? splitLocation(profile?.location ?? null).state;

    const seeds = await loadOptions(supabase, userId, homeState);
    const options: ReadinessOption[] = seeds.map(({ city: _c, state: _s, ...o }) => o);
    const seed = seeds.find((o) => o.value === data.selection) ?? seeds[0] ?? null;
    const selected = seed ? options.find((o) => o.value === seed.value) ?? null : null;

    const empty: ReadinessResult = {
      options,
      selected,
      targetRoundRating: data.targetRoundRating,
      layouts: [],
      course: null,
      courseCandidates: [],
      history: summarizeCourseHistory([]),
      noLayouts: true,
    };
    if (!seed) return empty;

    // ---- Resolve the venue ------------------------------------------------
    const candidates = await resolveCourseCandidates(supabase, {
      courseId: seed.courseId,
      courseName: seed.courseName,
      city: seed.city,
      state: seed.state,
      kind: seed.kind,
    });
    const course =
      (data.courseId ? candidates.find((c) => c.id === data.courseId) : null) ??
      candidates[0] ??
      null;

    const courseCandidates: ReadinessCourseCandidate[] = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      city: c.city ?? null,
      state: c.state ?? null,
      match: c.match,
    }));

    const layoutInputs: Array<ReadinessLayoutInput & { hazards: ReadinessLayoutRow["hazards"] }> = [];
    let courseInfo: ReadinessCourseInfo | null = course
      ? {
          id: course.id,
          name: course.name,
          slug: course.slug ?? null,
          city: course.city ?? null,
          state: course.state ?? null,
          holeCount: course.hole_count ?? null,
          parTotal: null,
          distanceTotal: null,
          difficulty: course.difficulty ?? null,
          pdgaRating: course.pdga_rating != null ? Number(course.pdga_rating) : null,
          layoutCount: 0,
        }
      : null;

    if (course) {
      const [layoutsRes, profileRatingRes, intelRes] = await Promise.all([
        supabase
          .from("course_layouts")
          .select(
            "id, name, hole_count, par_total, distance_total, scratch_rating, stroke_value, is_default, water_hole_count, ob_line_feet, mando_count, dropzone_count, island_green_count, longest_hole_ft, created_at",
          )
          .eq("course_id", course.id)
          .order("created_at", { ascending: false })
          .limit(30),
        supabase
          .from("course_rating_profiles")
          .select("ssa, stroke_value, par_total, status")
          .eq("course_id", course.id)
          .eq("status", "approved")
          .limit(1),
        supabase
          .from("course_intel")
          .select("avg_ssa, avg_stroke_value, avg_to_par, rounds_count")
          .eq("course_id", course.id)
          .limit(1),
      ]);

      const ratingProfile =
        ((profileRatingRes?.data ?? []) as Array<{
          ssa: number | null;
          stroke_value: number | null;
          par_total: number | null;
        }>)[0] ?? null;
      const intel =
        ((intelRes?.data ?? []) as Array<{
          avg_ssa: number | null;
          avg_stroke_value: number | null;
          rounds_count: number | null;
        }>)[0] ?? null;

      const rawLayouts = (layoutsRes?.data ?? []) as Array<{
        id: string;
        name: string | null;
        hole_count: number | null;
        par_total: number | null;
        distance_total: number | null;
        scratch_rating: number | null;
        stroke_value: number | null;
        is_default?: boolean | null;
        water_hole_count: number | null;
        ob_line_feet: number | null;
        mando_count: number | null;
        dropzone_count: number | null;
        island_green_count: number | null;
        longest_hole_ft: number | null;
      }>;

      // Course builds can leave repeat layouts behind; plan against one of each.
      const layouts: typeof rawLayouts = [];
      const layoutSeen = new Set<string>();
      for (const l of rawLayouts) {
        const key = `${(l.name ?? "main").toLowerCase()}|${l.hole_count ?? "?"}|${l.par_total ?? "?"}`;
        if (layoutSeen.has(key)) continue;
        layoutSeen.add(key);
        layouts.push(l);
        if (layouts.length >= 6) break;
      }

      if (courseInfo) {
        const primary = layouts.find((l) => l.is_default) ?? layouts[0] ?? null;
        courseInfo = {
          ...courseInfo,
          layoutCount: layouts.length,
          parTotal: primary?.par_total ?? ratingProfile?.par_total ?? null,
          holeCount: primary?.hole_count ?? courseInfo.holeCount,
          distanceTotal: primary?.distance_total ?? null,
        };
      }

      const fallbackSsa =
        ratingProfile?.ssa != null
          ? Number(ratingProfile.ssa)
          : intel?.avg_ssa != null
            ? +Number(intel.avg_ssa).toFixed(1)
            : null;
      const fallbackStroke =
        ratingProfile?.stroke_value != null
          ? Number(ratingProfile.stroke_value)
          : intel?.avg_stroke_value != null
            ? Number(intel.avg_stroke_value)
            : null;

      for (const l of layouts) {
        // A layout's scratch scoring average is a *score*, not a rating. Some
        // older builds stored a 900-ish rating here, which would ask the player
        // to shoot hundreds of strokes over par — ignore anything implausible.
        const rawSsa = l.scratch_rating != null ? Number(l.scratch_rating) : null;
        const parRef = l.par_total ?? ratingProfile?.par_total ?? null;
        const plausible =
          rawSsa != null &&
          rawSsa >= 20 &&
          rawSsa <= 150 &&
          (parRef == null || Math.abs(rawSsa - parRef) <= 30);
        const layoutSsa = plausible ? rawSsa : null;
        const ssa = layoutSsa ?? fallbackSsa;
        layoutInputs.push({
          layoutId: l.id,
          layoutName: l.name ?? "Main layout",
          ssa,
          strokeValue:
            l.stroke_value != null && Number(l.stroke_value) >= 3 && Number(l.stroke_value) <= 25
              ? Number(l.stroke_value)
              : fallbackStroke,
          parTotal: l.par_total ?? ratingProfile?.par_total ?? null,
          holeCount: l.hole_count,
          distanceTotal: l.distance_total ?? null,
          ssaSource:
            layoutSsa != null ? "layout-scratch" : ssa != null ? "rating-profile" : "unknown",
          hazards: {
            waterHoles: l.water_hole_count ?? null,
            obLineFeet: l.ob_line_feet ?? null,
            mandos: l.mando_count ?? null,
            dropzones: l.dropzone_count ?? null,
            islandGreens: l.island_green_count ?? null,
            longestHoleFt: l.longest_hole_ft ?? null,
          },
        });
      }

      if (layoutInputs.length === 0 && fallbackSsa != null) {
        layoutInputs.push({
          layoutId: null,
          layoutName: `${course.name} (course average)`,
          ssa: fallbackSsa,
          strokeValue: fallbackStroke,
          parTotal: ratingProfile?.par_total ?? null,
          holeCount: course.hole_count ?? null,
          ssaSource: "rating-profile",
          hazards: {
            waterHoles: null,
            obLineFeet: null,
            mandos: null,
            dropzones: null,
            islandGreens: null,
            longestHoleFt: null,
          },
        });
      }
    }

    // Nothing matched by course id — try a rating profile keyed by name only.
    if (layoutInputs.length === 0) {
      const needle = seed.kind === "course" ? seed.courseName : courseNameHint(seed.courseName);
      if (needle.length >= 4) {
        const byNameRes = await supabase
          .from("course_rating_profiles")
          .select("course_name, ssa, stroke_value, par_total")
          .eq("status", "approved")
          .ilike("course_name", `%${needle.slice(0, 40)}%`)
          .limit(1);
        const p = ((byNameRes?.data ?? []) as Array<{
          course_name: string;
          ssa: number | null;
          stroke_value: number | null;
          par_total: number | null;
        }>)[0];
        if (p?.ssa != null) {
          layoutInputs.push({
            layoutId: null,
            layoutName: p.course_name,
            ssa: Number(p.ssa),
            strokeValue: p.stroke_value != null ? Number(p.stroke_value) : null,
            parTotal: p.par_total ?? null,
            holeCount: null,
            ssaSource: "rating-profile",
            hazards: {
              waterHoles: null,
              obLineFeet: null,
              mandos: null,
              dropzones: null,
              islandGreens: null,
              longestHoleFt: null,
            },
          });
        }
      }
    }

    // ---- Hole detail for the game plan -----------------------------------
    const layoutIds = layoutInputs
      .map((l) => l.layoutId)
      .filter((id): id is string => !!id)
      .slice(0, 6);
    const holesByLayout = new Map<string, PlanHoleInput[]>();
    if (layoutIds.length) {
      const [holesRes, holeIntelRes] = await Promise.all([
        supabase
          .from("holes")
          .select("layout_id, number, par, distance_ft, shot_shape, caddy_notes")
          .in("layout_id", layoutIds)
          .order("number", { ascending: true })
          .limit(240),
        supabase
          .from("hole_intel")
          .select(
            "layout_id, hole_number, par, scores_count, avg_strokes, birdie_count, bogey_count, double_plus_count, ob_strokes_total",
          )
          .in("layout_id", layoutIds)
          .limit(240),
      ]);

      const intelKey = (layoutId: string, hole: number) => `${layoutId}:${hole}`;
      const intelMap = new Map<
        string,
        { avg: number | null; birdieRate: number | null; bogeyPlusRate: number | null; ob: number }
      >();
      for (const row of (holeIntelRes?.data ?? []) as Array<{
        layout_id: string;
        hole_number: number;
        scores_count: number | null;
        avg_strokes: number | null;
        birdie_count: number | null;
        bogey_count: number | null;
        double_plus_count: number | null;
        ob_strokes_total: number | null;
      }>) {
        const n = row.scores_count ?? 0;
        // One or two cards isn't a scoring trend — don't tell a player a hole
        // birdies "100% of the time" off a single round.
        const trusted = n >= 5;
        intelMap.set(intelKey(row.layout_id, row.hole_number), {
          avg: trusted && row.avg_strokes != null ? +Number(row.avg_strokes).toFixed(2) : null,
          birdieRate: trusted ? +((row.birdie_count ?? 0) / n).toFixed(3) : null,
          bogeyPlusRate: trusted
            ? +(((row.bogey_count ?? 0) + (row.double_plus_count ?? 0)) / n).toFixed(3)
            : null,
          ob: row.ob_strokes_total ?? 0,
        });
      }

      for (const h of (holesRes?.data ?? []) as Array<{
        layout_id: string;
        number: number;
        par: number | null;
        distance_ft: number | null;
        shot_shape: string | null;
        caddy_notes: string | null;
      }>) {
        const intel = intelMap.get(intelKey(h.layout_id, h.number));
        const list = holesByLayout.get(h.layout_id) ?? [];
        list.push({
          number: h.number,
          par: h.par,
          distanceFt: h.distance_ft,
          avgStrokes: intel?.avg ?? null,
          birdieRate: intel?.birdieRate ?? null,
          bogeyPlusRate: intel?.bogeyPlusRate ?? null,
          obStrokes: intel?.ob ?? 0,
          shotShape: h.shot_shape,
          caddyNote: h.caddy_notes,
        });
        holesByLayout.set(h.layout_id, list);
      }
    }

    // ---- The player's own history at this course --------------------------
    const historyNeedle = (course?.name ?? seed.courseName).slice(0, 40);
    const historyRes = await supabase
      .from("external_rounds")
      .select("played_on, score, to_par, round_rating")
      .eq("user_id", userId)
      .ilike("course_name", `%${historyNeedle}%`)
      .gte("played_on", statsWindowStart())
      .order("played_on", { ascending: false })
      .limit(STATS_LIMITS.historyRounds);

    const history = summarizeCourseHistory(
      (historyRes?.data ?? []) as Array<{
        played_on: string;
        score: number | null;
        to_par: number | null;
        round_rating: number | null;
      }>,
    );

    const layouts: ReadinessLayoutRow[] = layoutInputs.map(({ hazards, ...input }) => {
      const row = buildReadinessRow(input, data.targetRoundRating, history);
      const holes = input.layoutId ? holesByLayout.get(input.layoutId) ?? [] : [];
      return { ...row, hazards, plan: buildReadinessPlan(row, holes) };
    });

    return {
      options,
      selected,
      targetRoundRating: data.targetRoundRating,
      layouts,
      course: courseInfo,
      courseCandidates,
      history,
      noLayouts: layouts.length === 0,
    };
  });
