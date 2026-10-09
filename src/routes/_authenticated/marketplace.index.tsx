import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Store, Tag } from "lucide-react";
import { z } from "zod";
import { PageShell, PageHeader } from "@/components/shell";
import { MarketplaceBrowsePanel } from "@/components/marketplace/browse-panel";
import { SellDiscPanel } from "@/components/marketplace/sell-panel";
import { MyListingsPanel } from "@/components/marketplace/my-listings-panel";
import { AlertsPanel } from "@/components/marketplace/alerts-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const VIEWS = ["browse", "sell", "mine"] as const;
type MarketplaceView = (typeof VIEWS)[number];

const searchSchema = z.object({
  // "alerts" was its own page/tab; saved searches and watchlist now live with
  // the seller's own listings, so old links land on that combined view.
  view: z
    .union([
      z.enum(VIEWS),
      z.literal("alerts").transform(() => "mine" as const),
      z.literal("lost-found"),
    ])
    .catch("browse"),
  // A disc from the player's bag, pre-selected in the sell form.
  disc: z.string().uuid().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/marketplace/")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    // Lost & Found is its own page now — keep old deep links working.
    if (search.view === "lost-found") throw redirect({ to: "/lost-found" });
  },
  component: MarketplaceDashboard,
  head: () => ({
    meta: [
      { title: "Marketplace · Buy, sell, and trade discs · DG Dashboard" },
      {
        name: "description",
        content:
          "One place to browse local discs for sale, list your own, and manage your listings and alerts.",
      },
      { property: "og:title", content: "Local disc marketplace · DG Dashboard" },
      {
        property: "og:description",
        content: "Buy, sell, and trade discs with players in your area — no shipping guesswork.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function MarketplaceDashboard() {
  const { view, disc } = Route.useSearch();
  const navigate = useNavigate();

  function setView(next: string) {
    void navigate({ to: "/marketplace", search: { view: next as MarketplaceView } });
  }

  return (
    <PageShell section="community">
      <PageHeader
        eyebrow="Community"
        title="Buy, sell &amp; trade"
        description="Browse local discs, list your own, and manage what you have up. Deals are arranged player to player — DG Dashboard doesn't handle payments."
        leading={
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
            <Store className="h-5 w-5" />
          </div>
        }
        primaryAction={
          <Button onClick={() => setView("sell")}>
            <Tag className="mr-1.5 h-4 w-4" /> Sell a disc
          </Button>
        }
      />

      <Tabs value={view === "lost-found" ? "browse" : view} onValueChange={setView}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="browse">Browse discs</TabsTrigger>
          <TabsTrigger value="sell">Sell a disc</TabsTrigger>
          <TabsTrigger value="mine">My listings &amp; alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-4">
          <MarketplaceBrowsePanel />
        </TabsContent>
        <TabsContent value="sell" className="mt-4">
          <SellDiscPanel initialBagDiscId={disc ?? null} />
        </TabsContent>

        <TabsContent value="mine" className="mt-4 space-y-6">
          <MyListingsPanel />
          <AlertsPanel />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
