/**
 * The application a player fills in to become an approved Event Director.
 * Shown in place of the director desk until an admin approves them.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useApplyForDirector, useDirectorAccess } from "@/lib/director-access";
import { getMyDirectorApplication } from "@/lib/director-application.functions";

export function DirectorApplicationCard() {
  const { status } = useDirectorAccess();
  const apply = useApplyForDirector();
  const applicationQ = useQuery({
    queryKey: ["director-application"],
    queryFn: () => getMyDirectorApplication(),
    staleTime: 30_000,
  });
  const existing = applicationQ.data?.application ?? null;

  const [orgName, setOrgName] = useState("");
  const [region, setRegion] = useState("");
  const [experience, setExperience] = useState("");
  const [pitch, setPitch] = useState("");

  if (status === "pending") {
    return (
      <ContentCard
        title="Your Event Director application is in review"
        subtitle="We look at every application by hand so players can trust the events on the calendar."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">
            <Clock className="mr-1 h-3 w-3" aria-hidden /> Waiting on review
          </Badge>
          <p className="text-sm text-muted-foreground">
            You'll get a notification the moment you're approved. Until then you can still play,
            score, and register for events as usual.
          </p>
        </div>
        {existing?.pitch ? (
          <p className="mt-4 text-[13px] text-muted-foreground">
            What you told us: “{existing.pitch}”
          </p>
        ) : null}
      </ContentCard>
    );
  }

  if (status === "rejected" || status === "revoked") {
    return (
      <ContentCard
        title={
          status === "revoked"
            ? "Your Event Director access was removed"
            : "Your Event Director application wasn't approved"
        }
        subtitle="Hosting tools stay closed for now, but everything else in the app works exactly as before."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">
            <XCircle className="mr-1 h-3 w-3" aria-hidden />{" "}
            {status === "revoked" ? "Access removed" : "Not approved"}
          </Badge>
          {existing?.reviewer_notes ? (
            <p className="text-sm text-muted-foreground">{existing.reviewer_notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Reply to the notification we sent you if you'd like another look.
            </p>
          )}
        </div>
      </ContentCard>
    );
  }

  return (
    <ContentCard
      title="Apply to run events"
      subtitle="Tournament and league creation, registrations, check-in, and payouts are open to approved Event Directors. Tell us what you run and we'll review it."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Shield className="h-5 w-5 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Playing, scoring, and joining events don't need approval — only hosting does.
        </p>
      </div>

      <form
        className="mt-5 grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply.mutate(
            {
              org_name: orgName.trim() || undefined,
              region: region.trim() || undefined,
              experience: experience.trim() || undefined,
              pitch: pitch.trim() || undefined,
            },
            {
              onSuccess: () => {
                toast.success("Application sent. We'll let you know as soon as it's reviewed.");
                void applicationQ.refetch();
              },
              onError: (error: unknown) =>
                toast.error(
                  error instanceof Error ? error.message : "Couldn't send your application.",
                ),
            },
          );
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="director-org">Club or organization</Label>
          <Input
            id="director-org"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Northwest Indiana Disc Golf Club"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="director-region">Where you run events</Label>
          <Input
            id="director-region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Valparaiso, IN"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="director-experience">Events you've run</Label>
          <Textarea
            id="director-experience"
            rows={3}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Weekly Thursday league since 2022, two C-tiers in 2025…"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="director-pitch">What you want to host here</Label>
          <Textarea
            id="director-pitch"
            rows={3}
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="Move our league sign-ups and scoring onto DG Dashboard, then add a spring B-tier."
          />
        </div>
        <div className="md:col-span-2">
          <Button type="submit" disabled={apply.isPending}>
            {apply.isPending ? "Sending…" : "Send application"}
          </Button>
        </div>
      </form>

      {existing?.approved_at ? (
        <p className="mt-3 flex items-center gap-2 text-[13px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Previously reviewed
        </p>
      ) : null}
    </ContentCard>
  );
}
