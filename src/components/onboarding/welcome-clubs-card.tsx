/**
 * Welcome station: the clubs closest to the new player, with a working
 * Join button so the very first thing they do in the app is real.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, MapPin, Navigation, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadPlayCoords, savePlayCoords } from "@/lib/play-location";
import { getClubDirectory, joinClub as joinClubFn, type ClubSummary } from "@/lib/clubs.functions";

export function WelcomeClubsCard({ userId }: { userId: string | null | undefined }) {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setCoords(loadPlayCoords());
  }, []);

  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("This browser can't share your location — search clubs by city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(next);
        savePlayCoords(next);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error("We couldn't get your location. Open Clubs to search by city or state.");
      },
      { timeout: 8000 },
    );
  }, []);

  const fetchDirectory = useServerFn(getClubDirectory);
  const filters = {
    scope: "discover" as const,
    q: "",
    page: 0,
    city: "",
    state: "",
    radiusMiles: coords ? 100 : null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    sort: "suggested" as const,
  };

  const clubsQuery = useQuery({
    queryKey: ["welcome-clubs", userId, coords?.lat ?? null, coords?.lng ?? null],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: () => fetchDirectory({ data: filters }),
  });

  const clubs: ClubSummary[] = (clubsQuery.data?.clubs ?? []).slice(0, 4);
  const join = useServerFn(joinClubFn);

  async function handleJoin(club: ClubSummary) {
    setJoining(club.id);
    try {
      const res = await join({ data: { clubId: club.id } });
      toast.success(
        res.kind === "already_member"
          ? `You're already in ${club.name}`
          : `You're in — welcome to ${club.name}`,
      );
      void queryClient.invalidateQueries({ queryKey: ["welcome-clubs"] });
      void queryClient.invalidateQueries({ queryKey: ["welcome-progress"] });
      void queryClient.invalidateQueries({ queryKey: ["club-directory"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't join that club");
    } finally {
      setJoining(null);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <Users className="h-4 w-4 text-emerald-400" />
          Join your local club
        </h3>
        <Link to="/clubs" className="text-sm font-medium text-primary hover:underline">
          All clubs →
        </Link>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Clubs run the league nights and meetups near you. Join one now and their events show up on
        your schedule.
      </p>

      {!coords ? (
        <Button size="sm" variant="outline" onClick={locate} disabled={locating}>
          {locating ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="mr-1.5 h-4 w-4" />
          )}
          Use my location
        </Button>
      ) : null}

      {clubsQuery.isPending && userId ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : clubsQuery.isError ? (
        <div className="text-sm text-muted-foreground">
          Clubs didn&apos;t load just now.{" "}
          <button
            type="button"
            onClick={() => void clubsQuery.refetch()}
            className="font-medium text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : clubs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No clubs listed around you yet — you can{" "}
          <Link to="/clubs" className="font-medium text-primary hover:underline">
            start one
          </Link>{" "}
          and invite your regular group.
        </p>
      ) : (
        <ul className="space-y-2">
          {clubs.map((club) => (
            <li
              key={club.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/clubs/$slug"
                  params={{ slug: club.slug }}
                  className="truncate font-medium hover:underline"
                >
                  {club.name}
                </Link>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {club.location || club.city || club.state ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {club.location || [club.city, club.state].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                  {club.distance_miles != null ? (
                    <span>{Math.round(club.distance_miles)} mi away</span>
                  ) : null}
                  <span>
                    {club.member_count} {club.member_count === 1 ? "member" : "members"}
                  </span>
                </p>
              </div>
              {club.my_role ? (
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  <Check className="h-4 w-4" />
                  Joined
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleJoin(club)}
                  disabled={joining === club.id}
                >
                  {joining === club.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Join club"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
