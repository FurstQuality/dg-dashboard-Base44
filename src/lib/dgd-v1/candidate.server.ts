/**
 * Phase 3.8 — runs the V1.1 candidate matrix on the calibration cohort.
 * Shadow only: reads calibration rounds, writes a report plus event-round
 * difficulty estimates. Never writes player ratings, layout ratings or V1 rows.
 */
import { selectAll } from "./normalize.server";
import { CANDIDATE_MODEL_ID, CONTROL_MODEL_ID, backtest } from "./candidate";
import { buildCandidateReport, toCandRounds, type CalRow } from "./candidate-report";

type Admin = any;

export async function runCandidate(admin: Admin, triggeredBy: string | null) {
  const { data: rep, error } = await admin
    .from("dgd_candidate_reports")
    .insert({ candidate_model: CANDIDATE_MODEL_ID, control_model: CONTROL_MODEL_ID, triggered_by: triggeredBy })
    .select("id")
    .single();
  if (error || !rep) throw new Error("Could not start the candidate run");
  try {
    const rows: CalRow[] = await selectAll(
      admin,
      "dgd_calibration_rounds",
      "id,subject_id,pdga_event_id,event_name,division,round_number,played_on,score,round_rating,layout_node_ids,layout_name,hole_count,par,distance_ft",
    );
    const subjects = await selectAll(admin, "dgd_calibration_subjects", "id,official_rating");
    const { data: cal } = await admin
      .from("dgd_calibration_reports")
      .select("players")
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const classes = new Map<string, Record<string, boolean>>(((cal?.players as any[]) ?? []).map((p) => [p.subject_id, p.classes ?? {}]));
    const official = new Map<string, number | null>(subjects.map((s: any) => [`cal:${s.id}`, s.official_rating]));
    const report = buildCandidateReport(rows, classes, official);
    // Stored estimates come from the strict pre-round run: field scores are post-round context only.
    const f = backtest(toCandRounds(rows), report.strict_flags);
    const est = f.fieldEstimates.map((e) => ({
      report_id: rep.id,
      calculation_version: CANDIDATE_MODEL_ID,
      event_round_key: e.event_round_key,
      played_on: e.played_on,
      layout_key: e.layout_key,
      event_round_layout_difficulty_mu: e.event_round_layout_difficulty_mu,
      event_round_layout_difficulty_sigma: e.event_round_layout_difficulty_sigma,
      participant_count: e.participant_count,
      effective_participant_count: e.effective_participant_count,
      baseline_layout_difficulty: e.baseline_layout_difficulty ?? null,
      event_round_adjustment: e.event_round_adjustment ?? null,
      contextual_layout_difficulty: e.contextual_layout_difficulty ?? null,
      adjustment_uncertainty: e.adjustment_uncertainty ?? null,
    }));
    for (let i = 0; i < est.length; i += 500) {
      const { error: e } = await admin.from("dgd_event_round_difficulty").insert(est.slice(i, i + 500));
      if (e) throw new Error("Could not store event-round estimates");
    }
    await admin.from("rating_model_versions").update({ shadow_stage: report.promotion.stage }).eq("id", CANDIDATE_MODEL_ID);
    await admin.from("dgd_candidate_reports").update({ status: "succeeded", report, finished_at: new Date().toISOString() }).eq("id", rep.id);
    return { id: rep.id, f_components: report.f_components };
  } catch (e) {
    await admin
      .from("dgd_candidate_reports")
      .update({ status: "failed", error: String((e as Error).message).slice(0, 200), finished_at: new Date().toISOString() })
      .eq("id", rep.id);
    throw new Error("The candidate run failed");
  }
}
