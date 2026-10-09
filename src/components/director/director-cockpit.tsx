import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Info,
  MapPin,
  Radio,
  Users,
} from "lucide-react";
import { ContentCard, LoadingSkeleton } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Progress } from "@/components/ui/progress";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { getDirectorCockpit, type DirectorCockpit } from "@/lib/director.functions";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";
import {
  directorAlerts,
  fillPct,
  type DirectorAlert,
  type DirectorEvent,
} from "@/lib/director-alerts";
import { money } from "@/lib/director-kit";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { organizerDraft } from "@/lib/share-to-feed";
import { AnnouncementComposer } from "@/components/director/announcement-composer";

const SEVERITY: Record<
  DirectorAlert["severity"],
  { icon: typeof AlertTriangle; cls: string; label: string }
> = {
  critical: { icon: AlertTriangle, cls: "text-danger", label: "Fix now" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Soon" },
  info: { icon: Info, cls: "text-muted-foreground", label: "Heads up" },
};

const dayLabel = (d: string) =>
  new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function countdown(e: DirectorEvent): string {
  if (e.isLiveToday) return "Running today";
  if (e.daysOut === 0) return "Starts today";
  if (e.daysOut === 1) return "Starts tomorrow";
  if (e.daysOut > 1) return `In ${e.daysOut} days`;
  return "Wrapped";
}

/**
 * The organizer's cockpit: what is running or coming up, how full it is, how
 * much money is outstanding, and exactly what still needs a decision.
 */
export function DirectorCockpit({ userId }: { userId: string | null | undefined }) {
  const fetchCockpit = useServerFn(getDirectorCockpit);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: directorKeys.cockpit(userId),
    enabled: !!userId,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchCockpit(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);



  if (isPending) {
    return (
      <div className="space-y-4">
        <LoadingSkeleton variant="stat-grid" count={4} />
        <LoadingSkeleton variant="card" count={2} />
      </div>
    );
  }

  if (isError) {
    return (
      <DirectorErrorState title="Your director console didn't load" onRetry={() => void refetch()} />
    );
  }

  const events = data?.events ?? [];
  const autoFocus =
    events.find((e) => e.isLiveToday) ?? events.find((e) => e.daysOut >= 0) ?? events[0] ?? null;
  const focus = events.find((e) => e.id === selectedId) ?? autoFocus;
  // Only the event you're looking at — the alert list follows the picker.
  const alerts = focus ? directorAlerts(events.filter((e) => e.id === focus.id)) : [];

  const leagues = data?.leagues ?? [];

  if (!focus) {
    return (
      <div className="space-y-4">
        <ContentCard
          title={leagues.length ? "No tournaments yet" : "No events yet"}
          subtitle={
            leagues.length
              ? "Your leagues are below. Add a tournament and this console also tracks registrations, money, and event-day tasks."
              : "Create your first tournament or league and this console fills in with registrations, money, and event-day tasks."
          }
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/director/tournaments/new">Create a tournament</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/director/leagues/new">Start a league</Link>
            </Button>
          </div>
        </ContentCard>
        <LeaguesCard leagues={leagues} />
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {events.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Event
          </span>
          <Select value={focus.id} onValueChange={setSelectedId}>
            <SelectTrigger className="h-9 w-[280px] text-sm">
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <FocusEvent event={focus} onChanged={() => void refetch()} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ContentCard
          title="Needs your attention"
          subtitle={
            alerts.length === 0
              ? `Nothing outstanding for ${focus.name}.`
              : `${alerts.length} item${alerts.length === 1 ? "" : "s"} for ${focus.name}`
          }
        >

          {alerts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-community-green" />
              Everything is set up: courses, divisions, rounds, and rosters all check out.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 8).map((a) => {
                const sev = SEVERITY[a.severity];
                return (
                  <li key={a.id} className="rounded-control border border-border/60 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <sev.icon className={`mt-0.5 h-4 w-4 shrink-0 ${sev.cls}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{a.title}</span>
                          <Badge variant="outline" className="text-[11px]">
                            {sev.label}
                          </Badge>
                        </div>
                        <p className="text-[13px] text-muted-foreground">{a.detail}</p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">{a.eventName}</p>
                      </div>
                      <AlertFix alert={a} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ContentCard>

        <div className="space-y-4">
          <ContentCard title="Upcoming events you run" subtitle="Soonest first.">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/tournaments/$slug"
                      params={{ slug: e.slug }}
                      className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2 transition-colors hover:border-primary/60"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{e.name}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {dayLabel(e.startDate)} · {countdown(e)} ·{" "}
                          {e.registrations.confirmed + e.registrations.checkedIn} in the field
                        </span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ContentCard>

          <LeaguesCard leagues={leagues} />

        </div>
      </div>
    </div>
  );
}

function LeaguesCard({ leagues }: { leagues: DirectorCockpit["leagues"] }) {
  if (leagues.length === 0) return null;
  return (
    <ContentCard title="Leagues you run" subtitle="Seasons and sign-ups.">
      <ul className="space-y-1.5">
        {leagues.map((l) => (
          <li
            key={l.id}
            className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2"
          >
            <span className="min-w-0">
              <Link
                to="/director/leagues/$slug"
                params={{ slug: l.slug }}
                className="block truncate text-sm font-semibold hover:underline"
              >
                {l.name}
              </Link>
              <span className="block text-[12px] text-muted-foreground">
                {l.status.replace(/_/g, " ")} · {l.players} signed up
                {l.nextNight
                  ? ` · Next: Week ${l.nextNight.week}, ${new Date(`${l.nextNight.date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`
                  : ""}
              </span>
            </span>
            <ShareToFeedButton
              iconOnly
              label="Share league night"
              draft={() =>
                organizerDraft({
                  kind: "league_night",
                  eventName: l.name,
                  startDate: l.nextNight?.date ?? l.startDate,
                  players: l.players,
                  slug: l.slug,
                })
              }
            />
          </li>
        ))}
      </ul>
    </ContentCard>
  );
}


function AlertFix({ alert }: { alert: DirectorAlert }) {
  if (alert.fix === "registrations") {
    return (
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <Link to="/director/registrations" search={{ event: alert.eventId }}>
          Open
        </Link>
      </Button>
    );
  }
  if (alert.fix === "checklist") {
    // Checklist nudges belong on the prep desk that owns the list, not the
    // public event page.
    return (
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <Link to="/director/ops" search={{ event: alert.eventId }}>
          Open
        </Link>
      </Button>
    );
  }
  if (alert.fix === "kit") {
    return (
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <Link to="/director/kit" search={{ event: alert.eventId }}>
          Open
        </Link>
      </Button>
    );
  }
  return (
    <Button asChild size="sm" variant="ghost" className="shrink-0">
      <Link to="/tournaments/$slug" params={{ slug: alert.eventSlug }}>
        Open
      </Link>
    </Button>
  );
}

function FocusEvent({ event, onChanged }: { event: DirectorEvent; onChanged: () => void }) {
  const pct = fillPct(event);
  const inField = event.registrations.confirmed + event.registrations.checkedIn;

  return (
    <ContentCard
      title={
        <span className="flex flex-wrap items-center gap-2">
          {event.isLiveToday ? (
            <Badge className="gap-1 bg-danger/15 text-danger">
              <Radio className="h-3 w-3" /> Live today
            </Badge>
          ) : (
            <Badge variant="outline">{countdown(event)}</Badge>
          )}
          <span className="truncate">{event.name}</span>
        </span>
      }
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span className="inline-flex items-center gap-1">
            <CalendarRange className="h-3.5 w-3.5" />
            {dayLabel(event.startDate)}
            {event.endDate !== event.startDate ? ` – ${dayLabel(event.endDate)}` : ""}
          </span>
          {event.courseName || event.location ? (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.courseName ?? event.location}
            </span>
          ) : null}
          {event.pdgaSanctioned ? <Badge variant="outline">PDGA sanctioned</Badge> : null}
        </span>
      }
      action={
        <div className="flex flex-wrap gap-2">
          <AnnouncementComposer
            eventId={event.id}
            eventName={event.name}
            eventSlug={event.slug}
            startDate={event.startDate}
            courseName={event.courseName}
            onSent={onChanged}
          />
          <Button asChild size="sm" variant="outline">
            <Link to="/tournaments/$slug" params={{ slug: event.slug }}>
              Open event
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={Users}
          label="In the field"
          value={String(inField)}
          hint={
            event.maxPlayers
              ? `of ${event.maxPlayers} cap${event.registrations.waitlist ? ` · ${event.registrations.waitlist} waitlisted` : ""}`
              : `${event.registrations.pending} pending · ${event.registrations.waitlist} waitlisted`
          }
          footer={pct !== null ? <Progress value={pct} className="mt-2 h-1.5" /> : null}
        />
        <Metric
          icon={DollarSign}
          label="Entry fees"
          value={money(event.feesCollectedCents)}
          hint={
            event.feesOutstandingCents > 0
              ? `${money(event.feesOutstandingCents)} outstanding from ${event.registrations.unpaid} player(s)`
              : "Everyone is square"
          }
        />
        <Metric
          icon={ClipboardList}
          label="Checklist"
          value={event.checklistTotal ? `${event.checklistDone}/${event.checklistTotal}` : "—"}
          hint={
            event.checklistTotal ? "Tasks complete" : "No tasks yet — add the sanctioned template"
          }
        />
        <Metric
          icon={CalendarRange}
          label="Structure"
          value={`${event.rounds} round${event.rounds === 1 ? "" : "s"}`}
          hint={`${event.divisions} division(s) · ${event.roundsWithTeeTimes}/${event.rounds || 0} with start times`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/director/registrations" search={{ event: event.id }}>
            <Users className="mr-1 h-4 w-4" />
            Manage registrations
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/director/kit" search={{ event: event.id }}>
            <ClipboardList className="mr-1 h-4 w-4" />
            Tee signs &amp; caddy guide
          </Link>
        </Button>
        {event.isLiveToday ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/events">
              <Radio className="mr-1 h-4 w-4" />
              Live scoring
            </Link>
          </Button>
        ) : null}
        <ShareToFeedButton
          label={event.status === "completed" ? "Share results" : "Share to feed"}
          draft={() =>
            organizerDraft({
              kind:
                event.status === "completed"
                  ? "final_results"
                  : event.roundsWithTeeTimes > 0 && event.daysOut <= 3
                    ? "tee_times"
                    : "registration_open",
              eventName: event.name,
              startDate: event.startDate,
              location: event.location,
              courseName: event.courseName,
              players: inField,
              spotsLeft: event.maxPlayers ? Math.max(0, event.maxPlayers - inField) : null,
              divisions: event.divisions,
              slug: event.slug,
            })
          }
        />
      </div>
    </ContentCard>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  footer,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  hint: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-control border border-border/60 p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="font-display text-2xl font-semibold">{value}</div>
      <div className="text-[12px] text-muted-foreground">{hint}</div>
      {footer}
    </div>
  );
}
