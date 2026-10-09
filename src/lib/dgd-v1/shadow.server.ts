/**
 * Phase 5A — V1.1 production shadow pipeline. Server-only.
 * Jobs are queued by database triggers when evidence changes; this worker
 * claims them, runs the frozen strict V1.1 configuration over canonical
 * rounds, and writes only rows that changed. Never runs on Statboard load,
 * never writes Legacy or V1 rows.
 */
import { selectAll } from "./normalize.server";
import { loadCanonicalInputs } from "./run.server";
import { DGD_V1_DEFAULT_CONFIG, resolveConfig, toObservations } from "./engine";
import { CANDIDATE_MODEL_ID, CONTROL_MODEL_ID, backtest, calibrateScale } from "./candidate";
import { buildShadowPreview } from "./shadow-preview";
import { V12_SHADOW_MODEL_ID } from "./candidate-v12";
import { V13_RESEARCH_MODEL_ID } from "./candidate-v13";
import { v12Hooks, type SourceConflict } from "./v12-shadow";
import { pearson, playerSourceAudit, residualTable, sameDayUdisc, spearman, type RoundContext } from "./source-audit";
import { UDISC_FORMAT_CLASSES } from "@/lib/udisc-eligibility";
import { replayMode, residualsBySource, sourceQuality, toShadowRounds, restoreHistoricalPdga, type ExternalMeta } from "./shadow-input";

type Admin = any;
export const STRICT_FLAGS = { robust: true, coldStart: true, trend: false, volatility: true, strictPreRound: true, contextUpdate: true };
const BACKOFF_MIN = [1, 5, 30];

export async function loadShadowWorld(admin: Admin, opts: { udiscRule?: boolean; historicalPdga?: boolean } = {}) {
  const [{ rounds: raw }, extRows, model] = await Promise.all([
    loadCanonicalInputs(admin),
    selectAll(admin, "external_rounds", "id,source,event_name,pdga_event_ref,division,round_rating,chainlink_rating,round_format_class,included,format"),
    admin.from("rating_model_versions").select("config").eq("id", CONTROL_MODEL_ID).maybeSingle(),
  ]);
  const c = model?.data?.config ? resolveConfig(model.data.config) : DGD_V1_DEFAULT_CONFIG;
  const ext = new Map<string, ExternalMeta>(extRows.map((e: any) => [e.id, e]));
  const { rounds, restored } = opts.historicalPdga === false ? { rounds: raw, restored: new Set<string>() } : restoreHistoricalPdga(raw, ext);
  const { elig } = toObservations(rounds, c);
  const { cand, meta } = toShadowRounds(rounds, elig, ext, opts);
  const t0 = Date.now();
  const res = backtest(cand, STRICT_FLAGS);
  return { rounds, meta, cand, res, restored, compute_ms: Date.now() - t0 };
}

type Target = { model: string; stateTable: "dgd_v11_player_state" | "dgd_v12_player_state" | "dgd_v13_player_state"; history?: string };
const V11_TARGET: Target = { model: CANDIDATE_MODEL_ID, stateTable: "dgd_v11_player_state" };

async function writeUser(admin: Admin, u: string, built: ReturnType<typeof buildShadowPreview>["players"], lastProcessed: string | null, t: Target = V11_TARGET, reason: string | null = null) {
  const b = built.get(u);
  const { data: existing, error } = await admin
    .from("dgd_v11_round_results")
    .select("id,canonical_round_id,row_hash,played_on")
    .eq("user_id", u)
    .eq("model_version", t.model);
  if (error) throw new Error("Could not read stored rounds");
  const prev = new Map<string, any>();
  const stale: string[] = [];
  for (const r of existing ?? []) {
    if (!r.canonical_round_id) stale.push(r.id); // Phase 4 calibration-basis rows
    else prev.set(r.canonical_round_id, r);
  }
  const next = b?.rounds ?? [];
  const nextIds = new Set(next.map((r) => r.canonical_round_id as string));
  const changed = next.filter((r) => prev.get(r.canonical_round_id as string)?.row_hash !== r.row_hash);
  for (const [cid, r] of prev) if (!nextIds.has(cid)) stale.push(r.id);
  const replaceIds = changed.map((r) => prev.get(r.canonical_round_id as string)?.id).filter(Boolean);
  const del = [...stale, ...replaceIds];
  for (let i = 0; i < del.length; i += 200) {
    const { error: e } = await admin.from("dgd_v11_round_results").delete().in("id", del.slice(i, i + 200));
    if (e) throw new Error("Could not replace stored rounds");
  }
  for (let i = 0; i < changed.length; i += 500) {
    const { error: e } = await admin.from("dgd_v11_round_results").insert(changed.slice(i, i + 500));
    if (e) throw new Error(`Could not save rounds: ${e.message.slice(0, 120)}`);
  }
  const changedDates = [...changed.map((r) => String(r.played_on)), ...stale.map(() => "0000-00-00")].filter(Boolean);
  await admin.from("dgd_v11_layout_expectations").delete().eq("user_id", u).eq("model_version", t.model);
  if (b?.layouts.length) {
    const { error: e } = await admin.from("dgd_v11_layout_expectations").insert(b.layouts);
    if (e) throw new Error("Could not save layout expectations");
  }
  const st = b?.state as Record<string, any> | undefined;
  if (t.history) {
    // Superseded calculations are kept for audit whenever the state changes.
    const { data: old } = await admin.from(t.stateTable).select("*").eq("user_id", u).maybeSingle();
    if (old && old.state_hash !== (st?.state_hash ?? null)) {
      await admin.from(t.history).insert({ user_id: u, model_version: old.model_version, state: old, reason });
    }
  }
  if (st && st.skill_latent != null) {
    const { error: e } = await admin.from(t.stateTable).upsert(st, { onConflict: "user_id" });
    if (e) throw new Error(`Could not save player state: ${e.message.slice(0, 120)}`);
  } else {
    await admin.from(t.stateTable).delete().eq("user_id", u);
  }
  const mode = replayMode(changedDates, lastProcessed);
  return { ...mode, rows_changed: changed.length + stale.length, latest: (st?.last_played_on as string | undefined) ?? null };
}

/** Claims up to `limit` jobs and processes them. One player's failure never blocks others. */
export async function processDgdV11Jobs(admin: Admin, limit = 25) {
  const { data: jobs, error } = await admin.rpc("dgd_v11_claim_jobs", { _limit: limit });
  if (error) throw new Error("Could not claim rating jobs");
  if (!jobs?.length) return { claimed: 0, completed: 0, failed: 0, retried: 0, compute_ms: 0, followups: 0 };
  // Standard PDGA context enrichment: job players whose PDGA rounds lack recovered context.
  const enrichment = await autoEnrichPdga(admin, [...new Set((jobs as any[]).map((j) => j.user_id))]).catch(() => null);
  const { loadV12World } = await import("./v12.server");
  const v12 = await loadV12World(admin, { v13: true });
  const world = v12.world;
  const allUsers = [...new Set([...world.meta.values()].map((m) => m.user_id))];
  const everyone = [...new Set([...allUsers, ...jobs.map((j: any) => j.user_id)])];
  // Phase 9: production updates write only V1.3. V1.1/V1.2 rows are refreshed only for jobs explicitly tagged "research".
  const research = (jobs as any[]).some((j) => String(Array.isArray(j.reasons) ? j.reasons.join(",") : (j.reasons ?? "")).includes("research"));
  const built = research ? buildShadowPreview(world.res, world.meta, everyone).players : new Map();
  const conflictMap = await syncSourceConflicts(admin, v12.conflicts);
  const v12Res = { predictions: v12.res.predictions.filter((p) => world.meta.has(p.id)), final: v12.res.final, layoutFinal: v12.res.layoutFinal };
  const builtV12 = research ? buildShadowPreview(v12Res, world.meta, everyone, undefined, v12Hooks(conflictMap)).players : new Map();
  const v13Res = v12.res13 ? { predictions: v12.res13.predictions.filter((p) => world.meta.has(p.id)), final: v12.res13.final, layoutFinal: v12.res13.layoutFinal } : null;
  const builtV13 = v13Res ? buildShadowPreview(v13Res, world.meta, everyone, undefined, { ...v12Hooks(conflictMap), modelId: V13_RESEARCH_MODEL_ID }).players : null;
  const { data: fresh } = await admin.from("dgd_v11_freshness").select("user_id,latest_eligible_round_at");
  const lastByUser = new Map<string, string | null>((fresh ?? []).map((f: any) => [f.user_id, f.latest_eligible_round_at]));
  let completed = 0, failed = 0, retried = 0;

  for (const j of jobs as any[]) {
    const t0 = Date.now();
    try {
      const why = Array.isArray(j.reasons) ? j.reasons.join(",") : (j.reasons ?? null);
      if (!builtV13) throw new Error("V1.3 production model unavailable");
      const r = await writeUser(admin, j.user_id, builtV13, lastByUser.get(j.user_id) ?? null, V13_TARGET, why);
      if (research) {
        const r11 = await writeUser(admin, j.user_id, built, lastByUser.get(j.user_id) ?? null);
        const r12 = await writeUser(admin, j.user_id, builtV12, lastByUser.get(j.user_id) ?? null, V12_TARGET, why);
        r.rows_changed += r11.rows_changed + r12.rows_changed;
      }
      await admin.from("dgd_v11_jobs").update({
        status: "completed", mode: r.mode, replay_from: r.from && r.from !== "0000-00-00" ? r.from : null,
        rows_changed: r.rows_changed, duration_ms: Date.now() - t0, finished_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
      }).eq("id", j.id);
      const { count } = await admin.from("dgd_v11_jobs").select("id", { count: "exact", head: true }).eq("user_id", j.user_id).in("status", ["queued", "retry_pending"]);
      await admin.from("dgd_v11_freshness").upsert({
        user_id: j.user_id, last_calculated_at: new Date().toISOString(), latest_eligible_round_at: r.latest,
        recalculation_pending: (count ?? 0) > 0, last_job_status: "completed", last_error: null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      completed++;
    } catch (e) {
      const msg = String((e as Error).message ?? e).slice(0, 300);
      const final = j.attempts >= j.max_attempts;
      const runAfter = new Date(Date.now() + BACKOFF_MIN[Math.min(j.attempts - 1, BACKOFF_MIN.length - 1)] * 60_000).toISOString();
      // A newer open job for the player already carries the work forward.
      const { count } = await admin.from("dgd_v11_jobs").select("id", { count: "exact", head: true }).eq("user_id", j.user_id).in("status", ["queued", "retry_pending"]);
      const status = final || (count ?? 0) > 0 ? "failed" : "retry_pending";
      await admin.from("dgd_v11_jobs").update({ status, last_error: msg, duration_ms: Date.now() - t0, run_after: runAfter, finished_at: status === "failed" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", j.id);
      await admin.from("dgd_v11_freshness").upsert({ user_id: j.user_id, last_job_status: status, last_error: msg, recalculation_pending: true, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (status === "failed") failed++;
      else retried++;
    }
  }

  // Shared layouts: another player's stored state may now differ. Queue them so the system converges.
  const jobUsers = new Set((jobs as any[]).map((j) => j.user_id));
  const { data: states } = await admin.from("dgd_v11_player_state").select("user_id,state_hash");
  const { data: states12 } = await admin.from("dgd_v12_player_state").select("user_id,state_hash");
  const have12 = new Map<string, string>((states12 ?? []).map((s: any) => [s.user_id, s.state_hash]));
  const { data: states13 } = await admin.from("dgd_v13_player_state").select("user_id,state_hash");
  const have13 = new Map<string, string>((states13 ?? []).map((s: any) => [s.user_id, s.state_hash]));
  let followups = 0;
  void states; void have12;
  for (const uid of have13.keys()) {
    if (jobUsers.has(uid)) continue;
    const want13 = builtV13 ? ((builtV13.get(uid)?.state as any)?.state_hash ?? null) : (have13.get(uid) ?? null);
    const s = { user_id: uid };
    if (want13 !== (have13.get(uid) ?? null)) {
      await admin.rpc("dgd_v11_enqueue", { _user: s.user_id, _reason: "shared_layout_update", _from: null });
      followups++;
    }
  }
  return { claimed: jobs.length, completed, failed, retried, compute_ms: world.compute_ms, v12_compute_ms: v12.compute_ms, rounds_in_model: world.cand.length, followups, enrichment };
}

const V12_TARGET: Target = { model: V12_SHADOW_MODEL_ID, stateTable: "dgd_v12_player_state", history: "dgd_v12_state_history" };
const V13_TARGET: Target = { model: V13_RESEARCH_MODEL_ID, stateTable: "dgd_v13_player_state", history: "dgd_v13_state_history" };

/** Runs PDGA player-page enrichment for players whose PDGA rows lack context. */
async function autoEnrichPdga(admin: Admin, users: string[]) {
  if (!users.length) return null;
  const [{ data: ext }, { data: ctx }] = await Promise.all([
    admin.from("external_rounds").select("id,user_id").eq("source", "pdga").in("user_id", users).limit(5000),
    admin.from("pdga_round_context").select("external_round_id").in("user_id", users).is("superseded_at", null).limit(5000),
  ]);
  const have = new Set((ctx ?? []).map((c: any) => c.external_round_id));
  const need: string[] = [...new Set<string>((ext ?? []).filter((e: any) => !have.has(e.id)).map((e: any) => String(e.user_id)))];
  if (!need.length) return { players: 0 };
  const { enrichPdgaContext } = await import("./v12.server");
  const r = await enrichPdgaContext(admin, { refresh: true, users: need });
  return { players: need.length, overall: r.overall };
}

/** Stores SOURCE_CONFLICT rows (never edits layouts) and returns canonical round → kind. */
async function syncSourceConflicts(admin: Admin, conflicts: SourceConflict[]) {
  const map = new Map<string, string>();
  const rows = conflicts.filter((c) => !c.player.startsWith("cal:")).map((c) => {
    map.set(c.round_id, c.kind);
    return { canonical_round_id: c.round_id, user_id: c.player, kind: c.kind, state: "SOURCE_CONFLICT", detail: c.detail, last_seen_at: new Date().toISOString() };
  });
  if (rows.length) await admin.from("dgd_source_conflicts").upsert(rows, { onConflict: "canonical_round_id,kind" });
  return map;
}

/** Admin backfill: queues every player with canonical rounds, in bounded batches. */
export async function enqueueBackfill(admin: Admin, batch = 200) {
  const users = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin.from("canonical_rounds").select("user_id").order("user_id").range(from, from + 999);
    if (error) throw new Error("Could not list players");
    for (const r of data ?? []) users.add(r.user_id);
    if (!data || data.length < 1000) break;
  }
  const list = [...users];
  let queued = 0;
  for (let i = 0; i < list.length; i += batch) {
    for (const u of list.slice(i, i + batch)) {
      const { error } = await admin.rpc("dgd_v11_enqueue", { _user: u, _reason: "backfill", _from: null });
      if (!error) queued++;
    }
  }
  return { players: list.length, queued };
}

const band = (r: number | null) => (r == null ? "none" : r < 850 ? "<850" : r < 900 ? "850–899" : r < 935 ? "900–934" : r < 970 ? "935–969" : "970+");

/** Admin research report: population, coverage, quality, bias, representativeness, milestones. */
export async function shadowPopulationReport(admin: Admin) {
  const world = await loadShadowWorld(admin);
  const metas = [...world.meta.values()];
  const [profiles, states, jobs, freshness] = await Promise.all([
    selectAll(admin, "profiles", "id,pdga_rating,home_state"),
    selectAll(admin, "dgd_v11_player_state", "user_id,rating_status,skill_latent,skill_sigma,form_delta,confidence,eligible_rounds,last_played_on,source_mix,input_basis"),
    selectAll(admin, "dgd_v11_jobs", "user_id,status,duration_ms,created_at,mode,rows_changed"),
    selectAll(admin, "dgd_v11_freshness", "user_id,recalculation_pending,latest_source_change_at,last_job_status"),
  ]);
  const usersWithRounds = new Set(metas.map((m) => m.user_id));
  const eligibleUsers = new Set(metas.filter((m) => m.state === "ELIGIBLE").map((m) => m.user_id));
  const canon = states.filter((s: any) => s.input_basis === "canonical");
  const failedUsers = new Set(jobs.filter((j: any) => j.status === "failed").map((j: any) => j.user_id));
  const staleCut = Date.now() - 15 * 60_000;
  const stale = freshness.filter((f: any) => f.recalculation_pending && Date.parse(f.latest_source_change_at ?? "") < staleCut).length;
  const done = jobs.filter((j: any) => j.status === "completed" && j.duration_ms != null);
  const durations = done.map((j: any) => j.duration_ms).sort((a: number, b: number) => a - b);

  const prof = new Map<string, any>(profiles.map((p: any) => [p.id, p]));
  const tally = (f: (s: any) => string) => canon.reduce((a: Record<string, number>, s: any) => ((a[f(s)] = (a[f(s)] ?? 0) + 1), a), {});
  const today = Date.now();
  const representativeness = {
    pdga_rating_bands: tally((s) => band(prof.get(s.user_id)?.pdga_rating ?? null)),
    activity: tally((s) => (s.last_played_on && today - Date.parse(s.last_played_on) < 90 * 86_400_000 ? "active_90d" : "inactive")),
    round_volume: tally((s) => (s.eligible_rounds < 8 ? "<8" : s.eligible_rounds < 30 ? "8–29" : s.eligible_rounds < 100 ? "30–99" : "100+")),
    region: tally((s) => (prof.get(s.user_id)?.home_state ? "US state on file" : "not set")),
    dominant_source: tally((s) => Object.entries(s.source_mix ?? {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] ?? "none"),
  };

  // Scale-stability milestones: how much candidate scale inputs move as the population grows.
  const skills = canon.map((s: any) => Number(s.skill_latent));
  const stats = (xs: number[]) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return { mean: +m.toFixed(2), sd: +Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)).toFixed(2) };
  };
  const full = skills.length >= 2 ? stats(skills) : null;
  const milestones = [100, 250, 500, 1000].map((n) => {
    if (skills.length < n) return { players: n, reached: false };
    const sub = skills.slice(0, n);
    const s = stats(sub);
    return { players: n, reached: true, ...s, mean_shift_vs_full: full ? +(s.mean - full.mean).toFixed(2) : null, sd_shift_vs_full: full ? +(s.sd - full.sd).toFixed(2) : null };
  });

  const dataset = canon.map((s: any) => ({
    pid: String(s.user_id).slice(0, 8),
    skill_latent: +Number(s.skill_latent).toFixed(2), skill_sigma: +Number(s.skill_sigma).toFixed(2),
    form_minus_skill: s.form_delta == null ? null : +Number(s.form_delta).toFixed(2), confidence: Math.round(Number(s.confidence)),
    eligible_rounds: s.eligible_rounds, days_since_last: s.last_played_on ? Math.round((today - Date.parse(s.last_played_on)) / 86_400_000) : null,
    source_mix: s.source_mix, pdga_rating: prof.get(s.user_id)?.pdga_rating ?? null, rating_status: s.rating_status,
    mean_abs_error: (() => {
      const ps = world.res.predictions.filter((p) => p.player === s.user_id && p.prior_events >= 1);
      return ps.length ? +(ps.reduce((a, p) => a + Math.abs(p.err), 0) / ps.length).toFixed(2) : null;
    })(),
  }));

  return {
    population: {
      total_players: profiles.length,
      with_canonical_rounds: usersWithRounds.size,
      eligible_for_v11: eligibleUsers.size,
      calculated: canon.length,
      provisional: canon.filter((s: any) => s.rating_status === "PROVISIONAL").length,
      established: canon.filter((s: any) => s.rating_status === "ESTABLISHED").length,
      insufficient_data: usersWithRounds.size - eligibleUsers.size,
      failed: failedUsers.size,
      stale,
    },
    rounds: {
      physical: metas.length,
      multi_source: metas.filter((m) => m.sources.length > 1).length,
      source_records: metas.reduce((a, m) => a + m.sources.length, 0),
      eligible_by_origin: { pdga: metas.filter((m) => m.state === "ELIGIBLE" && m.sources.includes("pdga")).length, udisc: metas.filter((m) => m.state === "ELIGIBLE" && m.sources.includes("udisc")).length, app: metas.filter((m) => m.state === "ELIGIBLE" && m.sources.includes("app")).length },
      duplicates_collapsed: metas.filter((m) => m.duplicate_of).length,
      pending_review: metas.filter((m) => m.state === "PENDING_REVIEW").length,
    },
    quality: sourceQuality(metas),
    bias: residualsBySource(world.res.predictions, world.meta),
    category_residuals: residualsBySource(world.res.predictions, world.meta).filter((r) => r.key.includes("category:")),
    interval_scale_80: calibrateScale(world.res.predictions.filter((p) => p.prior_events >= 1)),
    performance: {
      compute_ms: world.compute_ms, rounds_in_model: world.cand.length,
      jobs_completed: done.length, jobs_failed: jobs.filter((j: any) => j.status === "failed").length,
      job_ms_median: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      job_ms_p95: durations.length ? durations[Math.floor(durations.length * 0.95)] : null,
      modes: jobs.reduce((a: Record<string, number>, j: any) => (j.mode ? ((a[j.mode] = (a[j.mode] ?? 0) + 1), a) : a), {}),
    },
    representativeness,
    milestones,
    dataset,
    model: CANDIDATE_MODEL_ID,
  };
}

/**
 * Phase 5A.1 — admin-only UDisc integrity & cross-source report. Compares the
 * unified model under the permanent UDisc rule against the Phase 5A rule
 * (counterfactual) without writing anything. One DGD model per player.
 */
export async function sourceIntegrityReport(admin: Admin) {
  const [now, before, udiscRows, states] = await Promise.all([
    loadShadowWorld(admin),
    loadShadowWorld(admin, { udiscRule: false }),
    selectAll(admin, "external_rounds", "id,format,round_format_class,participant_count,participant_count_source,round_rating,score,included"),
    selectAll(admin, "dgd_v11_player_state", "user_id,skill_latent,skill_sigma,display_rating,form_delta,confidence,eligible_rounds"),
  ]);
  const ud = (udiscRows as any[]).filter((r) => r.format != null && r.round_format_class != null);
  const cls = (k: string) => ud.filter((r) => r.round_format_class === k).length;
  const qualifying = ud.filter((r) => r.round_format_class === "SINGLES_MULTI_PLAYER");
  const incomplete = qualifying.filter((r) => r.score == null || r.score <= 0).length;
  const population = {
    total: ud.length,
    SINGLES_MULTI_PLAYER: cls("SINGLES_MULTI_PLAYER") - incomplete,
    SINGLES_SOLO: cls("SINGLES_SOLO"), DOUBLES: cls("DOUBLES"), TEAM: cls("TEAM"),
    UNKNOWN_FORMAT: cls("UNKNOWN_FORMAT"), INCOMPLETE: incomplete,
    OTHER_EXCLUDED: ud.length - UDISC_FORMAT_CLASSES.reduce((a, k) => a + cls(k), 0),
    participant_method: qualifying.reduce((a: Record<string, number>, r) => ((a[r.participant_count_source] = (a[r.participant_count_source] ?? 0) + 1), a), {}),
    native_rating: { qualifying: qualifying.length, with_rating: qualifying.filter((r) => r.round_rating != null).length },
  };
  const holeCtx = (w: typeof now) => new Map(w.rounds.map((r) => [r.id, {
    hole_count_origin: (r.hole_count == null ? "unknown" : r.hole_count_origin === "LAYOUT_INFERRED" || r.hole_count_origin === "EVENT_INFERRED" ? "inferred" : "known") as RoundContext["hole_count_origin"],
  }]));
  const latentState = (w: typeof now, u: string) => {
    const f = w.res.final.get(u);
    const ps = w.res.predictions.filter((p) => p.player === u);
    const last8 = ps.slice(-8);
    return f ? {
      skill_latent: +f.mu.toFixed(2), skill_sigma: +f.sigma.toFixed(2),
      form_latent: last8.length >= 5 ? +(last8.reduce((a, p) => a + p.perf, 0) / last8.length - f.mu).toFixed(2) : null,
      eligible: ps.length, udisc_eligible: ps.filter((p) => w.meta.get(p.id)?.sources.includes("udisc")).length,
    } : null;
  };
  const users = [...new Set([...now.meta.values()].map((m) => m.user_id))];
  const players = users.map((u) => ({
    pid: u.slice(0, 8),
    stored_preview: states.find((s: any) => s.user_id === u) ?? null,
    before_rule: latentState(before, u),
    after_rule: latentState(now, u),
    audit_after: playerSourceAudit(u, [...now.meta.values()], now.res.predictions),
    audit_before: playerSourceAudit(u, [...before.meta.values()], before.res.predictions),
  }));
  // Overlap: physical rounds with PDGA + UDisc.
  const overlap = [...now.meta.values()].filter((m) => m.sources.includes("pdga") && m.sources.includes("udisc"));
  const ovIds = new Set(overlap.map((m) => m.id));
  const udiscPairs = now.res.predictions.map((p) => [p, now.meta.get(p.id)?.udisc_round_rating] as const).filter(([, r]) => r != null);
  return {
    population,
    players,
    overlap: {
      physical_rounds: overlap.length,
      observations: now.res.predictions.filter((p) => ovIds.has(p.id)).length,
      with_pdga_rating: overlap.filter((m) => m.pdga_round_rating != null).length,
      with_udisc_rating: overlap.filter((m) => m.udisc_round_rating != null).length,
    },
    residuals_after: residualTable(now.res.predictions, now.meta, holeCtx(now)),
    residuals_before: residualTable(before.res.predictions, before.meta, holeCtx(before)),
    dgd_vs_udisc_rating: {
      n: udiscPairs.length,
      pearson: pearson(udiscPairs.map(([p]) => p.perf), udiscPairs.map(([, r]) => r as number)),
      spearman: spearman(udiscPairs.map(([p]) => p.perf), udiscPairs.map(([, r]) => r as number)),
    },
    same_day_udisc_before: sameDayUdisc([...before.meta.values()]),
    same_day_udisc_after: sameDayUdisc([...now.meta.values()]),
  };
}

/** Admin/ops: rebuild V1.2 shadow state for the given players directly (diff-only, same writer as the worker). */
export async function rebuildV12(admin: Admin, users: string[]) {
  const { loadV12World } = await import("./v12.server");
  const v12 = await loadV12World(admin);
  const conflictMap = await syncSourceConflicts(admin, v12.conflicts);
  const res = { predictions: v12.res.predictions.filter((p) => v12.world.meta.has(p.id)), final: v12.res.final, layoutFinal: v12.res.layoutFinal };
  const built = buildShadowPreview(res, v12.world.meta, users, undefined, v12Hooks(conflictMap)).players;
  const out = [];
  for (const u of users) out.push({ user: u.slice(0, 8), ...(await writeUser(admin, u, built, null, V12_TARGET, "ops_rebuild")) });
  return out;
}
