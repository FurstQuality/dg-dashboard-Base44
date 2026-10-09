/**
 * Course Fit server function — answers "how will I play this course?" for the
 * courses an event uses.
 *
 * Runs as the signed-in caller (RLS applies). Reads:
 *   - `courses` / `course_layouts` / `holes` for real course detail
 *   - `hole_intel` for how the field scores each hole
 *   - `course_rating_profiles` (approved) and `course_intel` for scratch average
 *     and stroke value
 *   - the caller's `external_rounds` / `external_round_holes` for their scoring
 *     history, plus their app rounds for typical course length
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildCourseFit,
  buildParProfile,
  plausibleSsa,
  type CourseFit,
  type FitHole,
} from "@/lib/stats/course-fit";
import { isSinglesAppRound, isSinglesExternalRound } from "@/lib/singles-only";

const courseInput = z.object({
  roundNumber: z.number().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  courseName: z.string().nullable().optional(),
  layoutId: z.string().uuid().nullable().optional(),
  layoutName: z.string().nullable().optional(),
});

const fitInput = z.object({
  targetRating: z.number().min(300).max(1100),
  courses: z.array(courseInput).max(8),
});

export type CourseDataGap = {
  id: string;
  label: string;
  severity: "blocking" | "partial";
};

export type CourseFitRow = {
  roundNumber: number | null;
  courseId: string | null;
  courseName: string;
  layoutId: string | null;
  layoutName: string | null;
  /** Every layout at this course, so the caller can pick the one being played. */
  layouts: { id: string; name: string }[];
  location: string | null;
  holesOnFile: number;
  holesWithDistance: number;
  holesWithPar: number;
  dataCompleteness: number;
  dataGaps: CourseDataGap[];
  fit: CourseFit;
};

export type CourseFitResult = {
  targetRating: number;
  rows: CourseFitRow[];
  historyHoles: number;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  return n != null && Number.isFinite(n) ? n : null;
};
const normalize = (v: string | null | undefined): string =>
  (v ?? "")
    .toLowerCase()
    .replace(/\b(disc golf course|disc golf|dgc|course|park)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

async function fetchRows(builder: unknown): Promise<Row[]> {
  const { data, error } = (await builder) as { data: Row[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return data ?? [];
}

function stdDev(values: number[]): number | null {
  if (values.length < 3) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  const sd = Math.sqrt(variance);
  return Number.isFinite(sd) && sd > 0 ? Math.min(8, Math.max(1, sd)) : null;
}

export const getCourseFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => fitInput.parse(data))
  .handler(async ({ data, context }): Promise<CourseFitResult> => {
    const supabase = context.supabase as SupabaseClient;
    const userId = context.userId as string;

    const requested = data.courses.filter((c) => c.courseId || c.courseName);
    if (requested.length === 0) return { targetRating: data.targetRating, rows: [], historyHoles: 0 };

    const courseIds = Array.from(
      new Set(requested.map((c) => c.courseId).filter((v): v is string => !!v)),
    );
    const courseNames = Array.from(
      new Set(requested.map((c) => c.courseName).filter((v): v is string => !!v)),
    );

    /* ---- course + layout detail ---------------------------------------- */
    const courseRows = courseIds.length
      ? await fetchRows(
          supabase
            .from("courses")
            .select("id, name, city, state, hole_count")
            .in("id", courseIds),
        )
      : [];

    const layoutRows = courseIds.length
      ? await fetchRows(
          supabase
            .from("course_layouts")
            .select(
              "id, course_id, name, hole_count, par_total, distance_total, scratch_rating, stroke_value, is_default, water_hole_count",
            )
            .in("course_id", courseIds),
        )
      : [];

    const layoutIds = Array.from(
      new Set([
        ...requested.map((c) => c.layoutId).filter((v): v is string => !!v),
        ...layoutRows.map((l) => str(l.id)).filter((v): v is string => !!v),
      ]),
    );

    const [holeRows, intelRows, profileRows, courseIntelRows] = await Promise.all([
      layoutIds.length
        ? fetchRows(
            supabase
              .from("holes")
              .select("layout_id, number, par, distance_ft, hazards")
              .in("layout_id", layoutIds)
              .limit(1000),
          )
        : Promise.resolve([] as Row[]),
      layoutIds.length
        ? fetchRows(
            supabase
              .from("hole_intel")
              .select("layout_id, hole_number, par, avg_strokes, scores_count")
              .in("layout_id", layoutIds)
              .limit(1000),
          )
        : Promise.resolve([] as Row[]),
      courseIds.length || courseNames.length
        ? fetchRows(
            supabase
              .from("course_rating_profiles")
              .select("course_id, course_name, ssa, stroke_value, par_total")
              .eq("status", "approved")
              .or(
                [
                  courseIds.length ? `course_id.in.(${courseIds.join(",")})` : null,
                  ...courseNames.map((n) => {
                    const safe = n.replace(/[(),%*]/g, " ").trim();
                    return safe ? `course_name.ilike.%${safe}%` : null;
                  }),
                ]
                  .filter(Boolean)
                  .join(","),
              ),
          )
        : Promise.resolve([] as Row[]),
      courseIds.length || courseNames.length
        ? fetchRows(
            supabase
              .from("course_intel")
              .select(
                "course_id, course_name, match_key, avg_ssa, avg_stroke_value, est_ssa, est_stroke_value, rounds_count, avg_score",
              )
              .or(
                [
                  courseIds.length ? `course_id.in.(${courseIds.join(",")})` : null,
                  ...courseNames.map((n) => {
                    const safe = n.replace(/[(),%*]/g, " ").trim();
                    return safe ? `course_name.ilike.%${safe}%` : null;
                  }),
                ]
                  .filter(Boolean)
                  .join(","),
              ),
          )
        : Promise.resolve([] as Row[]),
    ]);

    /* ---- the caller's scoring history ---------------------------------- */
    const myRoundsRaw = await fetchRows(
      supabase
        .from("external_rounds")
        .select(
          "id, course_name, layout_name, event_name, division, format, played_on, score, to_par, round_rating, ssa",
        )
        .eq("user_id", userId)
        .eq("format", "singles")
        .order("played_on", { ascending: false })
        .limit(400),
    );
    /* Labels are the only signal on UDisc imports, which have no format column —
       a doubles or best-shot card must never feed a solo projection. */
    const myRounds = myRoundsRaw.filter((r) =>
      isSinglesExternalRound({
        format: str(r.format),
        layout_name: str(r.layout_name),
        event_name: str(r.event_name),
        division: str(r.division),
      }),
    );
    const myRoundIds = myRounds.map((r) => str(r.id)).filter((v): v is string => !!v);
    /* Hole rows for every imported round, not just the newest 200. */
    const myHoles: Row[] = [];
    for (let i = 0; i < myRoundIds.length; i += 150) {
      const chunk = myRoundIds.slice(i, i + 150);
      const rows = await fetchRows(
        supabase
          .from("external_round_holes")
          .select("external_round_id, hole_number, par, strokes")
          .in("external_round_id", chunk)
          .limit(8000),
      );
      myHoles.push(...rows);
    }
    /** Hole rows grouped by the round they belong to. */
    const holesByRound = new Map<string, Row[]>();
    for (const h of myHoles) {
      const id = str(h.external_round_id);
      if (!id) continue;
      const list = holesByRound.get(id);
      if (list) list.push(h);
      else holesByRound.set(id, [h]);
    }
    const playerProfile = buildParProfile(
      myHoles.map((h) => ({ par: num(h.par), strokes: num(h.strokes) })),
    );

    /* ---- the caller's in-app scorecards --------------------------------- */
    /** hole number -> running total of the caller's strokes on that hole */
    type HoleAgg = Map<number, { sum: number; rounds: number }>;
    const bump = (agg: HoleAgg, hole: number, strokes: number) => {
      const b = agg.get(hole) ?? { sum: 0, rounds: 0 };
      b.sum += strokes;
      b.rounds += 1;
      agg.set(hole, b);
    };
    const nativeByCourse = new Map<string, HoleAgg>();
    const nativeByLayout = new Map<string, HoleAgg>();
    try {
      const appRounds = await fetchRows(
        supabase
          .from("rounds")
          .select("id, course_id, layout_id, play_format, team_size")
          .eq("created_by", userId)
          .order("started_at", { ascending: false })
          .limit(300),
      );
      const soloRounds = appRounds.filter((r) =>
        isSinglesAppRound({ play_format: str(r.play_format), team_size: num(r.team_size) }),
      );
      const soloIds = soloRounds.map((r) => str(r.id)).filter((v): v is string => !!v);
      if (soloIds.length) {
        const mePlayers: Row[] = [];
        for (let i = 0; i < soloIds.length; i += 150) {
          mePlayers.push(
            ...(await fetchRows(
              supabase
                .from("round_players")
                .select("id, round_id")
                .eq("user_id", userId)
                .in("round_id", soloIds.slice(i, i + 150)),
            )),
          );
        }
        const roundByPlayer = new Map<string, string>();
        for (const p of mePlayers) {
          const id = str(p.id);
          const rid = str(p.round_id);
          if (id && rid) roundByPlayer.set(id, rid);
        }
        const playerIds = Array.from(roundByPlayer.keys());
        const scoreRows: Row[] = [];
        for (let i = 0; i < playerIds.length; i += 150) {
          scoreRows.push(
            ...(await fetchRows(
              supabase
                .from("round_scores")
                .select("round_player_id, hole_number, strokes")
                .in("round_player_id", playerIds.slice(i, i + 150))
                .limit(8000),
            )),
          );
        }
        const venueByRound = new Map<string, { course: string | null; layout: string | null }>();
        for (const r of soloRounds) {
          const id = str(r.id);
          if (id) venueByRound.set(id, { course: str(r.course_id), layout: str(r.layout_id) });
        }
        for (const s of scoreRows) {
          const rid = roundByPlayer.get(str(s.round_player_id) ?? "");
          const venue = rid ? venueByRound.get(rid) : undefined;
          const hole = num(s.hole_number);
          const strokes = num(s.strokes);
          if (!venue || !hole || strokes == null || strokes <= 0 || strokes > 15) continue;
          if (venue.layout) {
            const agg = nativeByLayout.get(venue.layout) ?? new Map();
            bump(agg, hole, strokes);
            nativeByLayout.set(venue.layout, agg);
          }
          if (venue.course) {
            const agg = nativeByCourse.get(venue.course) ?? new Map();
            bump(agg, hole, strokes);
            nativeByCourse.set(venue.course, agg);
          }
        }
      }
    } catch {
      /* in-app scorecards are a bonus source — never fail the fit on them */
    }


    // Typical course length: layouts the caller has actually played in-app.
    let typicalCourseDistanceFt: number | null = null;
    try {
      const playedRounds = await fetchRows(
        supabase
          .from("rounds")
          .select("layout_id")
          .eq("created_by", userId)
          .not("layout_id", "is", null)
          .order("started_at", { ascending: false })
          .limit(60),
      );
      const playedLayoutIds = Array.from(
        new Set(playedRounds.map((r) => str(r.layout_id)).filter((v): v is string => !!v)),
      );
      if (playedLayoutIds.length) {
        const played = await fetchRows(
          supabase
            .from("course_layouts")
            .select("distance_total")
            .in("id", playedLayoutIds)
            .not("distance_total", "is", null),
        );
        const dists = played.map((l) => num(l.distance_total)).filter((v): v is number => !!v);
        if (dists.length) typicalCourseDistanceFt = Math.round(dists.reduce((s, v) => s + v, 0) / dists.length);
      }
    } catch {
      typicalCourseDistanceFt = null;
    }

    const overallSpread = stdDev(
      myRounds.map((r) => num(r.score)).filter((v): v is number => v != null),
    );

    /* ---- assemble one row per event course ----------------------------- */
    const rows: CourseFitRow[] = requested.map((req) => {
      const courseRow = req.courseId ? courseRows.find((c) => str(c.id) === req.courseId) : undefined;
      const courseName = req.courseName ?? str(courseRow?.name) ?? "Unnamed course";
      const key = normalize(courseName);

      const layoutsForCourse = layoutRows.filter((l) => str(l.course_id) === (req.courseId ?? ""));
      const holesByLayout = (id: string | null) =>
        id ? holeRows.filter((h) => str(h.layout_id) === id) : [];
      /* How often the caller has played each named layout at this course, so the
         default pick is the layout they actually play — not the longest one. */
      const myRoundsHere = myRounds.filter((r) => normalize(str(r.course_name) ?? "") === key);
      const playCountByLayoutName = new Map<string, number>();
      for (const r of myRoundsHere) {
        const nm = normalize(str(r.layout_name) ?? "");
        if (!nm) continue;
        playCountByLayoutName.set(nm, (playCountByLayoutName.get(nm) ?? 0) + 1);
      }
      const myPlays = (l: Row) => playCountByLayoutName.get(normalize(str(l.name) ?? "")) ?? 0;
      const hasRating = (l: Row) => (num(l.scratch_rating) != null ? 1 : 0);
      /** Layouts that publish hole distances make a far more useful plan. */
      const hasDistances = (l: Row) =>
        holesByLayout(str(l.id)).some((h) => num(h.distance_ft) != null) ? 1 : 0;
      const layout =
        (req.layoutId ? layoutRows.find((l) => str(l.id) === req.layoutId) : undefined) ??
        layoutsForCourse
          .slice()
          .sort((a, b) => {
            const playsA = myPlays(a);
            const playsB = myPlays(b);
            if (playsA !== playsB) return playsB - playsA;
            const ratedDelta = hasRating(b) - hasRating(a);
            if (ratedDelta !== 0) return ratedDelta;
            const distDelta = hasDistances(b) - hasDistances(a);
            if (distDelta !== 0) return distDelta;
            const holesA = holesByLayout(str(a.id)).length;
            const holesB = holesByLayout(str(b.id)).length;
            if (holesA !== holesB) return holesB - holesA;
            return (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0);
          })[0];
      const layoutId = req.layoutId ?? str(layout?.id);

      const layoutHoles = holesByLayout(layoutId);
      const intelForLayout = intelRows.filter((h) => str(h.layout_id) === layoutId);
      const intelByHole = new Map(
        intelForLayout.map((h) => [num(h.hole_number) ?? 0, h] as const),
      );
      /* Sibling layouts at this course fill blanks the chosen one leaves: a tee
         set often carries distances or field scoring the played layout lacks. */
      const siblingIds = layoutsForCourse
        .map((l) => str(l.id))
        .filter((id): id is string => !!id && id !== layoutId);
      const siblingHole = (number: number, par: number | null) => {
        for (const id of siblingIds) {
          const row = holesByLayout(id).find((h) => num(h.number) === number);
          if (row && (par == null || num(row.par) == null || num(row.par) === par)) return row;
        }
        return undefined;
      };
      const siblingIntel = (number: number, par: number | null) => {
        for (const id of siblingIds) {
          const row = intelRows.find(
            (h) => str(h.layout_id) === id && num(h.hole_number) === number,
          );
          if (row && (par == null || num(row.par) == null || num(row.par) === par)) return row;
        }
        return undefined;
      };

      const holes: FitHole[] = layoutHoles.map((h) => {
        const number = num(h.number) ?? 0;
        const par = num(h.par);
        const intel = intelByHole.get(number) ?? siblingIntel(number, par);
        const distanceFt = num(h.distance_ft) ?? num(siblingHole(number, par)?.distance_ft);
        const ownHazards = Array.isArray(h.hazards) ? (h.hazards as string[]).filter(Boolean) : [];
        const sibHazards = ownHazards.length
          ? []
          : (() => {
              const raw = siblingHole(number, par)?.hazards;
              return Array.isArray(raw) ? (raw as string[]).filter(Boolean) : [];
            })();
        return {
          number,
          par,
          distanceFt: distanceFt ?? null,
          hazards: ownHazards.length ? ownHazards : sibHazards,
          fieldAvgStrokes: intel ? num(intel.avg_strokes) : null,
          fieldScoresCount: intel ? (num(intel.scores_count) ?? 0) : 0,
        };
      });

      /* If this layout is missing hole rows, list the rest from a sibling tee set
         so the plan covers the whole course instead of stopping short. */
      const declaredHoles = num(layout?.hole_count) ?? num(courseRow?.hole_count);
      if (declaredHoles && holes.length && holes.length < declaredHoles) {
        const have = new Set(holes.map((h) => h.number));
        for (let n = 1; n <= declaredHoles; n += 1) {
          if (have.has(n)) continue;
          const sib = siblingHole(n, null);
          const intel = siblingIntel(n, sib ? num(sib.par) : null);
          if (!sib && !intel) continue;
          holes.push({
            number: n,
            par: sib ? num(sib.par) : null,
            distanceFt: sib ? num(sib.distance_ft) : null,
            hazards:
              sib && Array.isArray(sib.hazards) ? (sib.hazards as string[]).filter(Boolean) : [],
            fieldAvgStrokes: intel ? num(intel.avg_strokes) : null,
            fieldScoresCount: intel ? (num(intel.scores_count) ?? 0) : 0,
          });
        }
        holes.sort((a, b) => a.number - b.number);
      }

      /* scratch average, best source first */
      const profile =
        (req.courseId ? profileRows.find((p) => str(p.course_id) === req.courseId) : undefined) ??
        profileRows.find((p) => normalize(str(p.course_name)) === key);
      const intel =
        (req.courseId ? courseIntelRows.find((c) => str(c.course_id) === req.courseId) : undefined) ??
        courseIntelRows.find(
          (c) => normalize(str(c.course_name)) === key || str(c.match_key) === key,
        );

      let ssa: number | null = null;
      let strokeValue: number | null = null;
      let ssaSource = "not on file";
      // What the course actually rated in PDGA rated rounds comes first: an
      // approved rating profile is built from PDGA event results, and the
      // rated rounds played here are the same evidence one step rawer. A
      // stored layout number is only a stand-in until real rounds exist.
      // Course-wide numbers mix every tee set, so they only stand in when the
      // course has a single layout. Otherwise the chosen layout's own rating rules.
      const singleLayout = layoutsForCourse.length <= 1;
      const ratedRoundCount = num(intel?.rounds_count) ?? 0;
      if (singleLayout && num(profile?.ssa) != null) {
        ssa = num(profile?.ssa);
        strokeValue = num(profile?.stroke_value);
        ssaSource = "PDGA rated rounds (approved course rating)";
      } else if (singleLayout && num(intel?.avg_ssa) != null && ratedRoundCount >= 1) {
        ssa = num(intel?.avg_ssa);
        strokeValue = num(intel?.avg_stroke_value);
        ssaSource = `PDGA rated rounds played here (${ratedRoundCount})`;
      } else if (num(layout?.scratch_rating) != null) {
        ssa = num(layout?.scratch_rating);
        strokeValue = num(layout?.stroke_value);
        ssaSource = "stored layout rating (no PDGA rated rounds here yet)";
      } else if (singleLayout && num(intel?.est_ssa) != null) {
        ssa = num(intel?.est_ssa);
        strokeValue = num(intel?.est_stroke_value);
        ssaSource = "fitted from scores and round ratings here";
      }

      const parTotal = num(layout?.par_total);
      const holeCount = num(layout?.hole_count) ?? num(courseRow?.hole_count) ?? (holes.length || null);

      /* the caller's history at this course — only rounds the same size as this
         layout, so a 9-hole lap never drags an 18-hole projection down */
      const matchedRounds = myRounds.filter((r) => {
        const n = normalize(str(r.course_name));
        return !!n && (n === key || n.includes(key) || key.includes(n));
      });
      const sameSize = holeCount
        ? matchedRounds.filter((r) => {
            const rows = holesByRound.get(str(r.id) ?? "");
            if (rows && rows.length) return rows.length === holeCount;
            const score = num(r.score);
            if (score == null || parTotal == null) return true;
            return Math.abs(score - parTotal) <= 25;
          })
        : matchedRounds;
      /* Same score means different ratings on different layouts, so when the
         course has several layouts keep only rounds logged on this one. */
      const chosenLayoutKey = normalize(str(layout?.name) ?? req.layoutName ?? "");
      const onThisLayout =
        !singleLayout && chosenLayoutKey
          ? sameSize.filter((r) => normalize(str(r.layout_name) ?? "") === chosenLayoutKey)
          : sameSize;
      const mine = singleLayout ? (sameSize.length ? sameSize : matchedRounds) : onThisLayout;

      const scores = mine.map((r) => num(r.score)).filter((v): v is number => v != null);
      const ratings = mine.map((r) => num(r.round_rating)).filter((v): v is number => v != null);
      const courseHistory = {
        rounds: mine.length,
        avgScore: scores.length ? Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 10) / 10 : null,
        bestScore: scores.length ? Math.min(...scores) : null,
        avgRating: ratings.length ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length) : null,
        lastPlayedOn: mine.map((r) => str(r.played_on)).filter(Boolean)[0] ?? null,
      };

      /* the caller's own average on each hole here — imported scorecards first,
         matched to this layout's hole count, then loosened if that finds none,
         then topped up with any in-app scorecards from this course. */
      const aggregateMine = (strict: boolean) => {
        const agg = new Map<number, { sum: number; rounds: number }>();
        for (const r of mine) {
          const rows = holesByRound.get(str(r.id) ?? "") ?? [];
          if (strict && holeCount && rows.length && rows.length !== holeCount) continue;
          for (const hr of rows) {
            const n = num(hr.hole_number);
            const strokes = num(hr.strokes);
            if (!n || strokes == null || strokes <= 0 || strokes > 15) continue;
            if (holeCount && n > holeCount) continue;
            bump(agg, n, strokes);
          }
        }
        return agg;
      };
      let holeAgg = aggregateMine(true);
      if (holeAgg.size === 0) holeAgg = aggregateMine(false);
      for (const source of [
        layoutId ? nativeByLayout.get(layoutId) : undefined,
        req.courseId ? nativeByCourse.get(req.courseId) : undefined,
      ]) {
        if (!source) continue;
        for (const [n, b] of source) {
          if (holeCount && n > holeCount) continue;
          const existing = holeAgg.get(n);
          if (existing) {
            existing.sum += b.sum;
            existing.rounds += b.rounds;
          } else {
            holeAgg.set(n, { sum: b.sum, rounds: b.rounds });
          }
        }
        // A layout match is authoritative; don't double-count the course roll-up.
        if (layoutId && nativeByLayout.has(layoutId)) break;
      }
      const myHoleStats: Record<number, { avg: number; rounds: number }> = {};
      for (const [n, b] of holeAgg) myHoleStats[n] = { avg: b.sum / b.rounds, rounds: b.rounds };

      /* If the stored figure isn't a real stroke average, use the scratch
         average PDGA published on the rounds the caller played here. */
      if (!plausibleSsa(ssa, parTotal, holeCount)) {
        const median = (vals: number[]): number | null => {
          const s = vals.slice().sort((a, b) => a - b);
          return s.length ? s[Math.floor(s.length / 2)] : null;
        };
        const sv = strokeValue && strokeValue > 0 ? strokeValue : 10;
        const published = mine
          .map((r) => num(r.ssa))
          .filter((v): v is number => v != null && plausibleSsa(v, parTotal, holeCount));
        const fitted = mine
          .map((r) => {
            const s = num(r.score);
            const rt = num(r.round_rating);
            return s != null && rt != null ? s + (rt - 1000) / sv : null;
          })
          .filter((v): v is number => v != null && plausibleSsa(v, parTotal, holeCount));
        const pub = median(published);
        const fit2 = median(fitted);
        if (pub != null) {
          ssa = Math.round(pub * 10) / 10;
          ssaSource = `scratch average from ${published.length} rated round${published.length === 1 ? "" : "s"} you played here`;
        } else if (fit2 != null) {
          ssa = Math.round(fit2 * 10) / 10;
          ssaSource = `fitted from ${fitted.length} of your rated rounds here`;
        } else {
          ssa = null;
          ssaSource = "not on file";
        }
      }

      const fit = buildCourseFit({
        myHoleStats,
        holes,
        holeCount,
        parTotal,
        distanceTotal: num(layout?.distance_total),
        ssa,
        strokeValue,
        ssaSource,
        playerProfile,
        courseHistory,
        targetRating: data.targetRating,
        typicalCourseDistanceFt,
        scoreSpread: stdDev(scores) ?? overallSpread,
      });

      /* ---- data completeness -------------------------------------------- */
      const holesWithPar = holes.filter((h) => h.par != null).length;
      const holesWithDistance = holes.filter((h) => h.distanceFt != null).length;
      const expected = holeCount ?? holes.length ?? 18;
      const gaps: CourseDataGap[] = [];
      if (!req.courseId)
        gaps.push({ id: "course", label: "This event's course isn't linked to a course in the app yet.", severity: "blocking" });
      if (holes.length === 0)
        gaps.push({ id: "holes", label: "No hole detail on file — par and distance per hole are missing.", severity: "blocking" });
      else {
        if (holesWithPar < expected)
          gaps.push({ id: "par", label: `${expected - holesWithPar} of ${expected} holes have no par.`, severity: "partial" });
        if (holesWithDistance < expected)
          gaps.push({ id: "distance", label: `${expected - holesWithDistance} of ${expected} holes have no measured distance.`, severity: "partial" });
      }
      if (ssa == null)
        gaps.push({ id: "ssa", label: "No scratch scoring average, so scores can't be turned into a round rating.", severity: "blocking" });
      if (intelForLayout.length === 0)
        gaps.push({ id: "field", label: "No scored rounds here yet, so there's no field average per hole.", severity: "partial" });

      const parts = [
        req.courseId ? 1 : 0,
        holes.length ? 1 : 0,
        expected ? holesWithPar / expected : 0,
        expected ? holesWithDistance / expected : 0,
        ssa != null ? 1 : 0,
        intelForLayout.length ? 1 : 0,
      ];
      const dataCompleteness = Math.round((100 * parts.reduce((s, v) => s + Math.min(1, v), 0)) / parts.length);

      return {
        roundNumber: req.roundNumber ?? null,
        courseId: req.courseId ?? null,
        courseName,
        layoutId,
        layoutName: req.layoutName ?? str(layout?.name),
        layouts: layoutsForCourse
          .map((l) => ({ id: str(l.id) ?? "", name: str(l.name) ?? "Unnamed layout" }))
          .filter((l) => l.id),
        location: courseRow
          ? [str(courseRow.city), str(courseRow.state)].filter(Boolean).join(", ") || null
          : null,
        holesOnFile: holes.length,
        holesWithDistance,
        holesWithPar,
        dataCompleteness,
        dataGaps: gaps,
        fit,
      };
    });

    return { targetRating: data.targetRating, rows, historyHoles: playerProfile.holes };
  });

/**
 * Rebuilds shared course history and layout scoring models from every rated
 * round in the app. Safe to call repeatedly; the heavy lifting is in Postgres.
 */
export const rebuildCourseModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ coursesRefreshed: number; layoutsRefreshed: number }> => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" });
    if (role.error || role.data !== true) throw new Error("Only a super admin can rebuild course models");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [intel, layouts] = await Promise.all([
      supabaseAdmin.rpc("refresh_all_course_intel"),
      supabaseAdmin.rpc("refresh_all_layout_models"),
    ]);
    if (intel.error) throw new Error(intel.error.message);
    if (layouts.error) throw new Error(layouts.error.message);
    return {
      coursesRefreshed: Number(intel.data ?? 0),
      layoutsRefreshed: Number(layouts.data ?? 0),
    };
  });
