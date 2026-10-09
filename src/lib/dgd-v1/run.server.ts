/**
 * DGD Core V1 shadow calculation job. Server-only.
 * Loads canonical rounds, fits + freezes layout difficulty for the model
 * version, replays every player chronologically, and writes each player
 * atomically through dgd_v1_apply_player (one transaction per player).
 * Players whose inputs are unchanged are skipped (idempotent).
 */
import { runNormalization, selectAll } from "./normalize.server";
import {
  EXPERIENCE_DEFAULTS,
  EXPERIENCE_VERSION,
  classifyLayout,
  experienceHoldout,
  playerExperienceDiagnostics,
  playerLayoutExperience,
  type CourseFeatures,
} from "./experience";
import {
  DGD_V1_DISPLAY_SCALE_STATUS,
  DGD_V1_MODEL_ID,
  chronologicalHoldout,
  coldStartInfluence,
  layoutSigma,
  singleRoundWeight,
  spearman,
  fitLayoutDifficulty,
  inputHash,
  pearson,
  replayPlayer,
  resolveConfig,
  summarize,
  toObservations,
  type CanonicalRoundInput,
  type Observation,
  type RatingEvent,
  type SourceRef,
} from "./engine";

type Admin = any;

export async function loadCanonicalInputs(admin: Admin): Promise<{
  rounds: CanonicalRoundInput[];
  externalCount: number;
  linkedExternal: number;
}> {
  const [rounds, norms, dupes, links, ext] = await Promise.all([
    selectAll(
      admin,
      "canonical_rounds",
      "id,user_id,played_on,course_key,course_name,layout_name,score,format,eligibility,has_possible_duplicate",
    ),
    selectAll(
      admin,
      "dgd_round_normalization",
      "canonical_round_id,hole_count,hole_count_origin,to_par,par_played,layout_id,layout_mapping,data_issue",
    ),
    selectAll(admin, "dgd_duplicate_reviews", "canonical_round_id,resolution"),
    selectAll(
      admin,
      "canonical_round_sources",
      "canonical_round_id,source,source_table,source_row_id,match_level,source_round_rating",
    ),
    selectAll(admin, "external_rounds", "id,to_par,score"),
  ]);
  const extById = new Map<string, any>(ext.map((e) => [e.id, e]));
  const normById = new Map<string, any>(norms.map((n) => [n.canonical_round_id, n]));
  const dupeById = new Map<string, string>(dupes.map((d) => [d.canonical_round_id, d.resolution]));
  const byRound = new Map<string, SourceRef[]>();
  for (const l of links) {
    const arr = byRound.get(l.canonical_round_id) ?? [];
    arr.push({
      source: l.source,
      source_table: l.source_table,
      source_row_id: l.source_row_id,
      match_level: l.match_level,
      source_round_rating: l.source_round_rating,
    });
    byRound.set(l.canonical_round_id, arr);
  }
  const linkedExternal = new Set(
    links.filter((l) => l.source_table === "external_rounds").map((l) => l.source_row_id),
  ).size;
  return {
    externalCount: ext.length,
    linkedExternal,
    rounds: rounds.map((r) => {
      const sources = byRound.get(r.id) ?? [];
      // to_par: take it only from a linked source whose score matches; else UNKNOWN.
      let toPar: number | null = null;
      for (const s of sources) {
        const e = s.source_table === "external_rounds" ? extById.get(s.source_row_id) : null;
        if (e && e.to_par != null && e.score === r.score) {
          toPar = e.to_par;
          break;
        }
      }
      const n = normById.get(r.id);
      if (n && n.to_par != null) toPar = n.to_par;
      return {
        id: r.id,
        user_id: r.user_id,
        played_on: r.played_on,
        course_key: r.course_key,
        course_name: r.course_name,
        layout_name: r.layout_name,
        score: r.score,
        to_par: toPar,
        hole_count: n?.hole_count ?? null, // never defaulted: null = UNKNOWN
        hole_count_origin: n?.hole_count_origin ?? "UNKNOWN",
        par_played: n?.par_played ?? null,
        layout_mapping: n?.layout_mapping ?? "UNMAPPED",
        mapped_layout_id: n?.layout_id ?? null,
        data_issue: n?.data_issue ?? null,
        duplicate_resolution: (dupeById.get(r.id) as any) ?? null,
        format: r.format,
        canonical_eligibility: r.eligibility,
        has_possible_duplicate: !!r.has_possible_duplicate,
        sources,
      };
    }),
  };
}

export async function runDgdV1(admin: Admin, triggeredBy: string | null, force = false) {
  const { data: model, error: mErr } = await admin
    .from("rating_model_versions")
    .select("id,config,status")
    .eq("id", DGD_V1_MODEL_ID)
    .single();
  if (mErr || !model) throw new Error("Model version missing");
  const c = resolveConfig(model.config);
  const { data: run, error: rErr } = await admin
    .from("dgd_calc_runs")
    .insert({ model_version: DGD_V1_MODEL_ID, triggered_by: triggeredBy })
    .select("id")
    .single();
  if (rErr || !run) throw new Error("Could not start run");
  const runId = run.id as string;
  const failures: { user_id: string; error: string }[] = [];
  try {
    const normalization = await runNormalization(admin);
    const { rounds, externalCount, linkedExternal } = await loadCanonicalInputs(admin);
    const { elig, obs } = toObservations(rounds, c);
    const asOf = new Date().toISOString().slice(0, 10);
    const fit = fitLayoutDifficulty(obs, c, asOf);
    const layoutRows = [...fit.layouts.values()];
    if (layoutRows.length) {
      const { error } = await admin.rpc("dgd_v1_apply_layouts", {
        _run: runId,
        _model: DGD_V1_MODEL_ID,
        _layouts: layoutRows,
      });
      if (error) throw new Error(`layouts: ${error.message}`);
    }
    const { data: existing } = await admin
      .from("dgd_player_state")
      .select("user_id,input_hash")
      .eq("model_version", DGD_V1_MODEL_ID);
    const prevHash = new Map<string, string>((existing ?? []).map((s: any) => [s.user_id, s.input_hash]));

    const users = [...new Set(rounds.map((r) => r.user_id))];
    let written = 0;
    let skipped = 0;
    const allEvents: (RatingEvent & { user_id: string })[] = [];
    const states: any[] = [];
    for (const u of users) {
      const uObs = obs.filter((o) => o.round.user_id === u);
      const uElig = elig.filter((e) => rounds.find((r) => r.id === e.canonical_round_id)?.user_id === u);
      const { events, state } = replayPlayer(uObs, fit.layouts, c, asOf);
      allEvents.push(...events.map((e) => ({ ...e, user_id: u })));
      states.push({ user_id: u, ...state, ineligible_rounds: uElig.filter((e) => !e.eligible).length });
      // input hash also covers the eligibility verdicts
      const hash = `${inputHash(DGD_V1_MODEL_ID, uObs, fit.layouts)}:${uElig.length}:${uElig.map((e) => e.state[0]).sort().join("")}`;
      if (!force && prevHash.get(u) === hash) {
        skipped++;
        continue;
      }
      const { data: n, error } = await admin.rpc("dgd_v1_apply_player", {
        _run: runId,
        _user: u,
        _model: DGD_V1_MODEL_ID,
        _state: { ...state, ineligible_rounds: uElig.filter((e) => !e.eligible).length, input_hash: hash },
        _events: events,
        _eligibility: uElig.map((e) => ({
          canonical_round_id: e.canonical_round_id,
          eligible: e.eligible,
          state: e.state,
          reason_codes: e.reason_codes,
          reasons: e.reasons,
          layout_key: e.layout_key,
        })),
      });
      if (error) failures.push({ user_id: u, error: error.message.slice(0, 200) });
      else written += Number(n ?? 0);
    }

    const experience = await writeExperience(admin, runId, rounds, obs, allEvents, fit, c, asOf);

    const validation = buildValidation({
      rounds,
      elig,
      obs,
      events: allEvents,
      states,
      layouts: layoutRows,
      fit,
      externalCount,
      linkedExternal,
      c,
      normalization,
    });
    (validation as any).experience = experience;
    await admin
      .from("dgd_calc_runs")
      .update({
        status: failures.length ? "failed" : "succeeded",
        players_seen: users.length,
        players_skipped: skipped,
        events_written: written,
        layouts_fitted: layoutRows.length,
        iteration_count: fit.iterations,
        convergence_status: fit.convergence_status,
        final_delta: fit.final_delta,
        stop_reason: fit.stop_reason,
        failures,
        validation,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    return { runId, players: users.length, skipped, written, failures: failures.length };
  } catch (e) {
    await admin
      .from("dgd_calc_runs")
      .update({
        status: "failed",
        failures: [...failures, { user_id: "*", error: String((e as Error).message).slice(0, 300) }],
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
    throw e;
  }
}

/** Phase 3.6: experience/familiarity diagnostics (shadow, admin-only). */
async function writeExperience(
  admin: Admin,
  runId: string,
  rounds: CanonicalRoundInput[],
  obs: Observation[],
  events: (RatingEvent & { user_id: string })[],
  fit: ReturnType<typeof fitLayoutDifficulty>,
  c: ReturnType<typeof resolveConfig>,
  asOf: string,
) {
  const cfg = EXPERIENCE_DEFAULTS;
  // Features only for layout keys mapped (EXACT/HIGH) to a real app layout.
  const mappedId = new Map<string, string>();
  for (const o of obs)
    if (o.round.mapped_layout_id && (o.round.layout_mapping === "EXACT" || o.round.layout_mapping === "HIGH_CONFIDENCE"))
      mappedId.set(o.layout_key, o.round.mapped_layout_id);
  const ids = [...new Set(mappedId.values())];
  const { data: lrows } = ids.length
    ? await admin
        .from("course_layouts")
        .select("id,hole_count,distance_total,ob_area_count,ob_line_feet,water_hole_count")
        .in("id", ids)
    : { data: [] };
  const lById = new Map<string, any>((lrows ?? []).map((r: any) => [r.id, r]));
  const features = new Map<string, CourseFeatures>();
  for (const k of fit.layouts.keys()) features.set(k, classifyLayout(lById.get(mappedId.get(k) ?? "")));

  const allRoundsByUserLayout = new Map<string, number>();
  for (const o of obs) allRoundsByUserLayout.set(`${o.round.user_id}|${o.layout_key}`, (allRoundsByUserLayout.get(`${o.round.user_id}|${o.layout_key}`) ?? 0) + 1);

  const users = [...new Set(events.map((e) => e.user_id))];
  const layoutRows: any[] = [];
  const playerRows: any[] = [];
  for (const u of users) {
    const ev = events.filter((e) => e.user_id === u);
    const counts = new Map<string, number>();
    for (const [k, n] of allRoundsByUserLayout) if (k.startsWith(`${u}|`)) counts.set(k.slice(u.length + 1), n);
    for (const r of playerLayoutExperience(u, ev, fit.layouts, counts, asOf, cfg, c.recent_window_days))
      layoutRows.push({ ...r, model_version: DGD_V1_MODEL_ID, experience_version: EXPERIENCE_VERSION, run_id: runId });
    const d = playerExperienceDiagnostics(ev, fit.layouts, features, asOf, cfg);
    playerRows.push({
      model_version: DGD_V1_MODEL_ID,
      experience_version: EXPERIENCE_VERSION,
      run_id: runId,
      user_id: u,
      course_breadth: d.course_breadth,
      generalization_confidence: d.generalization_confidence,
      effective_layout_count: d.effective_layout_count,
      unique_layouts: d.unique_layouts,
      unique_courses: d.unique_courses,
      diagnostics: d,
    });
  }
  await admin.from("dgd_player_layout_experience").delete().eq("model_version", DGD_V1_MODEL_ID);
  for (let i = 0; i < layoutRows.length; i += 500) {
    const { error } = await admin.from("dgd_player_layout_experience").insert(layoutRows.slice(i, i + 500));
    if (error) throw new Error(`experience: ${error.message}`);
  }
  if (playerRows.length) {
    const { error } = await admin.from("dgd_player_experience").upsert(playerRows, { onConflict: "model_version,user_id" });
    if (error) throw new Error(`player experience: ${error.message}`);
  }
  const featureCounts: Record<string, number> = {};
  for (const f of features.values()) featureCounts[f.archetype] = (featureCounts[f.archetype] ?? 0) + 1;
  return {
    version: EXPERIENCE_VERSION,
    config: cfg,
    layouts_with_known_archetype: [...features.values()].filter((f) => f.archetype !== "UNKNOWN").length,
    archetype_counts: featureCounts,
    player_layout_rows: layoutRows.length,
    familiarity_abs_mu: summarize(layoutRows.map((r) => Math.abs(r.familiarity_mu))),
    holdout: experienceHoldout(obs, c, features, cfg),
  };
}

function buildValidation(x: {
  rounds: CanonicalRoundInput[];
  elig: ReturnType<typeof toObservations>["elig"];
  obs: Observation[];
  events: (RatingEvent & { user_id: string })[];
  states: any[];
  layouts: any[];
  fit: ReturnType<typeof fitLayoutDifficulty>;
  externalCount: number;
  linkedExternal: number;
  c: ReturnType<typeof resolveConfig>;
  normalization: Awaited<ReturnType<typeof runNormalization>>;
}) {
  const reasonCounts: Record<string, number> = {};
  for (const e of x.elig) for (const r of e.reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
  // Prequential MAE: expected score is computed before the round updates state.
  const warm = x.events.filter((e) => e.seq > 3);
  const mae = warm.length
    ? warm.reduce((s, e) => s + Math.abs(e.strokes_vs_expectation), 0) / warm.length
    : null;
  // One pair per canonical round (a linked round can carry several PDGA refs).
  const pdgaPairs: [number, number][] = [];
  const pdgaRows: { canonical_round_id: string; dgd: number; pdga: number }[] = [];
  const udiscPairs: [number, number][] = [];
  for (const e of x.events) {
    const p = e.source_refs.find((s) => s.source === "pdga" && s.source_round_rating != null);
    if (p) {
      pdgaPairs.push([e.round_performance_latent, p.source_round_rating!]);
      pdgaRows.push({ canonical_round_id: e.canonical_round_id, dgd: e.round_performance_latent, pdga: p.source_round_rating! });
    }
    const u = e.source_refs.find((s) => s.source === "udisc" && s.source_round_rating != null);
    if (u) udiscPairs.push([e.round_performance_latent, u.source_round_rating!]);
  }
  // Linear fit PDGA ~ a + b·DGD to flag outliers by standardized residual.
  let pdgaDiag: any = null;
  if (pdgaPairs.length >= 5) {
    const n = pdgaPairs.length;
    const mx = pdgaPairs.reduce((a, p) => a + p[0], 0) / n;
    const my = pdgaPairs.reduce((a, p) => a + p[1], 0) / n;
    const sxx = pdgaPairs.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    const b = sxx ? pdgaPairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx : 0;
    const a0 = my - b * mx;
    const res = pdgaRows.map((r) => ({ ...r, resid: r.pdga - (a0 + b * r.dgd) }));
    const sd = Math.sqrt(res.reduce((s, r) => s + r.resid ** 2, 0) / Math.max(1, n - 2));
    pdgaDiag = {
      slope_pdga_points_per_dgd_stroke: b,
      intercept: a0,
      residual_sd: sd,
      outliers: res.filter((r) => Math.abs(r.resid) > 2.5 * sd).slice(0, 20),
      dgd_range: summarize(pdgaPairs.map((p) => p[0])),
      pdga_range: summarize(pdgaPairs.map((p) => p[1])),
    };
  }
  // Reconciliation: every canonical round lands in exactly one state.
  const states = { ELIGIBLE: 0, INELIGIBLE: 0, PENDING_REVIEW: 0, EXCLUDED: 0 } as Record<string, number>;
  const codeCounts: Record<string, number> = {};
  const codeOverlap: Record<string, number> = {};
  for (const e of x.elig) {
    states[e.state]++;
    for (const r of e.reason_codes) codeCounts[r] = (codeCounts[r] ?? 0) + 1;
    const blocking = e.reason_codes.filter((r) => !["UNKNOWN_LAYOUT", "UNKNOWN_HOLE_COUNT", "POSSIBLE_LAYOUT_MAPPING"].includes(r));
    if (blocking.length > 1) codeOverlap[blocking.join("+")] = (codeOverlap[blocking.join("+")] ?? 0) + 1;
  }
  const evaluated = x.elig.length;
  const sumStates = Object.values(states).reduce((a, b) => a + b, 0);
  const counted = new Set(x.events.map((e) => e.canonical_round_id)).size;
  const layoutMap = new Map(x.layouts.map((l: any) => [l.layout_key, l]));
  const established = x.layouts.find((l: any) => l.status === "established");
  const playerSigma = 2;
  const reconciliation = {
    total_source_records: x.externalCount,
    source_records_linked: x.linkedExternal,
    total_canonical_physical_rounds: x.rounds.length,
    total_evaluated_for_dgd_v1: evaluated,
    eligible: states.ELIGIBLE,
    ineligible: states.INELIGIBLE,
    pending_review: states.PENDING_REVIEW,
    excluded: states.EXCLUDED,
    possible_duplicates_flagged: x.rounds.filter((r) => r.has_possible_duplicate).length,
    possible_duplicates_unresolved: codeCounts.POSSIBLE_DUPLICATE ?? 0,
    states_sum_equals_evaluated: sumStates === evaluated,
    eligible_rounds_counted_once: counted === states.ELIGIBLE,
    reason_code_counts: codeCounts,
    overlapping_blocking_codes: codeOverlap,
    unique_not_eligible_rounds: evaluated - states.ELIGIBLE,
  };
  const outlierRounds = x.events
    .filter((e) => Math.abs(e.strokes_vs_expectation) > 3 * e.observation_sigma)
    .map((e) => ({
      canonical_round_id: e.canonical_round_id,
      played_on: e.played_on,
      layout_key: e.layout_key,
      expected: e.expected_score,
      actual: e.actual_score,
    }))
    .slice(0, 25);
  const total = x.rounds.length;
  const eligible = x.elig.filter((e) => e.eligible).length;
  return {
    computed_at: new Date().toISOString(),
    canonicalized_pct: x.externalCount ? (100 * x.linkedExternal) / x.externalCount : null,
    canonical_rounds: total,
    eligible_rounds: eligible,
    eligible_pct: total ? (100 * eligible) / total : null,
    ineligible_reasons: reasonCounts,
    players: x.states.length,
    layouts: x.layouts.length,
    display_scale_status: DGD_V1_DISPLAY_SCALE_STATUS,
    reconciliation,
    normalization: { ...x.normalization, data_issues: x.normalization.data_issues.slice(0, 60) },
    layout_status: {
      unrated: x.layouts.filter((l) => l.status === "unrated").length,
      provisional: x.layouts.filter((l) => l.status === "provisional").length,
      developing: x.layouts.filter((l) => l.status === "developing").length,
      established: x.layouts.filter((l) => l.status === "established").length,
    },
    layout_diversity: {
      rounds_per_layout: summarize(x.layouts.map((l: any) => l.sample_size)),
      unique_players_per_layout: summarize(x.layouts.map((l: any) => l.player_count)),
      effective_players_per_layout: summarize(x.layouts.map((l: any) => l.effective_player_count)),
      layouts_with_3plus_effective_players: x.layouts.filter((l: any) => l.effective_player_count >= 3).length,
      skill_range: summarize(x.layouts.map((l: any) => l.skill_range).filter((v: any) => v != null)),
      recent_rounds_per_layout: summarize(x.layouts.map((l: any) => l.recent_round_count)),
      top_by_rounds: [...x.layouts]
        .sort((a: any, b: any) => b.sample_size - a.sample_size)
        .slice(0, 10)
        .map((l: any) => ({ layout_key: l.layout_key, n: l.sample_size, players: l.player_count, eff: l.effective_player_count, status: l.status })),
    },
    layout_fit: {
      iterations: x.fit.iterations,
      converged: x.fit.converged,
      convergence_status: x.fit.convergence_status,
      stop_reason: x.fit.stop_reason,
      final_delta: x.fit.final_delta,
      thresholds: { skill: x.c.convergence_max_skill_delta, layout: x.c.convergence_max_layout_delta, max_iterations: x.c.layout_max_iterations },
      history: x.fit.history,
      anchor: x.fit.anchor,
    },
    cold_start: {
      observed_by_layout_status: coldStartInfluence(x.events, layoutMap as any),
      one_round_weight_for_player_sigma_2: {
        established: established ? singleRoundWeight((established as any).difficulty_sigma, playerSigma, x.c) : null,
        single_player_layout_20_rounds: singleRoundWeight(layoutSigma(20, 1, x.c), playerSigma, x.c),
        provisional_5_rounds_1_player: singleRoundWeight(layoutSigma(5, 1, x.c), playerSigma, x.c),
        unseen_layout: singleRoundWeight(x.c.layout_prior_sigma, playerSigma, x.c),
      },
    },
    prequential_expected_score_mae: mae,
    prequential_rounds: warm.length,
    holdout: chronologicalHoldout(x.obs, x.c),
    rating_distribution: summarize(x.states.filter((s) => s.eligible_rounds).map((s) => s.display_rating)),
    round_performance_distribution: summarize(x.events.map((e) => e.round_performance_display)),
    confidence_distribution: summarize(x.states.map((s) => s.confidence)),
    confidence_vs_observations: x.states.map((s) => ({
      eligible_rounds: s.eligible_rounds,
      effective_observations: Math.round(s.effective_observations * 10) / 10,
      confidence: Math.round(s.confidence * 10) / 10,
    })),
    round_perf_vs_pdga_round_rating_r: pearson(pdgaPairs),
    round_perf_vs_pdga_pairs: pdgaPairs.length,
    pdga_comparison: {
      metric: "Pearson product-moment correlation coefficient (r), range -1 to +1; Spearman rank correlation also reported",
      x: "DGD round performance (latent strokes better than a population-average player on that layout = layout difficulty − score)",
      y: "Official PDGA round rating from the linked PDGA source record",
      sample: "Eligible canonical rounds that have both values, one pair per physical round",
      formula: "r = Σ(x−x̄)(y−ȳ) / √(Σ(x−x̄)² · Σ(y−ȳ)²)",
      n: pdgaPairs.length,
      pearson_r: pearson(pdgaPairs),
      spearman_rho: spearman(pdgaPairs),
      expected_sign: "positive (better DGD performance ↔ higher PDGA rating)",
      diagnostics: pdgaDiag,
      note: "Diagnostic only; DGD V1 is never optimized toward PDGA correlation.",
    },
    round_perf_vs_udisc_value_r: pearson(udiscPairs),
    round_perf_vs_udisc_pairs: udiscPairs.length,
    player_level_correlations:
      x.states.length < 5 ? "not computable: fewer than 5 rated players" : "see per-player inspector",
    outlier_rounds: outlierRounds,
    outlier_layouts: x.layouts
      .filter((l) => l.sample_size >= 3)
      .sort((a, b) => b.difficulty_mu - a.difficulty_mu)
      .filter((_, i, arr) => i < 3 || i >= arr.length - 3)
      .map((l) => ({ layout_key: l.layout_key, difficulty_mu: l.difficulty_mu, n: l.sample_size })),
  };
}
