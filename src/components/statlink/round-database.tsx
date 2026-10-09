import { formatToPar } from "@/lib/score-display";
import { useEffect, useMemo, useState } from "react";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { Link } from "@tanstack/react-router";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PdgaEventLinks } from "@/components/shared/pdga-links";
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search, Download, SlidersHorizontal } from "lucide-react";

/**
 * Phase 4 — Round Database.
 *
 * A single, comprehensive sortable/filterable table of every rated round
 * DG Dashboard has on file for the player, backed by the same PDGA-lab cache
 * that drives Overview. Clicking a row opens a detail sheet with every
 * field DG Dashboard knows about that round: source, division, event ref,
 * evaluated-on date, PDGA rating window status, and expiration.
 *
 * Terminology is enforced against the Phase 1 DG Statboard taxonomy:
 * - "PDGA round rating" for the per-round rating column
 * - "Official PDGA record" when linking back to the PDGA event page
 */

const PAGE_SIZE = 50;

type Round = {
  played_on: string;
  round_rating: number | null;
  event_name: string | null;
  division?: string | null;
  score?: number | null;
  to_par?: number | null;
  round_label?: string | null;
  included?: boolean | null;
  evaluated_on?: string | null;
  event_ref?: string | null;
  source?: string | null;
};

type SortKey = "played_on" | "event_name" | "division" | "score" | "round_rating";
type SortDir = "asc" | "desc";
/** Rounds you played vs the subset carrying a rating. */
type RatedFilter = "all" | "rated" | "unrated";

const PDGA_WINDOW_MONTHS = 24;
const RECENCY_WINDOW_MONTHS = 12;

function classifyWindow(playedOn: string): {
  status: "recent" | "active" | "expiring" | "expired";
  monthsAgo: number;
} {
  const played = new Date(playedOn);
  const now = new Date();
  const monthsAgo =
    (now.getFullYear() - played.getFullYear()) * 12 + (now.getMonth() - played.getMonth());
  if (monthsAgo > PDGA_WINDOW_MONTHS) return { status: "expired", monthsAgo };
  if (monthsAgo > RECENCY_WINDOW_MONTHS)
    return { status: monthsAgo >= 22 ? "expiring" : "active", monthsAgo };
  return { status: "recent", monthsAgo };
}

function sourceClass(src: string | null | undefined): string {
  switch (src) {
    case "pdga":
      return "border-primary/40 bg-primary/10 text-primary";
    case "disc_golf_scene":
      return "border-indigo-500/40 bg-indigo-500/10 text-indigo-400";
    case "udisc":
      return "border-orange-500/40 bg-orange-500/10 text-orange-400";
    case "chainlink":
      return "border-cyan-500/40 bg-cyan-500/10 text-cyan-400";
    case "tournament":
      return "border-amber-500/40 bg-amber-500/10 text-amber-400";
    case "league":
      return "border-sky-500/40 bg-sky-500/10 text-sky-400";
    case "casual":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

/** Player-facing name for every round source that can reach this table. */
const SOURCE_LABELS: Record<string, string> = {
  pdga: "PDGA",
  disc_golf_scene: "Disc Golf Scene",
  udisc: "UDisc",
  chainlink: "DG Dashboard",
  tournament: "Tournaments",
  league: "Leagues",
  casual: "Casual",
};

function sourceLabel(src: string | null | undefined): string {
  const key = src ?? "pdga";
  return SOURCE_LABELS[key] ?? key;
}

/** Sort order for the filter chips, so the list never reshuffles. */
const SOURCE_ORDER = [
  "pdga",
  "disc_golf_scene",
  "udisc",
  "chainlink",
  "tournament",
  "league",
  "casual",
];

function statusChip(status: ReturnType<typeof classifyWindow>["status"]) {
  switch (status) {
    case "recent":
      return { label: "Recent (2× weight)", cls: "border-primary/40 bg-primary/10 text-primary" };
    case "active":
      return { label: "Active window", cls: "border-border bg-muted/30 text-muted-foreground" };
    case "expiring":
      return { label: "Expiring soon", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" };
    case "expired":
      return { label: "Expired", cls: "border-red-500/40 bg-red-500/10 text-red-400" };
  }
}

function toCsv(rows: Round[]): string {
  const header = [
    "played_on",
    "event",
    "round_label",
    "division",
    "score",
    "round_rating",
    "source",
    "included",
    "evaluated_on",
    "event_ref",
  ].join(",");
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows
    .map((r) =>
      [
        r.played_on,
        r.event_name,
        r.round_label,
        r.division,
        r.score,
        r.round_rating,
        r.source ?? "pdga",
        r.included == null ? "" : r.included ? "yes" : "no",
        r.evaluated_on ?? "",
        r.event_ref ?? "",
      ]
        .map(esc)
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

export function RoundDatabase({ rounds }: { rounds: Round[] }) {
  const [source, setSource] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [rated, setRated] = useState<RatedFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("played_on");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [detail, setDetail] = useState<Round | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const divisions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) if (r.division) set.add(r.division);
    return Array.from(set).sort();
  }, [rounds]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const r of rounds) if (r.played_on) set.add(r.played_on.slice(0, 4));
    return Array.from(set).sort().reverse();
  }, [rounds]);

  const filtered = useMemo(() => {
    return rounds.filter((r) => {
      if (source !== "all" && (r.source ?? "pdga") !== source) return false;
      if (division !== "all" && r.division !== division) return false;
      if (year !== "all" && !(r.played_on ?? "").startsWith(year)) return false;
      if (includedOnly && r.included === false) return false;
      const hasRating = Number.isFinite(r.round_rating as number);
      if (rated === "rated" && !hasRating) return false;
      if (rated === "unrated" && hasRating) return false;
      return matchesOmnisearch(r, query);
    });
  }, [rounds, source, division, year, includedOnly, rated, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = (a as Record<SortKey, unknown>)[sortKey];
      const bv = (b as Record<SortKey, unknown>)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (sortKey === "played_on") {
        // Dates arrive as plain days and as full timestamps; compare as time
        // so a mixed list still reads newest-first.
        const at = Date.parse(String(av));
        const bt = Date.parse(String(bv));
        if (Number.isFinite(at) && Number.isFinite(bt)) return (at - bt) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const stats = useMemo(() => {
    const ratings = filtered
      .map((r) => r.round_rating)
      .filter((n): n is number => Number.isFinite(n as number));
    const avg = ratings.length
      ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
      : null;
    const best = ratings.length ? Math.max(...ratings) : null;
    const worst = ratings.length ? Math.min(...ratings) : null;
    return { shown: filtered.length, count: ratings.length, avg, best, worst };
  }, [filtered]);

  // The table grows with the page instead of scrolling inside its own box, so
  // rows are revealed in batches like the rest of the app's lists.
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [source, division, year, includedOnly, rated, query, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "played_on" || k === "round_rating" ? "desc" : "asc");
    }
  };

  // Chips come from the rounds actually on the table, so every source that
  // reaches this view is filterable and the counts always add up to "All".
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rounds) {
      const key = r.source ?? "pdga";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // PDGA, UDisc and DGD always show, even at 0, so DGD rounds have a home once played.
    for (const k of ["pdga", "udisc", "chainlink"]) if (!counts.has(k)) counts.set(k, 0);
    const present = Array.from(counts.keys()).sort((a, b) => {
      const ai = SOURCE_ORDER.indexOf(a);
      const bi = SOURCE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });
    return [
      { id: "all", label: "All", count: rounds.length },
      ...present.map((key) => ({
        id: key,
        label: key === "chainlink" ? "DGD" : sourceLabel(key),
        count: counts.get(key) ?? 0,
      })),
    ];
  }, [rounds]);

  // PDGA, UDisc and DG Dashboard ratings sit on different scales.
  const mixedScales = useMemo(() => {
    const scales = new Set(
      filtered
        .filter((r) => Number.isFinite(r.round_rating as number))
        .map((r) => (r.source === "udisc" ? "udisc" : r.source === "chainlink" ? "dgd" : "pdga")),
    );
    return scales.size > 1;
  }, [filtered]);

  const activeChips = [
    year !== "all" && { key: "year", label: year, clear: () => setYear("all") },
    division !== "all" && { key: "div", label: division, clear: () => setDivision("all") },
    rated !== "all" && {
      key: "rated",
      label: rated === "rated" ? "Rated only" : "Unrated only",
      clear: () => setRated("all"),
    },
    includedOnly && { key: "inc", label: "Counted only", clear: () => setIncludedOnly(false) },
    query.trim() && { key: "q", label: `“${query.trim()}”`, clear: () => setQuery("") },
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const download = () => {
    if (typeof window === "undefined") return;
    const blob = new Blob([toCsv(sorted)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dg-dashboard-rounds-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {/* Filter chips (source) */}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSource(c.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              source === c.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c.label} <span className="opacity-60">{c.count}</span>
          </button>
        ))}
      </div>

      {/* Toolbar: search + selects + export */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search rounds"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search event, round, or division"
            className="h-9 pl-8 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium hover:border-primary/50"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filters{activeChips.length ? ` (${activeChips.length})` : ""}
        </button>
        <button
          type="button"
          onClick={download}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 hover:text-foreground"
          title="Export current view to CSV"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 p-2">
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="all">All divisions</option>
          {divisions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={rated}
          onChange={(e) => setRated(e.target.value as RatedFilter)}
          className="h-9 rounded-md border border-border bg-background px-2 text-xs"
          aria-label="Rated rounds filter"
        >
          <option value="all">Rated and unrated</option>
          <option value="rated">Rated rounds only</option>
          <option value="unrated">Unrated rounds only</option>
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
          <input
            type="checkbox"
            checked={includedOnly}
            onChange={(e) => setIncludedOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Counted only
        </label>
        </div>
      )}

      {/* Active filter chips — each one removes its filter */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
              aria-label={`Remove filter ${c.label}`}
            >
              {c.label} <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      )}

      {/* Filtered summary. Sources use different rating scales, so averages
          only appear when one scale is on screen. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <MiniStat label="Rounds shown" value={stats.shown} />
        <MiniStat label="Rated rounds" value={stats.count} />
        <MiniStat label="Average" value={mixedScales ? "Pick a source" : (stats.avg ?? "Not rated")} />
        <MiniStat label="Best" value={mixedScales ? "—" : (stats.best ?? "—")} tone="success" />
        <MiniStat label="Worst" value={mixedScales ? "—" : (stats.worst ?? "—")} tone="danger" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                <SortHeader
                  label="Date"
                  k="played_on"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                />
                <SortHeader
                  label="Event"
                  k="event_name"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="left"
                />
                <th className="sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 text-left">
                  Round
                </th>
                <SortHeader
                  label="Div"
                  k="division"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="left"
                />
                <SortHeader
                  label="Score"
                  k="score"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <th className="sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 text-right">
                  To par
                </th>
                <th className="sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 text-right">
                  Par
                </th>
                <SortHeader
                  label="Round rating"
                  k="round_rating"
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
                <th className="sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 text-left">
                  Source
                </th>
                <th className="sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 text-left">
                  Window
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center">
                    <div className="text-sm text-muted-foreground">
                      No rounds match these filters yet.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSource("all");
                        setQuery("");
                        setDivision("all");
                        setYear("all");
                        setIncludedOnly(false);
                        setRated("all");
                      }}
                      className="mt-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition hover:border-primary/50"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              )}

              {sorted.slice(0, visible).map((r, i) => {
                const src = r.source ?? "pdga";
                const win = r.played_on ? classifyWindow(r.played_on) : null;
                const chip = win ? statusChip(win.status) : null;
                const dim = r.included === false || win?.status === "expired";
                return (
                  <tr
                    key={`${r.played_on}-${r.event_name ?? ""}-${i}`}
                    className={`border-t border-border transition-colors hover:bg-muted/30 cursor-pointer ${dim ? "opacity-60" : ""}`}
                    onClick={() => setDetail(r)}
                  >
                    <td className="py-1.5 px-3 tabular-nums whitespace-nowrap">{r.played_on}</td>
                    <td className="py-1.5 px-3 max-w-[280px] truncate">
                      {r.event_ref ? (
                        <a
                          href={`/events/pdga/${r.event_ref}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-primary hover:underline underline-offset-2"
                        >
                          {r.event_name ?? "—"}
                        </a>
                      ) : (
                        (r.event_name ?? "—")
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground">
                      {r.round_label ?? "—"}
                    </td>
                    <td className="py-1.5 px-3 text-xs">{r.division ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{r.score ?? "—"}</td>
                    <td className="py-1.5 px-3 text-right font-semibold tabular-nums">
                      {formatToPar(r.to_par)}
                    </td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                      {r.score != null && r.to_par != null ? r.score - r.to_par : "—"}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-semibold tabular-nums">
                      {Number.isFinite(r.round_rating as number) ? (
                        r.round_rating
                      ) : (
                        <span className="rounded-full border border-border px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Unrated
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${sourceClass(src)}`}
                      >
                        {src}
                      </span>
                    </td>
                    <td className="py-1.5 px-3">
                      {chip && (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${chip.cls}`}
                        >
                          {chip.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>
            Showing {Math.min(visible, sorted.length)} of {sorted.length} filtered rounds ·{" "}
            {rounds.length} on file. Click any row for round detail.
          </span>
          {visible < sorted.length && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/50"
            >
              Show more rounds
            </button>
          )}
        </div>
      </div>

      <RoundDetailSheet round={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function SortHeader({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`sticky top-0 z-10 border-b border-border bg-muted py-2 px-3 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </th>
  );
}

function RoundDetailSheet({ round, onClose }: { round: Round | null; onClose: () => void }) {
  const open = round != null;
  const win = round?.played_on ? classifyWindow(round.played_on) : null;
  const chip = win ? statusChip(win.status) : null;

  const expiresAt = useMemo(() => {
    if (!round?.played_on) return null;
    const d = new Date(round.played_on);
    d.setMonth(d.getMonth() + PDGA_WINDOW_MONTHS);
    return d;
  }, [round?.played_on]);

  const pdgaEventUrl = round?.event_ref
    ? `https://www.pdga.com/tour/event/${round.event_ref}`
    : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {round && (
          <>
            <SheetHeader>
              <SheetTitle className="text-lg leading-tight">
                {round.event_name ?? "Round"}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {round.round_label ? `${round.round_label} · ` : ""}
                {round.played_on}
                {round.division ? ` · ${round.division}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  PDGA Round Rating
                </div>
                <div className="mt-1 font-display text-4xl font-bold tabular-nums text-primary leading-none">
                  {round.round_rating ?? "—"}
                </div>
                {round.score != null && (
                  <div className="mt-1 text-xs text-muted-foreground">Score {round.score}</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <DetailStat
                  label="Source"
                  value={
                    <Badge variant="outline" className={sourceClass(round.source)}>
                      {round.source ?? "pdga"}
                    </Badge>
                  }
                />
                <DetailStat
                  label="Counted in rating"
                  value={
                    round.included === false ? (
                      <span className="text-red-400">No — dropped</span>
                    ) : round.included === true ? (
                      <span className="text-emerald-400">Yes</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )
                  }
                />
                <DetailStat label="Evaluated on" value={round.evaluated_on ?? "—"} />
                <DetailStat
                  label="Expires (24 mo)"
                  value={expiresAt ? expiresAt.toISOString().slice(0, 10) : "—"}
                />
              </div>

              {chip && (
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    PDGA window status
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {win?.monthsAgo}mo ago
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Recent rounds (last 12 months) count at 2× weight in the official PDGA rating.
                    Rounds older than 24 months drop out of the active window.
                  </p>
                </div>
              )}

              {round.event_ref ? (
                <PdgaEventLinks eventRef={round.event_ref} label="Verify on PDGA" />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Link
                  to="/stats"
                  search={{ tab: "scoring" }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/50"
                  onClick={onClose}
                >
                  View scoring breakdown
                </Link>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
