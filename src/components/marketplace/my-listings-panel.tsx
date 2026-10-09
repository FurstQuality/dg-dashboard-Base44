import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpCircle, Store } from "lucide-react";
import {
  ContentCard,
  ErrorState,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import {
  bumpListing,
  formatPrice,
  myListingsQueryOptions,
  setListingStatus,
  updateListingPrice,
  type ListingStatus,
} from "@/lib/marketplace";

const STATUSES: { value: ListingStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "removed", label: "Removed" },
];

export function MyListingsPanel() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const listings = useQuery(myListingsQueryOptions(userId));
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["marketplace-my-listings", userId] });
  }

  async function savePrice(id: string) {
    const draft = priceDrafts[id];
    if (draft === undefined) return;
    try {
      await updateListingPrice(id, draft.trim() ? Math.round(Number(draft) * 100) : null);
      setPriceDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refresh();
      toast.success("Price updated. Watchers get a heads-up on drops.");
    } catch {
      toast.error("Couldn't update that price. Try again in a moment.");
    }
  }

  async function changeStatus(id: string, status: ListingStatus) {
    try {
      await setListingStatus(id, status);
      await refresh();
      toast.success(
        status === "sold" ? "Marked sold. Nice deal." : `Listing set to ${status}.`,
      );
    } catch {
      toast.error("Couldn't change that listing. Try again in a moment.");
    }
  }

  async function bump(id: string) {
    try {
      await bumpListing(id);
      await refresh();
      toast.success("Bumped to the top of local browse.");
    } catch {
      toast.error("Couldn't bump that listing. Try again in a moment.");
    }
  }

  const rows = listings.data ?? [];

  return (
    <div className="space-y-4">

      {listings.isLoading ? (
        <LoadingSkeleton />
      ) : listings.error ? (
        <ErrorState
          title="Couldn't load your listings"
          description="Your posts are safe — the list just didn't load. Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <MascotEmptyState
          intent="scout"
          title="Nothing listed yet"
          description="Post a disc from your bag and local players can start messaging you today."
          actions={
            <Button asChild>
              <Link to="/marketplace" search={{ view: "sell" }}>Sell a disc</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <ContentCard
              key={row.id}
              plain
              title={
                <Link
                  to="/marketplace/$listingId"
                  params={{ listingId: row.id }}
                  className="hover:underline"
                >
                  {[row.brand, row.mold_name].filter(Boolean).join(" ")}
                </Link>
              }
              subtitle={[row.plastic_name, row.weight_grams ? `${row.weight_grams}g` : null]
                .filter(Boolean)
                .join(" · ")}
              action={<Badge variant="secondary">{formatPrice(row.price_cents, row.trade_only)}</Badge>}
            >
              <div className="flex flex-wrap items-end gap-3">
                {!row.trade_only ? (
                  <div className="flex items-end gap-2">
                    <div className="space-y-1">
                      <label className="text-sm text-muted-foreground" htmlFor={`price-${row.id}`}>
                        New price ($)
                      </label>
                      <Input
                        id={`price-${row.id}`}
                        className="w-28"
                        inputMode="decimal"
                        value={priceDrafts[row.id] ?? ""}
                        placeholder={row.price_cents ? (row.price_cents / 100).toFixed(2) : "Offer"}
                        onChange={(e) =>
                          setPriceDrafts((prev) => ({
                            ...prev,
                            [row.id]: e.target.value.replace(/[^0-9.]/g, ""),
                          }))
                        }
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={priceDrafts[row.id] === undefined}
                      onClick={() => void savePrice(row.id)}
                    >
                      Save price
                    </Button>
                  </div>
                ) : null}

                <div className="space-y-1">
                  <span className="block text-sm text-muted-foreground">Status</span>
                  <Select
                    value={row.status}
                    onValueChange={(v) => void changeStatus(row.id, v as ListingStatus)}
                  >
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button variant="ghost" size="sm" onClick={() => void bump(row.id)}>
                  <ArrowUpCircle className="mr-1.5 h-4 w-4" /> Bump
                </Button>
                <span className="ml-auto text-sm text-muted-foreground">
                  {row.view_count} view{row.view_count === 1 ? "" : "s"}
                </span>
              </div>
            </ContentCard>
          ))}
        </div>
      )}
    </div>
  );
}
