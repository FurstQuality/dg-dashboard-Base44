import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import {
  PageShell,
  PageHeader,
  ContentCard,
  ErrorState,
  LoadingSkeleton,
  MascotEmptyState,
} from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/current-user";
import { useUserAccess } from "@/lib/user-access";
import { matchFlagsQueryOptions, resolveMatchFlag, type MatchFlag } from "@/lib/marketplace";

export const Route = createFileRoute("/_authenticated/admin/marketplace")({
  component: AdminMarketplacePage,
  head: () => ({
    meta: [
      { title: "Marketplace review · Admin · DG Dashboard" },
      {
        name: "description",
        content:
          "Private review queue for listings and found discs that look like someone else's lost disc.",
      },
      { property: "og:title", content: "Marketplace review · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Handle suspected lost-disc resales without publicly accusing anyone.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function AdminMarketplacePage() {
  const { user } = useSession();
  const access = useUserAccess();
  const flags = useQuery(matchFlagsQueryOptions("open"));
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (!access.isSuperAdmin) {
    return (
      <PageShell section="community">
        <PageHeader
          eyebrow="Admin"
          title="Marketplace review"
          description="This queue is limited to moderators."
        />
        <MascotEmptyState
          intent="rules"
          title="You don't have access to this queue"
          description="Match flags stay private to moderators so nobody gets publicly accused over a coincidence."
          actions={
            <Button asChild variant="outline">
              <Link to="/marketplace" search={{ view: "browse" }}>
                Back to Marketplace
              </Link>
            </Button>
          }
        />
      </PageShell>
    );
  }

  async function resolve(flag: MatchFlag, status: MatchFlag["status"]) {
    if (!user?.id) return;
    try {
      await resolveMatchFlag(flag.id, status, notes[flag.id]?.trim() || null, user.id);
      await queryClient.invalidateQueries({ queryKey: ["marketplace-match-flags"] });
      toast.success("Flag resolved.");
    } catch {
      toast.error("Couldn't resolve that flag. Try again in a moment.");
    }
  }

  const rows = flags.data ?? [];

  return (
    <PageShell section="community">
      <PageHeader
        eyebrow="Admin"
        title="Marketplace review"
        description="Listings and found discs that scored high against an open lost report. Flags are private — the seller isn't badged or blocked automatically."
        leading={
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500">
            <ShieldAlert className="h-5 w-5" />
          </div>
        }
      />

      {flags.isLoading ? (
        <LoadingSkeleton />
      ) : flags.error ? (
        <ErrorState
          title="Couldn't load the review queue"
          description="The flags didn't load. Try again in a moment."
        />
      ) : rows.length === 0 ? (
        <MascotEmptyState
          intent="rules"
          title="Nothing to review"
          description="No listings or found discs currently look like someone's open lost report."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((flag) => (
            <ContentCard
              key={flag.id}
              plain
              title={
                flag.listing_id ? (
                  <Link
                    to="/marketplace/$listingId"
                    params={{ listingId: flag.listing_id }}
                    className="hover:underline"
                  >
                    Listing flagged against a lost report
                  </Link>
                ) : (
                  "Found report flagged against a lost report"
                )
              }
              subtitle={new Date(flag.created_at).toLocaleString()}
              action={<Badge variant="outline">Score {flag.score}</Badge>}
            >
              <pre className="max-h-40 overflow-auto rounded-lg border bg-muted/40 p-2 text-sm">
                {JSON.stringify(flag.evidence, null, 2)}
              </pre>
              <Input
                value={notes[flag.id] ?? ""}
                placeholder="Moderator notes (what you checked, who you contacted)"
                onChange={(e) => setNotes((prev) => ({ ...prev, [flag.id]: e.target.value }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void resolve(flag, "dismissed")}>
                  Dismiss
                </Button>
                <Button size="sm" variant="outline" onClick={() => void resolve(flag, "warned")}>
                  Warn seller
                </Button>
                <Button size="sm" variant="outline" onClick={() => void resolve(flag, "hidden")}>
                  Hide listing
                </Button>
                <Button size="sm" onClick={() => void resolve(flag, "connected")}>
                  Connect the two players
                </Button>
              </div>
            </ContentCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
