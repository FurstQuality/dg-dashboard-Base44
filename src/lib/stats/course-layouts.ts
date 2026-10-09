/**
 * Per-layout course breakdown. Scores, to-par and ratings are only ever
 * summarised inside one layout AND one rating source — a −10 on one layout
 * is not the same round as a −10 on another, and PDGA/UDisc/DG Dashboard
 * ratings sit on different scales.
 */
export type LayoutSource = "app" | "pdga" | "udisc" | "disc_golf_scene";

export type LayoutRoundInput = {
  layoutKey: string | null;
  layoutName: string | null;
  source: LayoutSource;
  score: number | null;
  toPar: number | null;
  rating: number | null;
  playedOn: string;
};

export type LayoutBreakdown = {
  key: string;
  layoutName: string | null;
  source: LayoutSource;
  rounds: number;
  bestScore: number | null;
  bestToPar: number | null;
  avgToPar: number | null;
  bestRating: number | null;
  avgRating: number | null;
  ratedRounds: number;
  lastPlayed: string;
};

export function buildLayoutBreakdown(rows: LayoutRoundInput[]): LayoutBreakdown[] {
  const groups = new Map<string, LayoutRoundInput[]>();
  for (const r of rows) {
    const layoutPart = (r.layoutKey ?? r.layoutName ?? "").trim().toLowerCase() || "unknown";
    const key = `${r.source}:${layoutPart}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const out: LayoutBreakdown[] = [];
  for (const [key, list] of groups) {
    const scores = list.map((x) => x.score).filter((x): x is number => x != null && x > 0);
    const tp = list.map((x) => x.toPar).filter((x): x is number => x != null);
    const rr = list.map((x) => x.rating).filter((x): x is number => x != null);
    out.push({
      key,
      layoutName: list.find((x) => x.layoutName)?.layoutName ?? null,
      source: list[0].source,
      rounds: list.length,
      bestScore: scores.length ? Math.min(...scores) : null,
      bestToPar: tp.length ? Math.min(...tp) : null,
      avgToPar: tp.length ? +(tp.reduce((s, v) => s + v, 0) / tp.length).toFixed(1) : null,
      bestRating: rr.length ? Math.max(...rr) : null,
      avgRating: rr.length ? Math.round(rr.reduce((s, v) => s + v, 0) / rr.length) : null,
      ratedRounds: rr.length,
      lastPlayed: list.reduce((a, x) => (x.playedOn > a ? x.playedOn : a), list[0].playedOn),
    });
  }
  return out.sort((a, b) => b.rounds - a.rounds || b.lastPlayed.localeCompare(a.lastPlayed));
}
