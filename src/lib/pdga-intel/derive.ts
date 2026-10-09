/**
 * PDGA Source Intelligence — derived, descriptive analytics (Phase 5C).
 * Pure functions. Nothing here feeds DGD model math.
 */
import type { PdgaDetailRound, PdgaLayoutPool } from "@/lib/dgd-v1/pdga-details";
import type { EventPage, RatingHistoryEntry } from "./parsers";

export type LayoutState =
  | "EXACT_LAYOUT"
  | "CONFIRMED_SCORE_MATCH"
  | "MULTIPLE_POSSIBLE_LAYOUTS"
  | "SOURCE_CONFLICT"
  | "UNRESOLVED";

export type QualityState = "COMPLETE" | "GOOD" | "PARTIAL" | "POOR";

/** Latest official rating whose effective date is on or before the round. */
export function officialRatingAt(history: RatingHistoryEntry[], date: string): number | null {
  let best: RatingHistoryEntry | null = null;
  for (const h of history)
    if (h.effective_date <= date && (!best || h.effective_date > best.effective_date)) best = h;
  return best?.rating ?? null;
}

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

export function ratingHistoryAnalytics(history: RatingHistoryEntry[], today: string) {
  const h = [...history].sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  if (!h.length) return null;
  const last = h[h.length - 1];
  const at = (d: string) => officialRatingAt(h, d);
  const back = (days: number) => {
    const d = new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
    const r = at(d);
    return r == null ? null : last.rating - r;
  };
  const deltas = h
    .slice(1)
    .map((e, i) => ({ date: e.effective_date, change: e.rating - h[i].rating }));
  const ytdBase = at(`${today.slice(0, 4)}-01-01`);
  const yearAgo = new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10);
  const r365 = at(yearAgo);
  const milestones = [850, 875, 900, 925, 950, 975, 1000]
    .map((m) => {
      const hit = h.find((e) => e.rating >= m);
      return hit
        ? {
            milestone: m,
            first_reached: hit.effective_date,
            days_from_first_rating: Math.round(
              daysBetween(h[0].effective_date, hit.effective_date),
            ),
          }
        : null;
    })
    .filter(Boolean);
  return {
    updates: h.length,
    first: h[0],
    current: last,
    change_since_previous: deltas.length ? deltas[deltas.length - 1].change : null,
    change_30d: back(30),
    change_90d: back(90),
    change_180d: back(180),
    change_365d: back(365),
    ytd_change: ytdBase == null ? null : last.rating - ytdBase,
    career_change: last.rating - h[0].rating,
    velocity_per_30d_last_365:
      r365 == null ? null : Math.round(((last.rating - r365) / 365) * 30 * 10) / 10,
    largest_gain: deltas.length ? deltas.reduce((a, b) => (b.change > a.change ? b : a)) : null,
    largest_loss: deltas.length ? deltas.reduce((a, b) => (b.change < a.change ? b : a)) : null,
    milestones,
  };
}

const poolKey = (p: PdgaLayoutPool) =>
  `${p.node_id}|${p.name.toLowerCase()}|${p.holes ?? ""}|${p.par ?? ""}`;

export type ResolvedRound = PdgaDetailRound & {
  official_rating_at_round_date: number | null;
  rating_delta: number | null;
  layout_state: LayoutState;
  layout: PdgaLayoutPool | null;
  layout_candidates: PdgaLayoutPool[];
  conflicts: { field: string; detail_value: string; event_value: string }[];
  field: FieldContext | null;
  quality: QualityState;
};

export type FieldContext = {
  /** Same event, same round number, same exact layout; this player excluded. */
  field_size: number;
  median_score: number | null;
  mean_score: number | null;
  median_round_rating: number | null;
  median_player_rating: number | null;
  mean_player_rating: number | null;
  top_quartile_player_rating: number | null;
  strongest_player_rating: number | null;
  player_rating_rank: number | null;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
const quantile = (xs: number[], q: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))];
};

export function resolveRound(
  r: PdgaDetailRound,
  pdgaNumber: string,
  history: RatingHistoryEntry[],
  event: EventPage | null,
): ResolvedRound {
  const conflicts: ResolvedRound["conflicts"] = [];
  const official = officialRatingAt(history, r.played_on);
  const evLayout =
    event && r.division && r.round_number != null
      ? (event.layouts.find(
          (l) => l.division === r.division && l.round_number === r.round_number,
        ) ?? null)
      : null;
  const detailPools = r.pools;
  let state: LayoutState = "UNRESOLVED";
  let layout: PdgaLayoutPool | null = null;
  let candidates: PdgaLayoutPool[] = [];

  if (evLayout && evLayout.pools.length) {
    candidates = evLayout.pools;
    if (evLayout.pools.length === 1) {
      layout = evLayout.pools[0];
      state = "EXACT_LAYOUT";
      if (detailPools.length === 1 && poolKey(detailPools[0]) !== poolKey(layout)) {
        state = "SOURCE_CONFLICT";
        conflicts.push({
          field: "layout",
          detail_value: detailPools[0].name,
          event_value: layout.name,
        });
      }
    } else if (
      detailPools.length === 1 &&
      evLayout.pools.some((p) => poolKey(p) === poolKey(detailPools[0]))
    ) {
      layout = detailPools[0];
      state = "CONFIRMED_SCORE_MATCH";
    } else state = "MULTIPLE_POSSIBLE_LAYOUTS";
  } else if (detailPools.length === 1) {
    layout = detailPools[0];
    candidates = detailPools;
    state = "EXACT_LAYOUT";
  } else if (detailPools.length > 1) {
    candidates = detailPools;
    state = "MULTIPLE_POSSIBLE_LAYOUTS";
  }

  // Cross-page score/rating agreement for this player's own row.
  const me = event?.field.find((f) => f.pdga_number === pdgaNumber && f.division === r.division);
  const myRound = me?.rounds.find((x) => x.round_number === r.round_number);
  if (myRound) {
    if (r.score != null && myRound.score != null && myRound.score !== r.score) {
      conflicts.push({
        field: "score",
        detail_value: String(r.score),
        event_value: String(myRound.score),
      });
      state = "SOURCE_CONFLICT";
    }
    if (
      r.round_rating != null &&
      myRound.round_rating != null &&
      myRound.round_rating !== r.round_rating
    ) {
      // Ratings are revised after events; record but do not flip layout state.
      conflicts.push({
        field: "round_rating",
        detail_value: String(r.round_rating),
        event_value: String(myRound.round_rating),
      });
    }
  }

  // Field context: every division that played this exact layout in this round.
  let field: FieldContext | null = null;
  if (event && layout && r.round_number != null && state !== "SOURCE_CONFLICT") {
    const sameLayoutDivs = new Set(
      event.layouts
        .filter(
          (l) =>
            l.round_number === r.round_number &&
            l.pools.length === 1 &&
            poolKey(l.pools[0]) === poolKey(layout!),
        )
        .map((l) => l.division),
    );
    const others = event.field.filter(
      (f) => sameLayoutDivs.has(f.division) && f.pdga_number !== pdgaNumber,
    );
    const rows = others
      .map((f) => ({ f, rd: f.rounds.find((x) => x.round_number === r.round_number) }))
      .filter((x) => x.rd?.score != null);
    const pr = others.map((f) => f.player_rating).filter((x): x is number => x != null);
    const myRating = me?.player_rating ?? official;
    field = {
      field_size: rows.length,
      median_score: median(rows.map((x) => x.rd!.score!)),
      mean_score: mean(rows.map((x) => x.rd!.score!)),
      median_round_rating: median(
        rows.map((x) => x.rd!.round_rating).filter((x): x is number => x != null),
      ),
      median_player_rating: median(pr),
      mean_player_rating: mean(pr),
      top_quartile_player_rating: quantile(pr, 0.75),
      strongest_player_rating: pr.length ? Math.max(...pr) : null,
      player_rating_rank:
        myRating != null && pr.length ? pr.filter((x) => x > myRating).length + 1 : null,
    };
  }

  const hasLayoutDetail = !!layout && layout.holes != null && layout.par != null;
  let quality: QualityState = "POOR";
  if (r.score != null) {
    quality = "PARTIAL";
    if (
      r.pdga_event_id &&
      r.round_number != null &&
      hasLayoutDetail &&
      (state === "EXACT_LAYOUT" || state === "CONFIRMED_SCORE_MATCH")
    ) {
      quality =
        r.round_rating != null && layout?.distance_ft != null && (field?.field_size ?? 0) >= 2
          ? "COMPLETE"
          : "GOOD";
    }
  }

  return {
    ...r,
    official_rating_at_round_date: official,
    rating_delta: r.round_rating != null && official != null ? r.round_rating - official : null,
    layout_state: state,
    layout,
    layout_candidates: candidates,
    conflicts,
    field,
    quality,
  };
}

/** Expectation vs result over a window of rounds (newest first). */
export function performanceVsRating(rounds: ResolvedRound[]) {
  const d = rounds.map((r) => r.rating_delta).filter((x): x is number => x != null);
  if (!d.length) return { sample: 0 };
  const sorted = [...d].sort((a, b) => a - b);
  const med = median(d)!;
  const mad = median(d.map((x) => Math.abs(x - med)));
  return {
    sample: d.length,
    above: d.filter((x) => x > 0).length,
    below: d.filter((x) => x < 0).length,
    pct_above: Math.round((d.filter((x) => x > 0).length / d.length) * 1000) / 10,
    mean_delta: mean(d),
    median_delta: med,
    best_over: sorted[sorted.length - 1],
    largest_under: sorted[0],
    mad,
    iqr: (quantile(d, 0.75) ?? 0) - (quantile(d, 0.25) ?? 0),
  };
}

export function consistency(rounds: ResolvedRound[]) {
  const rr = rounds.map((r) => r.round_rating).filter((x): x is number => x != null);
  if (rr.length < 2) return { sample: rr.length };
  const m = rr.reduce((a, b) => a + b, 0) / rr.length;
  const sd = Math.sqrt(rr.reduce((a, b) => a + (b - m) ** 2, 0) / (rr.length - 1));
  const med = median(rr)!;
  return {
    sample: rr.length,
    sd: Math.round(sd * 10) / 10,
    mad: median(rr.map((x) => Math.abs(x - med))),
    iqr: (quantile(rr, 0.75) ?? 0) - (quantile(rr, 0.25) ?? 0),
    ceiling_p90: quantile(rr, 0.9),
    typical_median: med,
    floor_p10: quantile(rr, 0.1),
  };
}

export function layoutHistory(rounds: ResolvedRound[]) {
  const by = new Map<string, ResolvedRound[]>();
  for (const r of rounds) {
    if (
      !r.layout ||
      (r.layout_state !== "EXACT_LAYOUT" && r.layout_state !== "CONFIRMED_SCORE_MATCH")
    )
      continue;
    const k = poolKey(r.layout);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  return [...by.values()]
    .map((rs) => {
      rs.sort((a, b) => a.played_on.localeCompare(b.played_on));
      const sc = rs.map((r) => r.score).filter((x): x is number => x != null);
      const rr = rs.map((r) => r.round_rating).filter((x): x is number => x != null);
      const dl = rs.map((r) => r.rating_delta).filter((x): x is number => x != null);
      return {
        layout: rs[0].layout!,
        rounds: rs.length,
        avg_score: mean(sc),
        best_score: sc.length ? Math.min(...sc) : null,
        avg_round_rating: mean(rr),
        best_round_rating: rr.length ? Math.max(...rr) : null,
        avg_vs_official: mean(dl),
        first_played: rs[0].played_on,
        last_played: rs[rs.length - 1].played_on,
        first_round_delta: rs[0].rating_delta,
        repeat_avg_delta: mean(dl.slice(1)),
      };
    })
    .sort((a, b) => b.rounds - a.rounds);
}
