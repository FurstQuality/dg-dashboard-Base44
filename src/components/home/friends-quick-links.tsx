import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users, ChevronRight } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getFriendsHub } from "@/lib/friends.functions";
import { initials } from "@/lib/current-user";

/**
 * Quick jump list to the people you actually play with: accepted friends,
 * newest first, straight to their profile. Lives on the feed rails.
 */
export function FriendsQuickLinks({
  userId,
  limit = 6,
}: {
  userId: string | null | undefined;
  limit?: number;
}) {
  const fetchHub = useServerFn(getFriendsHub);
  const { data, isLoading } = useQuery({
    queryKey: ["friends-quick-links", userId],
    queryFn: () => fetchHub(),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const friends = (() => {
    if (!data || !userId) return [];
    const others = data.rows
      .filter((r) => r.status === "accepted")
      .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const seen = new Set<string>();
    const out: NonNullable<(typeof data.profiles)[string]>[] = [];
    for (const id of others) {
      if (seen.has(id)) continue;
      seen.add(id);
      const p = data.profiles[id];
      if (p) out.push(p);
      if (out.length >= limit) break;
    }
    return out;
  })();

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Users className="h-4 w-4 text-muted-foreground" />
          Your friends
        </h3>
        <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <Link to="/friends">
            All
            <ChevronRight className="ml-0.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      ) : friends.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No friends yet. Add a few players and their rounds show up right here.
          </p>
          <Button asChild size="sm" variant="secondary" className="w-full">
            <Link to="/friends">Find players</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-1">
          {friends.map((f) => (
            <li key={f.id}>
              <Link
                to="/players/$username"
                params={{ username: f.username }}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
              >
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={f.avatar_url ?? undefined} alt="" />
                  <AvatarFallback className="text-xs">
                    {initials(f.display_name || f.username)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {f.display_name || f.username}
                  </span>
                  {f.pdga_rating ? (
                    <span className="block text-xs text-muted-foreground">
                      Rating {f.pdga_rating}
                    </span>
                  ) : f.home_course ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {f.home_course}
                    </span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
