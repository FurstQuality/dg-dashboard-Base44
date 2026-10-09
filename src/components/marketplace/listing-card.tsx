import { Link } from "@tanstack/react-router";
import { Heart, MapPin, Repeat2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  formatPrice,
  listingLocation,
  milesBetween,
  type MarketplaceListing,
} from "@/lib/marketplace";
import { cn } from "@/lib/utils";

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  worn: "Worn in",
  beat_in: "Beat in",
  retired: "Retired",
};

export function ListingCard({
  listing,
  watched,
  onToggleWatch,
  origin,
}: {
  listing: MarketplaceListing;
  watched?: boolean;
  onToggleWatch?: () => void;
  origin?: { lat: number; lng: number } | null;
}) {
  const photo = listing.photos[0]?.url ?? null;
  const place = listingLocation(listing);
  const distance =
    origin && listing.latitude != null && listing.longitude != null
      ? milesBetween(origin, { lat: listing.latitude, lng: listing.longitude })
      : null;
  const flight =
    listing.speed != null
      ? `${listing.speed} / ${listing.glide ?? "–"} / ${listing.turn ?? "–"} / ${listing.fade ?? "–"}`
      : null;

  return (
    <Card className="relative flex flex-col overflow-hidden rounded-card border accent-panel">
      <Link
        to="/marketplace/$listingId"
        params={{ listingId: listing.id }}
        className="block aspect-[4/3] w-full overflow-hidden bg-muted/40"
      >
        {photo ? (
          <img
            src={photo}
            alt={`${listing.brand ?? ""} ${listing.mold_name}`.trim()}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            No photo yet
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/marketplace/$listingId"
              params={{ listingId: listing.id }}
              className="block truncate font-semibold hover:underline"
            >
              {listing.mold_name}
            </Link>
            <p className="truncate text-sm text-muted-foreground">
              {[listing.brand, listing.plastic_name, listing.weight_grams ? `${listing.weight_grams}g` : null]
                .filter(Boolean)
                .join(" · ") || "Disc details coming"}
            </p>
          </div>
          {onToggleWatch ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={watched ? "Stop watching this disc" : "Watch this disc"}
              onClick={onToggleWatch}
            >
              <Heart className={cn("h-4 w-4", watched && "fill-current text-rose-500")} />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="font-semibold">
            {formatPrice(listing.price_cents, listing.trade_only)}
          </Badge>
          {listing.trade_only ? (
            <Badge variant="outline" className="gap-1">
              <Repeat2 className="h-3 w-3" /> Trade
            </Badge>
          ) : null}
          {listing.condition ? (
            <Badge variant="outline">{CONDITION_LABEL[listing.condition] ?? listing.condition}</Badge>
          ) : null}
          {listing.status === "reserved" ? <Badge variant="outline">Reserved</Badge> : null}
        </div>

        {flight ? <p className="text-sm text-muted-foreground">Flight {flight}</p> : null}

        <div className="mt-auto flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5" />
          <span className="truncate">
            {place ?? "Location not shared"}
            {distance != null ? ` · ${Math.round(distance)} mi away` : ""}
          </span>
        </div>
      </div>
    </Card>
  );
}
