import type { EventBucket } from "@/lib/tournament-knowledge";
import type { SeriesInfo } from "@/lib/event-series";
import type { LucideIcon } from "lucide-react";

export type Kind = "tournament" | "league" | "casual";
export type KindTab = "all" | Kind;
export type Source = "chainlink" | "pdga" | "udisc" | "scene";
export type BucketFilter = "all" | EventBucket;
export type SortKey =
  | "date_asc"
  | "date_desc"
  | "name_asc"
  | "name_desc"
  | "tier_asc"
  | "tier_desc"
  | "tier_rank_asc"
  | "tier_rank_desc"
  | "kind_asc"
  | "source_asc"
  | "location_asc"
  | "crew_desc"
  | "bucket_asc"
  | "distance_asc";
export type ViewMode = "grid" | "table" | "calendar" | "map" | "week" | "month";
export type Density = "compact" | "comfortable";
export type DateRange =
  | "any" | "upcoming" | "today" | "tomorrow" | "weekend" | "week" | "month" | "year" | "past";

export type ColumnKey =
  | "name"
  | "kind"
  | "source"
  | "bucket"
  | "date"
  | "location"
  | "tier"
  | "divisions"
  | "status"
  | "crew";

export const DEFAULT_COLUMNS: ColumnKey[] = [
  "name",
  "kind",
  "source",
  "bucket",
  "date",
  "location",
  "tier",
  "divisions",
  "status",
  "crew",
];

export const ALL_COLUMNS: { key: ColumnKey; label: string; defaultOn: boolean }[] = [
  { key: "name", label: "Event", defaultOn: true },
  { key: "kind", label: "Kind", defaultOn: true },
  { key: "source", label: "Source", defaultOn: true },
  { key: "bucket", label: "Sanctioning", defaultOn: true },
  { key: "date", label: "Dates", defaultOn: true },
  { key: "location", label: "Location", defaultOn: true },
  { key: "tier", label: "Tier / Season", defaultOn: true },
  { key: "divisions", label: "Divisions", defaultOn: false },
  { key: "status", label: "Status", defaultOn: false },
  { key: "crew", label: "Crew", defaultOn: false },
];

export interface UnifiedRow {
  id: string;
  kind: Kind;
  source: Source;
  bucket: EventBucket;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  tier: string | null;
  status: string | null;
  crew_count: number | null;
  divisions: string[];
  cover_url: string | null;
  external_url?: string | null;
  /** Explicit coordinates when the source stores them (app-created events). */
  lat?: number | null;
  lng?: number | null;
  /** Where a player signs up: an in-app event page or the source's own page. */
  register?: {
    label: string;
    to?: string;
    params?: Record<string, string>;
    url?: string;
  } | null;
  linkTo?: { to: string; params?: Record<string, string> };
  editTo?: { to: string; params?: Record<string, string> };
  /** Set when this row is one night of a league series. */
  series?: SeriesInfo | null;
}

export const KIND_META: Record<Kind, { label: string; tone: string; icon: string }> = {
  tournament: {
    label: "Tournament",
    tone: "bg-primary/15 text-primary border-primary/30",
    icon: "trophy",
  },
  league: {
    label: "League",
    tone: "bg-violet-500/15 text-violet-500 border-violet-500/30",
    icon: "cal",
  },
  casual: {
    label: "Casual",
    tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    icon: "handshake",
  },
};

export const SOURCE_META: Record<
  Source,
  { label: string; short: string; tone: string; blurb: string }
> = {
  chainlink: {
    label: "Disc Golf Dashboard",
    short: "DGD",
    tone: "bg-primary text-primary-foreground",
    blurb: "Native to Disc Golf Dashboard — registration, scoring, and stats all in one.",
  },
  pdga: {
    label: "PDGA",
    short: "PDGA",
    tone: "bg-amber-500 text-black",
    blurb: "PDGA.com sanctioned events. Ratings + rules + official results; scoring lives on PDGA.",
  },
  udisc: {
    label: "UDisc",
    short: "UDisc",
    tone: "bg-orange-600 text-white",
    blurb: "UDisc-hosted tournaments and leagues. Scoring runs in the UDisc app.",
  },
  scene: {
    label: "Disc Golf Scene",
    short: "Scene",
    tone: "bg-blue-600 text-white",
    blurb: "Disc Golf Scene handles registration and payments only — no scoring.",
  },
};

// Suppress unused-import warning: LucideIcon is here so consumers can share it.
export type _LucideIconExport = LucideIcon;

/**
 * Classify an external event as a League (recurring season/weekly play) or a
 * Tournament (a discrete competition on one date or a few consecutive days).
 * Applied uniformly to PDGA / UDisc / Scene rows.
 *
 * Order matters: PDGA tier "L" and league naming beat any date heuristic,
 * because sanctioned leagues run as a multi-week season and would otherwise be
 * mistaken for a multi-day tournament.
 */
export function inferKindFromTitle(
  title: string,
  tier: string | null,
  start?: string | null,
  end?: string | null,
): Kind {
  const t = (tier ?? "").toUpperCase().trim();
  if (t === "L" || t === "XL") return "league";

  const s = `${title} ${tier ?? ""}`.toLowerCase();
  if (/\bleagues?\b/.test(s)) return "league";
  if (/\bweekly\b/.test(s)) return "league";
  if (/\b(session|series)\b/.test(s)) return "league";
  if (/\bsanctioned\b.*\b(singles|doubles)\b/.test(s)) return "league";
  if (/\b(mon|tues|wednes|thurs|fri|satur|sun)day\b.*\b(night|singles|doubles)\b/.test(s))
    return "league";
  if (/\bnight\s+(singles|doubles|league)\b/.test(s)) return "league";

  // A span longer than a long tournament weekend is a recurring season.
  if (start && end && end !== start) {
    const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000;
    if (Number.isFinite(days) && days > 10) return "league";
  }
  return "tournament";

}

export function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (isNaN(d.getTime())) return "TBD";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateRange(start: string | null, end: string | null): string {
  if (!start) return "TBD";
  if (!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

/**
 * Most dateless rows are recurring leagues: the source publishes a weekly
 * meeting pattern instead of a single date, so "TBD" would read as missing
 * information when the schedule is simply ongoing.
 */
export function fmtWhen(row: {
  start_date: string | null;
  end_date: string | null;
  kind: UnifiedRow["kind"];
}): string {
  if (!row.start_date) return row.kind === "league" ? "Ongoing league" : "Date TBD";
  return fmtDateRange(row.start_date, row.end_date);
}

/**
 * Escape a value for safe CSV output. Also blocks spreadsheet formula
 * injection by prefixing values that start with a formula character.
 */
export function csvCell(value: unknown): string {
  const str = value == null ? "" : String(value);
  const escaped = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  const needsQuotes = /[",\n\r]/.test(escaped);
  const inner = escaped.replace(/"/g, '""');
  return needsQuotes ? `"${inner}"` : inner;
}

export function rowToCsvRecord(r: UnifiedRow): Record<string, string> {
  return {
    Event: r.title,
    Kind: KIND_META[r.kind].label,
    Source: SOURCE_META[r.source].label,
    Sanctioning: r.bucket,
    "Start date": r.start_date ?? "",
    "End date": r.end_date ?? "",
    Location: r.location ?? "",
    "Tier / Season": r.tier ?? "",
    Divisions: r.divisions.join(" | "),
    Status: r.status ?? "",
    Crew: r.crew_count == null ? "" : String(r.crew_count),
  };
}
