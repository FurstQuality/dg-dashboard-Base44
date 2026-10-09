import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ListOrdered, TrendingUp } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { getRatingSnapshot } from "@/lib/stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { NowStrip, NowTile, nowTileLinkClass } from "@/components/now/now-strip";
import { plural } from "@/components/now/now-data";

/**
 * Statboard, right now: your rating, where it's heading, and how many rounds
 * are behind it — the three numbers players open this section for.
 */
export function NowStatboard() {
  const { user } = useSession();
  const snap = useServerFn(getRatingSnapshot);
  const { data } = useQuery({
    queryKey: statsKeys.snapshot(user?.id, "all"),
    queryFn: () => snap({ data: { source: null } }),
    enabled: !!user,
    staleTime: STATS_STALE.ratings,
  });

  const rating = data?.current.rating ?? null;
  const used = data?.current.usedRounds ?? 0;
  const delta = data?.projected.delta ?? null;
  const since = data?.roundsSinceLastUpdate ?? 0;

  if (!data) return null;

  return (
    <NowStrip
      items={[
        rating != null ? (
          <Link key="rating" to="/stats" className={nowTileLinkClass}>
            <NowTile
              icon={Activity}
              tone="live"
              eyebrow="Your rating"
              title={`${rating}`}
              detail={`Built from ${plural(used, "rated round")}`}
            />
          </Link>
        ) : null,
        delta != null && delta !== 0 ? (
          <Link key="trend" to="/stats" className={nowTileLinkClass}>
            <NowTile
              icon={TrendingUp}
              eyebrow="Heading"
              title={`${delta > 0 ? "+" : ""}${Math.round(delta)} on your next update`}
              detail="See which rounds are moving it"
            />
          </Link>
        ) : null,
        since > 0 ? (
          <Link key="since" to="/stats" className={nowTileLinkClass}>
            <NowTile
              icon={ListOrdered}
              eyebrow="Since your last update"
              title={plural(since, "new round")}
              detail="Not counted in your official number yet"
            />
          </Link>
        ) : null,
      ]}
    />
  );
}
