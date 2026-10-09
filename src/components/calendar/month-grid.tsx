/**
 * Monthly calendar grid. Renders a 6-row month view with event chips per day.
 * Click a day to trigger onSelectDate.
 */
import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

export type CalendarEvent = {
  id: string;
  title: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  source: string;
  tier?: string | null;
  /** "tournament" | "league" | "casual" — shown as a compact L / T label. */
  kind?: string | null;
  /** 0=Sun..6=Sat. When set, event only renders on that weekday within [starts_on, ends_on]. */
  recurrence_dow?: number | null;
};

/** Statuses that mean the player isn't playing, so they can't create a conflict. */
const NON_COMMITTED_STATUS = new Set(["withdrawn", "cancelled", "completed", "interested"]);

/**
 * Color key for calendar chips: the listing source sets the color, the event
 * kind uses a separate label so patterns never obscure event titles.
 */
const SOURCE_BASE: Record<string, { color: string; label: string; dark?: boolean }> = {
  google: { color: "#9a3412", label: "Google" },
  community: { color: "#facc15", label: "Community", dark: true },
  pdga: { color: "#15803d", label: "PDGA" },
  disc_golf_scene: { color: "#2563eb", label: "Disc Golf Scene" },
  chainlink: { color: "#7c3aed", label: "DG Dashboard" },
  udisc: { color: "#0f766e", label: "UDisc" },
  manual: { color: "#475569", label: "Personal" },
};

/** Older callers pass a few legacy source names; fold them into the key above. */
function normalizeSource(source: string, kind?: string | null): string {
  if (source === "scene") return "disc_golf_scene";
  if (source === "tournament" || source === "league") return "chainlink";
  if (kind === "casual" && source !== "google") return "community";
  return SOURCE_BASE[source] ? source : "manual";
}

/** Background + text color for a chip or a legend swatch. */
export function eventChipStyle(
  source: string,
  kind?: string | null,
): { style: React.CSSProperties; textClass: string } {
  const key = normalizeSource(source, kind);
  const base = SOURCE_BASE[key] ?? SOURCE_BASE.manual;
  return {
    style: {
      backgroundColor: base.color,
      backgroundImage: "none",
    },
    textClass: base.dark ? "text-slate-900" : "text-white",
  };
}

const STATUS_ACCENT: Record<string, string> = {
  registered: "ring-1 ring-primary",
  confirmed: "ring-1 ring-emerald-500",
  waitlisted: "ring-1 ring-amber-500",
};

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MonthGrid({
  month,
  events,
  onMonthChange,
  onSelectDate,
  onSelectEvent,
}: {
  month: Date;
  events: CalendarEvent[];
  onMonthChange: (next: Date) => void;
  onSelectDate?: (isoDate: string) => void;
  onSelectEvent?: (id: string) => void;
}) {
  const grid = useMemo(() => {
    const first = startOfMonth(month);
    const leading = first.getDay(); // 0 = Sun
    const total = daysInMonth(month);
    const cells: Array<{ date: Date; iso: string; inMonth: boolean }> = [];
    // leading days from prev month
    for (let i = leading - 1; i >= 0; i--) {
      const d = new Date(first);
      d.setDate(-i);
      cells.push({ date: d, iso: toISODate(d), inMonth: false });
    }
    for (let i = 1; i <= total; i++) {
      const d = new Date(month.getFullYear(), month.getMonth(), i);
      cells.push({ date: d, iso: toISODate(d), inMonth: true });
    }
    while (cells.length < 42) {
      const last = cells[cells.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      cells.push({ date: d, iso: toISODate(d), inMonth: false });
    }
    return cells;
  }, [month]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.starts_on) continue;
      const start = new Date(ev.starts_on + "T12:00:00Z");
      const end = ev.ends_on ? new Date(ev.ends_on + "T12:00:00Z") : start;
      const dow = typeof ev.recurrence_dow === "number" ? ev.recurrence_dow : null;
      const singleDay = start.getTime() === end.getTime();
      const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const stampDays: Date[] = [];
      if (dow !== null) {
        // Recurring league: only the weekday it actually plays.
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          if (d.getDay() === dow) stampDays.push(new Date(d));
        }
      } else if (singleDay) {
        stampDays.push(new Date(start));
      } else if (spanDays <= 7) {
        // A real multi-round tournament: show every competition day.
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1))
          stampDays.push(new Date(d));
      } else {
        // Long registration/flex windows: start and end only, so they don't
        // bury every square of the month.
        stampDays.push(new Date(start));
        stampDays.push(new Date(end));
      }
      for (const d of stampDays) {
        const iso = toISODate(d);
        const list = map.get(iso) ?? [];
        list.push(ev);
        map.set(iso, list);
      }
    }
    return map;
  }, [events]);

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const today = toISODate(new Date());

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-display text-2xl font-bold">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMonthChange(new Date())}>
            Today
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6">
        {grid.map((cell) => {
          const dayEvents = eventsByDay.get(cell.iso) ?? [];
          const isToday = cell.iso === today;
          // Overlap warnings only matter for days inside the month being viewed
          // (spillover days are context, not conflicts), for dates that haven't
          // happened yet, and for events the player is actually committed to.
          const liveCount = dayEvents.filter((e) => !NON_COMMITTED_STATUS.has(e.status)).length;
          const hasConflict = cell.inMonth && cell.iso >= today && liveCount > 1;
          const spillLabel = cell.date.toLocaleDateString(undefined, { month: "short" });
          return (
            <button
              key={cell.iso + (cell.inMonth ? "" : "-o")}
              type="button"
              onClick={() => onSelectDate?.(cell.iso)}
              className={cn(
                "flex min-h-[92px] flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/40",
                !cell.inMonth && "bg-muted/40 text-muted-foreground",
                hasConflict && "bg-amber-50 ring-1 ring-inset ring-amber-400 dark:bg-amber-950/30",
              )}
              title={hasConflict ? `${liveCount} overlapping events` : undefined}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center justify-center gap-1 rounded-full px-1.5 text-xs font-semibold",
                    cell.inMonth ? "h-6 w-6 px-0" : "h-6",
                    isToday && "bg-primary text-primary-foreground",
                  )}
                >
                  {!cell.inMonth && (
                    <span className="text-[10px] font-medium uppercase">{spillLabel}</span>
                  )}
                  {cell.date.getDate()}
                </span>
                <div className="flex items-center gap-1">
                  {hasConflict && (
                    <span
                      className="rounded-sm bg-amber-700 px-1 text-[9px] font-bold uppercase text-white"
                      title="Overlap"
                    >
                      ⚠ {dayEvents.length}
                    </span>
                  )}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      +{dayEvents.length - 3}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <HoverCard key={ev.id + cell.iso} openDelay={120} closeDelay={80}>
                    <HoverCardTrigger asChild>
                      <span
                        onClick={(e) => {
                          if (onSelectEvent) { e.stopPropagation(); onSelectEvent(ev.id); }
                        }}
                        title={`${ev.title} · ${ev.kind ?? "Event"}`}
                        data-calendar-event={ev.id}
                        style={eventChipStyle(ev.source, ev.kind).style}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] font-semibold leading-4",
                          eventChipStyle(ev.source, ev.kind).textClass,
                          STATUS_ACCENT[ev.status] ?? "",
                        )}
                      >
                        {(ev.kind === "league" || ev.kind === "tournament") && <span className="shrink-0 rounded border border-current/40 px-0.5 text-[9px] leading-3" aria-label={ev.kind}>{ev.kind === "league" ? "L" : "T"}</span>}
                        <span className="min-w-0 truncate">{ev.title}</span>
                      </span>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-64 space-y-1 p-3 text-xs" side="top">
                      <div className="font-semibold text-sm leading-tight">{ev.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm"
                          style={eventChipStyle(ev.source, ev.kind).style}
                        />
                        <span className="capitalize">{ev.source.replace(/_/g, " ")}</span>
                        {ev.tier && (
                          <span className="rounded bg-muted px-1 py-0.5 font-medium text-foreground">
                            {ev.tier}
                          </span>
                        )}
                        <span className="capitalize">· {ev.status}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {ev.starts_on
                          ? new Date(ev.starts_on + "T12:00:00Z").toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "TBD"}
                        {ev.ends_on && ev.ends_on !== ev.starts_on
                          ? ` – ${new Date(ev.ends_on + "T12:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                          : ""}
                      </div>
                      <div className="pt-1 text-[11px] text-primary">Click to open</div>
                    </HoverCardContent>
                  </HoverCard>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const entries: Array<{ label: string; source: string; kind?: string }> = [
    { label: "Google events", source: "google" },
    { label: "PDGA leagues", source: "pdga", kind: "league" },
    { label: "PDGA tournaments", source: "pdga", kind: "tournament" },
    { label: "Disc Golf Scene leagues", source: "disc_golf_scene", kind: "league" },
    { label: "Disc Golf Scene tournaments", source: "disc_golf_scene", kind: "tournament" },
    { label: "DG Dashboard leagues", source: "chainlink", kind: "league" },
    { label: "DG Dashboard tournaments", source: "chainlink", kind: "tournament" },
    { label: "Community events", source: "community" },
    { label: "UDisc listings", source: "udisc" },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t px-4 py-2 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <span key={entry.label} className="inline-flex items-center gap-1.5">
          <span
            className={cn("inline-flex h-4 w-4 items-center justify-center rounded-sm text-[9px] font-bold",eventChipStyle(entry.source, entry.kind).textClass)}
            style={eventChipStyle(entry.source, entry.kind).style}
          >{entry.kind === "league" ? "L" : entry.kind === "tournament" ? "T" : ""}</span>
          {entry.label}
        </span>
      ))}
    </div>
  );
}
