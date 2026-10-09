/**
 * Goal definitions and progress math for StatLink Goals.
 *
 * Pure functions only — the server function feeds these a snapshot of the
 * player's own numbers and they decide where the goal stands. Keeping the math
 * here means "on pace" / "behind" / "achieved" is testable and identical on
 * every surface that shows a goal (Goals tab, Overview strip, feed share).
 */

export type GoalMetric =
  | "rating"
  | "round_rating"
  | "rounds"
  | "birdies"
  | "birdie_rate"
  | "scoring_average"
  | "courses_played"
  | "course_pr";

export type GoalMetricDef = {
  metric: GoalMetric;
  label: string;
  /** One-line explanation shown under the picker. */
  blurb: string;
  /** True when a bigger number is better (rating, birdies). */
  higherIsBetter: boolean;
  /** Suffix rendered after the number. */
  unit: "" | "%" | " strokes" | " to par";
  /** Metric applies to one course, so the goal needs a course name. */
  needsCourse: boolean;
  /** Sensible target bounds for the input. */
  min: number;
  max: number;
};

export const GOAL_METRICS: GoalMetricDef[] = [
  {
    metric: "rating",
    label: "Player rating",
    blurb:
      "Get your rating to a number. Progress uses your official PDGA rating when it's linked, and your rated-round estimate until then.",
    higherIsBetter: true,
    unit: "",
    needsCourse: false,
    min: 600,
    max: 1100,
  },
  {
    metric: "round_rating",
    label: "Best round rating",
    blurb: "Post a single round at or above this rating.",
    higherIsBetter: true,
    unit: "",
    needsCourse: false,
    min: 600,
    max: 1100,
  },
  {
    metric: "rounds",
    label: "Rated rounds played",
    blurb: "Log this many rated rounds. Volume is what stabilizes a rating.",
    higherIsBetter: true,
    unit: "",
    needsCourse: false,
    min: 1,
    max: 500,
  },
  {
    metric: "birdies",
    label: "Total birdies",
    blurb: "Career birdies from rounds you've scored in DG Dashboard.",
    higherIsBetter: true,
    unit: "",
    needsCourse: false,
    min: 1,
    max: 5000,
  },
  {
    metric: "birdie_rate",
    label: "Birdie rate",
    blurb: "Percent of holes you birdie in rounds scored in DG Dashboard.",
    higherIsBetter: true,
    unit: "%",
    needsCourse: false,
    min: 1,
    max: 90,
  },
  {
    metric: "scoring_average",
    label: "Scoring average vs. par",
    blurb:
      "Average strokes over par across your rated rounds. Lower is better — a target of 0 means shooting par.",
    higherIsBetter: false,
    unit: " strokes",
    needsCourse: false,
    min: -30,
    max: 40,
  },
  {
    metric: "courses_played",
    label: "Courses played",
    blurb: "Different courses in your Course Book.",
    higherIsBetter: true,
    unit: "",
    needsCourse: false,
    min: 1,
    max: 500,
  },
  {
    metric: "course_pr",
    label: "Course personal record",
    blurb: "Beat your best score to par at one course. Lower is better.",
    higherIsBetter: false,
    unit: " to par",
    needsCourse: true,
    min: -30,
    max: 40,
  },
];

export function goalMetricDef(metric: string): GoalMetricDef | null {
  return GOAL_METRICS.find((m) => m.metric === metric) ?? null;
}

/** The player's own numbers, one per supported metric. Null = no data yet. */
export type GoalStatsSnapshot = {
  rating: number | null;
  round_rating: number | null;
  rounds: number | null;
  birdies: number | null;
  birdie_rate: number | null;
  scoring_average: number | null;
  courses_played: number | null;
  /** Best (lowest) to-par per course name, lowercased key. */
  coursePrs: Record<string, number>;
};

export type GoalStatus = "achieved" | "on-pace" | "behind" | "no-data";

export type GoalProgress = {
  /** Where the player stands now, in the metric's own units. */
  current: number | null;
  /** 0–100 completion toward the target, relative to the baseline. */
  pct: number;
  status: GoalStatus;
  /** Remaining distance to the target in the metric's own units (0 when hit). */
  remaining: number | null;
  /** Days left before the deadline; null when the goal has no deadline. */
  daysLeft: number | null;
};

export type GoalInput = {
  metric: string;
  target: number;
  /** Value when the goal was created — anchors the progress bar. */
  baseline?: number | null;
  deadline?: string | null;
  course_name?: string | null;
  completed_at?: string | null;
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Reads the current value for a goal out of the stats snapshot. */
export function currentValueFor(goal: GoalInput, stats: GoalStatsSnapshot): number | null {
  if (goal.metric === "course_pr") {
    const key = (goal.course_name ?? "").trim().toLowerCase();
    if (!key) return null;
    const v = stats.coursePrs[key];
    return typeof v === "number" ? v : null;
  }
  const value = (stats as unknown as Record<string, number | null>)[goal.metric];
  return typeof value === "number" ? value : null;
}

/**
 * Progress for one goal. `todayIso` is injected so tests and the server agree
 * on "today" instead of each reading the clock separately.
 */
export function computeGoalProgress(
  goal: GoalInput,
  stats: GoalStatsSnapshot,
  todayIso: string,
): GoalProgress {
  const def = goalMetricDef(goal.metric);
  const current = currentValueFor(goal, stats);
  const daysLeft = goal.deadline ? daysBetween(todayIso, goal.deadline) : null;

  if (def == null || current == null) {
    return { current, pct: 0, status: "no-data", remaining: null, daysLeft };
  }

  const higher = def.higherIsBetter;
  const hit = higher ? current >= goal.target : current <= goal.target;
  const remaining = hit ? 0 : Math.abs(+(goal.target - current).toFixed(1));

  // Baseline anchors the bar. Without one, fall back to a sane starting point
  // so a fresh goal doesn't read as already 90% done.
  const baseline =
    typeof goal.baseline === "number" && goal.baseline !== goal.target
      ? goal.baseline
      : higher
        ? Math.min(current, goal.target)
        : Math.max(current, goal.target);

  const span = Math.abs(goal.target - baseline);
  const travelled = Math.abs(current - baseline);
  const rawPct = span === 0 ? (hit ? 100 : 0) : (travelled / span) * 100;
  // Moving the wrong way reads as 0%, not a negative bar.
  const wrongWay = higher ? current < baseline : current > baseline;
  const pct = hit ? 100 : wrongWay ? 0 : Math.max(0, Math.min(99, Math.round(rawPct)));

  if (hit || goal.completed_at) {
    return { current, pct: 100, status: "achieved", remaining: 0, daysLeft };
  }

  // With no deadline there's nothing to fall behind — anything above half the
  // distance reads as on pace, so the player still gets a signal.
  if (daysLeft == null) {
    return { current, pct, status: pct >= 50 ? "on-pace" : "behind", remaining, daysLeft };
  }
  if (daysLeft < 0) {
    return { current, pct, status: "behind", remaining, daysLeft };
  }

  // On pace = progress is at least as far along as the calendar, using the
  // goal's creation-to-deadline span implied by the elapsed share of days.
  const totalDays = Math.max(
    1,
    daysBetween(todayIso, goal.deadline!) + Math.max(1, Math.round(span * 7)),
  );
  const calendarPct = ((totalDays - daysLeft) / totalDays) * 100;
  return {
    current,
    pct,
    status: pct + 5 >= calendarPct ? "on-pace" : "behind",
    remaining,
    daysLeft,
  };
}

/** Human summary used in the UI and in the feed share text. */
export function formatGoalValue(metric: string, value: number | null): string {
  if (value == null) return "—";
  const def = goalMetricDef(metric);
  if (!def) return String(value);
  if (def.metric === "scoring_average" || def.metric === "course_pr") {
    const rounded = +value.toFixed(1);
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}`;
  }
  if (def.unit === "%") return `${Math.round(value)}%`;
  return String(Math.round(value));
}

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  achieved: "Achieved",
  "on-pace": "On pace",
  behind: "Needs work",
  "no-data": "Waiting on rounds",
};
