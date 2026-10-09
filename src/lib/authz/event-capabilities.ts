/**
 * Event capability keys — UI mirror only. The database function
 * event_has_capability is the authority; the UI reads its answers.
 */
export const OWNER_ONLY_CAPABILITIES = [
  "event.critical_edit", "event.delete", "event.cancel", "event.transfer_ownership",
  "event.change_host", "event.change_format", "event.change_sanctioning",
  "event.finalize_results", "event.reopen_results", "event.publish_critical",
] as const;

export const STAFF_CAPABILITIES = [
  "event.check_in", "event.manage_players", "event.manage_scoring", "event.manage_finance",
  "event.manage_course_ops", "event.send_announcements", "event.manage_staff",
  "event.view_private", "event.manage_volunteers", "event.manage_promotion",
] as const;

export type EventCapability =
  | (typeof OWNER_ONLY_CAPABILITIES)[number]
  | (typeof STAFF_CAPABILITIES)[number];

export const ALL_EVENT_CAPABILITIES: EventCapability[] = [...STAFF_CAPABILITIES, ...OWNER_ONLY_CAPABILITIES];

export const STAFF_ROLE_LABELS: Record<string, string> = {
  co_td: "Co-TD", check_in: "Check-in", scoring: "Scoring", course_lead: "Course lead",
  finance: "Finance", volunteer_lead: "Volunteer lead", media: "Media", staff: "Staff", view_only: "View only",
};

export const isOwnerOnly = (c: string) => (OWNER_ONLY_CAPABILITIES as readonly string[]).includes(c);
