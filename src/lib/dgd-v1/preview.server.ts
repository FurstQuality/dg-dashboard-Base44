/**
 * Phase 4 — publishes the V1.1 preview read model for linked calibration
 * players. Runs the frozen strict V1.1 configuration; never writes Legacy or
 * V1 rows, and never runs when a player opens Statboard.
 */
import { selectAll } from "./normalize.server";
import { CANDIDATE_MODEL_ID, backtest } from "./candidate";
import { toCandRounds, type CalRow } from "./candidate-report";
import { buildPreview } from "./preview";

type Admin = any;
const STRICT_FLAGS = { robust: true, coldStart: true, trend: false, volatility: true, strictPreRound: true, contextUpdate: true };

async function chunked(admin: Admin, table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`Could not save preview data (${table})`);
  }
}

export async function publishDgdPreview(admin: Admin) {
  const rows: CalRow[] = await selectAll(
    admin,
    "dgd_calibration_rounds",
    "id,subject_id,pdga_event_id,event_name,division,round_number,played_on,score,round_rating,layout_node_ids,layout_name,hole_count,par,distance_ft",
  );
  const subjects = await selectAll(admin, "dgd_calibration_subjects", "id,linked_user_id");
  const res = backtest(toCandRounds(rows), STRICT_FLAGS);
  const out = buildPreview(res, rows, subjects);
  const users = out.states.map((s) => s.user_id as string);
  if (users.length) {
    await admin.from("dgd_v11_round_results").delete().in("user_id", users).eq("model_version", CANDIDATE_MODEL_ID);
    await admin.from("dgd_v11_layout_expectations").delete().in("user_id", users).eq("model_version", CANDIDATE_MODEL_ID);
  }
  await chunked(admin, "dgd_v11_player_state", out.states, "user_id");
  await chunked(admin, "dgd_v11_round_results", out.rounds, "user_id,calibration_round_id,model_version");
  await chunked(admin, "dgd_v11_layout_expectations", out.layouts, "user_id,layout_key,model_version");
  return { players: out.states.length, rounds: out.rounds.length, layouts: out.layouts.length };
}
