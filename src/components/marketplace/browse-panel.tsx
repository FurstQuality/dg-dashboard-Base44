import { Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Filter, MapPin, PackageSearch, Store, Tag } from "lucide-react";
import {
  ContentCard,
  ErrorState,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { ListingCard } from "./listing-card";
const MarketplaceMap = lazy(() =>
  import("@/components/marketplace/marketplace-map").then((m) => ({ default: m.MarketplaceMap })),
);
import { Button } from "@/components/ui/button";
import { UseCurrentLocationButton } from "@/components/use-current-location-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import {
  createSavedSearch,
  formatPrice,

  listingsQueryOptions,
  toggleWatch,
  watchlistQueryOptions,
  type ListingFilters,
  type ListingSort,
} from "@/lib/marketplace";
import { FEATURED_BRANDS } from "@/lib/disc-catalog";

const DISC_TYPES = ["distance_driver", "fairway_driver", "midrange", "putter", "approach"];
const TYPE_LABEL: Record<string, string> = {
  distance_driver: "Distance driver",
  fairway_driver: "Fairway driver",
  midrange: "Midrange",
  putter: "Putter",
  approach: "Approach",
};
const CONDITIONS = [
  { value: "new", label: "New" },
  { value: "worn", label: "Worn in" },
  { value: "beat_in", label: "Beat in" },
];

export function MarketplaceBrowsePanel() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [brand, setBrand] = useState("all");
  const [discType, setDiscType] = useState("all");
  const [condition, setCondition] = useState("all");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [tradeOnly, setTradeOnly] = useState(false);
  const [sort, setSort] = useState<ListingSort>("newest");
  const [radius, setRadius] = useState("any");
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [page, setPage] = useState(0);

  const filters: ListingFilters = useMemo(
    () => ({
      search: search.trim() || undefined,
      brand: brand === "all" ? undefined : brand,
      discType: discType === "all" ? undefined : discType,
      condition: condition === "all" ? undefined : condition,
      state: state.trim() || undefined,
      city: city.trim() || undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      tradeOnly: tradeOnly || undefined,
      radiusMiles: radius === "any" || !origin ? undefined : Number(radius),
      origin,
      sort,
      page,
      pageSize: 24,
    }),
    [search, brand, discType, condition, state, city, maxPrice, tradeOnly, radius, origin, sort, page],
  );

  const [showMap, setShowMap] = useState(false);
  const listings = useQuery(listingsQueryOptions(filters));
  const watchlist = useQuery(watchlistQueryOptions(userId));
  const watched = new Set(watchlist.data ?? []);

  async function onToggleWatch(listingId: string) {
    if (!userId) return;
    try {
      await toggleWatch(userId, listingId, watched.has(listingId));
      await queryClient.invalidateQueries({ queryKey: ["marketplace-watchlist", userId] });
    } catch {
      toast.error("Couldn't update your watchlist. Try again in a moment.");
    }
  }

  async function saveThisSearch() {
    if (!userId) return;
    const label =
      [search.trim(), brand === "all" ? null : brand, discType === "all" ? null : TYPE_LABEL[discType]]
        .filter(Boolean)
        .join(" · ") || "All local listings";
    try {
      await createSavedSearch(userId, label, filters);
      await queryClient.invalidateQueries({ queryKey: ["marketplace-saved-searches", userId] });
      toast.success("Saved. We'll alert you when new listings match.");
    } catch {
      toast.error("Couldn't save that search. Try again in a moment.");
    }
  }

  const rows = listings.data?.rows ?? [];
  const total = listings.data?.total ?? 0;
  const navigate = useNavigate();
  const mapPins = rows
    .filter((row) => row.latitude != null && row.longitude != null)
    .map((row) => ({
      id: row.id,
      lat: row.latitude as number,
      lng: row.longitude as number,
      title: [row.brand, row.mold_name].filter(Boolean).join(" ") || "Disc for sale",
      detail: formatPrice(row.price_cents, row.trade_only),
      tone: "sale" as const,
    }));

  return (
    <div className="space-y-4">

      <ContentCard
        title="Find a disc"
        subtitle="Narrow by brand, type, condition, price, and how far you're willing to drive."
        action={
          <Button variant="ghost" size="sm" onClick={saveThisSearch} disabled={!userId}>
            Save this search
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="mk-search">Search</Label>
            <Input
              id="mk-search"
              value={search}
              placeholder="Mold, brand, or notes"
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select
              value={brand}
              onValueChange={(v) => {
                setPage(0);
                setBrand(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All brands</SelectItem>
                {FEATURED_BRANDS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Disc type</Label>
            <Select
              value={discType}
              onValueChange={(v) => {
                setPage(0);
                setDiscType(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every type</SelectItem>
                {DISC_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Condition</Label>
            <Select
              value={condition}
              onValueChange={(v) => {
                setPage(0);
                setCondition(v);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any condition</SelectItem>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-city">City</Label>
            <Input
              id="mk-city"
              value={city}
              placeholder="Indianapolis"
              onChange={(e) => {
                setPage(0);
                setCity(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-state">State</Label>
            <Input
              id="mk-state"
              value={state}
              placeholder="IN or Indiana"
              onChange={(e) => {
                setPage(0);
                setState(e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mk-price">Max price ($)</Label>
            <Input
              id="mk-price"
              inputMode="numeric"
              value={maxPrice}
              placeholder="25"
              onChange={(e) => {
                setPage(0);
                setMaxPrice(e.target.value.replace(/[^0-9]/g, ""));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sort</Label>
            <Select value={sort} onValueChange={(v) => setSort(v as ListingSort)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="cheapest">Cheapest first</SelectItem>
                <SelectItem value="nearest" disabled={!origin}>
                  Closest to me
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1">
          <div className="flex items-center gap-2">
            <Switch
              id="mk-trade"
              checked={tradeOnly}
              onCheckedChange={(v) => {
                setPage(0);
                setTradeOnly(v);
              }}
            />
            <Label htmlFor="mk-trade">Trade only</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Within</Label>
            <Select value={radius} onValueChange={setRadius}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any distance</SelectItem>
                <SelectItem value="15">15 miles</SelectItem>
                <SelectItem value="30">30 miles</SelectItem>
                <SelectItem value="60">60 miles</SelectItem>
                <SelectItem value="120">120 miles</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <UseCurrentLocationButton
            onLocated={(coords) => {
              setOrigin(coords);
              setSort("nearest");
            }}
          />
          <span className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {total} listing{total === 1 ? "" : "s"}
          </span>
        </div>
      </ContentCard>

      {listings.isLoading ? (
        <LoadingSkeleton />
      ) : listings.error ? (
        <ErrorState
          title="Couldn't load the marketplace"
          description="The listings didn't come through. Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <MascotEmptyState
          intent="scout"
          title="No discs match that yet"
          description="Widen the radius, clear a filter, or be the first to list something in your area."
          actions={
            <Button asChild>
              <Link to="/marketplace" search={{ view: "sell" }}>List a disc</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {total} disc{total === 1 ? "" : "s"} listed
            </p>
            <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>
              <MapPin className="mr-1.5 h-4 w-4" />
              {showMap ? "Hide map" : "Show map"}
            </Button>
          </div>
          {showMap ? (
            mapPins.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                None of these listings have a pinned location yet — sellers who add a course or map
                point will show up here.
              </p>
            ) : (
              <Suspense fallback={<div className="h-[380px] rounded-2xl border bg-muted/30" />}>
                <MarketplaceMap
                  pins={mapPins}
                  onSelect={(id) =>
                    void navigate({ to: "/marketplace/$listingId", params: { listingId: id } })
                  }
                />
              </Suspense>
            )
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                origin={origin}
                watched={watched.has(listing.id)}
                onToggleWatch={userId ? () => void onToggleWatch(listing.id) : undefined}
              />
            ))}
          </div>
          {total > 24 ? (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {Math.max(1, Math.ceil(total / 24))}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * 24 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
