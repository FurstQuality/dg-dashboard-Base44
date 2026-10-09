import type { Database } from "@/integrations/supabase/types";

export type ContributionKind = Database["public"]["Enums"]["contribution_kind"];
export type ContributionStatus = Database["public"]["Enums"]["contribution_status"];
export type CourseReportKind = Database["public"]["Enums"]["course_report_kind"];
export type CourseReportStatus = Database["public"]["Enums"]["course_report_status"];
export type RedemptionStatus = Database["public"]["Enums"]["redemption_status"];

/** Points needed for one free month, per plan. */
export const MONTH_COST: Record<"pro" | "elite", number> = { pro: 300, elite: 500 };

/** How many players have to sign off before a contribution counts. */
export const VERIFICATIONS_REQUIRED = 2;

export type ContributionKindMeta = {
  kind: ContributionKind;
  label: string;
  points: number;
  group: "Course building" | "Course upkeep" | "Data quality" | "Community growth";
  help: string;
  /** True when the entry should be tied to a course. */
  needsCourse: boolean;
  /** True when the player enters how many holes / items the work covered. */
  countsItems?: boolean;
};

/**
 * Point values mirror public.contribution_points_for in the database. Keep the
 * two in step — the database is the source of truth for what gets awarded.
 */
export const CONTRIBUTION_KINDS: ContributionKindMeta[] = [
  {
    kind: "course_created",
    label: "Added a new course",
    points: 150,
    group: "Course building",
    help: "You created a course that was missing from the app, with name, location and hole count.",
    needsCourse: true,
  },
  {
    kind: "layout_mapped",
    label: "Built a layout",
    points: 100,
    group: "Course building",
    help: "A complete layout with every hole listed, par and distance where known.",
    needsCourse: true,
  },
  {
    kind: "hole_pinned",
    label: "Pinned tees and baskets",
    points: 10,
    group: "Course building",
    help: "GPS pins captured on the course. Enter how many holes you pinned.",
    needsCourse: true,
    countsItems: true,
  },
  {
    kind: "course_fully_mapped",
    label: "Finished a whole course",
    points: 250,
    group: "Course building",
    help: "Every hole on the course has a tee pad and a basket pinned. Big bonus on top of the hole pins.",
    needsCourse: true,
  },
  {
    kind: "course_edit",
    label: "Fixed course details",
    points: 25,
    group: "Course upkeep",
    help: "Corrected par, distance, hole count, fees, hours or directions.",
    needsCourse: true,
  },
  {
    kind: "course_photo",
    label: "Added course photos",
    points: 15,
    group: "Course upkeep",
    help: "Clear photos of tees, fairways or greens. Enter how many you added.",
    needsCourse: true,
    countsItems: true,
  },
  {
    kind: "tee_sign",
    label: "Added a tee sign",
    points: 20,
    group: "Course upkeep",
    help: "A readable tee sign photo or hole map others can play from.",
    needsCourse: true,
    countsItems: true,
  },
  {
    kind: "duplicate_merge",
    label: "Merged duplicate courses",
    points: 40,
    group: "Data quality",
    help: "Flagged two listings of the same course so the data could be combined.",
    needsCourse: true,
  },
  {
    kind: "hole_data_verified",
    label: "Verified hole numbers",
    points: 10,
    group: "Data quality",
    help: "Walked the course and confirmed hole order, pars or distances. Enter how many holes.",
    needsCourse: true,
    countsItems: true,
  },
  {
    kind: "condition_report_verified",
    label: "Course condition report",
    points: 15,
    group: "Data quality",
    help: "Credited automatically when two players confirm a condition report you filed.",
    needsCourse: true,
  },
  {
    kind: "club_created",
    label: "Started a club",
    points: 100,
    group: "Community growth",
    help: "A real club with members playing regularly.",
    needsCourse: false,
  },
  {
    kind: "event_hosted",
    label: "Hosted an event or league night",
    points: 75,
    group: "Community growth",
    help: "You ran an event and posted the results here.",
    needsCourse: false,
  },
  {
    kind: "player_invited",
    label: "Brought in a new player",
    points: 50,
    group: "Community growth",
    help: "A player you invited signed up and played a round.",
    needsCourse: false,
  },
];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(
  CONTRIBUTION_KINDS.map((k) => [k.kind, k.label]),
);

export function contributionLabel(kind: string): string {
  return KIND_LABEL[kind] ?? "Community contribution";
}

/** Kinds a player can file themselves. Others are credited by the app. */
export const SUBMITTABLE_KINDS = CONTRIBUTION_KINDS.filter(
  (k) => k.kind !== "condition_report_verified",
);

export const REPORT_KINDS: { kind: CourseReportKind; label: string; help: string }[] = [
  { kind: "fallen_tree", label: "Fallen tree", help: "A tree or big limb down in the fairway." },
  { kind: "hazard", label: "Hazard", help: "Something unsafe: wasps, ice, loose footing, wildlife." },
  { kind: "flooding", label: "Flooding or mud", help: "Standing water or unplayable mud." },
  { kind: "construction", label: "Construction", help: "Work on or beside the hole." },
  { kind: "closed", label: "Hole or course closed", help: "Play is not allowed right now." },
  { kind: "basket_missing", label: "Basket missing", help: "No basket where one should be." },
  { kind: "basket_moved", label: "Basket moved", help: "Basket is in a different position than the map." },
  { kind: "tee_damage", label: "Tee pad damage", help: "Cracked, sunken or overgrown tee pad." },
  { kind: "obstacle", label: "Obstacle in play", help: "Debris, equipment or anything blocking the line." },
  { kind: "signage", label: "Signage problem", help: "Missing, wrong or unreadable sign." },
  { kind: "other", label: "Something else", help: "Anything else players should know before they tee off." },
];

export const REPORT_KIND_LABEL: Record<string, string> = Object.fromEntries(
  REPORT_KINDS.map((r) => [r.kind, r.label]),
);

export const SEVERITY_LABEL: Record<string, string> = {
  minor: "Minor",
  moderate: "Worth knowing",
  blocking: "Blocks play",
};

/** How many free months a points balance is worth on a plan. */
export function monthsAffordable(points: number, tier: "pro" | "elite"): number {
  return Math.floor(points / MONTH_COST[tier]);
}
