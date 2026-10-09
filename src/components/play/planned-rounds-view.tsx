/**
 * Planned rounds — the same upcoming events shown either as cards or on a
 * month calendar. Sources (PDGA, Disc Golf Scene, UDisc, manual) keep their
 * chips in both views, so the calendar is a layout change, not a data change.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CalendarDays, LayoutGrid, MapPin, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthGrid, type CalendarEvent } from "@/components/calendar/month-grid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlannedEventRow } from "@/lib/round-history.functions";

type ViewMode = "list" | "calendar";

/** How many cards show before the player asks for more. */
const PAGE_SIZE = 6;

type RangeKey = "all" | "7" | "30" | "90";

const RANGE_LABEL: Record<RangeKey, string> = {
  all: "Any date",
  "7": "Next 7 days",
  "30": "Next 30 days",
  "90": "Next 90 days",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "Added by you",
  pdga: "PDGA",
  scene: "Disc Golf Scene",
  disc_golf_scene: "Disc Golf Scene",
  udisc: "UDisc",
  chainlink: "DG Dashboard",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source.toUpperCase();
}

function isoOf(p: PlannedEventRow): string | null {
  return p.starts_on ?? (p.starts_at ? p.starts_at.slice(0, 10) : null);
}

const CARD_CLASS =
  "block rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 transition hover:border-emerald-500/60 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500";

function pdgaRefFor(p: PlannedEventRow): string | null {
  if (p.source !== "pdga" || !p.event_url) return null;
  return p.event_url.match(/\/event\/(\d+)/)?.[1] ?? null;
}

function locationFor(p: PlannedEventRow): string {
  return p.location || [p.city, p.state].filter(Boolean).join(", ") || "Location TBD";
}

function fmtDate(startsOn: string | null, startsAt: string | null): string {
  const iso = startsOn ?? (startsAt ? startsAt.slice(0, 10) : null);
  if (!iso) return "Date TBD";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Wraps a planned event in the right link target: in-app, external, or schedule. */
function PlannedLink({
  event,
  className,
  children,
}: {
  event: PlannedEventRow;
  className: string;
  children: React.ReactNode;
}) {
  const ref = pdgaRefFor(event);
  if (ref) {
    return (
      <Link to="/events/pdga/$eventRef" params={{ eventRef: ref }} className={className}>
        {children}
      </Link>
    );
  }
  if (event.event_url) {
    return (
      <a href={event.event_url} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to="/schedule" className={className}>
      {children}
    </Link>
  );
}

function PlannedCard({ event }: { event: PlannedEventRow }) {
  return (
    <PlannedLink event={event} className={CARD_CLASS}>
      <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
        <CalendarDays className="h-3.5 w-3.5" />
        <span>{fmtDate(event.starts_on, event.starts_at)}</span>
        {event.source !== "manual" ? (
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-emerald-500">
            {event.source.toUpperCase()}
          </span>
        ) : null}
      </div>
      <div className="mt-1 truncate font-display text-base font-semibold">{event.title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5" />
        <span className="truncate">{locationFor(event)}</span>
      </div>
    </PlannedLink>
  );
}

export function PlannedRoundsView({ planned }: { planned: PlannedEventRow[] }) {
  const [view, setView] = useState<ViewMode>("list");
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [range, setRange] = useState<RangeKey>("all");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const sources = useMemo(
    () => [...new Set(planned.map((p) => p.source))].sort((a, b) => a.localeCompare(b)),
    [planned],
  );

  /** Filters only shape the card list; the calendar always shows the month. */
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const cutoff =
      range === "all"
        ? null
        : new Date(Date.now() + Number(range) * 86_400_000).toISOString().slice(0, 10);
    return planned.filter((p) => {
      if (source !== "all" && p.source !== source) return false;
      if (term) {
        const haystack = [p.title, p.location, p.city, p.state]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (cutoff) {
        const iso = isoOf(p);
        if (!iso || iso > cutoff) return false;
      }
      return true;
    });
  }, [planned, search, source, range]);

  const shown = filtered.slice(0, visible);

  const dated = useMemo(
    () =>
      planned
        .map((p) => ({ ...p, iso: p.starts_on ?? (p.starts_at ? p.starts_at.slice(0, 10) : null) }))
        .filter((p): p is PlannedEventRow & { iso: string } => !!p.iso),
    [planned],
  );

  const events: CalendarEvent[] = useMemo(
    () =>
      dated.map((p) => ({
        id: p.id,
        title: p.title,
        starts_on: p.iso,
        ends_on: p.iso,
        status: p.status ?? "interested",
        source: p.source === "scene" ? "disc_golf_scene" : p.source,
      })),
    [dated],
  );

  const undatedCount = planned.length - dated.length;
  const dayEvents = selected ? dated.filter((p) => p.iso === selected) : [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="inline-flex rounded-control border border-border p-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className={cn("h-7 px-2.5", view === "list" && "bg-muted text-foreground")}
            aria-pressed={view === "list"}
          >
            <LayoutGrid className="mr-1 h-3.5 w-3.5" />
            Cards
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("calendar")}
            className={cn("h-7 px-2.5", view === "calendar" && "bg-muted text-foreground")}
            aria-pressed={view === "calendar"}
          >
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            Calendar
          </Button>
        </div>
        {view === "calendar" && undatedCount > 0 ? (
          <span className="text-xs text-muted-foreground">
            {undatedCount} {undatedCount === 1 ? "event is" : "events are"} still waiting on a date
          </span>
        ) : null}
      </div>

      {view === "list" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 px-1">
            <div className="relative min-w-[190px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setVisible(PAGE_SIZE);
                }}
                placeholder="Search by event or course"
                aria-label="Search planned rounds"
                className="h-9 pl-8"
              />
            </div>
            <Select
              value={source}
              onValueChange={(v) => {
                setSource(v);
                setVisible(PAGE_SIZE);
              }}
            >
              <SelectTrigger className="h-9 w-[170px]" aria-label="Filter by source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {sourceLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={range}
              onValueChange={(v) => {
                setRange(v as RangeKey);
                setVisible(PAGE_SIZE);
              }}
            >
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by date range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {RANGE_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">
              Nothing matches those filters. Widen the date range or clear the search to see the
              rest of your schedule.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {shown.map((p) => (
                  <PlannedCard key={p.id} event={p} />
                ))}
              </div>
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-muted-foreground">
                  Showing {shown.length} of {filtered.length}
                </span>
                {shown.length < filtered.length ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  >
                    Show more
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <MonthGrid
            month={month}
            events={events}
            onMonthChange={(next) => {
              setMonth(next);
              setSelected(null);
            }}
            onSelectDate={(iso) => setSelected(iso)}
          />
          {selected ? (
            dayEvents.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                Nothing planned on{" "}
                {new Date(`${selected}T12:00:00Z`).toLocaleDateString(undefined, {
                  month: "long",
                  day: "numeric",
                })}
                . Pick another day, or add an event from your schedule.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {dayEvents.map((p) => (
                  <PlannedCard key={p.id} event={p} />
                ))}
              </div>
            )
          ) : (
            <p className="px-1 text-sm text-muted-foreground">
              Pick a day to see what you have planned.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
