/**
 * "People you may know" — a shared panel of suggested players with a one-tap
 * Add friend, so any page can help players connect. Renders nothing when there
 * is nobody to suggest.
 */
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getFriendSuggestions } from "@/lib/friend-suggestions.functions";
import { suggestionReason } from "@/lib/friend-suggestions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { initials, useSession } from "@/lib/current-user";
import { AddFriendButton } from "@/components/social/add-friend-button";
import { cn } from "@/lib/utils";

export type SuggestedPerson = {
  user_id: string;
  mutual_count: number;
  reason: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  home_course: string | null;
  pdga_rating: number | null;
};

export function usePeopleYouMayKnow(limit = 6) {
  const { user } = useSession();
  const fetchSuggestions = useServerFn(getFriendSuggestions);
  return useQuery({
    queryKey: ["people-you-may-know", user?.id, limit],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<SuggestedPerson[]> => {
      const list = await fetchSuggestions({ data: { limit } });
      if (!list.length) return [];
      const ids = list.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, home_course, pdga_rating")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      return list
        .map((r) => {
          const p = map.get(r.user_id) as Record<string, unknown> | undefined;
          return {
            user_id: r.user_id,
            mutual_count: r.mutual_count,
            reason: suggestionReason(r),
            username: (p?.["username"] as string | null) ?? null,
            display_name: (p?.["display_name"] as string | null) ?? null,
            avatar_url: (p?.["avatar_url"] as string | null) ?? null,
            home_course: (p?.["home_course"] as string | null) ?? null,
            pdga_rating: (p?.["pdga_rating"] as number | null) ?? null,
          };
        })
        .filter((r) => !!r.display_name);
    },
  });
}

export function PeopleYouMayKnow({
  limit = 6,
  title = "People you may know",
  layout = "grid",
  className,
  hideWhenEmpty = true,
}: {
  limit?: number;
  title?: string;
  layout?: "grid" | "list";
  className?: string;
  hideWhenEmpty?: boolean;
}) {
  const { data, isLoading } = usePeopleYouMayKnow(limit);
  const rows = data ?? [];

  if (isLoading) {
    return (
      <div className={cn("rounded-card border border-border bg-card p-4", className)}>
        <div className="mb-3 h-4 w-40">
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className={cn("rounded-card border border-dashed border-border bg-card p-6", className)}>
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Users className="h-4 w-4 text-primary" /> {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Play a round or add a couple of friends and we'll start suggesting players you share
          courses and crews with.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to="/people">Browse players</Link>
        </Button>
      </div>
    );
  }

  return (
    <section className={cn("rounded-card border border-border bg-card p-4", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Users className="h-4 w-4 text-primary" /> {title}
        </h3>
        <Button asChild size="sm" variant="ghost">
          <Link to="/people">See all players</Link>
        </Button>
      </div>
      <ul
        className={cn(layout === "grid" ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3" : "space-y-2")}
      >
        {rows.map((r) => (
          <li
            key={r.user_id}
            className="flex items-center gap-3 rounded-card border border-border/60 bg-background/40 p-3"
          >
            <Avatar className="h-10 w-10">
              {r.avatar_url ? <AvatarImage src={r.avatar_url} alt={r.display_name ?? ""} /> : null}
              <AvatarFallback>{initials(r.display_name ?? "")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {r.username ? (
                <Link
                  to="/players/$username"
                  params={{ username: r.username }}
                  className="block truncate text-sm font-semibold hover:text-primary"
                >
                  {r.display_name}
                </Link>
              ) : (
                <span className="block truncate text-sm font-semibold">{r.display_name}</span>
              )}
              <p className="truncate text-xs text-muted-foreground">
                {r.reason ?? r.home_course ?? "Plays courses near you"}
                {r.pdga_rating ? ` · Rated ${r.pdga_rating}` : ""}
              </p>
            </div>
            <AddFriendButton userId={r.user_id} name={r.display_name} />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserRound className="h-3.5 w-3.5" /> Suggested from shared friends, crews and courses you
        both play.
      </p>
    </section>
  );
}
