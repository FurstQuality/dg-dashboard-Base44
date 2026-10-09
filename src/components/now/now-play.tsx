import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Shield } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { scheduleQueryOptions } from "@/lib/entities";
import { getDirectorCockpit } from "@/lib/director.functions";
import { directorKeys } from "@/lib/director-queries";
import { useDirectorAccess } from "@/lib/director-access";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { whenLabel } from "@/components/now/now-data";

/**
 * Play, right now: the card you left open, the next thing on your calendar,
 * and — for hosts — the event they are running today.
 */
export function NowPlay() {
  const { user } = useSession();
  const { data: schedule } = useQuery(scheduleQueryOptions(user?.id, { limit: 1 }));
  const { isDirector } = useDirectorAccess();
  const cockpitFn = useServerFn(getDirectorCockpit);
  const { data: cockpit } = useQuery({
    queryKey: directorKeys.cockpit(user?.id),
    queryFn: () => cockpitFn(),
    enabled: !!user && isDirector,
    staleTime: 60_000,
  });

  const next = schedule?.[0] ?? null;
  const runningToday = (cockpit?.events ?? []).find((e) => e.isLiveToday);

  return (
    <NowStrip
      items={[

        next ? (
          <Link key="next" to="/schedule" className={nowTileLinkClass}>
            <NowTile
              icon={CalendarDays}
              eyebrow={whenLabel(next.starts_on)}
              title={next.title}
              detail={
                [next.city, next.state].filter(Boolean).join(", ") ||
                next.location ||
                "On your schedule"
              }
            />
          </Link>
        ) : null,
        runningToday ? (
          <Link key="director" to="/director" className={nowTileLinkClass}>
            <NowTile
              icon={Shield}
              tone="attention"
              eyebrow="You're running this today"
              title={runningToday.name}
              detail="Check-in, scoring and standings"
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
