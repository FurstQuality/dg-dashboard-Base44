import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCheck, Radio, Wallet } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { getDirectorCockpit } from "@/lib/director.functions";
import { directorKeys } from "@/lib/director-queries";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { plural, whenLabel } from "@/components/now/now-data";

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/**
 * Event Director, right now: what needs the host today — the event running,
 * sign-ups waiting on approval, and entry fees still owed.
 */
export function NowDirector() {
  const { user } = useSession();
  const cockpitFn = useServerFn(getDirectorCockpit);
  const { data } = useQuery({
    queryKey: directorKeys.cockpit(user?.id),
    queryFn: () => cockpitFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const events = data?.events ?? [];
  const liveToday = events.find((e) => e.isLiveToday) ?? null;
  const pending = events.reduce((n, e) => n + (e.registrations?.pending ?? 0), 0);
  const outstanding = events.reduce((n, e) => n + (e.feesOutstandingCents ?? 0), 0);
  const upNext = events
    .filter((e) => !e.isLiveToday && e.daysOut >= 0)
    .sort((a, b) => a.daysOut - b.daysOut)[0];

  return (
    <NowStrip
      items={[
        liveToday ? (
          <Link key="live" to="/director/check-in" className={nowTileLinkClass}>
            <NowTile
              icon={Radio}
              tone="live"
              eyebrow="Running today"
              title={liveToday.name}
              detail={`${liveToday.registrations.checkedIn} of ${liveToday.registrations.total} checked in`}
            />
          </Link>
        ) : upNext ? (
          <Link key="upnext" to="/director" className={nowTileLinkClass}>
            <NowTile
              icon={ClipboardCheck}
              eyebrow={`Up next · ${whenLabel(upNext.startDate)}`}
              title={upNext.name}
              detail={`${plural(upNext.registrations.total, "player")} signed up`}
            />
          </Link>
        ) : null,
        pending > 0 ? (
          <Link key="pending" to="/director/registrations" className={nowTileLinkClass}>
            <NowTile
              icon={ClipboardCheck}
              tone="attention"
              eyebrow="Waiting on you"
              title={`${plural(pending, "sign-up")} to approve`}
              detail="Open registrations"
            />
          </Link>
        ) : null,
        outstanding > 0 ? (
          <Link key="fees" to="/director/registrations" className={nowTileLinkClass}>
            <NowTile
              icon={Wallet}
              eyebrow="Entry fees owed"
              title={`${money(outstanding)} outstanding`}
              detail="Mark payments as you collect them"
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
