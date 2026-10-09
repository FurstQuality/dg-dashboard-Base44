/**
 * Meaningful changes between the stored and freshly synced live row for one
 * crew member and round. Pure and diff-only: the same snapshot twice yields
 * nothing, so repeated syncs never duplicate updates.
 */
export type LiveRowLike = {
  round_number: number;
  division: string | null;
  tee_time: string | null;
  round_started: boolean | null;
  completed: boolean | null;
  running_place: number | null;
  round_score: number | null;
};

export type LiveChange = {
  field: "tee_time" | "division" | "round_status" | "position" | "round_score";
  from_value: string | null;
  to_value: string | null;
  severity: "info" | "warning";
};

const s = (v: unknown) => (v == null || v === "" ? null : String(v));

export function diffLiveRow(prev: LiveRowLike | null, next: LiveRowLike): LiveChange[] {
  const out: LiveChange[] = [];
  const r = `R${next.round_number}`;
  const prevTee = s(prev?.tee_time);
  const nextTee = s(next.tee_time);
  if (nextTee !== prevTee && nextTee != null)
    out.push({ field: "tee_time", from_value: prevTee && `${r} ${prevTee}`, to_value: `${r} ${nextTee}`, severity: prevTee ? "warning" : "info" });
  if (prev && s(prev.division) !== s(next.division) && next.division)
    out.push({ field: "division", from_value: s(prev.division), to_value: s(next.division), severity: "warning" });
  if (!prev?.round_started && next.round_started && !next.completed)
    out.push({ field: "round_status", from_value: null, to_value: `${r} started`, severity: "info" });
  if (!prev?.completed && next.completed)
    out.push({ field: "round_status", from_value: null, to_value: `${r} finished`, severity: "info" });
  if (next.completed && next.round_score != null && s(prev?.round_score) !== s(next.round_score))
    out.push({ field: "round_score", from_value: s(prev?.round_score), to_value: `${r} ${next.round_score}`, severity: "info" });
  if (next.running_place != null && prev?.running_place != null && prev.running_place !== next.running_place && next.completed)
    out.push({ field: "position", from_value: String(prev.running_place), to_value: String(next.running_place), severity: "info" });
  return out;
}

/** Which saved alert setting controls each live event update. */
export const LIVE_CHANGE_TOPIC: Record<string, "friendLiveRounds" | "crewCalendarChanges"> = {
  round_status: "friendLiveRounds",
  round_score: "friendLiveRounds",
  position: "friendLiveRounds",
  tee_time: "crewCalendarChanges",
  division: "crewCalendarChanges",
};
