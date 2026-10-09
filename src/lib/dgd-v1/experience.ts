/**
 * DGD V1 Phase 3.6 — player experience, course familiarity, breadth,
 * generalization and adaptability. Shadow/admin diagnostics only.
 *
 * Core idea: the DGD skill (mu) stays the estimate of GENERAL ability.
 * Everything here is computed from residuals against the player's
 * PRE-ROUND skill (event.mu_before), so experience is always historical,
 * and familiarity is centered per player so it can never be counted
 * both inside skill and again as an add-on.
 */
import {
  errorStats,
  fitLayoutDifficulty,
  replayPlayer,
  type DgdV1Config,
  type ErrorStats,
  type LayoutDifficulty,
  type Observation,
  type RatingEvent,
} from "./engine";

export const EXPERIENCE_VERSION = "dgd-experience@0.1.0";

export type ExperienceConfig = {
  /** Prior SD of a true player-layout familiarity effect (strokes). */
  familiarity_prior_sigma: number;
  /** Residual noise per round (strokes) used in shrinkage. */
  residual_sigma: number;
  /** Familiarity half-life in days without play. */
  familiarity_half_life_days: number;
  /** Share of familiarity transferred to a materially changed layout. */
  layout_change_transfer: number;
  /** Rounds at which a layout counts as "established" for the player. */
  established_layout_rounds: number;
  /** Minimum distinct layouts before Adaptability is aggregated. */
  adaptability_min_layouts: number;
  /** Evidence saturation constant for breadth (rounds). */
  breadth_saturation_rounds: number;
  /** Effective layouts that give ~63% generalization confidence. */
  generalization_scale_layouts: number;
  /** Prior SD of a course-type effect. */
  type_prior_sigma: number;
};

export const EXPERIENCE_DEFAULTS: ExperienceConfig = {
  familiarity_prior_sigma: 1.5,
  residual_sigma: 3.5,
  familiarity_half_life_days: 365,
  layout_change_transfer: 0,
  established_layout_rounds: 4,
  adaptability_min_layouts: 5,
  breadth_saturation_rounds: 3,
  generalization_scale_layouts: 6,
  type_prior_sigma: 1.0,
};

const dayNum = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// ---------- Course archetypes (only from real layout data) ----------

export type LayoutFeatureRow = {
  hole_count: number | null;
  distance_total: number | null;
  ob_area_count: number | null;
  ob_line_feet: number | null;
  water_hole_count: number | null;
};

export type CourseFeatures = {
  length: "short" | "medium" | "long" | "UNKNOWN";
  ob: "ob_heavy" | "ob_light" | "UNKNOWN";
  water: "water_heavy" | "water_light" | "UNKNOWN";
  cover: "UNKNOWN"; // wooded/open/mixed: no reliable source data yet
  elevation: "UNKNOWN";
  archetype: string; // e.g. "short|ob_heavy" or "UNKNOWN"
};

export const UNKNOWN_FEATURES: CourseFeatures = {
  length: "UNKNOWN",
  ob: "UNKNOWN",
  water: "UNKNOWN",
  cover: "UNKNOWN",
  elevation: "UNKNOWN",
  archetype: "UNKNOWN",
};

/** Classify a layout. Missing metadata stays UNKNOWN; nothing is guessed. */
export function classifyLayout(r: LayoutFeatureRow | null | undefined): CourseFeatures {
  if (!r || !r.hole_count) return UNKNOWN_FEATURES;
  const perHole = r.distance_total ? r.distance_total / r.hole_count : null;
  const length = perHole == null ? "UNKNOWN" : perHole < 250 ? "short" : perHole > 350 ? "long" : "medium";
  const obSignal = (r.ob_area_count ?? 0) + (r.ob_line_feet ?? 0) / 500;
  const ob = r.ob_area_count == null && r.ob_line_feet == null ? "UNKNOWN" : obSignal / r.hole_count >= 0.33 ? "ob_heavy" : "ob_light";
  const water = r.water_hole_count == null ? "UNKNOWN" : r.water_hole_count / r.hole_count >= 0.25 ? "water_heavy" : "water_light";
  const known = [length, ob].filter((x) => x !== "UNKNOWN");
  return {
    length,
    ob,
    water,
    cover: "UNKNOWN",
    elevation: "UNKNOWN",
    archetype: known.length ? known.join("|") : "UNKNOWN",
  };
}

// ---------- Shrinkage ----------

export type Shrunk = { mu: number; sigma: number; n: number; effective_n: number };

/**
 * Normal–normal shrinkage of weighted residuals toward 0.
 * posterior precision = 1/τ² + Σw/σ²,  mean = (Σ w·r / σ²) / precision.
 * One or two rounds stay near 0; consistent repeated evidence moves it.
 */
export function shrinkResiduals(rs: { r: number; w: number }[], priorSigma: number, noiseSigma: number): Shrunk {
  let sw = 0;
  let swr = 0;
  for (const x of rs) {
    sw += x.w;
    swr += x.w * x.r;
  }
  const prec = 1 / priorSigma ** 2 + sw / noiseSigma ** 2;
  return { mu: swr / noiseSigma ** 2 / prec, sigma: Math.sqrt(1 / prec), n: rs.length, effective_n: sw };
}

/** Versioned familiarity decay: weight of a round `ageDays` old. */
export const decayWeight = (ageDays: number, cfg: ExperienceConfig) =>
  0.5 ** (Math.max(0, ageDays) / cfg.familiarity_half_life_days);

// ---------- Per-round residuals (historical by construction) ----------

export type Resid = {
  canonical_round_id: string;
  played_on: string;
  layout_key: string;
  course_key: string | null;
  /** performance − pre-round general skill; positive = better than expected */
  r: number;
  /** how many rounds the player had on this layout BEFORE this round */
  prior_layout_rounds: number;
  competitive: boolean;
  sigma: number;
};

export function residualsFromEvents(
  events: RatingEvent[],
  layouts: Map<string, LayoutDifficulty>,
): Resid[] {
  const seen = new Map<string, number>();
  const out: Resid[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const prior = seen.get(e.layout_key) ?? 0;
    seen.set(e.layout_key, prior + 1);
    out.push({
      canonical_round_id: e.canonical_round_id,
      played_on: e.played_on,
      layout_key: e.layout_key,
      course_key: layouts.get(e.layout_key)?.course_key ?? null,
      r: e.round_performance_latent - e.mu_before,
      prior_layout_rounds: prior,
      competitive: e.source_refs.some((s) => s.source === "pdga"),
      sigma: e.observation_sigma,
    });
  }
  return out;
}

/**
 * Familiarity for each layout as of `asOf`, using only rounds before it.
 * Residuals are centered on the player's own mean residual so the
 * effects sum to ~0 across their layouts (identifiability: a uniformly
 * strong player keeps that strength in general skill, not familiarity).
 */
export function familiarityAsOf(rs: Resid[], asOf: string, cfg: ExperienceConfig): Map<string, Shrunk> {
  const past = rs.filter((x) => x.played_on < asOf);
  const out = new Map<string, Shrunk>();
  if (!past.length) return out;
  const now = dayNum(asOf.slice(0, 10));
  const center = past.reduce((s, x) => s + x.r, 0) / past.length;
  const by = new Map<string, { r: number; w: number }[]>();
  for (const x of past) {
    const arr = by.get(x.layout_key) ?? [];
    arr.push({ r: x.r - center, w: decayWeight(now - dayNum(x.played_on), cfg) });
    by.set(x.layout_key, arr);
  }
  for (const [k, arr] of by) out.set(k, shrinkResiduals(arr, cfg.familiarity_prior_sigma, cfg.residual_sigma));
  return out;
}

export function typeEffectsAsOf(
  rs: Resid[],
  asOf: string,
  features: Map<string, CourseFeatures>,
  cfg: ExperienceConfig,
): Map<string, Shrunk> {
  const past = rs.filter((x) => x.played_on < asOf);
  const out = new Map<string, Shrunk>();
  if (!past.length) return out;
  const center = past.reduce((s, x) => s + x.r, 0) / past.length;
  const by = new Map<string, { r: number; w: number }[]>();
  for (const x of past) {
    const a = features.get(x.layout_key)?.archetype ?? "UNKNOWN";
    if (a === "UNKNOWN") continue;
    const arr = by.get(a) ?? [];
    arr.push({ r: x.r - center, w: 1 });
    by.set(a, arr);
  }
  for (const [k, arr] of by) out.set(k, shrinkResiduals(arr, cfg.type_prior_sigma, cfg.residual_sigma));
  return out;
}

// ---------- Diagnostics ----------

const meanSe = (xs: number[]) => {
  if (!xs.length) return { n: 0, mean: null as number | null, se: null as number | null };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) : null;
  return { n: xs.length, mean: m, se: sd == null ? null : sd / Math.sqrt(xs.length) };
};

export type PlayerLayoutExperience = {
  user_id: string;
  layout_key: string;
  course_key: string | null;
  round_count: number;
  eligible_round_count: number;
  competitive_round_count: number;
  first_played_at: string;
  last_played_at: string;
  recent_round_count: number;
  average_dgd_round_performance: number;
  average_strokes_vs_expectation: number;
  first_time_layout_performance: number | null;
  experienced_layout_performance: number | null;
  familiarity_mu: number;
  familiarity_sigma: number;
  model_version: string;
};

export function playerLayoutExperience(
  userId: string,
  events: RatingEvent[],
  layouts: Map<string, LayoutDifficulty>,
  roundsByLayout: Map<string, number>,
  asOf: string,
  cfg: ExperienceConfig,
  recentDays: number,
): PlayerLayoutExperience[] {
  const rs = residualsFromEvents(events, layouts);
  // "Current" familiarity: everything up to and including today.
  const fam = familiarityAsOf(rs, `${asOf}~`, cfg);
  const now = dayNum(asOf);
  const by = new Map<string, { e: RatingEvent; x: Resid }[]>();
  const evById = new Map(events.map((e) => [e.canonical_round_id, e]));
  for (const x of rs) {
    const arr = by.get(x.layout_key) ?? [];
    arr.push({ e: evById.get(x.canonical_round_id)!, x });
    by.set(x.layout_key, arr);
  }
  return [...by.entries()].map(([k, arr]) => {
    const first = arr.filter((a) => a.x.prior_layout_rounds === 0).map((a) => a.x.r);
    const exp = arr.filter((a) => a.x.prior_layout_rounds >= cfg.established_layout_rounds - 1).map((a) => a.x.r);
    const f = fam.get(k) ?? { mu: 0, sigma: cfg.familiarity_prior_sigma };
    return {
      user_id: userId,
      layout_key: k,
      course_key: layouts.get(k)?.course_key ?? null,
      round_count: roundsByLayout.get(k) ?? arr.length,
      eligible_round_count: arr.length,
      competitive_round_count: arr.filter((a) => a.x.competitive).length,
      first_played_at: arr[0].e.played_on,
      last_played_at: arr[arr.length - 1].e.played_on,
      recent_round_count: arr.filter((a) => now - dayNum(a.e.played_on) <= recentDays).length,
      average_dgd_round_performance: arr.reduce((s, a) => s + a.e.round_performance_latent, 0) / arr.length,
      average_strokes_vs_expectation: arr.reduce((s, a) => s + a.e.strokes_vs_expectation, 0) / arr.length,
      first_time_layout_performance: first.length ? first[0] : null,
      experienced_layout_performance: exp.length ? exp.reduce((a, b) => a + b, 0) / exp.length : null,
      familiarity_mu: f.mu,
      familiarity_sigma: f.sigma,
      model_version: EXPERIENCE_VERSION,
    };
  });
}

export type PlayerExperienceDiagnostics = ReturnType<typeof playerExperienceDiagnostics>;

/** Player-level breadth / generalization / home dependence / adaptability. */
export function playerExperienceDiagnostics(
  events: RatingEvent[],
  layouts: Map<string, LayoutDifficulty>,
  features: Map<string, CourseFeatures>,
  asOf: string,
  cfg: ExperienceConfig,
) {
  const rs = residualsFromEvents(events, layouts);
  const n = rs.length;
  const count = (key: (x: Resid) => string | null) => {
    const m = new Map<string, number>();
    for (const x of rs) {
      const k = key(x);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const perLayout = count((x) => x.layout_key);
  const perCourse = count((x) => x.course_key);
  const perType = count((x) => features.get(x.layout_key)?.archetype ?? "UNKNOWN");
  // Evidence saturation: 1 round ≈ 0.28, 3 ≈ 0.63, 6 ≈ 0.86 of a layout.
  const sat = (k: number) => 1 - Math.exp(-k / cfg.breadth_saturation_rounds);
  const effectiveLayouts = [...perLayout.values()].reduce((s, k) => s + sat(k), 0);
  const effectiveCourses = [...perCourse.values()].reduce((s, k) => s + sat(k), 0);
  const knownTypes = [...perType.entries()].filter(([t]) => t !== "UNKNOWN");
  const typeShares = knownTypes.map(([, k]) => k / Math.max(1, knownTypes.reduce((s, [, v]) => s + v, 0)));
  const typeDiversity = typeShares.length ? Math.exp(-typeShares.reduce((s, p) => s + p * Math.log(p), 0)) : null;
  const compLayouts = new Set(rs.filter((x) => x.competitive).map((x) => x.layout_key)).size;
  const breadthEvidence = effectiveLayouts + 0.5 * Math.min(compLayouts, effectiveLayouts) + (typeDiversity ? 0.5 * (typeDiversity - 1) : 0);
  const courseBreadth = 100 * (1 - Math.exp(-breadthEvidence / 40));

  const top = [...perLayout.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCourse = [...perCourse.entries()].sort((a, b) => b[1] - a[1])[0];
  const home = top ? meanSe(rs.filter((x) => x.layout_key === top[0]).map((x) => x.r)) : meanSe([]);
  const away = top ? meanSe(rs.filter((x) => x.layout_key !== top[0]).map((x) => x.r)) : meanSe([]);
  const homeVsAway =
    home.mean != null && away.mean != null
      ? { diff: home.mean - away.mean, se: home.se != null && away.se != null ? Math.sqrt(home.se ** 2 + away.se ** 2) : null }
      : { diff: null, se: null };

  const firstTime = meanSe(rs.filter((x) => x.prior_layout_rounds === 0).map((x) => x.r));
  const early = meanSe(rs.filter((x) => x.prior_layout_rounds >= 1 && x.prior_layout_rounds <= 2).map((x) => x.r));
  const established = meanSe(rs.filter((x) => x.prior_layout_rounds >= cfg.established_layout_rounds - 1).map((x) => x.r));
  const firstLayouts = new Set(rs.filter((x) => x.prior_layout_rounds <= 2).map((x) => x.layout_key)).size;
  const adaptRaw = meanSe(rs.filter((x) => x.prior_layout_rounds <= 2).map((x) => x.r));
  const adaptability =
    firstLayouts >= cfg.adaptability_min_layouts
      ? { status: "computed" as const, ...adaptRaw, independent_layouts: firstLayouts }
      : { status: "insufficient_layouts" as const, n: adaptRaw.n, mean: null, se: null, independent_layouts: firstLayouts };

  // Generalization confidence: evidence that skill transfers across layouts.
  // Grows with effective layouts and known course-type spread; mapped-layout
  // quality scales it down when most layouts are unmatched.
  const mappedShare = n ? rs.filter((x) => features.get(x.layout_key)?.archetype !== "UNKNOWN").length / n : 0;
  const generalization = 100 * (1 - Math.exp(-effectiveLayouts / cfg.generalization_scale_layouts)) * (0.6 + 0.4 * mappedShare);

  const types = [...typeEffectsAsOf(rs, `${asOf}~`, features, cfg).entries()]
    .map(([t, s]) => ({ type: t, mu: s.mu, sigma: s.sigma, n: s.n }))
    .sort((a, b) => b.mu - a.mu);

  return {
    version: EXPERIENCE_VERSION,
    eligible_rounds: n,
    unique_layouts: perLayout.size,
    unique_courses: perCourse.size,
    effective_layout_count: effectiveLayouts,
    effective_course_count: effectiveCourses,
    competitive_layouts: compLayouts,
    course_type_diversity: typeDiversity,
    course_breadth: courseBreadth,
    generalization_confidence: generalization,
    mapped_round_share: mappedShare,
    primary_layout: top ? { layout_key: top[0], rounds: top[1], share: top[1] / n } : null,
    primary_course: topCourse ? { course_key: topCourse[0], rounds: topCourse[1], share: topCourse[1] / n } : null,
    home_layout_performance: home,
    non_home_performance: away,
    familiarity_advantage: homeVsAway,
    first_time_layout_performance: firstTime,
    early_layout_performance: early,
    established_layout_performance: established,
    adaptability,
    type_strengths: types.filter((t) => t.mu > 0).slice(0, 3),
    type_weaknesses: types.filter((t) => t.mu < 0).slice(-3).reverse(),
  };
}

// ---------- Validation: does familiarity improve prediction? ----------

const VARIANTS = ["A_dgd_v1", "B_plus_familiarity", "C_plus_course_type", "D_plus_both"] as const;
type Variant = (typeof VARIANTS)[number];

/**
 * Leakage-free: layouts, skill AND familiarity/type effects come only
 * from rounds before the cutoff, then are frozen for the test window.
 */
export function experienceHoldoutAtCutoff(
  obs: Observation[],
  c: DgdV1Config,
  cutoff: string,
  features: Map<string, CourseFeatures>,
  cfg: ExperienceConfig,
) {
  const train = obs.filter((o) => o.round.played_on < cutoff);
  const test = obs.filter((o) => o.round.played_on >= cutoff);
  if (!train.length || !test.length) return null;
  const fit = fitLayoutDifficulty(train, c, cutoff);
  const users = [...new Set(train.map((o) => o.round.user_id))];
  const mu = new Map<string, number>();
  const fam = new Map<string, Map<string, Shrunk>>();
  const typ = new Map<string, Map<string, Shrunk>>();
  const trainCount = new Map<string, number>();
  for (const u of users) {
    const uo = train.filter((o) => o.round.user_id === u);
    for (const o of uo) trainCount.set(`${u}|${o.layout_key}`, (trainCount.get(`${u}|${o.layout_key}`) ?? 0) + 1);
    const { events, state } = replayPlayer(uo, fit.layouts, c, cutoff);
    mu.set(u, state.skill_mu);
    const rs = residualsFromEvents(events, fit.layouts);
    fam.set(u, familiarityAsOf(rs, cutoff, cfg));
    typ.set(u, typeEffectsAsOf(rs, cutoff, features, cfg));
  }
  const errs: Record<string, Record<Variant, number[]>> = {};
  const push = (g: string, v: Variant, e: number) => {
    errs[g] ??= { A_dgd_v1: [], B_plus_familiarity: [], C_plus_course_type: [], D_plus_both: [] };
    errs[g][v].push(e);
  };
  for (const o of test) {
    const u = o.round.user_id;
    const L = fit.layouts.get(o.layout_key);
    const base = (L?.difficulty_mu ?? fit.anchor) - (mu.get(u) ?? c.population_prior_mu);
    const f = fam.get(u)?.get(o.layout_key)?.mu ?? 0;
    const arch = features.get(o.layout_key)?.archetype ?? "UNKNOWN";
    const t = arch === "UNKNOWN" ? 0 : typ.get(u)?.get(arch)?.mu ?? 0;
    // performance effect > 0 means better → fewer strokes
    const preds: Record<Variant, number> = {
      A_dgd_v1: base,
      B_plus_familiarity: base - f,
      C_plus_course_type: base - t,
      D_plus_both: base - f - t,
    };
    const k = trainCount.get(`${u}|${o.layout_key}`) ?? 0;
    const famGroup = k === 0 ? "unfamiliar_layout" : k >= cfg.established_layout_rounds ? "home_or_frequent_layout" : "some_experience_layout";
    const layoutGroup = L ? `layout_${L.status}` : "layout_unseen";
    for (const v of VARIANTS) {
      const e = preds[v] - o.score;
      push("overall", v, e);
      push(famGroup, v, e);
      push(layoutGroup, v, e);
    }
  }
  const stat = (r: Record<Variant, number[]>) =>
    Object.fromEntries(VARIANTS.map((v) => [v, errorStats(r[v])])) as Record<Variant, ErrorStats>;
  return {
    cutoff,
    train_rounds: train.length,
    test_rounds: test.length,
    groups: Object.fromEntries(Object.entries(errs).map(([g, r]) => [g, stat(r)])),
  };
}

export function experienceHoldout(
  obs: Observation[],
  c: DgdV1Config,
  features: Map<string, CourseFeatures>,
  cfg: ExperienceConfig = EXPERIENCE_DEFAULTS,
  fractions = [0.6, 0.7, 0.8, 0.9],
) {
  if (obs.length < 20) return null;
  const dates = obs.map((o) => o.round.played_on).sort();
  const cutoffs = [...new Set(fractions.map((f) => dates[Math.floor(dates.length * f)]))];
  const results = cutoffs.map((cut) => experienceHoldoutAtCutoff(obs, c, cut, features, cfg)).filter(Boolean) as NonNullable<
    ReturnType<typeof experienceHoldoutAtCutoff>
  >[];
  // Pooled verdict across cutoffs: activation requires a measurable gain.
  const pooled: Record<string, number> = {};
  for (const v of VARIANTS) {
    const xs = results.map((r) => r.groups.overall?.[v]?.mae).filter((x): x is number => x != null);
    pooled[v] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
  }
  const gain = (v: Variant) => pooled.A_dgd_v1 - pooled[v];
  return {
    leakage_free: true,
    cutoffs: results,
    mean_mae: pooled,
    mae_gain_vs_v1: { B_plus_familiarity: gain("B_plus_familiarity"), C_plus_course_type: gain("C_plus_course_type"), D_plus_both: gain("D_plus_both") },
    activation_threshold_strokes: 0.1,
  };
}
