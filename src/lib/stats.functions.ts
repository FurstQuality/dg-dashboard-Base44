import { validUdiscRating } from "./udisc-eligibility";
import { buildLayoutBreakdown, type LayoutBreakdown, type LayoutSource } from "./stats/course-layouts";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeRating, projectRating, type EngineRound } from "@/lib/stats/rating-engine";
import {
  computePdgaRating,
  computeDgdRating,
  type HeadToHeadSample,
} from "@/lib/stats/rating-engines";
import { nextPdgaUpdateDate, previousPdgaUpdateDate } from "@/lib/stats/pdga-update";
import { summarizeScores, type HoleScore } from "@/lib/stats/scoring-stats";
import { buildSkillReport, type SkillHole } from "@/lib/stats/skill-engine";
import { planTarget } from "@/lib/stats/target-calculator";
import { STATS_LIMITS } from "@/lib/stats-queries";
import { isSinglesExternalRound } from "@/lib/singles-only";

type AnyRow = Record<string, unknown>;

/**
 * Loose Supabase query builder used by the StatLink reads below. Every
 * StatLink query is scoped by user and bounded by an explicit row cap from
 * `STATS_LIMITS` so a long-playing account can never pull an unbounded
 * history into a server function.
 */
type LooseResult = { data: AnyRow[] | null; error?: { message?: string } | null };
type LooseBuilder = Promise<LooseResult> & {
  eq: (k: string, v: string) => LooseBuilder;
  neq: (k: string, v: string) => LooseBuilder;
  not: (k: string, op: string, v: unknown) => LooseBuilder;
  in: (k: string, v: readonly string[]) => LooseBuilder;
  order: (c: string, o?: { ascending?: boolean }) => LooseBuilder;
  limit: (n: number) => LooseBuilder;
};

function boundedQuery(supabase: unknown, table: string, columns: string): LooseBuilder {
  return (supabase as { from: (t: string) => { select: (c: string) => LooseBuilder } })
    .from(table)
    .select(columns);
}

type SupabaseLike = {
  from: (t: string) => {
    select: (c: string) => Record<string, unknown>;
  };
};

async function fetchExternalRounds(
  supabase: SupabaseLike,
  userId: string,
  sources: readonly string[],
  opts: { keepOutsideWindow?: boolean; max?: number } = {},
): Promise<AnyRow[]> {
  // Page through so we never lose data to the 1000-row PostgREST cap, but
  // stop at the StatLink row cap so one account can't pull an unbounded
  // history into the rating engines.
  const PAGE = 500;
  const MAX = opts.max ?? STATS_LIMITS.rounds;
  const all: AnyRow[] = [];
  for (let from = 0; from < MAX; from += PAGE) {
    const builder = supabase
      .from("external_rounds")
      .select(
        "played_on, round_rating, mock_pdga_rating, score, ssa, source, format, included, to_par, course_name, event_name, layout_name, division",
      ) as unknown as {
      eq: (
        k: string,
        v: string,
      ) => {
        in: (
          k: string,
          v: readonly string[],
        ) => {
          eq: (
            k: string,
            v: string,
          ) => {
            order: (
              col: string,
              opts?: { ascending?: boolean },
            ) => {
              range: (a: number, b: number) => Promise<{ data: AnyRow[] | null }>;
            };
          };
        };
      };
    };
    // Enforce singles-only at the query layer. UDisc CSVs don't have a format
    // column so doubles/best-shot cards slip in as "singles" unless the
    // importer catches them (identical score across partners). Historical
    // rows may still be miscategorized; anything explicitly marked non-singles
    // is filtered here so ratings/analytics only use verified solo rounds.
    const { data } = await builder
      .eq("user_id", userId)
      .in("source", sources)
      .eq("format", "singles")
      .order("played_on", { ascending: false })
      .range(from, from + PAGE - 1);
    const rows = data ?? [];
    all.push(
      ...rows.filter(
        (r) =>
          (opts.keepOutsideWindow || (r.included as boolean | null) !== false) &&
          isSinglesExternalRound({
            format: (r.format as string | null) ?? null,
            layout_name: (r.layout_name as string | null) ?? null,
            event_name: (r.event_name as string | null) ?? null,
            division: (r.division as string | null) ?? null,
          }),
      ),
    );
    if (rows.length < PAGE) break;
  }

  return all;
}

/**
 * Statboard source filter. Every rating/scoring aggregate on `/stats`
 * must be scoped to exactly one round source so PDGA, UDisc, and
 * DG Dashboard analytics never blend into a single number.
 *
 *   - "pdga"      → external_rounds.source in ('pdga','disc_golf_scene')
 *                   (official rated rounds, including PDGA scores imported
 *                   from a linked Disc Golf Scene profile)
 *   - "udisc"     → external_rounds.source = 'udisc' (mock PDGA rating only)
 *   - "chainlink" → native rounds/round_ratings scored inside DG Dashboard
 *   - null/omit   → PDGA-rated rounds + rounds scored natively in
 *                   DG Dashboard. UDisc never appears outside the explicit
 *                   "udisc" switcher selection on /stats.
 */
export type StatboardSource = "pdga" | "udisc" | "chainlink";

async function fetchAllRounds(
  supabase: SupabaseLike,
  userId: string,
  source?: StatboardSource | null,
  opts: { keepOutsideWindow?: boolean; max?: number } = {},
): Promise<EngineRound[]> {
  const wantExternal = source == null || source === "pdga" || source === "udisc";
  const wantNative = source == null || source === "chainlink";
  // Disc Golf Scene score imports mirror official PDGA event results, so
  // they roll up into the PDGA bucket alongside direct PDGA imports.
  // UDisc rounds are only ever surfaced by the DG Statboard source switcher.
  // Every other StatLink read (source omitted) is PDGA-rated rounds plus
  // rounds scored natively in DG Dashboard — never UDisc mock ratings.
  const extSources: readonly string[] =
    source === "pdga"
      ? ["pdga", "disc_golf_scene"]
      : source === "udisc"
        ? ["udisc"]
        : ["pdga", "disc_golf_scene"];

  const [extRows, nativeRes] = await Promise.all([
    wantExternal
      ? fetchExternalRounds(supabase, userId, extSources, opts)
      : Promise.resolve([] as AnyRow[]),
    wantNative
      ? boundedQuery(
          supabase,
          "round_ratings",
          "id, user_id, course_id, round_rating, scratch_rating, stroke_value, score_to_par, total_strokes, par_total, created_at",
        )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(STATS_LIMITS.rounds)
      : Promise.resolve({ data: [] as AnyRow[] | null }),
  ]);

  const rows: EngineRound[] = [];
  const pushExt = (r: AnyRow) => {
    const rawScore = (r.score as number | null) ?? null;
    const score = rawScore && rawScore > 0 ? rawScore : null;
    const rawSource = (r.source as string | null) ?? null;
    const officialRating = (r.round_rating as number | null) ?? null;
    // Disc Golf Scene hosts BOTH PDGA-sanctioned and casual events. DGS only
    // publishes an official round rating on sanctioned events, so treat a
    // DGS row as PDGA-source only when a round_rating is present. Casual
    // DGS rows stay under "disc_golf_scene" and are excluded from the PDGA
    // rated-round pool.
    const isDgs = rawSource === "disc_golf_scene";
    const dgsSanctioned = isDgs && officialRating != null;
    const normalizedSource = isDgs ? (dgsSanctioned ? "pdga" : "disc_golf_scene") : rawSource;
    // A round rating published by the source (PDGA, or UDisc when the export
    // carries one) is the true rating. We only fall back to the DG Dashboard
    // estimate when the source published nothing. Unsanctioned DGS
    // rows never contribute a rating (mock or otherwise) to any bucket.
    const rr =
      isDgs && !dgsSanctioned
        ? null
        : rawSource === "udisc"
          ? validUdiscRating(officialRating)
          : (officialRating ?? (r.mock_pdga_rating as number | null) ?? null);
    rows.push({
      played_on: String(r.played_on ?? ""),
      round_rating: rr,
      score,
      ssa: r.ssa == null ? null : Number(r.ssa),
      source: normalizedSource,
      format: (r.format as string | null) ?? "singles",
      included: (r.included as boolean | null) ?? null,
      course: (r.course_name as string | null) ?? null,
      to_par: r.to_par == null ? null : Number(r.to_par),
    });
  };
  extRows.forEach(pushExt);

  // Native rounds store a course id; imported rounds store the course name.
  // The DGD home/away component groups by course, so resolve ids to names
  // here — otherwise one physical course counts as two different places.
  const nativeRows = nativeRes.data ?? [];
  const courseIds = Array.from(
    new Set(
      nativeRows.map((r) => (r.course_id as string | null) ?? null).filter((x): x is string => !!x),
    ),
  );
  const courseNames = new Map<string, string>();
  if (courseIds.length > 0) {
    const namesRes = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (col: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
          };
        };
      }
    )
      .from("courses")
      .select("id, name")
      .in("id", courseIds);
    for (const c of namesRes.data ?? []) {
      const name = String((c.name as string | null) ?? "").trim();
      if (name) courseNames.set(String(c.id), name);
    }
  }

  for (const r of nativeRows) {
    const strokes = (r.total_strokes as number | null) ?? null;
    const par = (r.par_total as number | null) ?? null;
    const scratch = (r.scratch_rating as number | null) ?? null;
    let ssa: number | null = null;
    if (scratch != null && par != null) {
      const sv = (r.stroke_value as number | null) ?? 10;
      ssa = par + (1000 - scratch) / sv;
    }
    const courseId = (r.course_id as string | null) ?? null;
    rows.push({
      played_on: String(r.created_at ?? "").slice(0, 10),
      round_rating: (r.round_rating as number | null) ?? null,
      score: strokes,
      ssa,
      stroke_value: (r.stroke_value as number | null) ?? null,
      source: "app",
      course: (courseId ? courseNames.get(courseId) : null) ?? courseId,
      to_par: (r.score_to_par as number | null) ?? null,
    });
  }
  return rows;
}

export const getRatingSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        source: z.enum(["pdga", "udisc", "chainlink"]).nullish(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: Parameters<typeof fetchAllRounds>[0];
      userId: string;
    };
    const source = data.source ?? null;
    const rounds = await fetchAllRounds(supabase, userId, source);
    const current = computeRating(rounds);
    const nextUpdate = nextPdgaUpdateDate();
    const projected = projectRating(rounds, nextUpdate);
    const prevUpdate = previousPdgaUpdateDate();
    const sinceLast = rounds.filter(
      (r) => new Date(r.played_on).getTime() > prevUpdate.getTime(),
    ).length;

    // Only the PDGA source is allowed to display the "Official" rating.
    // UDisc and DG Dashboard views must render their engine value only —
    // they are projections/estimates, never official.
    let displayRating: number | null = current.rating;
    let displaySource: string = current.source;
    let udiscCounts: { imported: number; nativeRated: number } | null = null;
    let official: number | null = null;
    let udiscNative: {
      rating: number | null;
      usedRounds: number;
      bestRound: number | null;
      average: number | null;
    } | null = null;
    if (source == null || source === "pdga") {
      const profileRes = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              eq: (
                k: string,
                v: string,
              ) => {
                maybeSingle: () => Promise<{ data: { pdga_rating: number | null } | null }>;
              };
            };
          };
        }
      )
        .from("profiles")
        .select("pdga_rating")
        .eq("id", userId)
        .maybeSingle();
      official = profileRes.data?.pdga_rating ?? null;
      if (official != null) {
        displayRating = official;
        displaySource = "pdga_official";
      }
    } else if (source === "udisc") {
      // UDisc publishes its own round ratings. Whenever those come through on
      // an import they are the true rating for the round — DG Dashboard only
      // estimates when UDisc published nothing.
      const publishedRes = await (
        supabase as unknown as {
          from: (t: string) => {
            select: (
              c: string,
              o: { count: "exact"; head: true },
            ) => {
              eq: (
                k: string,
                v: string,
              ) => {
                eq: (
                  k: string,
                  v: string,
                ) => {
                  not: (k: string, op: string, v: null) => Promise<{ count: number | null }>;
                };
              };
            };
          };
        }
      )
        .from("external_rounds")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source", "udisc")
        .not("round_rating", "is", null);
      const publishedCount = publishedRes.count ?? 0;
      const importedRes = (await (supabase as any)
        .from("external_rounds")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("source", "udisc")) as { count: number | null };
      udiscCounts = { imported: importedRes.count ?? 0, nativeRated: publishedCount };
      displaySource = publishedCount > 0 ? "udisc_official" : "udisc_estimate";
      // UDisc ratings live on UDisc's own scale (~150–300). Never run them
      // through the PDGA-style engine, which also estimates unrated rounds on
      // the PDGA scale. Rating = best 8 of the latest 20 native UDisc ratings.
      const native = rounds
        .filter((r) => r.round_rating != null && r.round_rating > 0 && r.round_rating < 400)
        .sort((a, b) => (a.played_on < b.played_on ? 1 : -1));
      const latest = native.slice(0, 20).map((r) => r.round_rating as number);
      const best8 = [...latest].sort((a, b) => b - a).slice(0, 8);
      udiscNative = native.length
        ? {
            rating: Math.round(best8.reduce((a, b) => a + b, 0) / best8.length),
            usedRounds: best8.length,
            bestRound: Math.max(...native.map((r) => r.round_rating as number)),
            average: Math.round(
              native.reduce((a, r) => a + (r.round_rating as number), 0) / native.length,
            ),
          }
        : { rating: null, usedRounds: 0, bestRound: null, average: null };
      displayRating = udiscNative.rating;
    } else if (source === "chainlink") {
      displaySource = "chainlink_estimate";
    }

    return {
      source,
      current: {
        rating: displayRating,
        usedRounds: udiscNative?.usedRounds ?? current.usedRounds,
        bestRound: udiscNative ? udiscNative.bestRound : current.bestRound,
        average: udiscNative ? udiscNative.average : current.average,
        source: displaySource,
        computed: current.rating,
        official,
      },
      projected: {
        rating: projected.rating,
        // The delta must compare like with like. The official PDGA number and
        // our engine value sit on slightly different baselines, so a projection
        // is only ever measured against the engine value that produced it.
        delta:
          current.rating != null && projected.rating != null
            ? projected.rating - current.rating
            : null,
        baseline: current.rating,
      },
      usesOfficialRating: displaySource === "pdga_official" || displaySource === "udisc_official",
      udiscCounts,
      nextUpdateIso: nextUpdate.toISOString(),
      prevUpdateIso: prevUpdate.toISOString(),
      roundsSinceLastUpdate: sinceLast,
      sparkline: current.rounds
        .slice(0, 25)
        .reverse()
        .map((r) => ({ date: r.played_on, rating: r.rating, source: r.source })),
    };
  });

/**
 * Return PDGA, UDisc, and DG ratings side-by-side.
 *
 * The DG Dashboard layer looks at your in-app rated rounds where at least one
 * other rated player was on the card and adjusts the blended PDGA+UDisc
 * base by how you performed vs those opponents. Capped at +/- 25 pts.
 */
export const getAllRatings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase: sb, userId } = context as unknown as {
      supabase: unknown;
      userId: string;
    };
    const supabase = sb as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => Promise<{ data: AnyRow[] | null }>;
          in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
        };
      };
    };

    const rounds = await fetchAllRounds(
      supabase as unknown as Parameters<typeof fetchAllRounds>[0],
      userId,
    );

    const pdgaComputed = computePdgaRating(rounds);
    const udiscEmpty = {
      rating: null,
      usedRounds: 0,
      droppedLow: 0,
      bestRound: null,
      worstRound: null,
      average: null,
      windowMonths: 12,
      verified: "insufficient" as const,
      rounds: [],
    };
    const blended = computeRating(rounds);
    const blendedAsSingle = {
      rating: blended.rating,
      usedRounds: blended.usedRounds,
      droppedLow: blended.droppedLow,
      bestRound: blended.bestRound,
      worstRound: blended.worstRound,
      average: blended.average,
      windowMonths: blended.windowMonths,
      verified: (blended.usedRounds >= 8
        ? "verified"
        : blended.usedRounds >= 3
          ? "provisional"
          : "insufficient") as "verified" | "provisional" | "insufficient",
      rounds: blended.rounds.map((r) => ({ played_on: r.played_on, rating: r.rating })),
    };

    // ---- Official PDGA rating (source of truth) --------------------
    // Prefer the value PDGA publishes on the player's profile over any
    // in-app recomputation. Falls back to our computed number only when
    // the official rating hasn't been synced yet.
    const profileRes = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              maybeSingle: () => Promise<{ data: { pdga_rating: number | null } | null }>;
            };
          };
        };
      }
    )
      .from("profiles")
      .select("pdga_rating")
      .eq("id", userId)
      .maybeSingle();
    const officialPdga = profileRes.data?.pdga_rating ?? null;

    const pdga =
      officialPdga != null
        ? {
            ...pdgaComputed,
            rating: officialPdga,
            verified: "verified" as const,
            // Preserve computed breakdowns for context, but flag as official
            average: pdgaComputed.average,
          }
        : pdgaComputed;

    // -------- Head-to-head samples anchored by opponent PDGA ratings ----
    const myRatedRes = await boundedQuery(
      supabase,
      "round_ratings",
      "round_id, round_rating, created_at",
    )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(STATS_LIMITS.rounds);
    const myRated = (myRatedRes.data ?? []) as Array<{
      round_id: string;
      round_rating: number;
      created_at: string;
    }>;

    const h2h: HeadToHeadSample[] = [];
    if (myRated.length > 0) {
      const roundIds = myRated.map((r) => r.round_id);
      const othersRes = await boundedQuery(
        supabase,
        "round_ratings",
        "round_id, user_id, round_rating",
      )
        .in("round_id", roundIds)
        .limit(STATS_LIMITS.holeScores);
      const othersRows = (othersRes.data ?? []) as Array<{
        round_id: string;
        user_id: string | null;
        round_rating: number;
      }>;

      const opponentIds = Array.from(
        new Set(
          othersRows
            .filter((r) => r.user_id && r.user_id !== userId)
            .map((r) => r.user_id as string),
        ),
      );

      const pdgaByUser = new Map<string, number>();
      if (opponentIds.length > 0) {
        const profRes = await (
          supabase as unknown as {
            from: (t: string) => {
              select: (c: string) => {
                in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
              };
            };
          }
        )
          .from("profiles")
          .select("id, pdga_rating")
          .in("id", opponentIds);
        for (const row of (profRes.data ?? []) as Array<{
          id: string;
          pdga_rating: number | null;
        }>) {
          if (row.pdga_rating != null) pdgaByUser.set(row.id, row.pdga_rating);
        }
      }

      const byRound = new Map<string, Array<{ roundRating: number; pdga: number }>>();
      for (const row of othersRows) {
        if (!row.user_id || row.user_id === userId) continue;
        const pdga = pdgaByUser.get(row.user_id);
        if (pdga == null) continue; // require a PDGA-rated opponent
        const list = byRound.get(row.round_id) ?? [];
        list.push({ roundRating: row.round_rating, pdga });
        byRound.set(row.round_id, list);
      }
      for (const mine of myRated) {
        const opps = byRound.get(mine.round_id);
        if (!opps || opps.length === 0) continue;
        const avgRR = opps.reduce((s, v) => s + v.roundRating, 0) / opps.length;
        const avgPd = opps.reduce((s, v) => s + v.pdga, 0) / opps.length;
        h2h.push({
          myRoundRating: mine.round_rating,
          opponentAvgRoundRating: avgRR,
          opponentAvgPdga: avgPd,
          opponentCount: opps.length,
          playedOn: mine.created_at.slice(0, 10),
        });
      }
    }

    // -------- Extended H2H from external (PDGA + UDisc) rounds ---------
    // The DGD Rating is compiled from ALL rounds in the app. When multiple
    // users have imported rounds from the same PDGA event, we can build a
    // head-to-head sample directly from those external rounds, anchored on
    // any opponents whose official PDGA rating we know.
    try {
      const myExtRes = await boundedQuery(
        supabase,
        "external_rounds",
        "pdga_event_ref, round_rating, mock_pdga_rating, played_on",
      )
        .eq("user_id", userId)
        .not("pdga_event_ref", "is", null)
        .order("played_on", { ascending: false })
        .limit(STATS_LIMITS.rounds);
      const myExt = (myExtRes.data ?? []) as Array<{
        pdga_event_ref: string | null;
        round_rating: number | null;
        mock_pdga_rating: number | null;
        played_on: string;
      }>;
      const eventRefs = Array.from(
        new Set(myExt.map((r) => r.pdga_event_ref).filter((v): v is string => !!v)),
      );
      if (eventRefs.length > 0) {
        const oppRes = await boundedQuery(
          supabase,
          "external_rounds",
          "pdga_event_ref, user_id, round_rating, mock_pdga_rating",
        )
          .in("pdga_event_ref", eventRefs)
          .neq("user_id", userId)
          .limit(STATS_LIMITS.holeScores);

        const oppRows = (oppRes.data ?? []) as Array<{
          pdga_event_ref: string | null;
          user_id: string | null;
          round_rating: number | null;
          mock_pdga_rating: number | null;
        }>;
        const oppIds = Array.from(
          new Set(oppRows.map((r) => r.user_id).filter((v): v is string => !!v)),
        );
        const pdgaByUser = new Map<string, number>();
        if (oppIds.length > 0) {
          const profRes = await (
            supabase as unknown as {
              from: (t: string) => {
                select: (c: string) => {
                  in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
                };
              };
            }
          )
            .from("profiles")
            .select("id, pdga_rating")
            .in("id", oppIds);
          for (const row of (profRes.data ?? []) as Array<{
            id: string;
            pdga_rating: number | null;
          }>) {
            if (row.pdga_rating != null) pdgaByUser.set(row.id, row.pdga_rating);
          }
        }
        const byEvent = new Map<string, Array<{ roundRating: number; pdga: number }>>();
        for (const r of oppRows) {
          if (!r.pdga_event_ref || !r.user_id) continue;
          const pdga = pdgaByUser.get(r.user_id);
          if (pdga == null) continue;
          const rr = r.round_rating ?? r.mock_pdga_rating;
          if (rr == null) continue;
          const list = byEvent.get(r.pdga_event_ref) ?? [];
          list.push({ roundRating: rr, pdga });
          byEvent.set(r.pdga_event_ref, list);
        }
        for (const mine of myExt) {
          if (!mine.pdga_event_ref) continue;
          const myRR = mine.round_rating ?? mine.mock_pdga_rating;
          if (myRR == null) continue;
          const opps = byEvent.get(mine.pdga_event_ref);
          if (!opps || opps.length === 0) continue;
          const avgRR = opps.reduce((s, v) => s + v.roundRating, 0) / opps.length;
          const avgPd = opps.reduce((s, v) => s + v.pdga, 0) / opps.length;
          h2h.push({
            myRoundRating: myRR,
            opponentAvgRoundRating: avgRR,
            opponentAvgPdga: avgPd,
            opponentCount: opps.length,
            playedOn: mine.played_on,
          });
        }
      }
    } catch {
      // External H2H is additive — never fail the whole rating on this branch.
    }

    const chainlink = computeDgdRating(pdga, udiscEmpty, h2h, blendedAsSingle);

    return { pdga, chainlink, pdgaOfficial: officialPdga, pdgaComputed: pdgaComputed.rating };
  });

export const getTargetPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { targetRating: number; remainingRounds: number }) => ({
    targetRating: Math.max(500, Math.min(1100, Math.round(input.targetRating))),
    remainingRounds: Math.max(1, Math.min(50, Math.round(input.remainingRounds))),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: Parameters<typeof fetchAllRounds>[0];
      userId: string;
    };
    const rounds = await fetchAllRounds(supabase, userId);
    return planTarget(rounds, data.targetRating, data.remainingRounds);
  });

export const getScoringStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        courseId: z.string().uuid().nullish(),
        from: z.string().max(30).nullish(),
        to: z.string().max(30).nullish(),
        source: z.enum(["pdga", "udisc", "chainlink"]).nullish(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };

    // Pull round ids for this user with optional filters
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => { data: AnyRow[] | null; error: unknown } & Record<string, unknown>;
        };
      };
    };
    const roundsRes = await boundedQuery(
      supabase,
      "rounds",
      "id, course_id, layout_id, created_by, started_at",
    )
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(STATS_LIMITS.rounds);
    let rows = (roundsRes.data ?? []) as Array<{
      id: string;
      course_id: string | null;
      layout_id: string | null;
      started_at: string | null;
    }>;
    if (data.courseId) rows = rows.filter((r) => r.course_id === data.courseId);
    if (data.from) rows = rows.filter((r) => (r.started_at ?? "") >= data.from!);
    if (data.to) rows = rows.filter((r) => (r.started_at ?? "") <= data.to!);
    const roundIds = rows.map((r) => r.id);

    // ---- Hole-level summary (native scored rounds) --------------------
    // Native (DG Dashboard) scoring rounds only appear when the caller
    // wants "chainlink" or hasn't specified a source. UDisc/PDGA scoring
    // views intentionally show 0 hole-by-hole data because those sources
    // are imports, not live-scored inside the app.
    const includeNativeScoring = data.source == null || data.source === "chainlink";
    let holeSummary = summarizeScores([]);
    let courseCount = 0;
    // Partial-data signals: holes with a stroke recorded vs. holes whose layout
    // has no par on file (those can't be graded birdie/par/bogey).
    let holesScored = 0;
    let holesMissingPar = 0;

    if (includeNativeScoring && roundIds.length > 0) {
      const scoresRes = await boundedQuery(
        supabase,
        "round_scores",
        "round_id, hole_number, strokes, putts, penalties",
      )
        .in("round_id", roundIds)
        .limit(STATS_LIMITS.holeScores);
      const scoreRows = (scoresRes.data ?? []) as Array<{
        round_id: string;
        hole_number: number;
        strokes: number | null;
        putts: number | null;
        penalties: number | null;
      }>;

      courseCount = new Set(rows.map((r) => r.course_id).filter((x): x is string => !!x)).size;
      // Pars come from the layout that was played (holes.layout_id + number).
      const layoutIds = Array.from(
        new Set(rows.map((r) => r.layout_id).filter((x): x is string => !!x)),
      );
      const holesRes = layoutIds.length
        ? await boundedQuery(supabase, "holes", "layout_id, number, par").in("layout_id", layoutIds)
        : { data: [] as AnyRow[] };
      const parLookup = new Map<string, number>();
      for (const h of (holesRes.data ?? []) as Array<{
        layout_id: string;
        number: number;
        par: number;
      }>) {
        parLookup.set(`${h.layout_id}:${h.number}`, h.par);
      }
      const roundToLayout = new Map(rows.map((r) => [r.id, r.layout_id]));
      const scored: HoleScore[] = scoreRows.map((s) => {
        const layoutId = roundToLayout.get(s.round_id) ?? null;
        const par = layoutId ? (parLookup.get(`${layoutId}:${s.hole_number}`) ?? null) : null;
        if (s.strokes != null) {
          holesScored++;
          if (par == null) holesMissingPar++;
        }
        return { strokes: s.strokes, putts: s.putts, penalties: s.penalties, par };
      });
      holeSummary = summarizeScores(scored);
    }

    // ---- Rated-round summary (external + native round_ratings) ---------
    // Wires PDGA + UDisc + DG Dashboard rated rounds into StatLink scoring so
    // total volume, best/worst rating, and to-par extremes are visible even
    // when hole-by-hole data isn't captured.
    const engineRounds = await fetchAllRounds(
      supabase as unknown as Parameters<typeof fetchAllRounds>[0],
      userId,
      data.source ?? null,
      // Scoring counts every singles round on file — PDGA's rating window
      // decides PDGA ratings, not what you've played.
      { keepOutsideWindow: true, max: 3000 },
    );
    const bySource: Record<string, number> = {};
    const ratings: number[] = [];
    const toPars: number[] = [];
    let bestRating: number | null = null;
    let worstRating: number | null = null;
    let bestToPar: number | null = null;
    let worstToPar: number | null = null;
    let lastPlayed: string | null = null;
    let ratedCount = 0;
    const playedCourses = new Set<string>();
    for (const r of engineRounds) {
      const src = r.source ?? "app";
      bySource[src] = (bySource[src] ?? 0) + 1;
      if (r.course) playedCourses.add(r.course.trim().toLowerCase());
      if (r.round_rating != null && r.round_rating > 0) {
        ratedCount++;
        ratings.push(r.round_rating);
        bestRating = bestRating == null ? r.round_rating : Math.max(bestRating, r.round_rating);
        worstRating = worstRating == null ? r.round_rating : Math.min(worstRating, r.round_rating);
      }
      // Score to par as recorded by the source (falls back to score − SSA).
      const tp =
        r.to_par != null && Number.isFinite(r.to_par)
          ? r.to_par
          : r.score != null && r.ssa != null
            ? r.score - r.ssa
            : null;
      if (tp != null) {
        toPars.push(tp);
        bestToPar = bestToPar == null ? tp : Math.min(bestToPar, tp);
        worstToPar = worstToPar == null ? tp : Math.max(worstToPar, tp);
      }
      if (r.played_on && (lastPlayed == null || r.played_on > lastPlayed)) lastPlayed = r.played_on;
    }
    const avgRating = ratings.length
      ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length)
      : null;
    const avgToPar = toPars.length
      ? +(toPars.reduce((s, v) => s + v, 0) / toPars.length).toFixed(1)
      : null;
    if (!includeNativeScoring || courseCount === 0) courseCount = playedCourses.size;

    return {
      source: data.source ?? null,
      summary: holeSummary,
      courseCount,
      roundCount: includeNativeScoring ? roundIds.length : 0,
      holesScored,
      holesMissingPar,

      rated: {
        // Native rounds without a rating still count as rounds played.
        total: data.source === "chainlink" ? Math.max(engineRounds.length, roundIds.length) : engineRounds.length,
        ratedCount,
        toParRounds: toPars.length,
        bySource,
        avgRating,
        bestRating,
        worstRating,
        avgToPar,
        bestToPar: bestToPar != null ? +bestToPar.toFixed(1) : null,
        worstToPar: worstToPar != null ? +worstToPar.toFixed(1) : null,
        lastPlayed,
      },
    };
  });

/**
 * Career shot stats — aggregates the detailed shot-tracking columns on
 * `round_scores` across every round the user has scored in DG Dashboard.
 * Powers the "Career shot tracking" section on the Stats > Scoring tab.
 */
export const getShotStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        from: z.string().max(30).nullish(),
        to: z.string().max(30).nullish(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (
            k: string,
            v: string,
          ) => Promise<{ data: AnyRow[] | null }> & Record<string, unknown>;
          in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
        };
      };
    };

    const roundsRes = await boundedQuery(supabase, "rounds", "id, started_at")
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(STATS_LIMITS.rounds);
    let rounds = (roundsRes.data ?? []) as Array<{ id: string; started_at: string | null }>;
    if (data.from) rounds = rounds.filter((r) => (r.started_at ?? "") >= data.from!);
    if (data.to) rounds = rounds.filter((r) => (r.started_at ?? "") <= data.to!);
    const roundIds = rounds.map((r) => r.id);

    const empty = {
      holesLogged: 0,
      roundsLogged: 0,
      fairwayPct: null as number | null,
      c1RegPct: null as number | null,
      c2RegPct: null as number | null,
      c1PuttPct: null as number | null,
      c2PuttPct: null as number | null,
      scramblePct: null as number | null,
      avgDriveFt: null as number | null,
      maxDriveFt: null as number | null,
      topDrivers: [] as Array<{ name: string; count: number }>,
      topPutters: [] as Array<{ name: string; count: number }>,
      lastLoggedOn: null as string | null,
      discsInBag: 0,
    };
    if (roundIds.length === 0) return empty;

    const scoresRes = await boundedQuery(
      supabase,
      "round_scores",
      "round_id, fairway_hit, c1_in_reg, c2_in_reg, scramble, drive_distance_ft, drive_disc_id, putt_disc_id, c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed",
    )
      .in("round_id", roundIds)
      .limit(STATS_LIMITS.holeScores);
    const shots = (scoresRes.data ?? []) as Array<{
      round_id: string;
      fairway_hit: boolean | null;
      c1_in_reg: boolean | null;
      c2_in_reg: boolean | null;
      scramble: boolean | null;
      drive_distance_ft: number | null;
      drive_disc_id: string | null;
      putt_disc_id: string | null;
      c1_putts_made: number | null;
      c1_putts_missed: number | null;
      c2_putts_made: number | null;
      c2_putts_missed: number | null;
    }>;

    if (shots.length === 0) return empty;

    let fwHit = 0,
      fwTot = 0;
    let c1Hit = 0,
      c1Tot = 0;
    let c2Hit = 0,
      c2Tot = 0;
    let scrHit = 0,
      scrTot = 0;
    let c1PM = 0,
      c1PT = 0;
    let c2PM = 0,
      c2PT = 0;
    let driveSum = 0,
      driveN = 0,
      driveMax = 0;
    const driveCounts = new Map<string, number>();
    const puttCounts = new Map<string, number>();
    const loggedRounds = new Set<string>();
    let holesLogged = 0;

    for (const s of shots) {
      let hasSignal = false;
      if (s.fairway_hit != null) {
        fwTot++;
        if (s.fairway_hit) fwHit++;
        hasSignal = true;
      }
      if (s.c1_in_reg != null) {
        c1Tot++;
        if (s.c1_in_reg) c1Hit++;
        hasSignal = true;
      }
      if (s.c2_in_reg != null) {
        c2Tot++;
        if (s.c2_in_reg) c2Hit++;
        hasSignal = true;
      }
      if (s.scramble != null) {
        scrTot++;
        if (s.scramble) scrHit++;
        hasSignal = true;
      }
      const c1m = s.c1_putts_made ?? 0,
        c1x = s.c1_putts_missed ?? 0;
      if (c1m + c1x > 0) {
        c1PM += c1m;
        c1PT += c1m + c1x;
        hasSignal = true;
      }
      const c2m = s.c2_putts_made ?? 0,
        c2x = s.c2_putts_missed ?? 0;
      if (c2m + c2x > 0) {
        c2PM += c2m;
        c2PT += c2m + c2x;
        hasSignal = true;
      }
      if (s.drive_distance_ft != null && s.drive_distance_ft > 0) {
        driveSum += s.drive_distance_ft;
        driveN++;
        if (s.drive_distance_ft > driveMax) driveMax = s.drive_distance_ft;
        hasSignal = true;
      }
      if (s.drive_disc_id) {
        driveCounts.set(s.drive_disc_id, (driveCounts.get(s.drive_disc_id) ?? 0) + 1);
        hasSignal = true;
      }
      if (s.putt_disc_id) {
        puttCounts.set(s.putt_disc_id, (puttCounts.get(s.putt_disc_id) ?? 0) + 1);
        hasSignal = true;
      }
      if (hasSignal) {
        holesLogged++;
        loggedRounds.add(s.round_id);
      }
    }

    // Disc ids on round_scores reference the player's bag (user_discs), not a
    // global disc table. Resolve the display name from the linked mold and
    // fall back to the player's own nickname.
    const discIds = Array.from(new Set([...driveCounts.keys(), ...puttCounts.keys()]));
    const discNames = new Map<string, string>();
    if (discIds.length > 0) {
      const discRes = await client
        .from("user_discs")
        .select("id, nickname, mold:disc_molds(name)")
        .in("id", discIds);
      for (const d of (discRes.data ?? []) as Array<{
        id: string;
        nickname: string | null;
        mold: { name: string | null } | Array<{ name: string | null }> | null;
      }>) {
        const mold = Array.isArray(d.mold) ? d.mold[0] : d.mold;
        discNames.set(d.id, mold?.name ?? d.nickname ?? "Unnamed disc");
      }
    }
    const rank = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([id, count]) => ({ name: discNames.get(id) ?? "Retired disc", count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Provenance: the most recent round that actually carries shot signal, and
    // whether the player has a bag at all (drives the "link your bag" state).
    let lastLoggedOn: string | null = null;
    for (const r of rounds) {
      if (!loggedRounds.has(r.id) || !r.started_at) continue;
      if (lastLoggedOn == null || r.started_at > lastLoggedOn) lastLoggedOn = r.started_at;
    }
    const bagRes = await boundedQuery(supabase, "user_discs", "id")
      .eq("user_id", userId)
      .limit(200);
    const discsInBag = (bagRes.data ?? []).length;

    const pct = (hit: number, tot: number) =>
      tot > 0 ? Math.round((hit / tot) * 1000) / 10 : null;

    return {
      holesLogged,
      roundsLogged: loggedRounds.size,
      fairwayPct: pct(fwHit, fwTot),
      c1RegPct: pct(c1Hit, c1Tot),
      c2RegPct: pct(c2Hit, c2Tot),
      c1PuttPct: pct(c1PM, c1PT),
      c2PuttPct: pct(c2PM, c2PT),
      scramblePct: pct(scrHit, scrTot),
      avgDriveFt: driveN > 0 ? Math.round(driveSum / driveN) : null,
      maxDriveFt: driveMax > 0 ? driveMax : null,
      topDrivers: rank(driveCounts),
      topPutters: rank(puttCounts),
      lastLoggedOn,
      discsInBag,
    };
  });

/**
 * Skill Engine (Phase 6)
 * Hole-level scoring aggregated by par + distance bucket, plus derived
 * "rating leaks" (categories where the user gives back the most strokes vs
 * an elite baseline). Powers the Skill tab in StatLink.
 */
export const getSkillEngine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        courseId: z.string().uuid().nullish(),
        from: z.string().max(30).nullish(),
        to: z.string().max(30).nullish(),
        source: z.enum(["pdga", "udisc", "chainlink"]).nullish(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };
    // Skill engine is a hole-by-hole analyzer. It can only run on rounds
    // scored inside DG Dashboard, so any non-chainlink source is empty.
    if (data.source === "pdga" || data.source === "udisc") {
      return buildSkillReport([], 0);
    }
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => { data: AnyRow[] | null } & Record<string, unknown>;
          in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
        };
      };
    };

    const roundsRes = await boundedQuery(supabase, "rounds", "id, course_id, layout_id, started_at")
      .eq("created_by", userId)
      .order("started_at", { ascending: false })
      .limit(STATS_LIMITS.rounds);
    let rows = (roundsRes.data ?? []) as Array<{
      id: string;
      course_id: string | null;
      layout_id: string | null;
      started_at: string | null;
    }>;
    if (data.courseId) rows = rows.filter((r) => r.course_id === data.courseId);
    if (data.from) rows = rows.filter((r) => (r.started_at ?? "") >= data.from!);
    if (data.to) rows = rows.filter((r) => (r.started_at ?? "") <= data.to!);
    const roundIds = rows.map((r) => r.id);

    if (roundIds.length === 0) {
      return buildSkillReport([], 0);
    }

    const scoresRes = await boundedQuery(
      supabase,
      "round_scores",
      "round_id, hole_number, strokes, putts, penalties",
    )
      .in("round_id", roundIds)
      .limit(STATS_LIMITS.holeScores);
    const scoreRows = (scoresRes.data ?? []) as Array<{
      round_id: string;
      hole_number: number;
      strokes: number | null;
      putts: number | null;
      penalties: number | null;
    }>;

    // Par and distance live on `holes`, keyed by layout_id + number — a round's
    // layout, not its course, decides the pars that were actually played.
    const layoutIds = Array.from(
      new Set(rows.map((r) => r.layout_id).filter((x): x is string => !!x)),
    );
    const holesRes = layoutIds.length
      ? await boundedQuery(supabase, "holes", "layout_id, number, par, distance_ft").in(
          "layout_id",
          layoutIds,
        )
      : { data: [] as AnyRow[] };
    const holeLookup = new Map<string, { par: number; distance_ft: number | null }>();
    for (const h of (holesRes.data ?? []) as Array<{
      layout_id: string;
      number: number;
      par: number;
      distance_ft: number | null;
    }>) {
      holeLookup.set(`${h.layout_id}:${h.number}`, { par: h.par, distance_ft: h.distance_ft });
    }
    const roundToLayout = new Map(rows.map((r) => [r.id, r.layout_id]));

    const scored: SkillHole[] = scoreRows.map((s) => {
      const layoutId = roundToLayout.get(s.round_id) ?? null;
      const lookup = layoutId ? holeLookup.get(`${layoutId}:${s.hole_number}`) : null;
      return {
        strokes: s.strokes,
        putts: s.putts,
        penalties: s.penalties,
        par: lookup?.par ?? null,
        distance_ft: lookup?.distance_ft ?? null,
      };
    });

    // Distinct scored rounds (a round only counts if it has any strokes recorded).
    const distinctRounds = new Set(
      scoreRows.filter((s) => s.strokes != null).map((s) => s.round_id),
    ).size;
    return buildSkillReport(scored, distinctRounds);
  });

export const getCourseBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        source: z.enum(["pdga", "udisc", "chainlink"]).nullish(),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };
    const source = data.source ?? null;
    const includeNative = source == null || source === "chainlink";
    const includeExternal = source == null || source === "pdga" || source === "udisc";
    // Course Book outside the switcher = PDGA rounds + native DG Dashboard
    // rounds. UDisc imports only appear when the switcher asks for them.
    // With no switcher choice, the Course Book shows every import source —
    // UDisc rounds are courses the player really played.
    const extSourceFilter: readonly string[] =
      source === "udisc"
        ? ["udisc"]
        : source === "pdga"
          ? ["pdga", "disc_golf_scene"]
          : ["pdga", "disc_golf_scene", "udisc"];

    const ratingsClient = supabase as {
      from: (t: string) => {
        select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: AnyRow[] | null }> };
      };
    };
    type NativeRow = {
      course_id: string | null;
      layout_id?: string | null;
      round_rating: number | null;
      total_strokes: number | null;
      par_total: number | null;
      score_to_par: number | null;
      created_at: string;
    };
    let rows: NativeRow[] = [];
    if (includeNative) {
      const ratingsRes = await boundedQuery(
        supabase,
        "round_ratings",
        "course_id, layout_id, round_rating, total_strokes, par_total, score_to_par, created_at",
      )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(STATS_LIMITS.rounds);
      rows = (ratingsRes.data ?? []) as NativeRow[];
    }
    const byCourse = new Map<
      string,
      {
        course_id: string;
        rounds: number;
        bestScore: number | null;
        avgToPar: number | null;
        avgRating: number | null;
        bestRating: number | null;
        lastPlayed: string;
      }
    >();
    for (const r of rows) {
      if (!r.course_id) continue;
      const bucket = byCourse.get(r.course_id) ?? {
        course_id: r.course_id,
        rounds: 0,
        bestScore: null,
        avgToPar: null,
        avgRating: null,
        bestRating: null,
        lastPlayed: r.created_at,
      };
      bucket.rounds++;
      if (r.total_strokes != null)
        bucket.bestScore =
          bucket.bestScore == null ? r.total_strokes : Math.min(bucket.bestScore, r.total_strokes);
      if (r.round_rating != null)
        bucket.bestRating =
          bucket.bestRating == null ? r.round_rating : Math.max(bucket.bestRating, r.round_rating);
      if (r.created_at > bucket.lastPlayed) bucket.lastPlayed = r.created_at;
      byCourse.set(r.course_id, bucket);
    }
    // Compute averages
    const perCourseRows = new Map<string, Array<(typeof rows)[number]>>();
    for (const r of rows) {
      if (!r.course_id) continue;
      const list = perCourseRows.get(r.course_id) ?? [];
      list.push(r);
      perCourseRows.set(r.course_id, list);
    }
    for (const [id, list] of perCourseRows) {
      const bucket = byCourse.get(id);
      if (!bucket) continue;
      const ratings = list.map((x) => x.round_rating).filter((x): x is number => x != null);
      const tp = list.map((x) => x.score_to_par).filter((x): x is number => x != null);
      bucket.avgRating = ratings.length
        ? Math.round(ratings.reduce((s, v) => s + v, 0) / ratings.length)
        : null;
      bucket.avgToPar = tp.length ? +(tp.reduce((s, v) => s + v, 0) / tp.length).toFixed(1) : null;
    }

    // Attach course names
    const ids = Array.from(byCourse.keys());
    type CourseRow = {
      course_id: string;
      rounds: number;
      bestScore: number | null;
      avgToPar: number | null;
      avgRating: number | null;
      bestRating: number | null;
      lastPlayed: string;
      name?: string | null;
      city?: string | null;
      region?: string | null;
      source: "app" | "pdga" | "udisc" | "mixed" | "event";
      layouts?: LayoutBreakdown[];
    };
    const nameLookup = new Map<
      string,
      { name: string; city: string | null; region: string | null }
    >();
    if (ids.length > 0) {
      const coursesClient = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
          };
        };
      };
      const namesRes = await coursesClient
        .from("courses")
        .select("id, name, city, region")
        .in("id", ids);
      for (const c of (namesRes.data ?? []) as Array<{
        id: string;
        name: string;
        city: string | null;
        region: string | null;
      }>) {
        nameLookup.set(c.id, { name: c.name, city: c.city, region: c.region });
      }
    }
    const nativeCourses: CourseRow[] = Array.from(byCourse.values()).map((c) => ({
      ...c,
      ...nameLookup.get(c.course_id),
      source: "app" as const,
    }));

    // ---- External rounds (PDGA + UDisc) aggregated by course_name -----
    // PDGA imports often have no course on the round: the importer falls back
    // to the event name, so course_name === event_name means "course unknown".
    // Those rows are events, not courses, and must not become course book rows.
    type ExtRow = {
      source: string | null;
      course_name: string | null;
      event_name?: string | null;
      played_on: string;
      round_rating: number | null;
      score: number | null;
      to_par: number | null;
      layout_name?: string | null;
    };
    let extRows: ExtRow[] = [];
    if (includeExternal) {
      const extClient = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => Promise<{ data: AnyRow[] | null }> & {
              in: (k: string, v: readonly string[]) => Promise<{ data: AnyRow[] | null }>;
            };
          };
        };
      };
      const res = await boundedQuery(
        supabase,
        "external_rounds",
        "source, course_name, event_name, layout_name, division, played_on, round_rating, score, to_par, format, included",
      )
        .eq("user_id", userId)
        .in("source", extSourceFilter)
        .order("played_on", { ascending: false })
        .limit(STATS_LIMITS.rounds);
      const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
      extRows = ((res.data ?? []) as ExtRow[]).filter(
        (r) =>
          isSinglesExternalRound(r as unknown as Parameters<typeof isSinglesExternalRound>[0]) &&
          (r as unknown as { included?: boolean | null }).included !== false &&
          // Drop rows where the "course" is really the event name.
          !(norm(r.event_name) !== "" && norm(r.course_name) === norm(r.event_name)),
      );
    }
    const byExt = new Map<string, CourseRow & { _sources: Set<string> }>();
    for (const r of extRows) {
      const name = (r.course_name ?? "").trim();
      if (!name) continue;
      const key = `ext:${name.toLowerCase()}`;
      const existing = byExt.get(key) ?? {
        course_id: key,
        rounds: 0,
        bestScore: null,
        avgToPar: null,
        avgRating: null,
        bestRating: null,
        lastPlayed: r.played_on,
        name,
        city: null,
        region: null,
        source: (r.source as CourseRow["source"]) ?? "app",
        _sources: new Set<string>(),
      };
      existing.rounds++;
      existing._sources.add(r.source ?? "app");
      if (r.score != null && r.score > 0)
        existing.bestScore =
          existing.bestScore == null ? r.score : Math.min(existing.bestScore, r.score);
      if (r.round_rating != null)
        existing.bestRating =
          existing.bestRating == null
            ? r.round_rating
            : Math.max(existing.bestRating, r.round_rating);
      if (r.played_on > existing.lastPlayed) existing.lastPlayed = r.played_on;
      byExt.set(key, existing);
    }
    // Averages for external
    const extPer = new Map<string, typeof extRows>();
    for (const r of extRows) {
      const name = (r.course_name ?? "").trim();
      if (!name) continue;
      const key = `ext:${name.toLowerCase()}`;
      const list = extPer.get(key) ?? [];
      list.push(r);
      extPer.set(key, list);
    }
    for (const [key, list] of extPer) {
      const bucket = byExt.get(key);
      if (!bucket) continue;
      const rr = list.map((x) => x.round_rating).filter((x): x is number => x != null);
      const tp = list.map((x) => x.to_par).filter((x): x is number => x != null);
      bucket.avgRating = rr.length ? Math.round(rr.reduce((s, v) => s + v, 0) / rr.length) : null;
      bucket.avgToPar = tp.length ? +(tp.reduce((s, v) => s + v, 0) / tp.length).toFixed(1) : null;
      bucket.source =
        bucket._sources.size > 1
          ? "mixed"
          : ((bucket._sources.values().next().value as CourseRow["source"]) ?? "app");
    }
    const extCourses: CourseRow[] = Array.from(byExt.values()).map(
      ({ _sources: _s, ...rest }) => rest,
    );

    // Per-layout, per-source breakdown — course-level numbers mix layouts.
    const nativeLayoutIds = Array.from(
      new Set(rows.map((r) => r.layout_id).filter((x): x is string => !!x)),
    );
    const layoutNames = new Map<string, string>();
    if (nativeLayoutIds.length) {
      const lres = await boundedQuery(supabase, "course_layouts", "id, name").in("id", nativeLayoutIds);
      for (const l of (lres.data ?? []) as Array<{ id: string; name: string | null }>)
        if (l.name) layoutNames.set(l.id, l.name);
    }
    for (const c of nativeCourses) {
      c.layouts = buildLayoutBreakdown(
        (perCourseRows.get(c.course_id) ?? []).map((r) => ({
          layoutKey: r.layout_id ?? null,
          layoutName: r.layout_id ? (layoutNames.get(r.layout_id) ?? null) : null,
          source: "app",
          score: r.total_strokes,
          toPar: r.score_to_par,
          rating: r.round_rating,
          playedOn: r.created_at,
        })),
      );
    }
    for (const c of extCourses) {
      c.layouts = buildLayoutBreakdown(
        (extPer.get(c.course_id) ?? []).map((r) => ({
          layoutKey: null,
          layoutName: r.layout_name?.trim() || null,
          source: (r.source === "udisc" ? "udisc" : "pdga") as LayoutSource,
          score: r.score,
          toPar: r.to_par,
          rating: r.round_rating,
          playedOn: r.played_on,
        })),
      );
    }

    const all = [...nativeCourses, ...extCourses];

    // Courses the player only reached through an event — tournaments they
    // registered for, league nights they signed up for, and PDGA event
    // imports whose round carried no course. Those have no scored round on
    // file here, so they are added once, without score columns.
    if (source == null) {
      const { collectPlayedCourses, normalizeCourseKey } = await import("./played-courses.server");
      const played = await collectPlayedCourses(
        supabase as Parameters<typeof collectPlayedCourses>[0],
        userId,
      );
      const have = new Set(all.map((c) => normalizeCourseKey(c.name ?? "")));
      for (const [key, c] of played) {
        if (have.has(key)) continue;
        if (c.round_count === 0 && c.event_count === 0) continue;
        all.push({
          course_id: c.course_id ?? `event:${key}`,
          rounds: c.round_count + c.event_count,
          bestScore: null,
          avgToPar: c.best_to_par,
          avgRating: null,
          bestRating: c.best_rating,
          lastPlayed: c.last_played ?? "",
          name: c.display_name,
          city: c.location,
          region: null,
          source: "event",
        });
      }
    }

    all.sort((a, b) => (a.lastPlayed < b.lastPlayed ? 1 : -1));
    return { source, courses: all };
  });

/**
 * Source-scoped round list for the DG Statboard History tab.
 *
 * Ensures PDGA / UDisc / DG Dashboard histories never blend. The PDGA lab
 * cache (getMyPdgaLab) is used only when the picker is on "pdga"; UDisc and
 * DG Dashboard reads come from this function instead so the History tab
 * matches the round-source switcher exactly.
 */
export const getSourceRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        source: z.enum(["pdga", "udisc", "chainlink"]),
        limit: z.number().int().min(1).max(500).nullish(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };
    const source = data.source;
    const limit = data.limit ?? 200;

    type Row = {
      played_on: string;
      round_rating: number | null;
      event_name: string | null;
      course_name: string | null;
      division: string | null;
      score: number | null;
      to_par: number | null;
      round_label: string | null;
      included: boolean | null;
      source: string;
      event_ref: string | null;
    };
    type SourceRoundsResponse = { data: AnyRow[] | null; error?: { message?: string } | null };
    const rows: Row[] = [];

    if (source === "pdga" || source === "udisc") {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              eq: (
                k: string,
                v: string,
              ) => {
                eq: (
                  k: string,
                  v: string,
                ) => {
                  order: (
                    col: string,
                    opts?: { ascending?: boolean },
                  ) => {
                    limit: (n: number) => Promise<SourceRoundsResponse>;
                  };
                };
              };
            };
          };
        };
      };
      const res = await client
        .from("external_rounds")
        .select(
          "played_on, round_rating, mock_pdga_rating, event_name, layout_name, course_name, division, score, to_par, included, source, pdga_event_ref, format",
        )
        .eq("user_id", userId)
        .eq("source", source)
        .eq("format", "singles")
        .order("played_on", { ascending: false })
        .limit(limit);
      if (res.error) {
        throw new Error(res.error.message ?? `Unable to load ${source} rounds`);
      }

      for (const r of (res.data ?? []) as AnyRow[]) {
        if (
          !isSinglesExternalRound({
            format: (r.format as string | null) ?? null,
            layout_name: (r.layout_name as string | null) ?? null,
            event_name: (r.event_name as string | null) ?? null,
            division: (r.division as string | null) ?? null,
          })
        )
          continue;
        rows.push({
          played_on: String(r.played_on ?? ""),
          // UDisc shows only its own native rating (150–350); never a PDGA-style estimate.
          round_rating:
            source === "udisc"
              ? validUdiscRating(r.round_rating as number | null)
              : ((r.round_rating as number | null) ?? (r.mock_pdga_rating as number | null) ?? null),
          event_name: (r.event_name as string | null) ?? null,
          course_name: (r.course_name as string | null) ?? null,
          division: (r.division as string | null) ?? null,
          score: (r.score as number | null) ?? null,
          to_par: (r.to_par as number | null) ?? null,
          round_label: null,
          included: (r.included as boolean | null) ?? null,
          source,
          event_ref: (r.pdga_event_ref as string | null) ?? null,
        });
      }
    } else {
      // chainlink — native round_ratings joined to rounds/courses for labels
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              order: (
                col: string,
                opts?: { ascending?: boolean },
              ) => {
                limit: (n: number) => Promise<{ data: AnyRow[] | null }>;
              };
            };
          };
        };
      };
      const res = await client
        .from("round_ratings")
        .select("round_id, round_rating, total_strokes, par_total, score_to_par, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const rrRows = (res.data ?? []) as Array<{
        round_id: string;
        round_rating: number | null;
        total_strokes: number | null;
        par_total: number | null;
        score_to_par: number | null;
        created_at: string;
      }>;
      const roundIds = rrRows.map((r) => r.round_id).filter(Boolean);
      const courseByRound = new Map<string, { name: string | null }>();
      const eventByRound = new Map<string, string>();
      if (roundIds.length > 0) {
        const roundsClient = supabase as unknown as {
          from: (t: string) => {
            select: (c: string) => {
              in: (k: string, v: string[]) => Promise<{ data: AnyRow[] | null }>;
            };
          };
        };
        const rr = await roundsClient
          .from("rounds")
          .select("id, course_id, tournament_id, tournament_round_id, league_event_id")
          .in("id", roundIds);
        // Event context: "Spring Open · R2" or "Friday Glow · Week 4".
        const evRows = (rr.data ?? []) as Array<{
          id: string;
          tournament_id: string | null;
          tournament_round_id: string | null;
          league_event_id: string | null;
        }>;
        const tIds = [...new Set(evRows.map((r) => r.tournament_id).filter(Boolean))] as string[];
        const trIds = [...new Set(evRows.map((r) => r.tournament_round_id).filter(Boolean))] as string[];
        const leIds = [...new Set(evRows.map((r) => r.league_event_id).filter(Boolean))] as string[];
        const [tRes, trRes, leRes] = await Promise.all([
          tIds.length ? roundsClient.from("tournaments").select("id, name").in("id", tIds) : Promise.resolve({ data: [] }),
          trIds.length ? roundsClient.from("tournament_rounds").select("id, round_number").in("id", trIds) : Promise.resolve({ data: [] }),
          leIds.length ? roundsClient.from("league_events").select("id, week_number, league_id").in("id", leIds) : Promise.resolve({ data: [] }),
        ]);
        const leRows = (leRes.data ?? []) as Array<{ id: string; week_number: number; league_id: string }>;
        const lIds = [...new Set(leRows.map((r) => r.league_id))];
        const lRes = lIds.length ? await roundsClient.from("leagues").select("id, name").in("id", lIds) : { data: [] };
        const nameOf = (rows: AnyRow[] | null) => new Map((rows ?? []).map((x) => [String(x.id), String(x.name ?? "")]));
        const tName = nameOf(tRes.data);
        const lName = nameOf(lRes.data);
        const trNum = new Map((trRes.data ?? []).map((x) => [String(x.id), Number(x.round_number)]));
        const leById = new Map(leRows.map((x) => [x.id, x]));
        for (const e of evRows) {
          if (e.tournament_id && tName.get(e.tournament_id)) {
            const n = e.tournament_round_id ? trNum.get(e.tournament_round_id) : undefined;
            eventByRound.set(e.id, `${tName.get(e.tournament_id)}${n ? ` · R${n}` : ""}`);
          } else if (e.league_event_id) {
            const le = leById.get(e.league_event_id);
            const ln = le ? lName.get(le.league_id) : undefined;
            if (le && ln) eventByRound.set(e.id, `${ln} · Week ${le.week_number}`);
          }
        }
        const roundToCourse = new Map<string, string | null>();
        const courseIds: string[] = [];
        for (const row of (rr.data ?? []) as Array<{ id: string; course_id: string | null }>) {
          roundToCourse.set(row.id, row.course_id);
          if (row.course_id) courseIds.push(row.course_id);
        }
        const nameById = new Map<string, string>();
        if (courseIds.length > 0) {
          const cr = await roundsClient
            .from("courses")
            .select("id, name")
            .in("id", Array.from(new Set(courseIds)));
          for (const c of (cr.data ?? []) as Array<{ id: string; name: string | null }>) {
            if (c.name) nameById.set(c.id, c.name);
          }
        }
        for (const rid of roundIds) {
          const cid = roundToCourse.get(rid) ?? null;
          courseByRound.set(rid, { name: cid ? (nameById.get(cid) ?? null) : null });
        }
      }
      for (const r of rrRows) {
        rows.push({
          played_on: String(r.created_at ?? "").slice(0, 10),
          round_rating: r.round_rating,
          event_name: eventByRound.get(r.round_id) ?? null,
          course_name: courseByRound.get(r.round_id)?.name ?? null,
          division: null,
          score: r.total_strokes,
          to_par: r.score_to_par,
          round_label: null,
          included: true,
          source: "chainlink",
          event_ref: null,
        });
      }
    }

    return { source, rounds: rows };
  });

/**
 * Event mastery — VERIFIED DATA ONLY.
 *
 * Groups the player's PDGA-sourced rated rounds by event and returns one
 * summary row per repeated event. Aggregation runs here so the browser
 * receives a handful of summary rows instead of hundreds of raw rounds.
 */
export const getCourseMastery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({ limit: z.number().int().min(1).max(50).nullish() })
      .nullish()
      .transform((v) => ({ limit: v?.limit ?? 6 }))
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };
    const res = await boundedQuery(
      supabase,
      "external_rounds",
      "course_name, event_name, played_on, score, to_par, round_rating, source",
    )
      .eq("user_id", userId)
      .eq("source", "pdga")
      .not("round_rating", "is", null)
      .order("played_on", { ascending: false })
      .limit(STATS_LIMITS.masteryRounds);
    if (res.error) throw new Error(res.error.message ?? "Unable to load event mastery");

    type Row = {
      course_name: string | null;
      event_name: string | null;
      played_on: string | null;
      to_par: number | null;
      round_rating: number | null;
    };

    const buckets = new Map<string, Row[]>();
    for (const raw of (res.data ?? []) as AnyRow[]) {
      const r = raw as unknown as Row;
      const label = (r.event_name ?? r.course_name ?? "").trim();
      const k = label.toLowerCase();
      if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }

    const list: Array<{
      key: string;
      name: string;
      plays: number;
      best_to_par: number | null;
      best_rating: number | null;
      avg_rating: number | null;
      trend: number | null;
      last_played: string | null;
    }> = [];

    for (const [k, arr] of buckets) {
      // Mastery needs repeat plays to mean anything.
      if (arr.length < 2) continue;
      const ratings = arr
        .map((r) => r.round_rating)
        .filter((v): v is number => typeof v === "number");
      if (ratings.length < 2) continue;
      const avg = Math.round(ratings.reduce((s, x) => s + x, 0) / ratings.length);
      const toPars = arr.map((r) => r.to_par).filter((v): v is number => typeof v === "number");
      const sorted = [...arr].sort((a, b) => (a.played_on ?? "").localeCompare(b.played_on ?? ""));
      const series = sorted
        .map((r) => r.round_rating)
        .filter((v): v is number => typeof v === "number");
      const last3 = series.slice(-3);
      const prior = series.slice(0, -3);
      const l3a = last3.length ? last3.reduce((s, x) => s + x, 0) / last3.length : null;
      const pra = prior.length ? prior.reduce((s, x) => s + x, 0) / prior.length : null;
      list.push({
        key: k,
        name: (arr[0].event_name ?? arr[0].course_name ?? k) as string,
        plays: arr.length,
        best_to_par: toPars.length ? Math.min(...toPars) : null,
        best_rating: Math.max(...ratings),
        avg_rating: avg,
        trend: l3a != null && pra != null ? Math.round(l3a - pra) : null,
        last_played: sorted[sorted.length - 1]?.played_on ?? null,
      });
    }
    list.sort((a, b) => b.plays - a.plays);
    return { events: list.slice(0, data.limit) };
  });

/**
 * Per-disc distance and shape summary from logged throws. Returns the top
 * discs by throws logged, aggregated server-side.
 */
export const getDiscPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as { supabase: unknown; userId: string };

    const discRes = await boundedQuery(
      supabase,
      "user_discs",
      "id, nickname, mold:disc_molds(name, category)",
    ).eq("user_id", userId);
    if (discRes.error) throw new Error(discRes.error.message ?? "Unable to load your bag");

    type DiscRow = {
      id: string;
      nickname: string | null;
      mold?: { name: string | null; category: string | null } | null;
    };
    const discMap = new Map<string, DiscRow>();
    for (const raw of (discRes.data ?? []) as AnyRow[]) {
      const d = raw as unknown as DiscRow;
      discMap.set(d.id, d);
    }

    const throwRes = await boundedQuery(
      supabase,
      "range_throws",
      "disc_id, distance_ft, shape, intent",
    )
      .eq("user_id", userId)
      .not("disc_id", "is", null)
      .limit(STATS_LIMITS.discThrows);
    if (throwRes.error) throw new Error(throwRes.error.message ?? "Unable to load your throws");

    type Throw = { disc_id: string | null; distance_ft: number | null; shape: string | null };
    const buckets = new Map<string, Throw[]>();
    for (const raw of (throwRes.data ?? []) as AnyRow[]) {
      const t = raw as unknown as Throw;
      if (!t.disc_id) continue;
      if (!buckets.has(t.disc_id)) buckets.set(t.disc_id, []);
      buckets.get(t.disc_id)!.push(t);
    }

    const list: Array<{
      key: string;
      label: string;
      category: string | null;
      count: number;
      avg_ft: number | null;
      max_ft: number | null;
      top_shape: string | null;
    }> = [];
    for (const [id, arr] of buckets) {
      const d = discMap.get(id);
      const dists = arr
        .map((x) => x.distance_ft)
        .filter((v): v is number => typeof v === "number" && v > 0);
      const shapeCounts = new Map<string, number>();
      for (const t of arr) {
        if (t.shape) shapeCounts.set(t.shape, (shapeCounts.get(t.shape) ?? 0) + 1);
      }
      let topShape: string | null = null;
      let topN = 0;
      for (const [k, n] of shapeCounts) {
        if (n > topN) {
          topShape = k;
          topN = n;
        }
      }
      list.push({
        key: id,
        label: d?.nickname || d?.mold?.name || "Untagged disc",
        category: d?.mold?.category ?? null,
        count: arr.length,
        avg_ft: dists.length ? Math.round(dists.reduce((s, x) => s + x, 0) / dists.length) : null,
        max_ft: dists.length ? Math.max(...dists) : null,
        top_shape: topShape,
      });
    }
    list.sort((a, b) => b.count - a.count);
    return { discs: list.slice(0, 8) };
  });
