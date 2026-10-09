import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch, Store } from "lucide-react";
import { ContentCard, MascotEmptyState } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, listingLocation, listingsQueryOptions } from "@/lib/marketplace";
import { reportsQueryOptions } from "@/lib/lostfound";

/**
 * Community overview widget — a quick read on what's for sale locally and how
 * many discs are currently waiting to find their owner.
 */
export function MarketplaceWidget() {
  const listings = useQuery(listingsQueryOptions({ sort: "newest", page: 0, pageSize: 4 }));
  const lost = useQuery(
    reportsQueryOptions({ kind: "lost", sinceDays: 30, page: 0, pageSize: 1 }),
  );

  const rows = listings.data?.rows ?? [];
  const openLost = lost.data?.total ?? 0;

  return (
    <ContentCard
      title="Marketplace"
      subtitle="Discs for sale and trade near you, plus the local lost and found."
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/marketplace" search={{ view: "browse" }}>Open Marketplace</Link>
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <PackageSearch className="h-3.5 w-3.5" />
          {openLost} disc{openLost === 1 ? "" : "s"} reported lost in the last 30 days.
          <Link to="/lost-found" className="font-medium text-foreground hover:underline">
            Lost &amp; Found
          </Link>
        </div>
      }
    >
      {listings.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading local listings…</p>
      ) : rows.length === 0 ? (
        <MascotEmptyState
          intent="scout"
          size={96}
          title="No local listings yet"
          description="Be the first to post a disc and your area's marketplace gets rolling."
          actions={
            <Button asChild size="sm">
              <Link to="/marketplace" search={{ view: "sell" }}>Sell a disc</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 text-sm">
              <Store className="h-3.5 w-3.5 text-muted-foreground" />
              <Link
                to="/marketplace/$listingId"
                params={{ listingId: row.id }}
                className="truncate font-medium hover:underline"
              >
                {[row.brand, row.mold_name].filter(Boolean).join(" ")}
              </Link>
              <span className="truncate text-muted-foreground">
                {listingLocation(row) ?? "Nearby"}
              </span>
              <Badge variant="secondary" className="ml-auto shrink-0">
                {formatPrice(row.price_cents, row.trade_only)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </ContentCard>
  );
}
