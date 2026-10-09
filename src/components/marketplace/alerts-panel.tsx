import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BellRing, Heart, Trash2 } from "lucide-react";
import {
  ContentCard,
  ErrorState,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { ListingCard } from "./listing-card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useSession } from "@/lib/current-user";
import {
  deleteSavedSearch,
  fetchListing,
  savedSearchesQueryOptions,
  setSavedSearchNotify,
  toggleWatch,
  watchlistQueryOptions,
} from "@/lib/marketplace";
import { useQueries } from "@tanstack/react-query";

export function AlertsPanel() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const searches = useQuery(savedSearchesQueryOptions(userId));
  const watchlist = useQuery(watchlistQueryOptions(userId));
  const watchedIds = watchlist.data ?? [];

  const watchedListings = useQueries({
    queries: watchedIds.map((id) => ({
      queryKey: ["marketplace-listing", id] as const,
      queryFn: () => fetchListing(id),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="space-y-4">

      <ContentCard
        title="Saved searches"
        subtitle="Built from the filters you had set when you saved them."
      >
        {searches.isLoading ? (
          <LoadingSkeleton />
        ) : searches.error ? (
          <ErrorState
            title="Couldn't load your saved searches"
            description="They're still saved — the list just didn't load. Try again in a moment."
          />
        ) : (searches.data ?? []).length === 0 ? (
          <MascotEmptyState
            intent="scout"
            title="No saved searches yet"
            description="Set your filters on Browse, then hit Save this search to get alerts."
            actions={
              <Button asChild>
                <Link to="/marketplace" search={{ view: "browse" }}>Go to Browse</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {(searches.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                <span className="font-medium">{s.label}</span>
                <div className="ml-auto flex items-center gap-2">
                  <Switch
                    id={`notify-${s.id}`}
                    checked={s.notify}
                    onCheckedChange={async (v) => {
                      try {
                        await setSavedSearchNotify(s.id, v);
                        await queryClient.invalidateQueries({
                          queryKey: ["marketplace-saved-searches", userId],
                        });
                      } catch {
                        toast.error("Couldn't change that alert. Try again in a moment.");
                      }
                    }}
                  />
                  <Label htmlFor={`notify-${s.id}`}>Alerts</Label>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete saved search"
                    onClick={async () => {
                      try {
                        await deleteSavedSearch(s.id);
                        await queryClient.invalidateQueries({
                          queryKey: ["marketplace-saved-searches", userId],
                        });
                      } catch {
                        toast.error("Couldn't delete that search. Try again in a moment.");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ContentCard>

      <ContentCard
        title="Watching"
        subtitle="Discs you flagged — we ping you on price drops and status changes."
      >
        {!watchedIds.length ? (
          <MascotEmptyState
            intent="social"
            title="Nothing on your watchlist"
            description="Tap the heart on any listing to keep an eye on it."
            actions={
              <Button asChild>
                <Link to="/marketplace" search={{ view: "browse" }}>Find a disc</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {watchedListings.map((q, index) => {
              const listing = q.data;
              if (!listing) return null;
              return (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  watched
                  onToggleWatch={
                    userId
                      ? async () => {
                          try {
                            await toggleWatch(userId, listing.id, true);
                            await queryClient.invalidateQueries({
                              queryKey: ["marketplace-watchlist", userId],
                            });
                          } catch {
                            toast.error("Couldn't update your watchlist. Try again in a moment.");
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
            {watchedListings.every((q) => !q.data) ? (
              <p className="text-sm text-muted-foreground">
                <Heart className="mr-1 inline h-3.5 w-3.5" /> Those listings are no longer
                available.
              </p>
            ) : null}
          </div>
        )}
      </ContentCard>
    </div>
  );
}
