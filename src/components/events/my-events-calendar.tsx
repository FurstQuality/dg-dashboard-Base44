import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  listMySchedule,
  upsertScheduledEvent,
  setScheduledEventStatus,
  deleteScheduledEvent,
  refreshScheduledEvent,
  syncMyPdgaEvents,
  syncMyOutreachEvents,
} from "@/lib/scheduled-events.functions";

import { pushEventToGoogle } from "@/lib/calendar-sync.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageShell, PageHeader } from "@/components/shell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  ExternalLink,
  List,
  MapPin,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
  Upload,
  Settings,
} from "lucide-react";
import { Mascot } from "@/components/mascot";
import { MonthGrid, type CalendarEvent } from "@/components/calendar/month-grid";
import { TrackedEventsPanel } from "@/components/tracker/tracked-events-panel";
import { EventsViewTabs } from "@/components/events/events-view-tabs";

type ScheduledEvent = {
  id: string;
  source: string;
  status: string;
  title: string;
  event_url: string | null;
  registration_url: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  starts_on: string | null;
  ends_on: string | null;
  registration_deadline: string | null;
  tier: string | null;
  division: string | null;
  entry_fee_cents: number | null;
  currency: string | null;
  spots_taken: number | null;
  spots_total: number | null;
  waitlist_position: number | null;
  notes: string | null;
  last_synced_at: string | null;
  external_id?: string | null;
  google_event_id?: string | null;
  recurrence_dow?: number | null;
};

const STATUS_LABEL: Record<string, string> = {
  interested: "Interested",
  registered: "Registered",
  waitlisted: "Waitlisted",
  confirmed: "Confirmed",
  completed: "Completed",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  interested: "secondary",
  registered: "default",
  waitlisted: "outline",
  confirmed: "default",
  completed: "secondary",
  withdrawn: "outline",
  cancelled: "destructive",
};

const SOURCE_LABEL: Record<string, string> = {
  disc_golf_scene: "Disc Golf Scene",
  pdga: "PDGA",
  udisc: "UDisc",
  tournament: "In-app tournament",
  league: "In-app league",
  google: "Google Calendar",
  manual: "Manual",
};

function formatDateRange(start: string | null, end: string | null): string {
  if (!start) return "Date TBD";
  const s = new Date(start + "T12:00:00Z");
  if (!end || end === start)
    return s.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const e = new Date(end + "T12:00:00Z");
  return `${s.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${e.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

const AUTO_SYNC_KEY = "dgd:schedule:last-pdga-auto-sync";

export function MyEventsCalendar() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMySchedule);
  const syncPdgaFn = useServerFn(syncMyPdgaEvents);
  const syncOutreachFn = useServerFn(syncMyOutreachEvents);

  const { data, isLoading } = useQuery({
    queryKey: ["my-schedule"],
    queryFn: () => listFn(),
  });

  // Keep the calendar on live PDGA data: refresh the signed-in player's PDGA
  // schedule at most once per day, silently (manual sync lives in settings).
  useEffect(() => {
    let cancelled = false;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(AUTO_SYNC_KEY) === today) return;
    localStorage.setItem(AUTO_SYNC_KEY, today);
    void (async () => {
      let changed = false;
      try {
        const res = await syncPdgaFn();
        changed = (res?.added ?? 0) > 0 || (res?.updated ?? 0) > 0;
      } catch {
        // No PDGA number linked or PDGA unreachable — manual sync stays available.
      }
      try {
        // Outreach events the player hosts or RSVP'd to belong on the calendar too.
        const res = await syncOutreachFn();
        changed =
          changed || (res?.added ?? 0) > 0 || (res?.updated ?? 0) > 0 || (res?.removed ?? 0) > 0;
      } catch {
        // Outreach mirror is best effort.
      }
      if (!cancelled && changed) qc.invalidateQueries({ queryKey: ["my-schedule"] });
    })();
    return () => {
      cancelled = true;
    };
  }, [qc, syncPdgaFn, syncOutreachFn]);

  const scheduledRaw = (data?.scheduled ?? []) as ScheduledEvent[];
  const [month, setMonth] = useState<Date>(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "calendar">("calendar");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-schedule"] });

  // Dedupe: the same real-world event can arrive as PDGA + Scene + manual +
  // in-app tournament, so collapse rows that share a signature. We prefer
  // linked in-app tournaments, then PDGA, then Scene, then manual/other.
  const SOURCE_RANK: Record<string, number> = {
    tournament: 0,
    league: 1,
    pdga: 2,
    disc_golf_scene: 3,
    udisc: 4,
    google: 5,
    manual: 6,
  };
  function signature(e: ScheduledEvent): string {
    if (e.event_url) {
      const pdga = e.event_url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
      if (pdga) return `pdga:${pdga[1]}`;
      const dgs = e.event_url.match(/discgolfscene\.com\/tournaments\/([^/?#]+)/i);
      if (dgs) return `dgs:${dgs[1].toLowerCase()}`;
    }
    if (e.external_id) return `ext:${e.external_id}`;
    const title = (e.title || "").toLowerCase().replace(/\s+/g, " ").trim();
    return `t:${title}|${e.starts_on ?? ""}`;
  }
  const bySig = new Map<string, ScheduledEvent>();
  for (const e of scheduledRaw) {
    const sig = signature(e);
    const cur = bySig.get(sig);
    if (!cur) {
      bySig.set(sig, e);
      continue;
    }
    const curRank = SOURCE_RANK[cur.source] ?? 99;
    const nextRank = SOURCE_RANK[e.source] ?? 99;
    if (nextRank < curRank) bySig.set(sig, e);
  }
  const scheduled = Array.from(bySig.values());

  const calendarEvents: CalendarEvent[] = scheduled.map((e) => ({
    id: e.id,
    title: e.title,
    starts_on: e.starts_on,
    ends_on: e.ends_on,
    status: e.status,
    source: e.source,
    tier: e.tier,
    recurrence_dow: e.recurrence_dow ?? null,
  }));

  const eventsForSelected = selectedDate
    ? scheduled.filter((e) => {
        if (!e.starts_on) return false;
        const end = e.ends_on ?? e.starts_on;
        if (selectedDate < e.starts_on || selectedDate > end) return false;
        // If the event recurs on a specific weekday, only include it on that weekday.
        if (typeof e.recurrence_dow === "number") {
          const sel = new Date(selectedDate + "T12:00:00Z");
          if (sel.getUTCDay() !== e.recurrence_dow) return false;
        }
        return true;
      })
    : [];

  const upcoming = scheduled
    .filter((e) => e.starts_on && e.starts_on >= new Date().toISOString().slice(0, 10))
    .slice(0, 8);

  const today = new Date().toISOString().slice(0, 10);
  const byDate = (a: ScheduledEvent, b: ScheduledEvent) =>
    (a.starts_on ?? "9999").localeCompare(b.starts_on ?? "9999");
  const listGroups = [
    {
      key: "upcoming",
      heading: "Coming up",
      rows: scheduled
        .filter((e) => !e.starts_on || (e.ends_on ?? e.starts_on) >= today)
        .sort(byDate),
    },
    {
      key: "past",
      heading: "Already played",
      rows: scheduled
        .filter((e) => e.starts_on && (e.ends_on ?? e.starts_on) < today)
        .sort(byDate)
        .reverse()
        .slice(0, 20),
    },
  ];

  return (
    <PageShell section="play">
      <PageHeader
        leading={<Mascot name="hyzer" pose="action" size={72} />}
        title="My Events"
        description="What you're registered for, signed up for, or tracking."
        primaryAction={
          <Button asChild>
            <Link to="/settings/calendar">
              <Settings className="mr-1 h-4 w-4" />
              Calendar settings
            </Link>
          </Button>
        }
        secondaryAction={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/schedule/compare">Compare with friends</Link>
            </Button>
          </div>
        }
      />

      <EventsViewTabs current="mine" />

      <MyEventsSummary rows={scheduled} today={today} />

      <div className="flex flex-wrap items-center gap-2">
        {(["calendar", "list"] as const).map((v) => {
          const on = view === v;
          return (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-control border px-4 py-2 text-sm font-semibold transition ${
                on
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {v === "list" ? <List className="h-4 w-4" /> : <CalendarIcon className="h-4 w-4" />}
              {v === "list" ? "List" : "Calendar"}
            </button>
          );
        })}
        <span className="text-xs text-muted-foreground">
          {scheduled.length} event{scheduled.length === 1 ? "" : "s"} on your schedule
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your schedule…</p>
      ) : view === "calendar" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <MonthGrid
            month={month}
            events={calendarEvents}
            onMonthChange={setMonth}
            onSelectDate={setSelectedDate}
            onSelectEvent={(id) => {
              const ev = scheduled.find((s) => s.id === id);
              if (ev?.starts_on) setSelectedDate(ev.starts_on);
            }}
          />
          <aside className="space-y-3">
            <h3 className="font-display text-lg font-semibold">Up next</h3>
            {upcoming.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-sm text-muted-foreground">
                  Nothing scheduled yet. Find a tournament or league and sign up — it lands here
                  automatically.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map((ev) => (
                  <MiniEventCard
                    key={ev.id}
                    event={ev}
                    onClick={() => setSelectedDate(ev.starts_on)}
                  />
                ))}
              </div>
            )}
            <Link to="/events">
              <Button variant="outline" className="w-full">
                <Trophy className="mr-1 h-4 w-4" />
                Browse in-app tournaments
              </Button>
            </Link>
          </aside>
        </div>
      ) : (
        <div className="space-y-6">
          {scheduled.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 py-8 text-center text-sm text-muted-foreground">
                <p>
                  You're not signed up for anything yet. Browse events and register — everything you
                  join shows up here.
                </p>
                <Button asChild size="sm">
                  <Link to="/events">Find an event</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            listGroups.map((g) =>
              g.rows.length === 0 ? null : (
                <section key={g.key} className="space-y-3">
                  <h2 className="font-display text-lg font-semibold">
                    {g.heading}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      ({g.rows.length})
                    </span>
                  </h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {g.rows.map((ev) => (
                      <EventCard key={ev.id} event={ev} onChanged={invalidate} />
                    ))}
                  </div>
                </section>
              ),
            )
          )}

          <TrackedEventsPanel />
        </div>
      )}

      <Sheet open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDate
                ? new Date(selectedDate + "T12:00:00Z").toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })
                : ""}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {eventsForSelected.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events on this day.</p>
            ) : (
              eventsForSelected.map((ev) => (
                <EventCard key={ev.id} event={ev} onChanged={invalidate} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function MiniEventCard({ event, onClick }: { event: ScheduledEvent; onClick: () => void }) {
  const pdgaRef = event.external_id?.startsWith("pdga:") ? event.external_id.slice(5) : null;
  return (
    <div className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40">
      <button onClick={onClick} className="block w-full text-left">
        <p className="line-clamp-1 text-sm font-semibold">{event.title}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateRange(event.starts_on, event.ends_on)}
        </p>
      </button>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {SOURCE_LABEL[event.source] ?? event.source}
        </Badge>
        <Badge variant={STATUS_COLOR[event.status] ?? "secondary"} className="text-[10px]">
          {STATUS_LABEL[event.status] ?? event.status}
        </Badge>
        {pdgaRef && (
          <Link
            to="/events/pdga/$eventRef"
            params={{ eventRef: pdgaRef }}
            className="ml-auto inline-flex items-center gap-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
            onClick={(e) => e.stopPropagation()}
          >
            <Trophy className="h-2.5 w-2.5" /> Details
          </Link>
        )}
      </div>
    </div>
  );
}

function EventCard({ event, onChanged }: { event: ScheduledEvent; onChanged: () => void }) {
  const setStatus = useServerFn(setScheduledEventStatus);
  const del = useServerFn(deleteScheduledEvent);
  const refresh = useServerFn(refreshScheduledEvent);
  const push = useServerFn(pushEventToGoogle);
  const [busy, setBusy] = useState(false);

  async function updateStatus(next: string) {
    setBusy(true);
    try {
      await setStatus({ data: { id: event.id, status: next as never } });
      toast.success(`Marked as ${STATUS_LABEL[next]}`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove this event from your schedule?")) return;
    setBusy(true);
    try {
      await del({ data: { id: event.id } });
      toast.success("Removed");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function pull() {
    setBusy(true);
    try {
      await refresh({ data: { id: event.id } });
      toast.success("Refreshed from source");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function pushGoogle() {
    setBusy(true);
    try {
      await push({ data: { id: event.id } });
      toast.success("Pushed to Google Calendar");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Push failed");
    } finally {
      setBusy(false);
    }
  }

  const feeDisplay =
    event.entry_fee_cents != null
      ? `$${(event.entry_fee_cents / 100).toFixed(2)}${event.currency && event.currency !== "USD" ? ` ${event.currency}` : ""}`
      : null;

  const location = event.location ?? [event.city, event.state].filter(Boolean).join(", ");

  return (
    <Card className={busy ? "opacity-60" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 text-base leading-tight">{event.title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {SOURCE_LABEL[event.source] ?? event.source}
            </p>
          </div>
          <Badge variant={STATUS_COLOR[event.status] ?? "secondary"}>
            {STATUS_LABEL[event.status] ?? event.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CalendarIcon className="h-4 w-4" />
          <span>{formatDateRange(event.starts_on, event.ends_on)}</span>
        </div>
        {location && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span className="line-clamp-1">{location}</span>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {event.tier && <Badge variant="outline">{event.tier}</Badge>}
          {event.division && <Badge variant="outline">{event.division}</Badge>}
          {feeDisplay && <Badge variant="secondary">{feeDisplay}</Badge>}
          {event.spots_total != null && (
            <Badge variant="outline">
              <Users className="mr-1 h-3 w-3" />
              {event.spots_taken ?? 0}/{event.spots_total}
            </Badge>
          )}
          {event.google_event_id && <Badge variant="outline">✓ Google</Badge>}
        </div>
        {event.registration_deadline && (
          <p className="text-xs text-muted-foreground">
            Registration closes {new Date(event.registration_deadline).toLocaleString()}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Select value={event.status} onValueChange={updateStatus}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(() => {
            const ref = event.external_id?.startsWith("pdga:") ? event.external_id.slice(5) : null;
            return ref ? (
              <Link to="/events/pdga/$eventRef" params={{ eventRef: ref }}>
                <Button size="sm" variant="secondary">
                  <Trophy className="mr-1 h-3 w-3" />
                  Details
                </Button>
              </Link>
            ) : null;
          })()}
          {event.event_url && (
            <>
              <a href={event.event_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  <ExternalLink className="mr-1 h-3 w-3" />
                  Open
                </Button>
              </a>
              <Button size="sm" variant="ghost" onClick={pull} disabled={busy}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </>
          )}
          {!event.google_event_id && (
            <Button size="sm" variant="ghost" onClick={pushGoogle} disabled={busy}>
              <Upload className="mr-1 h-3 w-3" />
              Google
            </Button>
          )}
          {event.registration_url && (
            <a href={event.registration_url} target="_blank" rel="noreferrer">
              <Button size="sm">Register</Button>
            </a>
          )}
          <Button size="sm" variant="ghost" onClick={remove} disabled={busy}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MyEventsSummary({ rows, today }: { rows: ScheduledEvent[]; today: string }) {
  const in7 = new Date(today + "T12:00:00");
  in7.setDate(in7.getDate() + 7);
  const weekEnd = in7.toISOString().slice(0, 10);
  const ahead = rows
    .filter((e) => e.starts_on && (e.ends_on ?? e.starts_on) >= today && e.status !== "withdrawn" && e.status !== "cancelled")
    .sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""));
  const registered = ahead.filter((e) => ["registered", "confirmed", "waitlisted"].includes(e.status)).length;
  const tracking = ahead.filter((e) => e.status === "interested").length;
  const thisWeek = ahead.filter((e) => (e.starts_on ?? "") <= weekEnd).length;
  const next = ahead.slice(0, 3);
  const stats = [
    ["Registered", registered],
    ["Tracking", tracking],
    ["Next 7 days", thisWeek],
  ] as const;
  return (
    <section className="grid gap-3 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-card p-3">
        {stats.map(([label, n]) => (
          <div key={label} className="min-w-0 text-center">
            <div className="text-xl font-semibold tabular-nums">{n}</div>
            <div className="truncate text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        <h2 className="mb-1.5 text-sm font-semibold">Up next</h2>
        {next.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on your calendar yet.{" "}
            <Link to="/events" className="font-medium text-primary hover:underline">
              Find an event
            </Link>
          </p>
        ) : (
          <ul className="space-y-1">
            {next.map((e) => (
              <li key={e.id} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {new Date((e.starts_on ?? today) + "T12:00:00").toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="shrink-0 text-xs capitalize text-muted-foreground">
                  {e.status === "interested" ? "Tracking" : e.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
