/**
 * Game Plan prep — server-side data assembly.
 * -------------------------------------------
 * Two products are built here:
 *   • Division advice: every division in an event's field, scored for the
 *     caller (eligibility, field strength, odds, recommendation).
 *   • Training plan: the caller's weakest holes on the event's actual layouts,
 *     their measured skill leaks, a practice plan, and a readiness score.
 *
 * All reads are scoped to the authenticated caller. Tournament rosters stay
 * behind `checkTournamentAccess`; PDGA field data is public cached data.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSkillReport, type Leak, type SkillHole } from "@/lib/stats/skill-engine";
import {
  buildHoleFocus,
  buildPracticePlan,
  computeReadiness,
  daysUntilDate,
  familiarityFrom,
  rankDivisions,
  type DivisionFieldInput,
  type DivisionOption,
  type HoleFocus,
  type HolePlay,
  type PracticeFocus,
  type ReadinessItem,
} from "@/lib/game-plan/prep-model";

/* ------------------------------- contracts ------------------------------ */

export type PrepCourseInput = {
  round_number: number | null;
  course_id: string | null;
  course_name: string | null;
  layout_id: string | null;
  layout_name: string | null;
};

export type PrepEventInput = {
  eventId: string;
  tournamentId: string | null;
  pdgaEventRef: string | null;
  startsOn: string | null;
  courses: PrepCourseInput[];
};

export type DivisionAdvice = {
  eventId: string;
  meRating: number | null;
  preferredDivision: string | null;
  registeredDivision: string | null;
  recommendedCode: string | null;
  options: DivisionOption[];
  fieldSource: "internal" | "pdga_cache" | "none";
  lastSyncedAt: string | null;
};

export type PrepCourseSummary = {
  round_number: number | null;
  course_name: string;
  layout_name: string | null;
  plays: number;
  holesAnalyzed: number;
  avgVsPar: number | null;
  bestRoundRating: number | null;
};

export type EventTrainingPlan = {
  eventId: string;
  daysUntil: number | null;
  roundsScheduled: number;
  familiarity: "none" | "light" | "solid";
  courses: PrepCourseSummary[];
  holeFocus: HoleFocus[];
  holeStrengths: HoleFocus[];
  leaks: Leak[];
  strengths: Leak[];
  totalStrokesLostPerRound: number;
  ratingUpside: number;
  practicePlan: PracticeFocus[];
  readiness: { score: number; items: ReadinessItem[] };
  dataPoints: { holeScores: number; ratedRounds12mo: number; coursePlays: number };
};

/* ------------------------------- utilities ------------------------------ */

type LooseClient = {
  from: (table: string) => {
    select: (cols: string) => Record<string, unknown>;
  };
};

/** Narrow the generated Supabase client to an untyped shape for dynamic reads. */
function loose(client: unknown): LooseClient {
  return client as LooseClient;
}

type Row = Record<string, unknown>;

async function run(builder: unknown): Promise<Row[]> {
  const res = (await builder) as { data: Row[] | null; error?: unknown };
  return res?.data ?? [];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length ? v : null;
}

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

function normalizeCourseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/* --------------------------- division advisor --------------------------- */

export async function buildDivisionAdvice(
  supabase: SupabaseClient,
  userId: string,
  input: PrepEventInput,
): Promise<DivisionAdvice> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = loose(supabase);

  const profileRows = await run(
    (
      client.from("profiles").select("pdga_rating, pdga_number, preferred_division") as {
        eq: (k: string, v: string) => unknown;
      }
    ).eq("id", userId),
  );
  const profile = profileRows[0] ?? {};
  const meRating = num(profile.pdga_rating);
  const preferredDivision = str(profile.preferred_division);

  let fields: DivisionFieldInput[] = [];
  let fieldSource: DivisionAdvice["fieldSource"] = "none";
  let lastSyncedAt: string | null = null;
  let registeredDivision: string | null = null;

  if (input.pdgaEventRef) {
    const rows = await run(
      (
        loose(supabaseAdmin)
          .from("pdga_event_field")
          .select("pdga_number, name, division, rating, prize, synced_at") as {
          eq: (k: string, v: string) => unknown;
        }
      ).eq("event_ref", input.pdgaEventRef),
    );
    const myPdga = str(profile.pdga_number);
    const grouped = new Map<string, { ratings: number[]; purse: number }>();
    for (const r of rows) {
      const code = str(r.division) ?? "Open";
      const bucket = grouped.get(code) ?? { ratings: [], purse: 0 };
      const rating = num(r.rating);
      if (rating != null) bucket.ratings.push(rating);
      bucket.purse += num(r.prize) ?? 0;
      grouped.set(code, bucket);
      if (myPdga && str(r.pdga_number) === myPdga) registeredDivision = code;
      lastSyncedAt = lastSyncedAt ?? str(r.synced_at);
    }
    fields = Array.from(grouped.entries()).map(([code, b]) => ({
      code,
      ratings: b.ratings.filter((rating) => rating !== meRating || b.ratings.length === 1),
      purse: b.purse || null,
    }));
    fieldSource = rows.length ? "pdga_cache" : "none";
  } else if (input.tournamentId) {
    const { checkTournamentAccess } = await import("@/lib/tournament-access.server");
    const access = await checkTournamentAccess(supabase, userId, input.tournamentId);
    if (access.allowed) {
      const admin = loose(supabaseAdmin);
      const [divs, regs] = await Promise.all([
        run(
          (
            admin
              .from("tournament_divisions")
              .select("id, code, name, min_rating, max_rating") as {
              eq: (k: string, v: string) => unknown;
            }
          ).eq("tournament_id", input.tournamentId),
        ),
        run(
          (
            (
              admin.from("tournament_registrations").select("division_id, user_id, status") as {
                eq: (k: string, v: string) => { in: (k: string, v: string[]) => unknown };
              }
            ).eq("tournament_id", input.tournamentId) as {
              in: (k: string, v: string[]) => unknown;
            }
          ).in("status", ["confirmed", "checked_in", "pending", "waitlist"]),
        ),
      ]);
      const userIds = Array.from(
        new Set(regs.map((r) => str(r.user_id)).filter((v): v is string => !!v)),
      );
      const profiles = userIds.length
        ? await run(
            (
              admin.from("profiles").select("id, pdga_rating") as {
                in: (k: string, v: string[]) => unknown;
              }
            ).in("id", userIds),
          )
        : [];
      const ratingByUser = new Map(profiles.map((p) => [str(p.id) ?? "", num(p.pdga_rating)]));
      for (const d of divs) {
        const id = str(d.id);
        const code = str(d.code) ?? str(d.name) ?? "Division";
        const inDiv = regs.filter((r) => str(r.division_id) === id);
        if (inDiv.some((r) => str(r.user_id) === userId)) registeredDivision = code;
        fields.push({
          code,
          name: str(d.name),
          minRating: num(d.min_rating),
          maxRating: num(d.max_rating),
          ratings: inDiv
            .filter((r) => str(r.user_id) !== userId)
            .map((r) => ratingByUser.get(str(r.user_id) ?? "") ?? null)
            .filter((v): v is number => v != null),
        });
      }
      fieldSource = regs.length ? "internal" : "none";
    }
  }

  const { options, recommendedCode } = rankDivisions(meRating, fields);
  return {
    eventId: input.eventId,
    meRating,
    preferredDivision,
    registeredDivision,
    recommendedCode,
    options,
    fieldSource,
    lastSyncedAt,
  };
}

/* ---------------------------- training plan ----------------------------- */

export async function buildTrainingPlan(
  supabase: SupabaseClient,
  userId: string,
  input: PrepEventInput,
): Promise<EventTrainingPlan> {
  const client = loose(supabase);
  const courseIds = Array.from(
    new Set(input.courses.map((c) => c.course_id).filter((v): v is string => !!v)),
  );
  const courseNames = input.courses
    .map((c) => c.course_name)
    .filter((v): v is string => !!v)
    .map(normalizeCourseName);

  /* --- native rounds on the event's courses ---------------------------- */
  const myRounds = await run(
    (
      (
        client.from("rounds").select("id, course_id, layout_id, started_at") as {
          eq: (k: string, v: string) => {
            order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
          };
        }
      ).eq("created_by", userId) as {
        order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
      }
    )
      .order("started_at", { ascending: false })
      .limit(200),
  );
  const roundMeta = myRounds.map((r) => ({
    id: str(r.id) ?? "",
    courseId: str(r.course_id),
    layoutId: str(r.layout_id),
    startedAt: str(r.started_at),
  }));
  const eventRoundIds = roundMeta
    .filter((r) => r.courseId && courseIds.includes(r.courseId))
    .map((r) => r.id);
  const recentRoundIds = roundMeta.slice(0, 40).map((r) => r.id);
  const allRoundIds = Array.from(new Set([...eventRoundIds, ...recentRoundIds])).filter(Boolean);

  const [myPlayers, layoutHoles] = await Promise.all([
    allRoundIds.length
      ? run(
          (
            (
              client.from("round_players").select("id, round_id, user_id") as {
                in: (k: string, v: string[]) => { eq: (k: string, v: string) => unknown };
              }
            ).in("round_id", allRoundIds) as { eq: (k: string, v: string) => unknown }
          ).eq("user_id", userId),
        )
      : Promise.resolve([] as Row[]),
    (() => {
      const layoutIds = Array.from(
        new Set(roundMeta.map((r) => r.layoutId).filter((v): v is string => !!v)),
      );
      return layoutIds.length
        ? run(
            (
              client.from("holes").select("layout_id, number, par, distance_ft") as {
                in: (k: string, v: string[]) => unknown;
              }
            ).in("layout_id", layoutIds),
          )
        : Promise.resolve([] as Row[]);
    })(),
  ]);

  const myPlayerIds = new Set(myPlayers.map((p) => str(p.id) ?? ""));
  const holeLookup = new Map<string, { par: number | null; distance_ft: number | null }>();
  for (const h of layoutHoles) {
    holeLookup.set(`${str(h.layout_id)}:${num(h.number)}`, {
      par: num(h.par),
      distance_ft: num(h.distance_ft),
    });
  }

  const scoreRows = allRoundIds.length
    ? await run(
        (
          client
            .from("round_scores")
            .select(
              "round_id, round_player_id, hole_number, strokes, putts, penalties, ob_strokes",
            ) as { in: (k: string, v: string[]) => { limit: (n: number) => unknown } }
        )
          .in("round_id", allRoundIds)
          .limit(6000),
      )
    : [];
  const myScores = scoreRows.filter(
    (s) => myPlayerIds.size === 0 || myPlayerIds.has(str(s.round_player_id) ?? ""),
  );

  const roundById = new Map(roundMeta.map((r) => [r.id, r]));
  const courseNameById = new Map(
    input.courses
      .filter((c) => c.course_id)
      .map((c) => [c.course_id as string, c.course_name ?? "Course"]),
  );
  const layoutNameById = new Map(
    input.courses.filter((c) => c.layout_id).map((c) => [c.layout_id as string, c.layout_name]),
  );

  const plays: HolePlay[] = [];
  const skillHoles: SkillHole[] = [];
  for (const s of myScores) {
    const round = roundById.get(str(s.round_id) ?? "");
    if (!round) continue;
    const hole = round.layoutId
      ? holeLookup.get(`${round.layoutId}:${num(s.hole_number)}`)
      : undefined;
    const strokes = num(s.strokes);
    skillHoles.push({
      strokes,
      putts: num(s.putts),
      penalties: num(s.penalties) ?? num(s.ob_strokes),
      par: hole?.par ?? null,
      distance_ft: hole?.distance_ft ?? null,
    });
    if (!round.courseId || !courseIds.includes(round.courseId) || strokes == null) continue;
    plays.push({
      courseKey: round.courseId,
      courseName: courseNameById.get(round.courseId) ?? "Course",
      layoutName: round.layoutId ? (layoutNameById.get(round.layoutId) ?? null) : null,
      holeNumber: num(s.hole_number) ?? 0,
      par: hole?.par ?? null,
      distanceFt: hole?.distance_ft ?? null,
      strokes,
      putts: num(s.putts),
      penalties: num(s.penalties) ?? num(s.ob_strokes),
    });
  }

  /* --- imported (external) rounds at the same venues -------------------- */
  const externalRounds = await run(
    (
      (
        client
          .from("external_rounds")
          .select("id, course_name, layout_name, played_on, round_rating") as {
          eq: (k: string, v: string) => {
            order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
          };
        }
      ).eq("user_id", userId) as {
        order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
      }
    )
      .order("played_on", { ascending: false })
      .limit(300),
  );
  const matchingExternal = externalRounds.filter((r) => {
    const name = str(r.course_name);
    if (!name) return false;
    const norm = normalizeCourseName(name);
    return courseNames.some((c) => c && (norm.includes(c) || c.includes(norm)));
  });
  const externalHoleRows = matchingExternal.length
    ? await run(
        (
          client
            .from("external_round_holes")
            .select("external_round_id, hole_number, par, strokes") as {
            in: (k: string, v: string[]) => { limit: (n: number) => unknown };
          }
        )
          .in(
            "external_round_id",
            matchingExternal.map((r) => str(r.id) ?? ""),
          )
          .limit(3000),
      )
    : [];
  const extById = new Map(matchingExternal.map((r) => [str(r.id) ?? "", r]));
  for (const h of externalHoleRows) {
    const parent = extById.get(str(h.external_round_id) ?? "");
    const strokes = num(h.strokes);
    if (!parent || strokes == null) continue;
    const name = str(parent.course_name) ?? "Course";
    plays.push({
      courseKey: `ext:${normalizeCourseName(name)}`,
      courseName: name,
      layoutName: str(parent.layout_name),
      holeNumber: num(h.hole_number) ?? 0,
      par: num(h.par),
      distanceFt: null,
      strokes,
    });
  }

  /* --- practice recency, rated-round volume ---------------------------- */
  const [puttingRows, rangeRows, ratedRows] = await Promise.all([
    run(
      (
        (
          client.from("putting_sessions").select("started_at") as {
            eq: (k: string, v: string) => {
              order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
            };
          }
        ).eq("user_id", userId) as {
          order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
        }
      )
        .order("started_at", { ascending: false })
        .limit(1),
    ),
    run(
      (
        (
          client.from("range_sessions").select("started_at") as {
            eq: (k: string, v: string) => {
              order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
            };
          }
        ).eq("user_id", userId) as {
          order: (k: string, o: { ascending: boolean }) => { limit: (n: number) => unknown };
        }
      )
        .order("started_at", { ascending: false })
        .limit(1),
    ),
    Promise.resolve(externalRounds),
  ]);
  const cutoff = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const ratedRounds12mo = ratedRows.filter(
    (r) => num(r.round_rating) != null && (str(r.played_on) ?? "") >= cutoff,
  ).length;

  /* --- assemble --------------------------------------------------------- */
  const roundsScheduled = Math.max(1, input.courses.length);
  const focus = buildHoleFocus(plays, roundsScheduled);
  const skill = buildSkillReport(
    skillHoles,
    new Set(myScores.map((s) => str(s.round_id))).size,
  );
  const coursePlaysNative = new Set(
    plays.filter((p) => !p.courseKey.startsWith("ext:")).map((p) => `${p.courseKey}`),
  ).size
    ? eventRoundIds.length
    : 0;
  const coursePlays = coursePlaysNative + matchingExternal.length;
  const puttingDaysAgo = daysAgo(str(puttingRows[0]?.started_at));
  const rangeDaysAgo = daysAgo(str(rangeRows[0]?.started_at));
  const daysUntil = daysUntilDate(input.startsOn);
  const familiarity = familiarityFrom(coursePlays);

  const courseSummaries: PrepCourseSummary[] = input.courses.map((c) => {
    const key = c.course_id ?? `ext:${normalizeCourseName(c.course_name ?? "")}`;
    const holes = focus.filter((h) => h.courseKey === key);
    const avg = holes.length
      ? Math.round((holes.reduce((s, h) => s + h.avgVsPar, 0) / holes.length) * 100) / 100
      : null;
    const ratings = matchingExternal
      .filter((r) => normalizeCourseName(str(r.course_name) ?? "") === normalizeCourseName(c.course_name ?? ""))
      .map((r) => num(r.round_rating))
      .filter((v): v is number => v != null);
    return {
      round_number: c.round_number,
      course_name: c.course_name ?? "Course TBD",
      layout_name: c.layout_name,
      plays: holes.length ? Math.max(...holes.map((h) => h.plays)) : 0,
      holesAnalyzed: holes.length,
      avgVsPar: avg,
      bestRoundRating: ratings.length ? Math.max(...ratings) : null,
    };
  });

  const practicePlan = buildPracticePlan({
    daysUntil,
    leaks: skill.leaks,
    holeFocus: focus,
    familiarity,
    puttingDaysAgo,
    rangeDaysAgo,
    courseName: input.courses[0]?.course_name ?? null,
  });

  const readiness = computeReadiness({
    ratingOnFile: true,
    ratedRounds12mo,
    coursePlays,
    divisionChosen: true,
    fieldSynced: !!(input.pdgaEventRef || input.tournamentId),
    holeDataPoints: plays.length,
    puttingDaysAgo,
    rangeDaysAgo,
  });

  return {
    eventId: input.eventId,
    daysUntil,
    roundsScheduled,
    familiarity,
    courses: courseSummaries,
    holeFocus: focus.filter((h) => h.avgVsPar > 0).slice(0, 8),
    holeStrengths: [...focus]
      .filter((h) => h.avgVsPar < 0)
      .sort((a, b) => a.avgVsPar - b.avgVsPar)
      .slice(0, 4),
    leaks: skill.leaks.slice(0, 5),
    strengths: skill.strengths.slice(0, 3),
    totalStrokesLostPerRound: skill.totalStrokesLostPerRound,
    ratingUpside: skill.totalRatingUpside,
    practicePlan,
    readiness,
    dataPoints: {
      holeScores: plays.length,
      ratedRounds12mo,
      coursePlays,
    },
  };
}
