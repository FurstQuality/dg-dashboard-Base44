import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { PdgaEventLinks } from "@/components/shared/pdga-links";
import type {
  TrackerEvent,
  TrackerTeeTime,
  TrackerEventRound,
  TrackerMember,
} from "@/lib/tracker.functions";
import { fmtDate, PhasePlaceholder, SectionIntro } from "./tracker-ui";

export function CoursesView({
  events,
  eventRounds,
  teeTimes,
  memberById,
  tripStart,
  tripEnd,
  embedded,
}: {
  events: TrackerEvent[];
  eventRounds: TrackerEventRound[];
  teeTimes: TrackerTeeTime[];
  memberById: Map<string, TrackerMember>;
  tripStart: string | null;
  tripEnd: string | null;
  embedded?: boolean;
}) {
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  // Only include events that fall inside the tracker's trip window. Without
  // this filter, a member registered for an unrelated event pollutes the
  // "courses this week" list with random local courses.
  const inTrip = (eventId: string) => {
    const e = eventById.get(eventId);
    if (!e) return false;
    if (!tripStart && !tripEnd) return true;
    if (!e.event_date) return false;
    if (tripStart && e.event_date < tripStart) return false;
    if (tripEnd && e.event_date > tripEnd) return false;
    return true;
  };

  const byCourse = new Map<
    string,
    { rounds: TrackerEventRound[]; events: Set<string>; players: Set<string> }
  >();
  for (const r of eventRounds) {
    const name = r.course_name?.trim();
    if (!name) continue;
    if (/^Default Layout/i.test(name)) continue; // PDGA placeholder — not a real course.
    if (!inTrip(r.event_id)) continue;
    const entry = byCourse.get(name) ?? { rounds: [], events: new Set(), players: new Set() };
    entry.rounds.push(r);
    entry.events.add(r.event_id);
    byCourse.set(name, entry);
  }
  for (const t of teeTimes) {
    if (!inTrip(t.event_id)) continue;
    const rnd = eventRounds.find(
      (r) => r.event_id === t.event_id && (r.round_number ?? 0) === (t.round_number ?? 0),
    );
    const name = rnd?.course_name?.trim();
    if (!name) continue;
    const mem = memberById.get(t.member_id);
    if (mem) byCourse.get(name)?.players.add(mem.display_name || `#${mem.pdga_number}`);
  }
  const rows = Array.from(byCourse.entries())
    .map(([name, v]) => {
      const dates = v.rounds
        .map((r) => r.round_date)
        .filter((d): d is string => !!d)
        .sort();
      const locSource = v.rounds.find((r) => eventById.get(r.event_id)?.location);
      return {
        name,
        rounds: v.rounds.length,
        events: Array.from(v.events)
          .map((id) => eventById.get(id)?.name)
          .filter(Boolean) as string[],
        players: Array.from(v.players).sort(),
        first: dates[0] ?? null,
        last: dates[dates.length - 1] ?? null,
        location: locSource ? (eventById.get(locSource.event_id)?.location ?? null) : null,
      };
    })
    .sort((a, b) => (a.first ?? "9999").localeCompare(b.first ?? "9999"));

  const tripEvents = events.filter((e) => inTrip(e.id));
  const eventsMissingCourse = tripEvents.filter((e) => {
    const rs = eventRounds.filter((r) => r.event_id === e.id);
    return (
      rs.length === 0 || rs.every((r) => !r.course_name || /^Default Layout/i.test(r.course_name))
    );
  });

  if (rows.length === 0 && eventsMissingCourse.length === 0) {
    return (
      <PhasePlaceholder label="No courses on file yet. Sync an event with round-by-round details to see the course list." />
    );
  }

  return (
    <div className="space-y-3">
      {embedded ? null : (
        <SectionIntro
          title="Courses this trip"
          description="Every course your crew is playing across tracked events during this trip window."
          compact
        />
      )}
      {rows.length === 0 && (
        <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
          PDGA hasn't published the round-by-round schedule for these events yet. Once the TD posts
          it, courses populate automatically. You can also add them by hand from the Events tab.
        </div>
      )}
      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => (
            <Card key={r.name}>
              <CardHeader className="pb-2">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{r.name}</CardTitle>
                    {r.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />{" "}
                        <span className="truncate">{r.location}</span>
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {r.rounds} round{r.rounds === 1 ? "" : "s"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="text-muted-foreground">
                  {r.first && (
                    <>
                      {fmtDate(r.first)}
                      {r.last && r.last !== r.first && ` – ${fmtDate(r.last)}`}
                    </>
                  )}
                </div>
                {r.events.length > 0 && (
                  <div>
                    <div className="font-medium text-foreground">Events</div>
                    <div className="text-muted-foreground">{r.events.join(" · ")}</div>
                  </div>
                )}
                {r.players.length > 0 && (
                  <div>
                    <div className="font-medium text-foreground">Crew playing here</div>
                    <div className="text-muted-foreground">{r.players.join(", ")}</div>
                  </div>
                )}
                {r.location && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.location}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <MapPin className="h-3 w-3" /> Get directions
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {eventsMissingCourse.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Events still waiting on a course schedule</CardTitle>
            <p className="pt-1 text-xs text-muted-foreground">
              These events are on your tracker but don't have round-by-round course assignments yet.
              Flex events often name the course in the event title instead of posting a schedule.
            </p>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {eventsMissingCourse.map((e) => (
              <div
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border bg-muted/30 px-2 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{e.name}</div>
                  <div className="text-muted-foreground">
                    {e.event_date ? fmtDate(e.event_date) : "TBD"}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
                {e.pdga_event_ref && <PdgaEventLinks eventRef={e.pdga_event_ref} label={null} />}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
