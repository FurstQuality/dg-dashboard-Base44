import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Radio, Shield } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { scheduleQueryOptions } from "@/lib/entities";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { getDirectorCockpit } from "@/lib/director.functions";
import { directorKeys } from "@/lib/director-queries";
import { useDirectorAccess } from "@/lib/director-access";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { isToday, plural, whenLabel } from "@/components/now/now-data";

/**
 * Events, right now: your next commitment, anything scoring today, and the
 * event you're hosting if you hold that role.
 */
export function NowEvents() {
  const { user } = useSession();
  const { data: schedule } = useQuery(scheduleQueryOptions(user?.id, { limit: 1 }));
  const list = useServerFn(listTrackedEvents);
  const { data: tracked } = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => list(),
    staleTime: TRACKER_STALE.watchlist,
  });
  const { isDirector } = useDirectorAccess();
  const cockpitFn = useServerFn(getDirectorCockpit);
  const { data: cockpit } = useQuery({
    queryKey: directorKeys.cockpit(user?.id),
    queryFn: () => cockpitFn(),
    enabled: !!user && isDirector,
    staleTime: 60_000,
  });

  const next = schedule?.[0] ?? null;
  const live = (tracked?.events ?? []).filter((e) => e.phase === "live");
  const hostingToday =
    (cockpit?.events ?? []).find((e) => e.isLiveToday) ?? cockpit?.hostingLeagueToday ?? null;

  return (
    <NowStrip
      items={[
        next ? (
          <Link key="next" to="/schedule" className={nowTileLinkClass}>
            <NowTile
              icon={CalendarDays}
              tone={isToday(next.starts_on) ? "live" : "default"}
              eyebrow={`You're playing · ${whenLabel(next.starts_on)}`}
              title={next.title}
              detail={
                [next.city, next.state].filter(Boolean).join(", ") ||
                next.location ||
                "On your schedule"
              }
            />
          </Link>
        ) : null,
        live.length > 0 ? (
          <Link key="live" to="/tracker/events" className={nowTileLinkClass}>
            <NowTile
              icon={Radio}
              tone="live"
              eyebrow="Scoring now"
              title={live.length === 1 ? live[0].name : `${plural(live.length, "event")} underway`}
              detail="Open the event tracker"
            />
          </Link>
        ) : null,
        hostingToday ? (
          <Link key="hosting" to="/director" className={nowTileLinkClass}>
            <NowTile
              icon={Shield}
              tone="attention"
              eyebrow="You're hosting today"
              title={hostingToday.name}
              detail="Check-in, pools and scoring"
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
