import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Crown, Swords, Users, Megaphone } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ARENA_GAMES, arenaLeaderboardQueryOptions, duelsQueryOptions } from "@/lib/arena";

/**
 * Arena widget for the Play overview — nudges the player to challenge friends
 * to a game, finish the duels they already have running, and post the result
 * to the feed afterwards.
 */
export function PlayArenaCard({ userId }: { userId: string | null | undefined }) {
  const duels = useQuery(duelsQueryOptions(userId));
  const board = useQuery(arenaLeaderboardQueryOptions(userId));

  const mine = (duels.data ?? []).filter((d) => d.participants.some((p) => p.user_id === userId));
  const invites = mine.filter(
    (d) =>
      d.duel.status === "pending" &&
      d.participants.some(
        (p) => p.user_id === userId && p.invite_status !== "accepted" && p.role !== "creator",
      ),
  ).length;
  const active = mine.filter((d) => d.duel.status === "active").length;
  const toReview = mine.filter((d) => d.duel.status === "awaiting_review").length;
  const wins = mine.filter((d) => d.duel.winner_id === userId).length;
  const justFinished = mine.filter((d) => d.duel.status === "completed").length;

  const me = (board.data ?? []).find((l) => l.is_self);
  const leader = (board.data ?? [])[0];
  const friendCount = Math.max(0, (board.data?.length ?? 0) - 1);

  // Rotate the suggestions daily so the nudge stays fresh without new data.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const picks = [0, 1, 2].map((i) => ARENA_GAMES[(dayIndex + i) % ARENA_GAMES.length]!);

  const loading = duels.isLoading || board.isLoading;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
            <Swords className="h-4 w-4" />
          </span>
          Arena
        </h2>
        <Link
          to="/arena"
          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Open Arena <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="space-y-3 p-3">
        {loading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Link
                to="/arena"
                className="rounded-lg border border-border/60 p-2.5 transition hover:border-primary/50"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Crown className="h-3.5 w-3.5 text-competitive-gold" /> King of the Hill
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  {me ? `#${me.rank}` : "—"}
                </div>
                <p className="text-xs text-muted-foreground">
                  {me && leader && !leader.is_self
                    ? `${leader.display_name} holds the crown`
                    : me?.rank === 1
                      ? "You hold the crown — defend it"
                      : "Play a duel to join the board"}
                </p>
              </Link>

              <Link
                to="/arena"
                className="rounded-lg border border-border/60 p-2.5 transition hover:border-primary/50"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Swords className="h-3.5 w-3.5 text-primary" /> Live duels
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{active}</div>
                <p className="text-xs text-muted-foreground">
                  {invites > 0
                    ? `${invites} challenge${invites === 1 ? "" : "s"} waiting on you`
                    : toReview > 0
                      ? `${toReview} score${toReview === 1 ? "" : "s"} to verify`
                      : `${wins} duel win${wins === 1 ? "" : "s"} so far`}
                </p>
              </Link>

              <Link
                to="/friends"
                className="rounded-lg border border-border/60 p-2.5 transition hover:border-primary/50"
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5 text-community-green" /> Friends to play
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{friendCount}</div>
                <p className="text-xs text-muted-foreground">
                  {friendCount > 0
                    ? "Pick someone and throw down"
                    : "Add friends to start challenging"}
                </p>
              </Link>
            </div>

          </>
        )}
      </div>
    </section>
  );
}
