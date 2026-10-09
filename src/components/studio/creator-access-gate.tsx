/**
 * Shown instead of the Creator Studio publishing tools until an admin approves
 * the player's creator application.
 */
import { Link } from "@tanstack/react-router";
import { Sparkles, Clock, XCircle } from "lucide-react";
import { ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCreatorAccess } from "@/lib/creator-access";

export function CreatorAccessGate() {
  const { status } = useCreatorAccess();

  if (status === "pending") {
    return (
      <ContentCard
        title="Your creator application is in review"
        subtitle="Composer, scheduling, series, and analytics open up as soon as you're approved."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" aria-hidden /> Waiting on review
          </Badge>
          <p className="text-sm text-muted-foreground">
            You can keep posting to the home feed like any other player in the meantime.
          </p>
        </div>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/studio/settings">Review your application</Link>
        </Button>
      </ContentCard>
    );
  }

  if (status === "rejected" || status === "revoked") {
    return (
      <ContentCard
        title={
          status === "revoked"
            ? "Your creator access was removed"
            : "Your creator application wasn't approved"
        }
        subtitle="Publishing tools stay closed for now — posting to the feed still works as normal."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            <XCircle className="mr-1 h-3 w-3" aria-hidden />{" "}
            {status === "revoked" ? "Access removed" : "Not approved"}
          </Badge>
          <p className="text-sm text-muted-foreground">
            Update your application if you'd like the team to take another look.
          </p>
        </div>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/studio/settings">Update your application</Link>
        </Button>
      </ContentCard>
    );
  }

  return (
    <ContentCard
      title="Creator Studio is for approved creators"
      subtitle="Apply once and we'll review it by hand. Approved creators get the composer, scheduling, series, overlays, and reach analytics."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Posting photos, rounds, and aces to the feed never needs approval — only the studio tools
          do.
        </p>
      </div>
      <Button asChild className="mt-4">
        <Link to="/studio/settings">Apply as a creator</Link>
      </Button>
    </ContentCard>
  );
}
