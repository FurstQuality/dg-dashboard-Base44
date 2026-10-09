import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, MapPin, MessageCircle, Repeat2, TrendingDown } from "lucide-react";
import {
  PageShell,
  PageHeader,
  ContentCard,
  ErrorState,
  LoadingSkeleton,
} from "@/components/shell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/current-user";
import { openDirectConversation } from "@/lib/messaging";
import {
  formatPrice,
  listingLocation,
  listingQueryOptions,
  priceHistoryQueryOptions,
  toggleWatch,
  watchlistQueryOptions,
} from "@/lib/marketplace";

export const Route = createFileRoute("/_authenticated/marketplace/$listingId")({
  component: ListingDetailPage,
  head: () => ({
    meta: [
      { title: "Disc listing · Marketplace · DG Dashboard" },
      {
        name: "description",
        content:
          "Disc details, flight numbers, condition, price history, and a direct line to the seller.",
      },
      { property: "og:title", content: "Disc listing · DG Dashboard Marketplace" },
      {
        property: "og:description",
        content: "See the disc, the asking price, and message the seller directly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const CONDITION_LABEL: Record<string, string> = {
  new: "New",
  worn: "Worn in",
  beat_in: "Beat in",
  retired: "Retired",
};

function ListingDetailPage() {
  const { listingId } = Route.useParams();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const listing = useQuery(listingQueryOptions(listingId));
  const history = useQuery(priceHistoryQueryOptions(listingId));
  const watchlist = useQuery(watchlistQueryOptions(userId));

  if (listing.isLoading) {
    return (
      <PageShell section="community">
        <LoadingSkeleton />
      </PageShell>
    );
  }
  if (listing.error || !listing.data) {
    return (
      <PageShell section="community">
        <ErrorState
          title="That listing isn't available"
          description="It may have sold or been taken down. Head back to browse what's still up."
        />
      </PageShell>
    );
  }

  const row = listing.data;
  const isWatched = (watchlist.data ?? []).includes(row.id);
  const isMine = userId === row.seller_id;
  const points = history.data ?? [];
  const drop =
    points.length > 1 && points[0]?.price_cents && row.price_cents
      ? points[0]!.price_cents! - row.price_cents
      : 0;

  async function messageSeller() {
    if (!userId) return;
    const conversationId = await openDirectConversation(userId, row.seller_id);
    if (conversationId) void navigate({ to: "/dgim" });
  }

  async function onToggleWatch() {
    if (!userId) return;
    try {
      await toggleWatch(userId, row.id, isWatched);
      await queryClient.invalidateQueries({ queryKey: ["marketplace-watchlist", userId] });
    } catch {
      toast.error("Couldn't update your watchlist. Try again in a moment.");
    }
  }

  return (
    <PageShell section="community">
      <PageHeader
        eyebrow="Marketplace listing"
        title={[row.brand, row.mold_name].filter(Boolean).join(" ")}
        description={
          row.description ??
          "No extra notes from the seller — message them if you want more detail or photos."
        }
        primaryAction={
          isMine ? (
            <Button asChild variant="outline">
              <Link to="/marketplace" search={{ view: "mine" }}>Manage my listings</Link>
            </Button>
          ) : (
            <Button onClick={() => void messageSeller()} disabled={!userId}>
              <MessageCircle className="mr-1.5 h-4 w-4" /> Message seller
            </Button>
          )
        }
        secondaryAction={
          !isMine && userId ? (
            <Button variant="outline" onClick={() => void onToggleWatch()}>
              <Heart className={isWatched ? "mr-1.5 h-4 w-4 fill-current text-rose-500" : "mr-1.5 h-4 w-4"} />
              {isWatched ? "Watching" : "Watch"}
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <ContentCard title="Photos" bare>
            {row.photos.length ? (
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {row.photos.map((p) => (
                  <img
                    key={p.id}
                    src={p.url}
                    alt={`${row.mold_name} photo`}
                    className="aspect-[4/3] w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                The seller hasn't added photos. Message them for a look.
              </p>
            )}
          </ContentCard>

          <ContentCard title="Disc details">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Mold" value={row.mold_name} />
              <Detail label="Brand" value={row.brand} />
              <Detail label="Plastic" value={row.plastic_name} />
              <Detail label="Weight" value={row.weight_grams ? `${row.weight_grams}g` : null} />
              <Detail label="Color" value={row.color} />
              <Detail
                label="Condition"
                value={row.condition ? (CONDITION_LABEL[row.condition] ?? row.condition) : null}
              />
              <Detail
                label="Flight numbers"
                value={
                  row.speed != null
                    ? `${row.speed} / ${row.glide ?? "–"} / ${row.turn ?? "–"} / ${row.fade ?? "–"}`
                    : null
                }
              />
              <Detail label="Ink and dye notes" value={row.ink_notes} />
            </dl>
          </ContentCard>
        </div>

        <div className="space-y-4">
          <ContentCard title="Price">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-semibold">
                {formatPrice(row.price_cents, row.trade_only)}
              </span>
              {row.trade_only ? (
                <Badge variant="outline" className="gap-1">
                  <Repeat2 className="h-3 w-3" /> Trade only
                </Badge>
              ) : null}
              {row.status === "reserved" ? <Badge variant="outline">Reserved</Badge> : null}
              {row.status === "sold" ? <Badge variant="secondary">Sold</Badge> : null}
            </div>
            {drop > 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-500">
                <TrendingDown className="h-4 w-4" /> Dropped ${(drop / 100).toFixed(2)} since it was
                listed
              </p>
            ) : null}
            {points.length > 1 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {points.map((p) => (
                  <li key={p.id}>
                    {new Date(p.changed_at).toLocaleDateString()} ·{" "}
                    {formatPrice(p.price_cents, false)}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Payments happen between you and the seller — DG Dashboard doesn't process money.
            </p>
          </ContentCard>

          <ContentCard title="Seller">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {row.seller?.avatar_url ? (
                  <AvatarImage src={row.seller.avatar_url} alt={row.seller.display_name ?? "Seller"} />
                ) : null}
                <AvatarFallback>
                  {(row.seller?.display_name ?? "DG").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                {row.seller?.username ? (
                  <Link
                    to="/players/$username"
                    params={{ username: row.seller.username }}
                    className="font-medium hover:underline"
                  >
                    {row.seller.display_name ?? row.seller.username}
                  </Link>
                ) : (
                  <span className="font-medium">A DG Dashboard player</span>
                )}
                <p className="flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {listingLocation(row) ?? row.seller?.location ?? "Location not shared"}
                </p>
              </div>
            </div>
          </ContentCard>
        </div>
      </div>
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value ?? "Not listed"}</dd>
    </div>
  );
}
