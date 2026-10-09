import { v13Options, V13_RESEARCH_CANDIDATE } from "./candidate-v13";
/**
 * Phase 5A.4 — server-only: PDGA context enrichment and the V1.2 research
 * report. Enrichment writes only pdga_round_context (separate, with
 * provenance; old rows superseded, never deleted). The report is read-only.
 * Nothing here writes V1 or V1.1 rows.
 */
import { selectAll } from "./normalize.server";
import { fetchCalibrationSubject } from "./calibration.server";
import { loadShadowWorld, STRICT_FLAGS } from "./shadow.server";
import { backtest, type CandRound } from "./candidate";
import { toCandRounds } from "./candidate-report";
import { detectRatingConflicts } from "./v12-shadow";
import { eventRoundLayoutKey } from "./pdga-context";
import { V12_SHADOW_FLAGS } from "./candidate-v12";
import { backtestV12, connectionPaths, formConfidence, formDisplay, formValue, FORM_METHODS, V12_MODEL_ID, V12_REFERENCE, type V12Prediction } from "./candidate-v12";
import { contextCoverage, contextReplayFrom, matchPdgaContext, CONTEXT_STATUSES, type DetailRow, type RoundContextRecord } from "./pdga-context";
import { directionalAgreement, errorMetrics } from "./recent-audit";
import { pearson, spearman } from "./source-audit";

type Admin = any;
const CAL_COLS = "id,subject_id,pdga_event_id,event_name,division,round_number,played_on,score,round_rating,layout_node_ids,layout_name,hole_count,par,distance_ft,source_url,fetched_at";

/** Refreshes PDGA detail pages for app players (optional) and stores matched context. */
export async function enrichPdgaContext(admin: Admin, opts: { refresh?: boolean; by?: string | null; users?: string[] } = {}) {
  const [profiles, ext, subjects, current] = await Promise.all([
    selectAll(admin, "profiles", "id,pdga_number"),
    selectAll(admin, "external_rounds", "id,user_id,source,pdga_event_ref,event_name,played_on,division,score"),
    selectAll(admin, "dgd_calibration_subjects", "id,pdga_number,linked_user_id"),
    selectAll(admin, "pdga_round_context", "id,external_round_id,layout_node_ids,par,hole_count,distance_ft,played_on,superseded_at"),
  ]);
  const pdgaExt = (ext as any[]).filter((e) => e.source === "pdga");
  const users = [...new Set(pdgaExt.map((e) => e.user_id))].filter((u) => !opts.users || opts.users.includes(u));
  const out: any[] = [];
  const all: RoundContextRecord[] = [];
  for (const u of users) {
    const num = (profiles as any[]).find((p) => p.id === u)?.pdga_number;
    if (!num) { out.push({ user: u.slice(0, 8), status: "NO_PDGA_NUMBER" }); continue; }
    if (opts.refresh) await fetchCalibrationSubject(admin, String(num), opts.by ?? null);
    const subj = (subjects as any[]).find((s) => s.pdga_number === String(num)) ??
      (await admin.from("dgd_calibration_subjects").select("id").eq("pdga_number", String(num)).maybeSingle()).data;
    if (!subj) { out.push({ user: u.slice(0, 8), status: "NO_DETAIL_PAGE" }); continue; }
    const { data: det } = await admin.from("dgd_calibration_rounds").select(CAL_COLS).eq("subject_id", subj.id).limit(5000);
    const recs = matchPdgaContext(pdgaExt.filter((e) => e.user_id === u), (det ?? []) as DetailRow[]);
    all.push(...recs);
    const prev = new Map<string, any>((current as any[]).filter((c) => !c.superseded_at && pdgaExt.some((e) => e.id === c.external_round_id && e.user_id === u)).map((c) => [c.external_round_id, c]));
    const next = new Map(recs.map((r) => [r.external_round_id, r]));
    const replayFrom = contextReplayFrom(prev, next);
    const sig = (r: any) => `${(r.layout_node_ids ?? []).join(",")}|${r.par}|${r.hole_count}|${r.distance_ft}`;
    const changed = recs.filter((r) => !prev.has(r.external_round_id) || sig(prev.get(r.external_round_id)) !== sig(r));
    const supersede = changed.map((r) => prev.get(r.external_round_id)?.id).filter(Boolean);
    if (supersede.length) await admin.from("pdga_round_context").update({ superseded_at: new Date().toISOString() }).in("id", supersede);
    for (let i = 0; i < changed.length; i += 500) {
      const { error } = await admin.from("pdga_round_context").insert(changed.slice(i, i + 500));
      if (error) throw new Error(`Could not save round context: ${error.message.slice(0, 120)}`);
    }
    out.push({ user: u.slice(0, 8), status: "OK", written: changed.length, superseded: supersede.length, replay_from: replayFrom, ...contextCoverage(pdgaExt.filter((e) => e.user_id === u).length, recs) });
  }
  return { players: out, overall: contextCoverage(pdgaExt.length, all) };
}

/** Overlays recovered PDGA context on canonical rounds (raw source rows untouched). */
export function overlayContext(cand: CandRound[], canonById: Map<string, any>, ctx: Map<string, any>, pdgaIds: Set<string>): CandRound[] {
  return cand.map((r) => {
    const src = canonById.get(r.id)?.sources.find((s: any) => s.source_table === "external_rounds" && pdgaIds.has(s.source_row_id));
    const c = src ? ctx.get(src.source_row_id) : null;
    if (!c) return r;
    const node = c.layout_node_ids.length === 1 ? c.layout_node_ids[0] : null;
    return { ...r, event: c.pdga_event_id ?? r.event, round_number: c.round_number ?? r.round_number, node, pools: c.layout_node_ids.length, layout_name: c.layout_name, par: c.par, holes: c.hole_count, distance_ft: c.distance_ft };
  });
}

/** Reliable full-field sizes from synced PDGA event results, per event + division. */
export function fullFieldLookup(rows: { event_ref: string; division: string | null }[]) {
  const by = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.event_ref}|${r.division ?? "?"}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  // Only when every division seen on this layout has a synced field.
  return (_erl: string, event: string, divisions: string[]) => {
    let n = 0;
    for (const d of divisions) {
      const c = by.get(`${event}|${d}`);
      if (c == null) return null;
      n += c;
    }
    return n || null;
  };
}

/**
 * The V1.2 shadow-champion world: app canonical rounds with recovered PDGA
 * context, plus calibration players without app accounts as event-field
 * evidence. Fixed reference frame; frozen production flags.
 */
export async function loadV12World(admin: Admin, opts: { v13?: boolean } = {}) {
  const world = await loadShadowWorld(admin);
  const [ctxRows, calRows, subjects, ext, field] = await Promise.all([
    selectAll(admin, "pdga_round_context", "external_round_id,round_number,layout_node_ids,layout_name,hole_count,par,distance_ft,pdga_event_id,match_method,superseded_at"),
    selectAll(admin, "dgd_calibration_rounds", CAL_COLS),
    selectAll(admin, "dgd_calibration_subjects", "id,linked_user_id"),
    selectAll(admin, "external_rounds", "id,source"),
    selectAll(admin, "pdga_event_field", "event_ref,division"),
  ]);
  const ctx = new Map<string, any>((ctxRows as any[]).filter((c) => !c.superseded_at).map((c) => [c.external_round_id, c]));
  const pdgaIds = new Set((ext as any[]).filter((e) => e.source === "pdga").map((e) => e.id));
  const canonById = new Map(world.rounds.map((r) => [r.id, r]));
  const app = overlayContext(world.cand, canonById, ctx, pdgaIds);
  const linked = new Set((subjects as any[]).filter((s) => s.linked_user_id).map((s) => s.id));
  const calField = toCandRounds(calRows as any).filter((r) => !linked.has(r.player.slice(4)));
  const all = [...app, ...calField];
  const t0 = Date.now();
  const fullField = fullFieldLookup(field as any);
  const res = backtestV12(all, V12_SHADOW_FLAGS, undefined, { fullField });
  // V1.3 research candidate: same engine, same inputs, frozen Candidate D hooks. Never touches V1.2 output.
  const res13 = opts.v13 ? backtestV12(all, V12_SHADOW_FLAGS, undefined, v13Options(V13_RESEARCH_CANDIDATE, { fullField })) : null;
  // Source conflicts among rounds belonging to app players, judged against everyone on the same listed layout.
  const appIds = new Set(app.map((r) => r.id));
  const conflicts = detectRatingConflicts(all, eventRoundLayoutKey).filter((c) => appIds.has(c.round_id));
  for (const [extId, c] of ctx) {
    if (c.match_method !== "AMBIGUOUS") continue;
    const canon = world.rounds.find((r) => r.sources.some((s: any) => s.source_row_id === extId));
    if (canon) conflicts.push({ round_id: canon.id, player: canon.user_id, kind: "AMBIGUOUS_LAYOUT_MATCH", detail: { external_round_id: extId } });
  }
  return { world, app, calField, all, res, res13, conflicts, ctx, compute_ms: Date.now() - t0 };
}

const r2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : +x.toFixed(2));
const metrics = (ps: { err: number }[]) => {
  const m = errorMetrics(ps.map((p) => p.err));
  return { n: m.sample_size, bias: r2(m.mean_error_bias), mae: r2(m.mae), median_ae: r2(m.median_absolute_error), rmse: r2(m.rmse) };
};

function strata(preds: V12Prediction[]) {
  const ps = preds.filter((p) => p.prior_events >= 1);
  const out: Record<string, ReturnType<typeof metrics>> = { all: metrics(ps) };
  for (const s of CONTEXT_STATUSES) out[s] = metrics(ps.filter((p) => p.context_status === s));
  out.first_time_layout = metrics(ps.filter((p) => p.mapping === "EXACT" && p.layout_rounds_before === 0));
  out.post_inactivity_90d = metrics(ps.filter((p) => (p.gap ?? 0) >= 90));
  return out;
}

/** V1.1 predictions tagged with a context status so strata line up. */
const tagV11 = (preds: any[], cand: CandRound[]): V12Prediction[] => {
  const byId = new Map(cand.map((r) => [r.id, r]));
  return preds.map((p) => {
    const r = byId.get(p.id)!;
    const known = p.mapping === "EXACT" || p.mapping === "HIGH_CONFIDENCE";
    const st = known ? (p.layout_rounds_before >= 10 ? "ESTABLISHED_LAYOUT" : p.layout_rounds_before >= 1 ? "PROVISIONAL_LAYOUT" : "EXACT_LAYOUT") : r?.par != null && r?.holes ? "STRUCTURAL_CONTEXT_ONLY" : "INSUFFICIENT_CONTEXT";
    return { ...p, context_status: st, context_sigma: 0, field_others: 0, erl_key: null };
  });
};

function perfValidation(preds: V12Prediction[], official: Map<string, number | null>) {
  const rated = preds.filter((p) => p.round_rating != null && p.prior_events >= 1);
  const dir = directionalAgreement(
    rated.filter((p) => official.get(p.player) != null).map((p) => ({ id: p.id, pdga_signal: (p.round_rating as number) - (official.get(p.player) as number), dgd_signal: p.perf - p.mu_before })),
  );
  const x = rated.map((p) => p.perf);
  const y = rated.map((p) => p.round_rating as number);
  const withField = rated.filter((p) => p.perf_ctx != null);
  return {
    n: rated.length,
    pearson: pearson(x, y),
    spearman: spearman(x, y),
    direction: { sample: dir.sample, agree: dir.agree, disagree: dir.disagree, strong: dir.strong },
    signal_pearson: pearson(dir.rows.map((r) => r.pdga_signal), dir.rows.map((r) => r.dgd_signal)),
    signal_spearman: spearman(dir.rows.map((r) => r.pdga_signal), dir.rows.map((r) => r.dgd_signal)),
    field_rounds: withField.length,
    baseline_vs_rating_pearson: pearson(withField.map((p) => p.perf_baseline), withField.map((p) => p.round_rating as number)),
    contextual_vs_rating_pearson: pearson(withField.map((p) => p.perf_ctx as number), withField.map((p) => p.round_rating as number)),
  };
}

/** Next-round check: does each Form method predict the next performance better than Skill? */
function formResearch(preds: V12Prediction[]) {
  const byPlayer = new Map<string, V12Prediction[]>();
  for (const p of preds) byPlayer.set(p.player, [...(byPlayer.get(p.player) ?? []), p]);
  const res: Record<string, any> = {};
  for (const m of FORM_METHODS) {
    const eForm: number[] = [];
    const eSkill: number[] = [];
    let unavailable = 0;
    for (const ps of byPlayer.values()) {
      for (let i = 8; i < ps.length; i++) {
        const t = ps[i];
        if (t.context_status === "INSUFFICIENT_CONTEXT" || t.context_status === "STRUCTURAL_CONTEXT_ONLY") continue;
        const f = formValue(ps.slice(0, i), m);
        if (f == null) { unavailable++; continue; }
        eForm.push(t.perf - f);
        eSkill.push(t.perf - t.mu_before);
      }
    }
    res[m] = { n: eForm.length, unavailable, form_mae: metrics(eForm.map((err) => ({ err }))).mae, skill_mae_same_rounds: metrics(eSkill.map((err) => ({ err }))).mae };
  }
  return res;
}

export async function v12Report(admin: Admin) {
  const world = await loadShadowWorld(admin);
  const [ctxRows, calRows, subjects, profiles, ext] = await Promise.all([
    selectAll(admin, "pdga_round_context", "external_round_id,round_number,layout_node_ids,layout_name,hole_count,par,distance_ft,pdga_event_id,match_method,superseded_at"),
    selectAll(admin, "dgd_calibration_rounds", CAL_COLS),
    selectAll(admin, "dgd_calibration_subjects", "id,pdga_number,linked_user_id,official_rating"),
    selectAll(admin, "profiles", "id,pdga_number,pdga_rating"),
    selectAll(admin, "external_rounds", "id,source"),
  ]);
  const ctx = new Map<string, any>((ctxRows as any[]).filter((c) => !c.superseded_at).map((c) => [c.external_round_id, c]));
  const pdgaIds = new Set((ext as any[]).filter((e) => e.source === "pdga").map((e) => e.id));
  const canonById = new Map(world.rounds.map((r) => [r.id, r]));

  // App rounds: original (as V1.1 sees them) and with recovered context overlaid.
  const appOrig = world.cand;
  const appCtx: CandRound[] = appOrig.map((r) => {
    const src = canonById.get(r.id)?.sources.find((s) => s.source_table === "external_rounds" && pdgaIds.has(s.source_row_id));
    const c = src ? ctx.get(src.source_row_id) : null;
    if (!c) return r;
    const node = c.layout_node_ids.length === 1 ? c.layout_node_ids[0] : null;
    return {
      ...r,
      event: c.pdga_event_id ?? r.event,
      round_number: c.round_number ?? r.round_number,
      node,
      pools: c.layout_node_ids.length,
      layout_name: c.layout_name,
      par: c.par,
      holes: c.hole_count,
      distance_ft: c.distance_ft,
    };
  });
  const linkedSubjects = new Set((subjects as any[]).filter((s) => s.linked_user_id).map((s) => s.id));
  const calAll = toCandRounds(calRows as any);
  // Event-field observations: calibration players without an app account here.
  const calField = calAll.filter((r) => !linkedSubjects.has(r.player.slice(4)));
  const appPlayers = new Set(appOrig.map((r) => r.player));
  const official = new Map<string, number | null>();
  for (const p of profiles as any[]) official.set(p.id, p.pdga_rating ?? null);
  for (const s of subjects as any[]) official.set(`cal:${s.id}`, s.official_rating ?? null);

  const flagsCD = { ctxSigma: false, contextUpdate: true };
  const flagsD = { ctxSigma: true, contextUpdate: true };
  const appModels = {
    A_v11_frozen: tagV11(world.res.predictions, appOrig),
    B_fixed_anchor: backtestV12([...appOrig, ...calField], flagsCD).predictions,
    C_fixed_anchor_context: backtestV12([...appCtx, ...calField], flagsCD).predictions,
    D_context_uncertainty: backtestV12([...appCtx, ...calField], flagsD).predictions,
  };
  const onlyApp = (ps: V12Prediction[]) => ps.filter((p) => appPlayers.has(p.player));
  const calModels = {
    A_v11_frozen: tagV11(backtest(calAll, STRICT_FLAGS).predictions, calAll),
    B_fixed_anchor: backtestV12(calAll, flagsCD).predictions,
    D_context_uncertainty: backtestV12(calAll, flagsD).predictions,
  };

  // Context coverage for app PDGA rows.
  const appPdgaCtx = [...ctx.values()];
  const coverage = contextCoverage(pdgaIds.size, appPdgaCtx);
  const statusMix = (ps: V12Prediction[]) => ps.reduce((a: Record<string, number>, p) => ((a[p.context_status] = (a[p.context_status] ?? 0) + 1), a), {});

  // Event-round-layout grouping + field coverage among app rounds.
  const dD = onlyApp(appModels.D_context_uncertainty);
  const erl = new Set(dD.map((p) => p.erl_key).filter(Boolean));
  const fieldCov = { app_rounds: dD.length, with_erl_key: dD.filter((p) => p.erl_key).length, with_field: dD.filter((p) => p.field_others >= 2).length, distinct_event_round_layouts: erl.size, median_field_size: (() => { const xs = dD.filter((p) => p.field_others >= 2).map((p) => p.field_others).sort((a, b) => a - b); return xs.length ? xs[xs.length >> 1] : null; })() };

  // 236190 recent-round replay (by PDGA number).
  const uid = (num: string) => (profiles as any[]).find((p) => String(p.pdga_number) === num)?.id as string | undefined;
  const u236 = uid("236190");
  const u280 = uid("280905");
  const replay = (() => {
    if (!u236) return null;
    const a = new Map(appModels.A_v11_frozen.map((p) => [p.id, p]));
    const d = appModels.D_context_uncertainty.filter((p) => p.player === u236);
    // The rounds flagged in Phase 5A.3: inside the latest 20, at those events.
    const pick = d.slice(-20).filter((p) => /eureka|ledgestone|world/i.test(world.meta.get(p.id)?.event_name ?? ""));
    return pick.map((p) => {
      const x = a.get(p.id);
      return {
        event: world.meta.get(p.id)?.event_name, played_on: p.played_on, score: p.actual, pdga_round_rating: p.round_rating,
        before: x ? { context: x.context_status, expected: r2(x.expected), course_difficulty: r2(x.baseline_layout_difficulty), performance: r2(x.perf), skill_gain_pct: r2(100 * x.gain), skill_move: r2(x.mu_after - x.mu_before) } : null,
        after: { context: p.context_status, expected: r2(p.expected), course_difficulty: r2(p.baseline_layout_difficulty), event_adjustment: r2(p.event_round_adjustment), field: p.field_others, performance: r2(p.perf), skill_gain_pct: r2(100 * p.gain), skill_move: r2(p.mu_after - p.mu_before) },
      };
    });
  })();

  const formNow = (ps: V12Prediction[], u: string | undefined) => {
    if (!u) return null;
    const mine = ps.filter((p) => p.player === u);
    const last = mine.at(-1);
    const conf = formConfidence(mine);
    const o: Record<string, any> = { skill_latent: r2(last?.mu_after), form_confidence: conf };
    for (const m of FORM_METHODS) {
      const f = formValue(mine, m);
      o[m] = { form: r2(f), form_vs_skill: f == null || !last ? null : r2(f - last.mu_after), display: formDisplay(f, conf.level).state };
    }
    return o;
  };

  // 280905 coupling: with vs without 236190's rounds.
  const coupling = (() => {
    if (!u236 || !u280) return null;
    const muOf = (res: { final: Map<string, { mu: number }> }) => res.final.get(u280)?.mu ?? null;
    const v11With = muOf(backtest(appOrig, STRICT_FLAGS));
    const v11Without = muOf(backtest(appOrig.filter((r) => r.player !== u236), STRICT_FLAGS));
    const v12AloneOrig = muOf(backtestV12(appOrig.filter((r) => r.player === u280), flagsD));
    const v12WithOrig = muOf(backtestV12(appOrig, flagsD));
    const base = [...appCtx, ...calField];
    const v12With = muOf(backtestV12(base, flagsD));
    const v12Without = muOf(backtestV12(base.filter((r) => r.player !== u236), flagsD));
    const paths = connectionPaths(base).sharedKeys(u236, u280);
    return {
      v11: { without_236190: r2(v11Without), with_236190: r2(v11With), shift: r2((v11With ?? 0) - (v11Without ?? 0)) },
      v12_without_context: { without_236190: r2(v12AloneOrig), with_236190: r2(v12WithOrig), shift: r2((v12WithOrig ?? 0) - (v12AloneOrig ?? 0)) },
      v12_with_context_and_field: { without_236190: r2(v12Without), with_236190: r2(v12With), shift: r2((v12With ?? 0) - (v12Without ?? 0)), shared_paths: paths.slice(0, 20), shared_path_count: paths.length },
    };
  })();

  // Reference-frame stability on the calibration cohort.
  const stability = (() => {
    const ids = [...new Set(calAll.map((r) => r.player))].sort();
    const frozen = ids.slice(0, 5);
    const sizes = [2, 10, 25, ids.length];
    const rows: any[] = [];
    for (const f of frozen) {
      const others = ids.filter((x) => x !== f);
      const full11 = backtest(calAll, STRICT_FLAGS).final.get(f)?.mu ?? 0;
      const full12 = backtestV12(calAll, flagsD).final.get(f)?.mu ?? 0;
      const paths = connectionPaths(calAll);
      for (const n of sizes) {
        const set = new Set([f, ...others.slice(0, n - 1)]);
        const sub = calAll.filter((r) => set.has(r.player));
        const unrelated = new Set([f, ...others.filter((o) => !paths.connected(f, o)).slice(0, n - 1)]);
        const subU = calAll.filter((r) => unrelated.has(r.player));
        const alone = calAll.filter((r) => r.player === f);
        const a11 = backtest(alone, STRICT_FLAGS).final.get(f)?.mu ?? 0;
        const a12 = backtestV12(alone, flagsD).final.get(f)?.mu ?? 0;
        rows.push({
          frozen: f.slice(4, 12), players: set.size,
          v11_skill_change_vs_full: r2((backtest(sub, STRICT_FLAGS).final.get(f)?.mu ?? 0) - full11),
          v12_skill_change_vs_full: r2((backtestV12(sub, flagsD).final.get(f)?.mu ?? 0) - full12),
          unrelated_players_added: unrelated.size - 1,
          v11_change_from_unrelated: r2((backtest(subU, STRICT_FLAGS).final.get(f)?.mu ?? 0) - a11),
          v12_change_from_unrelated: r2((backtestV12(subU, flagsD).final.get(f)?.mu ?? 0) - a12),
        });
      }
    }
    return rows;
  })();

  return {
    model: V12_MODEL_ID,
    reference: V12_REFERENCE,
    coverage,
    app_context_mix: { before: statusMix(onlyApp(appModels.A_v11_frozen)), after: statusMix(dD) },
    field: fieldCov,
    forecast: {
      app: Object.fromEntries(Object.entries(appModels).map(([k, v]) => [k, strata(onlyApp(v))])),
      calibration: Object.fromEntries(Object.entries(calModels).map(([k, v]) => [k, strata(v)])),
    },
    performance_validation: {
      app: Object.fromEntries(Object.entries(appModels).map(([k, v]) => [k, perfValidation(onlyApp(v), official)])),
      calibration: Object.fromEntries(Object.entries(calModels).map(([k, v]) => [k, perfValidation(v, official)])),
    },
    form_research: { calibration_D: formResearch(calModels.D_context_uncertainty), app_D: formResearch(onlyApp(appModels.D_context_uncertainty)) },
    form_now: { "236190": { v11: formNow(appModels.A_v11_frozen, u236), v12_D: formNow(appModels.D_context_uncertainty, u236) }, "280905": { v11: formNow(appModels.A_v11_frozen, u280), v12_D: formNow(appModels.D_context_uncertainty, u280) } },
    replay_236190: replay,
    coupling_280905: coupling,
    stability,
  };
}
