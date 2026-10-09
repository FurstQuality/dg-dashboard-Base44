/**
 * One event lifecycle state, derived only from synced facts. Drives the event
 * page badge, pending messages, and (later) sync priority. Never inferred from
 * today's date alone: an event is LIVE only when scoring has actually started.
 */
export type EventLifecycle =
  | "CANCELLED"
  | "EVENT_COMPLETE"
  | "LIVE"
  | "ROUND_COMPLETE"
  | "TEE_TIMES_AVAILABLE"
  | "FIELD_AVAILABLE"
  | "REGISTRATION_OPEN"
  | "ANNOUNCED"
  | "UNKNOWN";

export type LifecycleInput = {
  eventDate: string | null;
  endDate: string | null;
  eventStatus: string | null;
  registrationStatus: string | null;
  roundsPlanned: number | null;
  fieldCount: number;
  scores: Array<{
    round_number: number | null;
    round_started: boolean | null;
    completed: boolean | null;
    tee_time: string | null;
    place: number | null;
  }>;
  hasTeeTimes?: boolean;
};

export type LifecycleResult = {
  state: EventLifecycle;
  label: string;
  /** Precise "not yet" messages for data PDGA hasn't published. */
  pending: string[];
  /** Whether projections (position, back of lead) are meaningful yet. */
  hasStandings: boolean;
};

const LABEL: Record<EventLifecycle, string> = {
  CANCELLED: "Cancelled",
  EVENT_COMPLETE: "Final",
  LIVE: "Live",
  ROUND_COMPLETE: "Between rounds",
  TEE_TIMES_AVAILABLE: "Tee times posted",
  FIELD_AVAILABLE: "Field posted",
  REGISTRATION_OPEN: "Registration open",
  ANNOUNCED: "Announced",
  UNKNOWN: "Status unknown",
};

export function eventLifecycle(i: LifecycleInput): LifecycleResult {
  const status = (i.eventStatus ?? "").toLowerCase();
  const reg = (i.registrationStatus ?? "").toLowerCase();
  const started = i.scores.filter((s) => s.round_started);
  const hasScores = started.length > 0;
  const teeTimes = !!i.hasTeeTimes || i.scores.some((s) => !!s.tee_time);
  const maxRound = Math.max(0, ...started.map((s) => s.round_number ?? 0));
  const inMax = started.filter((s) => (s.round_number ?? 0) === maxRound);
  const roundDone = inMax.length > 0 && inMax.every((s) => s.completed);
  const planned = i.roundsPlanned ?? null;

  let state: EventLifecycle;
  if (/cancel/.test(status)) state = "CANCELLED";
  else if (/complete|final|official/.test(status) || (roundDone && planned != null && maxRound >= planned))
    state = "EVENT_COMPLETE";
  else if (hasScores && !roundDone) state = "LIVE";
  else if (hasScores && roundDone) state = "ROUND_COMPLETE";
  else if (teeTimes) state = "TEE_TIMES_AVAILABLE";
  else if (i.fieldCount > 0) state = "FIELD_AVAILABLE";
  else if (/open/.test(reg)) state = "REGISTRATION_OPEN";
  else if (i.eventDate) state = "ANNOUNCED";
  else state = "UNKNOWN";

  const pending: string[] = [];
  if (state !== "CANCELLED" && state !== "EVENT_COMPLETE") {
    if (i.fieldCount === 0) pending.push("Field not published yet");
    if (!teeTimes && !hasScores) pending.push("Tee times not posted");
    if (!hasScores) pending.push("Live scoring not started");
  }
  if (state === "EVENT_COMPLETE" && !i.scores.some((s) => s.place != null))
    pending.push("No official results yet");

  return { state, label: LABEL[state], pending, hasStandings: hasScores };
}
