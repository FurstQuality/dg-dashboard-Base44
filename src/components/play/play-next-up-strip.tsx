/**
 * "Next up" strip for the Play overview — the single soonest thing on the
 * player's calendar, with the two actions they actually want at that moment:
 * plan it, or get it into their calendar. It reuses the Play events query that
 * the rest of the page already loads, so it costs no extra reads.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ExternalLink, MapPin, Target } from "lucide-react";
import { getPlayEvents, type MyPlayEvent, type NearbyPlayEvent } from "@/lib/play.functions";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AddToCalendarButton } from "@/components/events/add-to-calendar-button";

type NextUp = {
  key: string;
  title: string;
  date: string | null;
  time: string | null;
  location: string | null;
  /** Committed entries carry a game-plan id; directory listings do not. */
  gamePlanEventId: string | null;
  registrationUrl: string | null;
  calendar: {
    id: string;
    title: string;
    source: "pdga" | "chainlink";
    start_date: string | null;
    end_date: string | null;
    location: string | null;
    tier: string | null;
    external_url: string | null;
  } | null;
  mine: boolean;
};

function dayLabel(date: string | null): string {
  if (!date) return "Date to be announced";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const today = new Date();
  const days = Math.round((d.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000);
  const formatted = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (days === 0) return `Today · ${formatted}`;
  if (days === 1) return `Tomorrow · ${formatted}`;
  if (days > 1 && days <= 14) return `In ${days} days · ${formatted}`;
  return formatted;
}

function teeTime(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function fromMine(e: MyPlayEvent): NextUp {
  return {
    key: `mine-${e.id}`,
    title: e.title,
    date: e.startsOn,
    time: teeTime(e.startsAt),
    location: e.location,
    gamePlanEventId: e.id,
    registrationUrl: null,
    calendar: null,
    mine: true,
  };
}

function fromNearby(e: NearbyPlayEvent): NextUp {
  return {
    key: `nearby-${e.id}`,
    title: e.name,
    date: e.startDate,
    time: null,
    location: e.location ?? ([e.city, e.state].filter(Boolean).join(", ") || null),
    gamePlanEventId: null,
    registrationUrl: e.registrationUrl,
    calendar: {
      id: e.id,
      title: e.name,
      source: e.pdgaEventId ? "pdga" : "chainlink",
      start_date: e.startDate,
      end_date: e.endDate,
      location: e.location ?? ([e.city, e.state].filter(Boolean).join(", ") || null),
      tier: e.tier,
      external_url: e.registrationUrl,
    },
    mine: false,
  };
}

export function PlayNextUpStrip({ userId }: { userId: string | null | undefined }) {
  const fetchEvents = useServerFn(getPlayEvents);
  const {
    data,
    isPending: queryPending,
    isError,
  } = useQuery({
    queryKey: playKeys.events(userId),
    enabled: !!userId,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchEvents({ data: { limit: PLAY_LIMITS.events } }),
  });

  // A disabled query stays `pending` forever, so only show loading while the
  // account is known and the request is actually in flight.
  const isPending = queryPending && !!userId;

  // Nothing to show is the normal case for a player with an empty calendar —
  // the strip stays quiet rather than taking up space with an empty card.
  if (isError) return null;
  if (isPending) return <Skeleton className="h-20 w-full rounded-2xl" />;

  const next: NextUp | null = data?.mine?.length
    ? fromMine(data.mine[0]!)
    : data?.nearby?.length
      ? fromNearby(data.nearby[0]!)
      : null;
  if (!next) return null;

  return (
    <div
      className="rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4"
      aria-label="Next up"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {next.mine ? "Next up on your schedule" : "Next event near you"}
          </p>
          <p className="mt-0.5 truncate font-display text-base font-semibold">{next.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {dayLabel(next.date)}
              {next.time ? ` · ${next.time} tee` : ""}
            </span>
            {next.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">{next.location}</span>
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link
              to="/game-plan"
              search={next.gamePlanEventId ? { event: next.gamePlanEventId } : {}}
            >
              <Target className="mr-1 h-3.5 w-3.5" />
              Plan for&nbsp;this event
            </Link>
          </Button>
          {next.calendar ? (
            <AddToCalendarButton event={next.calendar} />
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link to="/schedule">
                <CalendarDays className="mr-1 h-3.5 w-3.5" />
                Full schedule
              </Link>
            </Button>
          )}
          {next.registrationUrl ? (
            <Button asChild size="sm" variant="ghost">
              <a href={next.registrationUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-3.5 w-3.5" />
                Register
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
