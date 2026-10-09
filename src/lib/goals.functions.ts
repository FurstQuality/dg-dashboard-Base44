import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { STATS_LIMITS, statsWindowStart } from "@/lib/stats-queries";
import {
  computeGoalProgress,
  goalMetricDef,
  type GoalProgress,
  type GoalStatsSnapshot,
} from "@/lib/stats/goals";
import { computePdgaRating } from "@/lib/stats/rating-engines";
import type { EngineRound } from "@/lib/stats/rating-engine";

/**
 * StatLink Goals — read, write, and progress for `public.user_goals`.
 *
 * Progress is never stored as the truth: it is recomputed from the player's
 * own rounds on every read (and written back so other surfaces can show a
 * cached number), so a goal can't drift out of sync with the round database.
 */

type Client = { from: (table: string) => any };

export type GoalRow = {
  id: string;
  title: string;
  metric: string;
  target: number;
  baseline: number | null;
  deadline: string | null;
  course_name: string | null;
  completed_at: string | null;
  created_at: string;
};

export type GoalWithProgress = GoalRow & { progress: GoalProgress };

export type GoalsResult = {
  goals: GoalWithProgress[];
  stats: GoalStatsSnapshot;
  /** Provenance for the numbers behind progress. */
  meta: {
    ratedRounds: number;
    usesOfficialRating: boolean;
    holesGraded: number;
    lastPlayedOn: string | null;
    windowStart: string;
  };
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds the metric snapshot every goal measures itself against. All reads are
 * scoped to the caller and explicitly bounded.
 */
async function buildSnapshot(
  supabase: Client,
  userId: string,
): Promise<{ stats: GoalStatsSnapshot; meta: GoalsResult["meta"] }> {
  const windowStart = statsWindowStart();

  const [profileRes, externalRes, nativeRoundsRes] = await Promise.all([
    supabase.from("profiles").select("pdga_number, pdga_rating").eq("id", userId).maybeSingle(),
    supabase
      .from("external_rounds")
      .select(
        "played_on, course_name, score, to_par, round_rating, ssa, source, format, included",
      )
      .eq("user_id", userId)
      .gte("played_on", windowStart)
      .order("played_on", { ascending: false })
      .limit(STATS_LIMITS.rounds),
    supabase
      .from("rounds")
      .select("id, course_id, layout_id, started_at")
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(STATS_LIMITS.rounds),
  ]);

  const official = (profileRes?.data?.pdga_rating as number | null) ?? null;

  const external = (externalRes?.data ?? []) as Array<{
    played_on: string;
    course_name: string | null;
    score: number | null;
    to_par: number | null;
    round_rating: number | null;
    ssa: number | null;
    source: string | null;
    format: string | null;
    included: boolean | null;
  }>;

  // ---- Rated-round derived metrics -----------------------------------
  const ratings = external
    .map((r) => r.round_rating)
    .filter((v): v is number => typeof v === "number");
  const toPars = external.map((r) => r.to_par).filter((v): v is number => typeof v === "number");
  const bestRoundRating = ratings.length ? Math.max(...ratings) : null;
  const scoringAverage = toPars.length
    ? +(toPars.reduce((s, v) => s + v, 0) / toPars.length).toFixed(1)
    : null;
  const lastPlayedOn = external.length ? external[0]!.played_on : null;

  let estimated: number | null = null;
  if (official == null && external.length) {
    const engineRounds: EngineRound[] = external.map((r) => ({
      played_on: r.played_on,
      round_rating: r.round_rating,
      score: r.score,
      ssa: r.ssa,
      // external_rounds has no stroke value; the rating engine defaults it.
      source: r.source,
      format: r.format,
      included: r.included,
    }));
    estimated = computePdgaRating(engineRounds).rating;
  }

  // Best (lowest) to-par per course, from imported rounds.
  const coursePrs: Record<string, number> = {};
  for (const r of external) {
    const name = (r.course_name ?? "").trim();
    if (!name || r.to_par == null) continue;
    const key = name.toLowerCase();
    const prev = coursePrs[key];
    if (prev == null || r.to_par < prev) coursePrs[key] = r.to_par;
  }

  // ---- Native scored rounds: birdies, birdie rate, courses ----------
  const nativeRounds = (nativeRoundsRes?.data ?? []) as Array<{
    id: string;
    course_id: string | null;
    layout_id: string | null;
    started_at: string | null;
  }>;
  const roundIds = nativeRounds.map((r) => r.id);

  let birdies = 0;
  let holesGraded = 0;
  if (roundIds.length) {
    const [scoresRes, playersRes] = await Promise.all([
      supabase
        .from("round_scores")
        .select("round_id, round_player_id, hole_number, strokes")
        .in("round_id", roundIds)
        .limit(STATS_LIMITS.holeScores),
      supabase
        .from("round_players")
        .select("id, round_id")
        .in("round_id", roundIds)
        .eq("user_id", userId)
        .limit(STATS_LIMITS.rounds),
    ]);
    const myPlayerIds = new Set(
      ((playersRes?.data ?? []) as Array<{ id: string }>).map((p) => p.id),
    );
    const layoutIds = Array.from(
      new Set(nativeRounds.map((r) => r.layout_id).filter((x): x is string => !!x)),
    );
    const holesRes = layoutIds.length
      ? await supabase
          .from("holes")
          .select("layout_id, number, par")
          .in("layout_id", layoutIds)
          .limit(STATS_LIMITS.holeScores)
      : { data: [] };
    const parByLayoutHole = new Map<string, number>();
    for (const h of (holesRes?.data ?? []) as Array<{
      layout_id: string;
      number: number;
      par: number;
    }>) {
      parByLayoutHole.set(`${h.layout_id}:${h.number}`, h.par);
    }
    const layoutByRound = new Map(nativeRounds.map((r) => [r.id, r.layout_id]));

    for (const s of (scoresRes?.data ?? []) as Array<{
      round_id: string;
      round_player_id: string;
      hole_number: number;
      strokes: number | null;
    }>) {
      if (myPlayerIds.size && !myPlayerIds.has(s.round_player_id)) continue;
      if (s.strokes == null || s.strokes <= 0) continue;
      const layoutId = layoutByRound.get(s.round_id) ?? null;
      const par = layoutId ? (parByLayoutHole.get(`${layoutId}:${s.hole_number}`) ?? null) : null;
      if (par == null) continue;
      holesGraded++;
      if (s.strokes < par) birdies++;
    }
  }

  const birdieRate = holesGraded > 0 ? +((birdies / holesGraded) * 100).toFixed(1) : null;

  // Courses played across both worlds: native course ids + imported names.
  const courseKeys = new Set<string>();
  for (const r of nativeRounds) if (r.course_id) courseKeys.add(`id:${r.course_id}`);
  for (const key of Object.keys(coursePrs)) courseKeys.add(`name:${key}`);
  for (const r of external) {
    const name = (r.course_name ?? "").trim().toLowerCase();
    if (name) courseKeys.add(`name:${name}`);
  }

  const stats: GoalStatsSnapshot = {
    rating: official ?? estimated,
    round_rating: bestRoundRating,
    rounds: ratings.length ? ratings.length : external.length || null,
    birdies: holesGraded > 0 ? birdies : null,
    birdie_rate: birdieRate,
    scoring_average: scoringAverage,
    courses_played: courseKeys.size || null,
    coursePrs,
  };

  return {
    stats,
    meta: {
      ratedRounds: ratings.length,
      usesOfficialRating: official != null,
      holesGraded,
      lastPlayedOn,
      windowStart,
    },
  };
}

/** Goals with live progress, plus the snapshot the progress came from. */
export const listGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoalsResult> => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };

    const [{ stats, meta }, goalsRes] = await Promise.all([
      buildSnapshot(supabase, userId),
      supabase
        .from("user_goals")
        .select(
          "id, title, metric, target, baseline, deadline, course_name, completed_at, created_at, progress",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const rows = (goalsRes?.data ?? []) as Array<GoalRow & { progress: number | null }>;
    const today = todayIso();

    const goals: GoalWithProgress[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      metric: row.metric,
      target: row.target,
      baseline: row.baseline,
      deadline: row.deadline,
      course_name: row.course_name,
      completed_at: row.completed_at,
      created_at: row.created_at,
      progress: computeGoalProgress(row, stats, today),
    }));

    // Cache the percentage and stamp newly achieved goals so other surfaces
    // (Overview strip, notifications) don't have to recompute.
    await Promise.all(
      goals.map(async (g, i) => {
        const row = rows[i]!;
        const nextPct = g.progress.pct;
        const justAchieved = g.progress.status === "achieved" && !row.completed_at;
        if (row.progress === nextPct && !justAchieved) return;
        await supabase
          .from("user_goals")
          .update({
            progress: nextPct,
            ...(justAchieved ? { completed_at: new Date().toISOString() } : {}),
          })
          .eq("id", g.id)
          .eq("user_id", userId);
        if (justAchieved) g.completed_at = new Date().toISOString();
      }),
    );

    return { goals, stats, meta };
  });

const goalInput = z.object({
  id: z.string().uuid().nullish(),
  title: z.string().trim().min(1).max(120),
  metric: z.string().max(40),
  target: z.number().int().min(-100).max(5000),
  deadline: z.string().max(20).nullish(),
  course_name: z.string().trim().max(200).nullish(),
});

/** Creates or updates one goal, capturing today's value as the baseline. */
export const saveGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => goalInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };
    const def = goalMetricDef(data.metric);
    if (!def) throw new Error("Pick a goal type we can measure.");
    if (def.needsCourse && !(data.course_name ?? "").trim()) {
      throw new Error("Course goals need a course name.");
    }

    const patch = {
      title: data.title,
      metric: data.metric,
      target: data.target,
      deadline: data.deadline || null,
      course_name: def.needsCourse ? (data.course_name ?? "").trim() : null,
    };

    if (data.id) {
      const { error } = await supabase
        .from("user_goals")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    // Baseline = where the player stands right now, so the progress bar starts
    // empty instead of jumping to whatever fraction of the target they're at.
    const { stats } = await buildSnapshot(supabase, userId);
    const baseline = def.needsCourse
      ? (stats.coursePrs[(data.course_name ?? "").trim().toLowerCase()] ?? null)
      : ((stats as unknown as Record<string, number | null>)[data.metric] ?? null);

    const { data: inserted, error } = await supabase
      .from("user_goals")
      .insert({
        user_id: userId,
        ...patch,
        baseline: baseline != null ? Math.round(baseline) : null,
        progress: 0,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (inserted as { id: string }).id };
  });

export const deleteGoal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };
    const { error } = await supabase
      .from("user_goals")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Records that an achieved goal was shared, so we stop nudging about it. */
export const markGoalShared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: Client; userId: string };
    await supabase
      .from("user_goals")
      .update({ shared_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    return { ok: true as const };
  });
