/**
 * Game Plan prep model — pure analysis helpers.
 * ---------------------------------------------
 * Everything in this file is deterministic and dependency-free so it can be
 * unit tested and reused by both the server functions and the UI.
 *
 * Three questions drive the model:
 *   1. Which division gives me the best realistic result? (`rankDivisions`)
 *   2. Which holes at this event's courses cost me the most? (`buildHoleFocus`)
 *   3. What should I practice between now and the first tee? (`buildPracticePlan`)
 *
 * Numbers are directional coaching aids, not official PDGA outputs. Every
 * surface that renders them also shows how they were derived.
 */

import { PDGA_DIVISIONS } from "@/lib/pdga-data";
import type { Leak } from "@/lib/stats/skill-engine";

/* --------------------------- shared statistics -------------------------- */

export function summarizeRatings(ratings: number[]): {
  avg: number | null;
  median: number | null;
  top: number | null;
} {
  const clean = ratings.filter((r) => Number.isFinite(r));
  if (!clean.length) return { avg: null, median: null, top: null };
  const sorted = [...clean].sort((a, b) => a - b);
  return {
    avg: Math.round(clean.reduce((s, r) => s + r, 0) / clean.length),
    median: Math.round(sorted[Math.floor(sorted.length / 2)]),
    top: sorted[sorted.length - 1],
  };
}

/** Share of the field (0-100) the given rating sits above. */
export function percentileVsField(me: number | null, ratings: number[]): number | null {
  const clean = ratings.filter((r) => Number.isFinite(r));
  if (me == null || !clean.length) return null;
  const below = clean.filter((r) => r < me).length;
  return Math.round((below / clean.length) * 100);
}

/**
 * Deterministic Monte-Carlo placement simulation. Each player's round is their
 * rating plus normal noise (±45 rating points), which is roughly the spread of
 * a single tournament round for a settled player.
 */
export function simulatePlacement(
  meRating: number,
  opponents: number[],
  cashLine: number,
  sims = 400,
): { winPct: number; top3Pct: number; cashPct: number } {
  if (!opponents.length) return { winPct: 100, top3Pct: 100, cashPct: 100 };
  let seed = (meRating || 900) * 9301 + opponents.length * 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const noise = 45;
  const gauss = () => {
    const u = Math.max(1e-9, Math.min(1 - 1e-9, rand()));
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  let wins = 0;
  let top3 = 0;
  let cash = 0;
  for (let s = 0; s < sims; s++) {
    const my = meRating + gauss() * noise;
    const scores = opponents.map((r) => r + gauss() * noise);
    let rank = 1;
    for (const sc of scores) if (sc > my) rank += 1;
    if (rank === 1) wins += 1;
    if (rank <= 3) top3 += 1;
    if (rank <= cashLine) cash += 1;
  }
  return {
    winPct: Math.round((wins / sims) * 100),
    top3Pct: Math.round((top3 / sims) * 100),
    cashPct: Math.round((cash / sims) * 100),
  };
}

/** Roughly 40% of a field cashes at a standard PDGA event. */
export function cashLineFor(fieldSize: number): number {
  return Math.max(1, Math.round((fieldSize + 1) * 0.4));
}

/* ---------------------------- division advisor -------------------------- */

/**
 * Inclusive rating ceilings per division, derived from the official PDGA
 * divisions table. Amateur requirements are exclusive ("MA3 is under 900"), so
 * the ceiling is one point below. MA1 is absent on purpose: it has no cap —
 * any rating can play MA1 as long as the player has not accepted cash.
 */
export const DIVISION_RATING_CAPS: Record<string, number> = Object.fromEntries(
  PDGA_DIVISIONS.filter((d) => typeof d.max_rating === "number").map((d) => [
    d.code,
    d.max_rating as number,
  ]),
);

export type DivisionRecommendation =
  | "recommended"
  | "viable"
  | "stretch"
  | "too_easy"
  | "over_cap";

export type DivisionOption = {
  code: string;
  name: string | null;
  fieldSize: number;
  avgRating: number | null;
  medianRating: number | null;
  topRating: number | null;
  minRating: number | null;
  maxRating: number | null;
  purse: number | null;
  cashLine: number;
  yourPercentile: number | null;
  odds: { winPct: number; top3Pct: number; cashPct: number };
  score: number;
  recommendation: DivisionRecommendation;
  rationale: string;
};

export type DivisionFieldInput = {
  code: string;
  name?: string | null;
  ratings: number[];
  minRating?: number | null;
  maxRating?: number | null;
  purse?: number | null;
};

/**
 * Score divisions for the caller and label each one. The headline number is a
 * blend of win / podium / cash probability, weighted toward outcomes players
 * actually plan around (cashing and podium), then adjusted for rating caps and
 * for divisions the player has clearly outgrown.
 */
export function rankDivisions(
  meRating: number | null,
  fields: DivisionFieldInput[],
): { options: DivisionOption[]; recommendedCode: string | null } {
  const me = meRating ?? 900;
  const options: DivisionOption[] = fields.map((f) => {
    const ratings = f.ratings.filter((r) => Number.isFinite(r));
    const { avg, median, top } = summarizeRatings(ratings);
    const cashLine = cashLineFor(ratings.length);
    const odds = simulatePlacement(me, ratings, cashLine, 500);
    const percentile = percentileVsField(meRating, ratings);
    const cap = f.maxRating ?? DIVISION_RATING_CAPS[f.code.toUpperCase()] ?? null;
    const floor = f.minRating ?? null;

    const overCap = cap != null && meRating != null && meRating > cap;
    const belowFloor = floor != null && meRating != null && meRating < floor;
    let recommendation: DivisionRecommendation = "viable";
    let rationale = "";

    if (overCap) {
      recommendation = "over_cap";
      rationale = `Your ${meRating} rating is above the ${cap} ceiling for ${f.code} — you are not eligible.`;
    } else if (belowFloor) {
      recommendation = "stretch";
      rationale = `${f.code} expects ${floor}+ rated players. Expect to play from behind, but the rating gain is real.`;
    } else if (percentile != null && percentile >= 92 && ratings.length >= 6) {
      recommendation = "too_easy";
      rationale = `You out-rate ${percentile}% of this field. A win here does little for your rating — move up if the cap allows.`;
    } else if (odds.cashPct >= 50) {
      recommendation = "recommended";
      rationale = `Strong fit: ${odds.cashPct}% cash odds and ${odds.top3Pct}% podium odds against ${ratings.length} rated players.`;
    } else if (odds.cashPct >= 20) {
      recommendation = "viable";
      rationale = `Competitive: ${odds.cashPct}% cash odds. Field average ${avg ?? "—"} vs your ${meRating ?? "unrated"}.`;
    } else {
      recommendation = "stretch";
      rationale = `Deep field (avg ${avg ?? "—"}). Treat this as a rating-building weekend rather than a run at the podium.`;
    }

    const raw = odds.cashPct * 0.4 + odds.top3Pct * 0.35 + odds.winPct * 0.25;
    const penalty =
      recommendation === "over_cap" ? 1000 : recommendation === "too_easy" ? 25 : 0;

    return {
      code: f.code,
      name: f.name ?? null,
      fieldSize: ratings.length,
      avgRating: avg,
      medianRating: median,
      topRating: top,
      minRating: floor,
      maxRating: cap,
      purse: f.purse ?? null,
      cashLine,
      yourPercentile: percentile,
      odds,
      score: Math.round(Math.max(0, raw - penalty)),
      recommendation,
      rationale,
    };
  });

  const eligible = options.filter((o) => o.recommendation !== "over_cap" && o.fieldSize > 0);
  const best = [...eligible].sort((a, b) => b.score - a.score)[0] ?? null;
  if (best && best.recommendation !== "too_easy") best.recommendation = "recommended";
  return {
    options: [...options].sort((a, b) => b.score - a.score),
    recommendedCode: best?.code ?? null,
  };
}

/* ------------------------------ hole focus ------------------------------ */

export type HolePlay = {
  courseKey: string;
  courseName: string;
  layoutName: string | null;
  holeNumber: number;
  par: number | null;
  distanceFt: number | null;
  strokes: number;
  putts?: number | null;
  penalties?: number | null;
};

export type HoleFocus = {
  courseKey: string;
  courseName: string;
  layoutName: string | null;
  holeNumber: number;
  par: number | null;
  distanceFt: number | null;
  plays: number;
  avgStrokes: number;
  avgVsPar: number;
  bestStrokes: number;
  worstStrokes: number;
  bogeyPlusPct: number;
  birdiePct: number;
  penaltyRate: number;
  /** Strokes this hole is expected to cost across the event's scheduled rounds. */
  projectedCost: number;
  note: string;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Aggregate every logged play of every hole at the event's courses, then rank
 * by strokes given back vs par. `roundsAtEvent` scales the projected cost so a
 * three-round event weights a bad hole three times.
 */
export function buildHoleFocus(plays: HolePlay[], roundsAtEvent = 1): HoleFocus[] {
  const groups = new Map<string, HolePlay[]>();
  for (const p of plays) {
    if (!Number.isFinite(p.strokes) || p.strokes <= 0) continue;
    const key = `${p.courseKey}#${p.holeNumber}`;
    const list = groups.get(key);
    if (list) list.push(p);
    else groups.set(key, [p]);
  }

  const out: HoleFocus[] = [];
  for (const [, list] of groups) {
    const first = list[0];
    const par = list.find((p) => p.par != null)?.par ?? null;
    const strokes = list.map((p) => p.strokes);
    const avgStrokes = strokes.reduce((s, v) => s + v, 0) / strokes.length;
    const avgVsPar = par != null ? avgStrokes - par : 0;
    const bogeyPlus = par != null ? strokes.filter((s) => s > par).length : 0;
    const birdies = par != null ? strokes.filter((s) => s < par).length : 0;
    const penalties = list.filter((p) => (p.penalties ?? 0) > 0).length;
    out.push({
      courseKey: first.courseKey,
      courseName: first.courseName,
      layoutName: first.layoutName,
      holeNumber: first.holeNumber,
      par,
      distanceFt: list.find((p) => p.distanceFt != null)?.distanceFt ?? null,
      plays: list.length,
      avgStrokes: round1(avgStrokes),
      avgVsPar: round1(avgVsPar),
      bestStrokes: Math.min(...strokes),
      worstStrokes: Math.max(...strokes),
      bogeyPlusPct: Math.round((bogeyPlus / strokes.length) * 100),
      birdiePct: Math.round((birdies / strokes.length) * 100),
      penaltyRate: Math.round((penalties / strokes.length) * 100),
      projectedCost: round1(avgVsPar * Math.max(1, roundsAtEvent)),
      note: holeNote(par, avgVsPar, penalties / strokes.length, list.length),
    });
  }
  return out.sort((a, b) => b.avgVsPar - a.avgVsPar || b.plays - a.plays);
}

function holeNote(
  par: number | null,
  avgVsPar: number,
  penaltyRate: number,
  plays: number,
): string {
  const sample = plays === 1 ? "1 logged play" : `${plays} logged plays`;
  if (par == null) return `No par on file yet — ${sample}.`;
  if (penaltyRate >= 0.34)
    return `Penalty strokes on ${Math.round(penaltyRate * 100)}% of plays. Pick the safe line here before the round matters (${sample}).`;
  if (avgVsPar >= 0.75)
    return `Averaging ${round1(avgVsPar)} over par — your most expensive hole on this layout (${sample}).`;
  if (avgVsPar >= 0.25) return `Giving back ${round1(avgVsPar)} per play. Par is a win here (${sample}).`;
  if (avgVsPar <= -0.3) return `A birdie hole for you — protect it and take the look (${sample}).`;
  return `Playing this hole to par (${sample}).`;
}

/* ---------------------------- practice plan ----------------------------- */

export type PracticeFocus = {
  id: string;
  title: string;
  why: string;
  drill: string;
  href: string;
  cta: string;
  priority: "high" | "medium" | "low";
};

export type PracticePlanInput = {
  daysUntil: number | null;
  leaks: Leak[];
  holeFocus: HoleFocus[];
  familiarity: "none" | "light" | "solid";
  puttingDaysAgo: number | null;
  rangeDaysAgo: number | null;
  courseName: string | null;
};

/**
 * Turn measured weaknesses into a concrete, time-aware practice list. Each item
 * links to the tool in the app that trains it, so the plan is actionable rather
 * than advisory.
 */
export function buildPracticePlan(input: PracticePlanInput): PracticeFocus[] {
  const out: PracticeFocus[] = [];
  const { daysUntil, leaks, holeFocus, familiarity, puttingDaysAgo, rangeDaysAgo } = input;
  const soon = daysUntil != null && daysUntil <= 7;

  for (const leak of leaks.slice(0, 3)) {
    const putting = /putt/i.test(leak.category);
    out.push({
      id: `leak-${leak.id}`,
      title: `Fix: ${leak.category}`,
      why: `Costing ${leak.strokesPerRound} strokes per round (≈${leak.ratingImpact} rating points) across ${leak.sample} logged holes.`,
      drill: leak.suggestion,
      href: putting ? "/putting" : "/range",
      cta: putting ? "Open putting practice" : "Open field work",
      priority: leak.ratingImpact >= 8 ? "high" : "medium",
    });
  }

  const worst = holeFocus.filter((h) => h.avgVsPar >= 0.25).slice(0, 3);
  if (worst.length) {
    out.push({
      id: "hole-specific",
      title: `Play holes ${worst.map((h) => h.holeNumber).join(", ")} with a plan`,
      why: `These holes cost you ${round1(worst.reduce((s, h) => s + h.projectedCost, 0))} strokes across this event's rounds.`,
      drill:
        "Walk or play them as a practice loop: throw your safe line first, then the aggressive line, and commit to whichever finishes closer twice out of three.",
      href: "/play",
      cta: "Log a practice round",
      priority: "high",
    });
  }

  if (familiarity === "none") {
    out.push({
      id: "course-recon",
      title: "Scout the course before round one",
      why: "You have no logged rounds on this layout, so every hole decision will be a first read.",
      drill:
        "Study the hole maps and distances, then play a casual round or walk the layout and note the landing zones you trust.",
      href: "/courses",
      cta: "Open course directory",
      priority: soon ? "high" : "medium",
    });
  }

  if (puttingDaysAgo == null || puttingDaysAgo > 5) {
    out.push({
      id: "putting-touch",
      title: "Get putting reps in this week",
      why:
        puttingDaysAgo == null
          ? "No putting sessions logged yet — circle 1 is where events are decided."
          : `Last putting session was ${puttingDaysAgo} days ago.`,
      drill: "20/20/20: twenty putts each from 15, 25, and 33 ft. Log the makes so the trend is tracked.",
      href: "/putting",
      cta: "Start putting session",
      priority: soon ? "high" : "medium",
    });
  }

  if (rangeDaysAgo == null || rangeDaysAgo > 10) {
    out.push({
      id: "field-work",
      title: "Dial in your tee shots at the field",
      why:
        rangeDaysAgo == null
          ? "No field sessions logged yet — shot shapes drift fast."
          : `Last field session was ${rangeDaysAgo} days ago.`,
      drill: "Throw five of each shot shape you expect to need, and keep the ones that land inside a 40 ft window.",
      href: "/range",
      cta: "Start field session",
      priority: "medium",
    });
  }

  if (soon) {
    out.push({
      id: "taper",
      title: "Taper and prep the bag",
      why: `First round is ${daysUntil === 0 ? "today" : `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`}.`,
      drill:
        "Light putting only, confirm your bag and check the forecast for wind. Sleep and hydration beat one more bucket of drives.",
      href: "/me/bag",
      cta: "Review bag",
      priority: "low",
    });
  }

  return out;
}

/* ------------------------------ readiness ------------------------------- */

export type ReadinessItem = {
  id: string;
  label: string;
  status: "good" | "partial" | "missing";
  detail: string;
  href?: string;
};

export type ReadinessInput = {
  ratingOnFile: boolean;
  ratedRounds12mo: number;
  coursePlays: number;
  divisionChosen: boolean;
  fieldSynced: boolean;
  holeDataPoints: number;
  puttingDaysAgo: number | null;
  rangeDaysAgo: number | null;
};

/** Weighted 0-100 readiness score plus the checklist behind it. */
export function computeReadiness(input: ReadinessInput): {
  score: number;
  items: ReadinessItem[];
} {
  const items: ReadinessItem[] = [
    {
      id: "rating",
      label: "Rating on file",
      status: input.ratingOnFile ? "good" : "missing",
      detail: input.ratingOnFile
        ? "Your current rating is synced, so odds and division advice are live."
        : "Add your PDGA number so odds and division advice can use your real rating.",
      href: input.ratingOnFile ? undefined : "/settings/profile",
    },
    {
      id: "history",
      label: "Rated round history",
      status:
        input.ratedRounds12mo >= 8 ? "good" : input.ratedRounds12mo >= 3 ? "partial" : "missing",
      detail:
        input.ratedRounds12mo > 0
          ? `${input.ratedRounds12mo} rated rounds in the last 12 months feeding your form model.`
          : "Import or score rounds so your form and targets are based on real results.",
      href: input.ratedRounds12mo >= 8 ? undefined : "/settings/imports",
    },
    {
      id: "course",
      label: "Course familiarity",
      status: input.coursePlays >= 3 ? "good" : input.coursePlays >= 1 ? "partial" : "missing",
      detail:
        input.coursePlays > 0
          ? `${input.coursePlays} logged round${input.coursePlays === 1 ? "" : "s"} on this event's layouts.`
          : "No rounds logged on this event's layouts yet — a scouting round is the highest-value prep you can do.",
      href: input.coursePlays >= 3 ? undefined : "/courses",
    },
    {
      id: "holes",
      label: "Hole-by-hole data",
      status:
        input.holeDataPoints >= 54 ? "good" : input.holeDataPoints >= 18 ? "partial" : "missing",
      detail:
        input.holeDataPoints > 0
          ? `${input.holeDataPoints} scored holes available for hole-level prep.`
          : "Score a round hole-by-hole in the app to unlock per-hole practice targets.",
      href: input.holeDataPoints >= 54 ? undefined : "/play",
    },
    {
      id: "division",
      label: "Division locked in",
      status: input.divisionChosen ? "good" : "partial",
      detail: input.divisionChosen
        ? "Your division is set, so every projection is scoped to your real competition."
        : "Pick a division on the Division tab so odds reflect who you actually play against.",
    },
    {
      id: "field",
      label: "Field synced",
      status: input.fieldSynced ? "good" : "missing",
      detail: input.fieldSynced
        ? "Registered players and ratings are cached for this event."
        : "Sync the field to see who is registered and how you stack up.",
    },
    {
      id: "practice",
      label: "Recent practice",
      status:
        (input.puttingDaysAgo != null && input.puttingDaysAgo <= 5) ||
        (input.rangeDaysAgo != null && input.rangeDaysAgo <= 5)
          ? "good"
          : input.puttingDaysAgo != null || input.rangeDaysAgo != null
            ? "partial"
            : "missing",
      detail: describePractice(input.puttingDaysAgo, input.rangeDaysAgo),
      href: "/practice",
    },
  ];

  const weights: Record<string, number> = {
    rating: 15,
    history: 15,
    course: 20,
    holes: 15,
    division: 10,
    field: 10,
    practice: 15,
  };
  let earned = 0;
  let total = 0;
  for (const item of items) {
    const w = weights[item.id] ?? 10;
    total += w;
    earned += item.status === "good" ? w : item.status === "partial" ? w * 0.5 : 0;
  }
  return { score: total ? Math.round((earned / total) * 100) : 0, items };
}

function describePractice(puttingDaysAgo: number | null, rangeDaysAgo: number | null): string {
  const parts: string[] = [];
  if (puttingDaysAgo != null)
    parts.push(`putting ${puttingDaysAgo === 0 ? "today" : `${puttingDaysAgo}d ago`}`);
  if (rangeDaysAgo != null)
    parts.push(`field work ${rangeDaysAgo === 0 ? "today" : `${rangeDaysAgo}d ago`}`);
  if (!parts.length) return "No practice sessions logged yet.";
  return `Last sessions — ${parts.join(", ")}.`;
}

/** Whole days from today until an ISO date (negative once the date has passed). */
export function daysUntilDate(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function familiarityFrom(coursePlays: number): "none" | "light" | "solid" {
  if (coursePlays >= 3) return "solid";
  if (coursePlays >= 1) return "light";
  return "none";
}
