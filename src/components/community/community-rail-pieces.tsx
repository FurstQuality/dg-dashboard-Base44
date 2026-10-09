import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, HeartHandshake, MapPin, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CommunityClub, CommunityOutreachEvent, CommunityPerson } from "@/lib/community.functions";
import { respondToFriendRequest, sendFriendRequest } from "@/lib/friends.functions";
import { communityKeys } from "@/lib/community-queries";

/* Compact Community pieces shown around the Feed. */

export function ClubsSnapshot({ loading, clubs }: { loading: boolean; clubs: CommunityClub[] }) {
  if (loading) return <Skeleton className="h-20 w-full rounded-lg" />;
  if (clubs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        You haven't joined any clubs.
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/clubs">Discover clubs</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <ul className="grid gap-1">
      {clubs.map((c) => (
        <li key={c.id}>
          <Link
            to="/clubs/$slug"
            params={{ slug: c.slug }}
            className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 hover:border-border hover:bg-muted/50"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-500/10 text-emerald-500"
              style={
                c.avatar_url
                  ? { backgroundImage: `url(${c.avatar_url})`, backgroundSize: "cover" }
                  : undefined
              }
            >
              {!c.avatar_url ? <HeartHandshake className="h-4 w-4" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.location || "Club"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EventsSnapshot({
  loading,
  events,
}: {
  loading: boolean;
  events: CommunityOutreachEvent[];
}) {
  if (loading) return <Skeleton className="h-20 w-full rounded-lg" />;
  if (events.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No upcoming community events nearby.
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/community/events">Browse all</Link>
          </Button>
        </div>
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {events.map((e) => (
        <li key={e.id}>
          <Link
            to="/community/$eventId"
            params={{ eventId: e.id }}
            className="block rounded-lg px-2 py-1.5 hover:bg-muted/50"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {new Date(e.starts_at).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              ·{" "}
              {new Date(e.starts_at).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
            <div className="mt-0.5 truncate text-sm font-medium">{e.title}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {e.location ? (
                <span className="flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" /> {e.location}
                </span>
              ) : null}
              <span>{e.goingCount} going</span>
              {e.myRsvp === "going" ? <span className="text-emerald-500">You're in</span> : null}
              {e.full ? <span className="text-amber-500">Full</span> : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function personName(p: CommunityPerson): string {
  return p.display_name || p.username || "Player";
}

function PersonAvatar({ person }: { person: CommunityPerson }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-cyan-500/10 text-xs font-semibold text-cyan-600 dark:text-cyan-300"
      style={
        person.avatar_url
          ? { backgroundImage: `url(${person.avatar_url})`, backgroundSize: "cover" }
          : undefined
      }
    >
      {!person.avatar_url ? personName(person).slice(0, 1).toUpperCase() : null}
    </span>
  );
}

/** Incoming friend requests plus shared-friend suggestions, actionable in place. */
export function PeopleSnapshot({
  loading,
  requests,
  suggestions,
}: {
  loading: boolean;
  requests: CommunityPerson[];
  suggestions: CommunityPerson[];
}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const respond = useServerFn(respondToFriendRequest);
  const addFriend = useServerFn(sendFriendRequest);
  const refresh = () => qc.invalidateQueries({ queryKey: communityKeys.overview(user?.id) });

  const respondMut = useMutation({
    mutationFn: (vars: { id: string; accept: boolean }) => respond({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(vars.accept ? "Friend added." : "Request declined.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "That didn't go through. Try again."),
  });
  const addMut = useMutation({
    mutationFn: (targetId: string) => addFriend({ data: { targetId } }),
    onSuccess: () => {
      toast.success("Request sent.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "That didn't go through. Try again."),
  });

  if (loading) return <Skeleton className="h-24 w-full rounded-lg" />;

  if (requests.length === 0 && suggestions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No suggestions yet.
        <div className="mt-3">
          <Button asChild size="sm" variant="outline">
            <Link to="/friends">
              <Search className="mr-1.5 h-3.5 w-3.5" /> Find players
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {requests.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Waiting on you
          </div>
          <ul className="space-y-2">
            {requests.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <PersonAvatar person={p} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{personName(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.pdga_rating ? `Rated ${p.pdga_rating}` : "Wants to connect"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    disabled={respondMut.isPending}
                    onClick={() =>
                      p.friendshipId && respondMut.mutate({ id: p.friendshipId, accept: true })
                    }
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={respondMut.isPending}
                    onClick={() =>
                      p.friendshipId && respondMut.mutate({ id: p.friendshipId, accept: false })
                    }
                  >
                    Decline
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Players you may know
          </div>
          <ul className="space-y-2">
            {suggestions.slice(0, 4).map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <PersonAvatar person={p} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{personName(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.mutualCount
                      ? `${p.mutualCount} mutual friend${p.mutualCount === 1 ? "" : "s"}`
                      : "In your area"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={addMut.isPending}
                  onClick={() => addMut.mutate(p.id)}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
