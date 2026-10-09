/**
 * Calendar view for the event directory. Renders the same filtered rows the list
 * and table views show — PDGA, Disc Golf Scene, UDisc, and Disc Golf Dashboard —
 * on a month grid, with a day panel for adding an event to a personal calendar.
 */
import { useMemo, useState } from "react";
import { meetingSchedule, meetsOn } from "@/lib/league-recurrence";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { MonthGrid, type CalendarEvent } from "@/components/calendar/month-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";
import { SeriesNote, SeriesLink } from "@/components/events/series-note";
import { KIND_META, SOURCE_META, fmtWhen, type UnifiedRow } from "./events-types";

const CALENDAR_SOURCE: Record<UnifiedRow["source"], string> = {
  pdga: "pdga",
  scene: "disc_golf_scene",
  udisc: "udisc",
  chainlink: "chainlink",
};

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rows that touch the given date, so a click on a square lists what's playing. */
function rowsOnDate(rows: UnifiedRow[], iso: string): UnifiedRow[] {
  return rows.filter((r) => {
    if (!r.start_date) return false;
    // A multi-week season block only plays on its weekday; short events cover every day.
    return meetsOn({ name: r.title, start_date: r.start_date, end_date: r.end_date }, iso);
  });
}

/** Weekday a league season plays, so the month grid stamps only those squares. */
function leagueWeekday(r: UnifiedRow): number | null {
  if (!r.start_date) return null;
  const schedule = meetingSchedule({
    name: r.title,
    start_date: r.start_date,
    end_date: r.end_date,
  });
  if (!schedule.recurring || schedule.weekdays.length !== 1) return null;
  return schedule.weekdays[0];
}

export function EventsCalendar({ rows }: { rows: UnifiedRow[] }) {
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const events: CalendarEvent[] = useMemo(
    () =>
      rows
        .filter((r) => r.start_date)
        .map((r) => ({
          id: r.id,
          title: r.title,
          starts_on: r.start_date,
          ends_on: r.end_date,
          status: r.status ?? "interested",
          source: CALENDAR_SOURCE[r.source],
          kind: r.kind,
          tier: r.tier,
          recurrence_dow: leagueWeekday(r),
        })),
    [rows],
  );

  const dayRows = selected ? rowsOnDate(rows, selected) : [];
  const dated = events.length;
  const undated = rows.length - dated;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" />
          {dated} dated {dated === 1 ? "event" : "events"} in view
        </span>
        {undated > 0 ? <span>{undated} still waiting on dates</span> : null}
        <span>Pick a day to open it and add anything to your calendar.</span>
      </div>

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
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold">
              {new Date(`${selected}T12:00:00Z`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h3>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Close day
            </Button>
          </div>

          {dayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing scheduled here yet. Try another day, or widen your filters to see more of the
              area.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {dayRows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${SOURCE_META[r.source].tone}`}
                      >
                        {SOURCE_META[r.source].short}
                      </span>
                      <Badge variant="outline" className={KIND_META[r.kind].tone}>
                        {KIND_META[r.kind].label}
                      </Badge>
                      {r.tier ? (
                        <span className="text-[11px] text-muted-foreground">{r.tier}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate font-semibold">
                      {r.linkTo ? (
                        <Link
                          to={r.linkTo.to}
                          params={r.linkTo.params}
                          className="hover:text-primary"
                        >
                          {r.title}
                        </Link>
                      ) : r.external_url ? (
                        <a
                          href={r.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          {r.title}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        r.title
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{fmtWhen(r)}</span>
                      {r.series ? (
                        <>
                          <SeriesNote series={r.series} />
                          <SeriesLink series={r.series} />
                        </>
                      ) : null}
                      {r.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {r.location}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <AddToCalendarButton
                    event={{
                      id: r.id,
                      title: r.title,
                      source: r.source,
                      start_date: r.start_date,
                      end_date: r.end_date,
                      location: r.location,
                      tier: r.tier,
                      external_url: r.external_url ?? null,
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
