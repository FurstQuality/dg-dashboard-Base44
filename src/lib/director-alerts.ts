/**
 * Pure alert rules for the Event Director cockpit.
 *
 * Every alert is derived from real event data — never a placeholder. Keeping
 * the rules pure means they are unit-testable and the server read stays a
 * plain data fetch.
 */

export type DirectorRegistrationCounts = {
  total: number;
  pending: number;
  confirmed: number;
  waitlist: number;
  checkedIn: number;
  withdrawn: number;
  paid: number;
  unpaid: number;
};

export type DirectorEvent = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startDate: string;
  endDate: string;
  location: string | null;
  courseId: string | null;
  layoutId: string | null;
  courseName: string | null;
  maxPlayers: number | null;
  pdgaSanctioned: boolean;
  entryFeeCents: number;
  divisions: number;
  rounds: number;
  roundsWithCourse: number;
  roundsWithTeeTimes: number;
  registrations: DirectorRegistrationCounts;
  feesCollectedCents: number;
  feesOutstandingCents: number;
  checklistDone: number;
  checklistTotal: number;
  staffCount: number;
  /** Event is running today (or the multi-day window contains today). */
  isLiveToday: boolean;
  daysOut: number;
};

export type DirectorAlert = {
  id: string;
  eventId: string;
  eventName: string;
  eventSlug: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  /** Where the organizer goes to fix it. */
  fix: "event" | "registrations" | "kit" | "checklist";
};

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

/** Alerts for a single event, soonest-event-first ordering handled by the caller. */
export function eventAlerts(e: DirectorEvent): DirectorAlert[] {
  const out: DirectorAlert[] = [];
  const base = { eventId: e.id, eventName: e.name, eventSlug: e.slug };
  const soon = e.daysOut <= 14 && e.daysOut >= 0;
  const finished = e.status === "completed" || e.status === "cancelled";
  if (finished) return out;

  if (!e.courseId) {
    out.push({
      ...base,
      id: `${e.id}:no-course`,
      severity: soon ? "critical" : "warning",
      title: "No course selected",
      detail: "Players can't see where they're playing until you pick the course.",
      fix: "event",
    });
  } else if (!e.layoutId) {
    out.push({
      ...base,
      id: `${e.id}:no-layout`,
      severity: "warning",
      title: "No layout selected",
      detail: "Pick the layout so pars, distances, and tee signs come out right.",
      fix: "event",
    });
  }

  if (e.divisions === 0) {
    out.push({
      ...base,
      id: `${e.id}:no-divisions`,
      severity: soon ? "critical" : "warning",
      title: "No divisions set up",
      detail: "Add divisions before registration opens so players sign up in the right field.",
      fix: "event",
    });
  }

  if (e.rounds === 0) {
    out.push({
      ...base,
      id: `${e.id}:no-rounds`,
      severity: soon ? "critical" : "warning",
      title: "No rounds scheduled",
      detail: "Add each round so the schedule, tee times, and caddy guide have something to show.",
      fix: "event",
    });
  } else if (e.roundsWithCourse < e.rounds) {
    out.push({
      ...base,
      id: `${e.id}:rounds-missing-course`,
      severity: "warning",
      title: `${e.rounds - e.roundsWithCourse} round(s) missing a course`,
      detail: "Assign a course to every round so players know where to show up.",
      fix: "event",
    });
  }

  if (e.rounds > 0 && e.roundsWithTeeTimes === 0 && e.daysOut <= 3 && e.daysOut >= 0) {
    out.push({
      ...base,
      id: `${e.id}:no-tee-times`,
      severity: "critical",
      title: "No tee times posted",
      detail: `Starts in ${days(Math.max(e.daysOut, 0))} and nobody has a start time yet.`,
      fix: "event",
    });
  }

  if (e.registrations.pending > 0) {
    out.push({
      ...base,
      id: `${e.id}:pending`,
      severity: soon ? "warning" : "info",
      title: `${e.registrations.pending} registration(s) awaiting confirmation`,
      detail: "Confirm or waitlist them so the field count is accurate.",
      fix: "registrations",
    });
  }

  if (e.maxPlayers && e.registrations.confirmed + e.registrations.checkedIn > e.maxPlayers) {
    out.push({
      ...base,
      id: `${e.id}:over-cap`,
      severity: "critical",
      title: "Field is over the player cap",
      detail: `${e.registrations.confirmed + e.registrations.checkedIn} confirmed against a cap of ${e.maxPlayers}.`,
      fix: "registrations",
    });
  } else if (
    e.maxPlayers &&
    e.registrations.waitlist > 0 &&
    e.registrations.confirmed + e.registrations.checkedIn < e.maxPlayers
  ) {
    out.push({
      ...base,
      id: `${e.id}:promote-waitlist`,
      severity: "warning",
      title: `${e.registrations.waitlist} on the waitlist with room to spare`,
      detail: `${e.maxPlayers - (e.registrations.confirmed + e.registrations.checkedIn)} spot(s) open — promote from the waitlist.`,
      fix: "registrations",
    });
  }

  if (e.entryFeeCents > 0 && e.registrations.unpaid > 0 && e.daysOut <= 7) {
    out.push({
      ...base,
      id: `${e.id}:unpaid`,
      severity: e.daysOut <= 1 ? "critical" : "warning",
      title: `${e.registrations.unpaid} unpaid entr${e.registrations.unpaid === 1 ? "y" : "ies"}`,
      detail: "Collect or waive entry fees before players tee off.",
      fix: "registrations",
    });
  }

  if (
    e.checklistTotal > 0 &&
    e.checklistDone < e.checklistTotal &&
    e.daysOut <= 7 &&
    e.daysOut >= 0
  ) {
    out.push({
      ...base,
      id: `${e.id}:checklist`,
      severity: e.daysOut <= 2 ? "warning" : "info",
      title: `${e.checklistTotal - e.checklistDone} checklist item(s) left`,
      detail: `Event starts in ${days(Math.max(e.daysOut, 0))}.`,
      fix: "checklist",
    });
  }

  if (e.pdgaSanctioned && e.staffCount === 0 && e.daysOut <= 14 && e.daysOut >= 0) {
    out.push({
      ...base,
      id: `${e.id}:no-staff`,
      severity: "info",
      title: "No staff assigned",
      detail: "Add co-directors, scorekeepers, or spotters so you're not running it alone.",
      fix: "event",
    });
  }

  return out;
}

const RANK: Record<DirectorAlert["severity"], number> = { critical: 0, warning: 1, info: 2 };

/** All alerts across events, most urgent first, then soonest event. */
export function directorAlerts(events: DirectorEvent[]): DirectorAlert[] {
  const order = new Map(events.map((e, i) => [e.id, i]));
  return events
    .flatMap(eventAlerts)
    .sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        (order.get(a.eventId) ?? 0) - (order.get(b.eventId) ?? 0) ||
        a.title.localeCompare(b.title),
    );
}

/** Registration fill for a progress readout. Returns null when there is no cap. */
export function fillPct(e: DirectorEvent): number | null {
  if (!e.maxPlayers || e.maxPlayers <= 0) return null;
  const filled = e.registrations.confirmed + e.registrations.checkedIn;
  return Math.min(100, Math.round((filled / e.maxPlayers) * 100));
}
