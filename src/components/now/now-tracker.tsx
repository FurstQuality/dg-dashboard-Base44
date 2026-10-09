import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Radio } from "lucide-react";
import { listTrackedEvents } from "@/lib/tracker-watchlist.functions";
import { trackerKeys, TRACKER_STALE } from "@/lib/tracker-queries";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { whenLabel } from "@/components/now/now-data";

/**
 * Trackers, right now: any event you follow that is scoring, promoted above the
 * tracking lists so a live weekend never takes a second tap.
 */
export function NowTracker() {
  const list = useServerFn(listTrackedEvents);
  const { data } = useQuery({
    queryKey: trackerKeys.watchlist(),
    queryFn: () => list(),
    staleTime: TRACKER_STALE.watchlist,
  });

  const live = (data?.events ?? []).filter((e) => e.phase === "live").slice(0, 3);

  const items = live.map((e) => (
    <Link
      key={e.id}
      to="/tracker/$groupId/event/$eventId"
      params={{ groupId: e.groupId, eventId: e.id }}
      className={nowTileLinkClass}
    >
      <NowTile
        icon={Radio}
        tone="live"
        eyebrow="Scoring now"
        badge={e.liveCurrentRound ? `Round ${e.liveCurrentRound}` : null}
        title={e.name}
        detail={e.location ?? whenLabel(e.startDate)}
      />
    </Link>
  ));

  return (
    <NowStrip
      items={
        items.length > 0
          ? items
          : [
              <Link key="follow" to="/tracker/events" className={nowTileLinkClass}>
                <NowTile
                  icon={Radio}
                  tone="live"
                  eyebrow="Nothing scoring right now"
                  title="Follow an event"
                  detail="Save an event and its live scores land here"
                />
              </Link>,
            ]
      }
    />
  );
}
