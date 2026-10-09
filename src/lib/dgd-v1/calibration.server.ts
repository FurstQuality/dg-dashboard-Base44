/**
 * Phase 3.7 calibration cohort — server-only jobs.
 * Reads public PDGA player detail pages (the same source the round importer
 * already uses), stores rounds with provenance under an admin-only subject,
 * and replays unchanged DGD V1 in memory. It never writes dgd_player_state,
 * never creates auth users or profiles, and never reads admin notes.
 */
import { normalizePdgaNumber } from "@/lib/pdga-number";
import { parsePdgaDetailPage } from "./pdga-details";
import { selectAll } from "./normalize.server";
import { DGD_V1_MODEL_ID, fitLayoutDifficulty, replayPlayer, resolveConfig, toObservations } from "./engine";
import {
  CALIBRATION_VERSION,
  DISPLAY_TRANSFORM_STATUS,
  classify,
  cohortHoldout,
  modelFlags,
  pdgaCorrelation,
  playerDiagnostics,
  quantiles,
  ratingBand,
  subjectKey,
  toCalibrationInput,
  type CalibrationPlayer,
  type CalibrationRoundRow,
} from "./calibration";

type Admin = any;
const MIN_RATED_EVENTS = 10;

export async function fetchCalibrationSubject(admin: Admin, rawNumber: string, addedBy: string | null) {
  const pdga = normalizePdgaNumber(rawNumber);
  if (!pdga) throw new Error("Enter a valid PDGA number");
  const url = `https://www.pdga.com/player/${pdga}/details`;
  // One subject per PDGA number (unique) — re-adding refreshes, never duplicates.
  const { data: linked } = await admin.from("profiles").select("id").eq("pdga_number", pdga).limit(2);
  const linkedUser = linked?.length === 1 ? linked[0].id : null;
  const { data: subj, error: sErr } = await admin
    .from("dgd_calibration_subjects")
    .upsert({ pdga_number: pdga, linked_user_id: linkedUser, added_by: addedBy, updated_at: new Date().toISOString() }, { onConflict: "pdga_number" })
    .select("id,source_history")
    .single();
  if (sErr || !subj) throw new Error("Could not save calibration player");
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0; +https://dgdashboard.app)", Accept: "text/html" },
    });
    if (!res.ok) throw new Error(`PDGA returned HTTP ${res.status}`);
    const page = parsePdgaDetailPage(await res.text(), pdga);
    const rows = page.rounds.map((r) => {
      const holes = [...new Set(r.pools.map((p) => p.holes))];
      const pars = [...new Set(r.pools.map((p) => p.par))];
      return {
        subject_id: subj.id,
        source: "pdga",
        source_url: url,
        pdga_event_id: r.pdga_event_id,
        event_name: r.event_name,
        tier: r.tier,
        division: r.division,
        round_number: r.round_number,
        played_on: r.played_on,
        score: r.score,
        round_rating: r.round_rating,
        evaluated: r.evaluated,
        included: r.included,
        layout_node_ids: r.pools.map((p) => p.node_id),
        layout_name: r.pools.length === 1 ? r.pools[0].name : r.pools.length ? `${r.pools.length} pools` : null,
        // Only trust hole count / par when every pool agrees; never default.
        hole_count: holes.length === 1 ? holes[0] : null,
        par: pars.length === 1 ? pars[0] : null,
        distance_ft: r.pools.length === 1 ? r.pools[0].distance_ft : null,
        dedupe_key: r.dedupe_key,
        fetched_at: new Date().toISOString(),
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("dgd_calibration_rounds").upsert(rows.slice(i, i + 500), { onConflict: "subject_id,dedupe_key" });
      if (error) throw new Error("Could not store rounds");
    }
    const history = [...((subj.source_history as any[]) ?? []), { at: new Date().toISOString(), url, rounds: rows.length }].slice(-20);
    await admin
      .from("dgd_calibration_subjects")
      .update({
        display_name: page.name,
        official_rating: page.current_rating,
        status: rows.filter((r) => r.round_rating != null).length >= MIN_RATED_EVENTS ? "fetched" : "insufficient",
        rounds_parsed: rows.length,
        last_fetched_at: new Date().toISOString(),
        last_error: null,
        source_history: history,
      })
      .eq("id", subj.id);
    return { pdga_number: pdga, name: page.name, rounds: rows.length, rating: page.current_rating };
  } catch (e) {
    await admin
      .from("dgd_calibration_subjects")
      .update({ status: "failed", last_error: String((e as Error).message).slice(0, 200) })
      .eq("id", subj.id);
    return { pdga_number: pdga, name: null, rounds: 0, rating: null, error: "Couldn't read that player's PDGA page" };
  }
}

export async function runCalibration(admin: Admin, triggeredBy: string | null) {
  const { data: model } = await admin.from("rating_model_versions").select("id,config").eq("id", DGD_V1_MODEL_ID).single();
  if (!model) throw new Error("Model version missing");
  const c = resolveConfig(model.config);
  const { data: rep } = await admin
    .from("dgd_calibration_reports")
    .insert({ model_version: DGD_V1_MODEL_ID, triggered_by: triggeredBy })
    .select("id")
    .single();
  try {
    const subjects = (await selectAll(admin, "dgd_calibration_subjects", "id,pdga_number,display_name,official_rating,linked_user_id,status")).filter(
      (s: any) => s.status !== "removed",
    );
    const rows: CalibrationRoundRow[] = await selectAll(
      admin,
      "dgd_calibration_rounds",
      "id,subject_id,pdga_event_id,event_name,division,round_number,played_on,score,round_rating,evaluated,included,layout_node_ids,layout_name,hole_count,par",
    );
    const inputs = rows.map(toCalibrationInput);
    const { elig, obs } = toObservations(inputs, c);
    const asOf = new Date().toISOString().slice(0, 10);
    const fit = fitLayoutDifficulty(obs, c, asOf);
    const players: CalibrationPlayer[] = [];
    const allEvents: any[] = [];
    for (const s of subjects) {
      const key = subjectKey(s.id);
      const sObs = obs.filter((o) => o.round.user_id === key);
      const sRounds = inputs.filter((r) => r.user_id === key);
      const { events } = replayPlayer(sObs, fit.layouts, c, asOf);
      allEvents.push(...events);
      players.push(playerDiagnostics(s, sRounds, sObs.length, events, fit.layouts, c, asOf));
    }
    const sufficient = players.filter((p) => p.rated_events >= MIN_RATED_EVENTS);
    const classes = classify(sufficient);
    const mae75 = quantiles(sufficient.map((p) => p.expected_vs_actual.mae).filter((v): v is number => v != null))?.p75 ?? null;
    const enriched = players.map((p) => ({
      ...p,
      sufficient: p.rated_events >= MIN_RATED_EVENTS,
      classes: classes.get(p.subject_id) ?? null,
      flags: p.rated_events >= MIN_RATED_EVENTS ? modelFlags(p, c, mae75) : [],
    }));
    const groupsOf = (u: string) => {
      const cl = classes.get(u.replace(/^cal:/, ""));
      return cl ? Object.entries(cl).filter(([, v]) => v).map(([k]) => k) : [];
    };
    const states = { ELIGIBLE: 0, INELIGIBLE: 0, PENDING_REVIEW: 0, EXCLUDED: 0 } as Record<string, number>;
    const codes: Record<string, number> = {};
    for (const e of elig) {
      states[e.state]++;
      for (const r of e.reason_codes) codes[r] = (codes[r] ?? 0) + 1;
    }
    const mapping: Record<string, number> = {};
    for (const r of inputs) mapping[r.layout_mapping ?? "UNMAPPED"] = (mapping[r.layout_mapping ?? "UNMAPPED"] ?? 0) + 1;
    const bands: Record<string, CalibrationPlayer[]> = {};
    for (const p of sufficient) (bands[ratingBand(p.official_pdga_rating)] ??= []).push(p);
    const layoutsArr = [...fit.layouts.values()];
    const report = {
      version: CALIBRATION_VERSION,
      model_version: DGD_V1_MODEL_ID,
      model_changed: false,
      display_transform_status: DISPLAY_TRANSFORM_STATUS,
      computed_at: new Date().toISOString(),
      subjects: subjects.length,
      sufficient_players: sufficient.length,
      pdga_rating_range: quantiles(sufficient.map((p) => p.official_pdga_rating).filter((v): v is number => v != null)),
      canonical_rounds: inputs.length,
      states,
      reason_codes: codes,
      layout_mapping: mapping,
      layouts: {
        fitted: layoutsArr.length,
        convergence: fit.convergence_status,
        iterations: fit.iterations,
        by_status: layoutsArr.reduce((a: Record<string, number>, l) => ((a[l.status] = (a[l.status] ?? 0) + 1), a), {}),
        effective_players: quantiles(layoutsArr.map((l) => l.effective_player_count)),
      },
      distributions: {
        skill_mu: quantiles(sufficient.map((p) => p.skill_mu)),
        skill_sigma: quantiles(sufficient.map((p) => p.skill_sigma)),
        form: quantiles(sufficient.map((p) => p.form).filter((v): v is number => v != null)),
        confidence: quantiles(sufficient.map((p) => p.confidence)),
        by_pdga_band: Object.fromEntries(
          Object.entries(bands).map(([b, ps]) => [b, { players: ps.length, skill_mu: quantiles(ps.map((p) => p.skill_mu)), confidence: quantiles(ps.map((p) => p.confidence)) }]),
        ),
      },
      class_counts: Object.fromEntries(
        ["rapid_improver", "decliner", "stable", "high_volatility", "high_volume", "low_volume", "local_heavy", "broad_experience"].map((k) => [
          k,
          [...classes.values()].filter((v) => (v as any)[k]).length,
        ]),
      ),
      holdout: cohortHoldout(obs, c, groupsOf),
      pdga_correlation: pdgaCorrelation(allEvents),
      flags: enriched.flatMap((p) => p.flags.map((f) => ({ subject_id: p.subject_id, name: p.name, flag: f }))),
    };
    await admin
      .from("dgd_calibration_reports")
      .update({ status: "succeeded", report, players: enriched, finished_at: new Date().toISOString() })
      .eq("id", rep.id);
    return { reportId: rep.id as string, players: enriched.length, sufficient: sufficient.length };
  } catch (e) {
    await admin
      .from("dgd_calibration_reports")
      .update({ status: "failed", report: { error: String((e as Error).message).slice(0, 300) }, finished_at: new Date().toISOString() })
      .eq("id", rep.id);
    throw e;
  }
}
