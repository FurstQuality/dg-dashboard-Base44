import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Calendar, MapPin, Loader2, Check, X, HelpCircle } from "lucide-react";
import { getInviteByToken, respondToInvite } from "@/lib/event-invites.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  component: InvitePage,
  head: () => ({
    meta: [
      { title: "Event invite · DG Dashboard" },
      { name: "description", content: "You've been invited to a disc golf event on DG Dashboard." },
      { property: "og:title", content: "Event invite · DG Dashboard" },
      { property: "og:description", content: "RSVP to a disc golf event on DG Dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const getInvite = useServerFn(getInviteByToken);
  const respond = useServerFn(respondToInvite);

  const [choice, setChoice] = useState<"going" | "maybe" | "declined" | null>(null);

  const q = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInvite({ data: { token } }),
    retry: 0,
  });

  const respondMut = useMutation({
    mutationFn: (rsvp: "going" | "maybe" | "declined") => respond({ data: { token, rsvp } }),
    onSuccess: (_, rsvp) => {
      setChoice(rsvp);
      toast.success(`RSVP recorded: ${rsvp}`);
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not save RSVP"),
  });

  if (q.isLoading) {
    return (
      <div className="max-w-2xl mx-auto py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (q.error || !q.data) {
    return (
      <div className="max-w-2xl mx-auto py-16">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This invite link may have been cancelled or is no longer valid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate({ to: "/home" })}>Go to home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { invite, inviter } = q.data;
  const inviterName = inviter?.display_name || inviter?.username || "A friend";
  const kindLabel =
    invite.event_kind === "community"
      ? "Community event"
      : invite.event_kind === "tournament"
        ? "Tournament"
        : invite.event_kind === "league"
          ? "League"
          : "Round";
  const eventLink =
    invite.event_kind === "community"
      ? `/community/events/${invite.event_id}`
      : invite.event_kind === "tournament"
        ? `/events/${invite.event_id}`
        : invite.event_kind === "league"
          ? `/events/${invite.event_id}`
          : `/play/${invite.event_id}`;

  const displayedRsvp = choice ?? (invite.rsvp === "none" ? null : invite.rsvp);

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <div className="text-xs uppercase tracking-wider text-primary font-semibold">
            {kindLabel} · Invite
          </div>
          <CardTitle className="text-2xl mt-1">
            {inviterName} invited you to {invite.event_title ?? "an event"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm">
            {invite.event_starts_at && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {new Date(invite.event_starts_at).toLocaleString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}
            {invite.event_location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {invite.event_location}
              </div>
            )}
          </div>

          {invite.personal_message && (
            <div className="border-l-4 border-primary/50 pl-4 py-2 bg-muted/30 rounded-r italic text-sm">
              "{invite.personal_message}"
              <div className="text-xs text-muted-foreground not-italic mt-1">— {inviterName}</div>
            </div>
          )}

          <div className="pt-2">
            <div className="text-sm font-medium mb-2">Your RSVP</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={displayedRsvp === "going" ? "default" : "outline"}
                onClick={() => respondMut.mutate("going")}
                disabled={respondMut.isPending}
              >
                <Check className="h-4 w-4 mr-1" /> Going
              </Button>
              <Button
                variant={displayedRsvp === "maybe" ? "default" : "outline"}
                onClick={() => respondMut.mutate("maybe")}
                disabled={respondMut.isPending}
              >
                <HelpCircle className="h-4 w-4 mr-1" /> Maybe
              </Button>
              <Button
                variant={displayedRsvp === "declined" ? "destructive" : "outline"}
                onClick={() => respondMut.mutate("declined")}
                disabled={respondMut.isPending}
              >
                <X className="h-4 w-4 mr-1" /> Can't make it
              </Button>
            </div>
          </div>

          <div className="pt-4 flex gap-2">
            <Button variant="secondary" onClick={() => navigate({ to: eventLink })}>
              Open event page
            </Button>
            <Button variant="ghost" onClick={() => navigate({ to: "/home" })}>
              Back to home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
