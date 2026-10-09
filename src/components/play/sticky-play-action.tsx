import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Play, Plus } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { getRoundHistory } from "@/lib/round-history.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";

/** Phone-only button above the bottom bar: Resume your live round, or start one. */
export function StickyPlayAction() {
  const { user } = useSession();
  const historyFn = useServerFn(getRoundHistory);
  const { data } = useQuery({
    queryKey: statsKeys.roundHistory(user?.id),
    queryFn: () => historyFn({ data: {} }),
    enabled: !!user,
    staleTime: STATS_STALE.rounds,
  });
  const active = (data?.native ?? []).find((r) => r.status === "in_progress");
  const cls =
    "fixed right-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg md:hidden";
  const style = { bottom: "calc(env(safe-area-inset-bottom, 0px) + 76px)" };
  return active ? (
    <Link to="/play/$roundId" params={{ roundId: active.id }} className={cls} style={style}>
      <Play className="h-4 w-4" /> Resume round
    </Link>
  ) : (
    <Link to="/play/pick-course" className={cls} style={style}>
      <Plus className="h-4 w-4" /> Play
    </Link>
  );
}
