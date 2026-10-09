/**
 * One Event Director list: tournaments and leagues in a single shape, with a
 * stage, filters and the single most useful next step for each event.
 * Pure — no I/O — so the rules are testable and shared by every list view.
 */
import type { DirectorEventOption, HostedLeagueRow } from "@/lib/director.functions";

export type DirectorSeriesRow = { id: string; name: string; slug: string; status: string; season?: string | null; year?: number | null; stop_count: number };

export type ListKind = "tournament" | "league" | "series";
export type ListStage = "draft" | "upcoming" | "live" | "past" | "cancelled";
export type ListRole = "owner" | "co_td";

export type NextStep = {
  label: string;
  /** Route path understood by the list view's link map. */
  target: "event" | "registrations" | "ops" | "league" | "series";
};

export type DirectorListItem = {
  id: string;
  kind: ListKind;
  name: string;
  slug: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  role: ListRole;
  stage: ListStage;
  detail: string | null;
  next: NextStep;
};

export const STAGE_LABEL: Record<ListStage, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  live: "Happening now",
  past: "Finished",
  cancelled: "Cancelled",
};

function tournamentStage(e: DirectorEventOption, today: string): ListStage {
  if (e.status === "cancelled") return "cancelled";
  if (e.status === "draft") return "draft";
  if (e.status === "in_progress") return "live";
  if (e.status === "completed") return "past";
  if (e.startDate && e.startDate.slice(0, 10) < today) return "past";
  return "upcoming";
}

function tournamentNext(e: DirectorEventOption, stage: ListStage): NextStep {
  switch (stage) {
    case "draft":
      return { label: "Finish setup and publish", target: "event" };
    case "live":
      return { label: "Run event day", target: "ops" };
    case "past":
      return { label: "Review results", target: "event" };
    case "cancelled":
      return { label: "View event", target: "event" };
    default:
      return e.status === "registration_open"
        ? { label: "Check registrations", target: "registrations" }
        : { label: "Open registration", target: "event" };
  }
}

function leagueStage(l: HostedLeagueRow, today: string): ListStage {
  if (l.status === "cancelled") return "cancelled";
  if (l.status === "draft") return "draft";
  if (l.status === "completed") return "past";
  if (l.endDate && l.endDate < today) return "past";
  if (l.startDate && l.startDate > today) return "upcoming";
  return "live";
}

function leagueNext(l: HostedLeagueRow, stage: ListStage): NextStep {
  if (stage === "draft") return { label: "Finish setup and publish", target: "league" };
  if (l.weeks === 0 && stage !== "past" && stage !== "cancelled")
    return { label: "Add league nights", target: "league" };
  if (stage === "live") return { label: "Run the next night", target: "league" };
  if (stage === "upcoming") return { label: "Get players signed up", target: "league" };
  return { label: "Review standings", target: "league" };
}

export function buildDirectorList(
  events: DirectorEventOption[],
  leagues: HostedLeagueRow[],
  today: string,
  series: DirectorSeriesRow[] = [],
): DirectorListItem[] {
  const items: DirectorListItem[] = [
    ...events.map((e) => {
      const stage = tournamentStage(e, today);
      return {
        id: e.id,
        kind: "tournament" as const,
        name: e.name,
        slug: e.slug,
        status: e.status,
        startDate: e.startDate ?? null,
        endDate: null,
        role: e.role,
        stage,
        detail: null,
        next: tournamentNext(e, stage),
      };
    }),
    ...leagues.map((l) => {
      const stage = leagueStage(l, today);
      const parts = [
        l.weeks ? `${l.weeks} ${l.weeks === 1 ? "night" : "nights"}` : null,
        `${l.players} ${l.players === 1 ? "player" : "players"}`,
      ].filter(Boolean);
      return {
        id: l.id,
        kind: "league" as const,
        name: l.name,
        slug: l.slug,
        status: l.status,
        startDate: l.startDate,
        endDate: l.endDate,
        role: "owner" as const,
        stage,
        detail: parts.join(" · "),
        next: leagueNext(l, stage),
      };
    }),
    ...series.map((r) => {
      const stage: ListStage =
        r.status === "draft" ? "draft" : r.status === "completed" || r.status === "archived" ? "past" : r.status === "cancelled" ? "cancelled" : "upcoming";
      const next: NextStep =
        stage === "past" || stage === "cancelled"
          ? { label: "Review standings", target: "series" }
          : r.stop_count === 0
            ? { label: "Add events", target: "series" }
            : { label: "Manage series", target: "series" };
      return {
        id: r.id,
        kind: "series" as const,
        name: r.name,
        slug: r.slug,
        status: r.status,
        startDate: null,
        endDate: null,
        role: "owner" as const,
        stage,
        detail: `${r.stop_count} ${r.stop_count === 1 ? "event" : "events"}${r.season ? ` · ${r.season}` : ""}`,
        next,
      };
    }),
  ];
  const order: Record<ListStage, number> = { live: 0, draft: 1, upcoming: 2, past: 3, cancelled: 4 };
  return items.sort((a, b) => {
    if (order[a.stage] !== order[b.stage]) return order[a.stage] - order[b.stage];
    const ad = a.startDate ?? "";
    const bd = b.startDate ?? "";
    // Upcoming soonest first; finished most recent first.
    return a.stage === "past" || a.stage === "cancelled" ? (ad < bd ? 1 : -1) : ad < bd ? -1 : 1;
  });
}

export type ListFilters = {
  stage: ListStage | "all";
  kind: ListKind | "all";
  role: ListRole | "all";
  term: string;
};

export function filterDirectorList(items: DirectorListItem[], f: ListFilters): DirectorListItem[] {
  const q = f.term.trim().toLowerCase();
  return items.filter(
    (i) =>
      (f.stage === "all" || i.stage === f.stage) &&
      (f.kind === "all" || i.kind === f.kind) &&
      (f.role === "all" || i.role === f.role) &&
      (!q || i.name.toLowerCase().includes(q)),
  );
}
