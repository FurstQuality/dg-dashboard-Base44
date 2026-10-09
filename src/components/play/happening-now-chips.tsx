import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, CalendarClock, Hand } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { getPlayLobby } from "@/lib/play-status.functions";
import { getRoundHistory } from "@/lib/round-history.functions";
import { STATS_STALE } from "@/lib/stats-queries";

/**
 * Happening Now — action chips that summarise live play around the player and
 * jump to the matching section. Chips with nothing to show stay hidden.
 */
export function HappeningNowChips() {
  const { user } = useSession();
  const lobbyFn = useServerFn(getPlayLobby);
  const historyFn = useServerFn(getRoundHistory);
  // Same cache keys as the crew panel, so no extra requests.
  const { data: lobby } = useQuery({
    queryKey: ["play-lobby", user?.id ?? "anon"],
    queryFn: () => lobbyFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const { data: history } = useQuery({
    queryKey: ["play-overview", "crew", user?.id ?? null],
    queryFn: () =>
      historyFn({ data: { nativeLimit: 1, externalLimit: 1, includeFriends: true, includePlanned: false } }),
    enabled: !!user,
    staleTime: STATS_STALE.rounds,
  });

  const chips = [
    { n: lobby?.friendsLooking?.length ?? 0, label: "looking to play", icon: Hand, href: "#play-together" },
    { n: lobby?.openRounds?.length ?? 0, label: "open rounds", icon: CalendarClock, href: "#play-together" },
    { n: history?.friendsActive?.length ?? 0, label: "friends playing", icon: Activity, href: "#play-together" },
  ].filter((c) => c.n > 0);

  if (chips.length === 0) return null;
  return (
    <nav aria-label="Happening now" className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Happening now</span>
      {chips.map((c) => (
        <a
          key={c.label}
          href={c.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-foreground hover:border-primary"
        >
          <c.icon className="h-3.5 w-3.5 text-primary" />
          <span className="font-bold tabular-nums">{c.n}</span> {c.label}
        </a>
      ))}
    </nav>
  );
}
