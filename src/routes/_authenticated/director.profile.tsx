import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { getDirectorCockpit } from "@/lib/director.functions";
import { DIRECTOR_STALE, directorKeys } from "@/lib/director-queries";
import { useSession, useMyProfile } from "@/lib/current-user";
import { PageHeader, ContentCard, StatCard } from "@/components/shell";
import { toast } from "sonner";
import { useDirectorAccess } from "@/lib/director-access";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  IdCard,
  ExternalLink,
  Trophy,
  CalendarRange,
  Building2,
  Sparkles,
  Link2,
  Bell,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/director/profile")({
  head: () => ({
    meta: [
      { title: "Organizer profile · DG Dashboard" },
      {
        name: "description",
        content:
          "Control the organizer identity players see on your tournament, league, and club pages.",
      },
      { property: "og:title", content: "Organizer profile — DG Dashboard" },
      {
        property: "og:description",
        content: "The name, contact details, and credentials shown on every event you run.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorProfile,
});

function useOrganizerFootprint() {
  const { user } = useSession();
  const fetchCockpit = useServerFn(getDirectorCockpit);
  // Counts come from the Overview's own aggregate so the two desks never disagree.
  const cockpit = useQuery({
    queryKey: directorKeys.cockpit(user?.id),
    enabled: !!user?.id,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => fetchCockpit(),
  });
  const creator = useQuery({
    queryKey: ["director-creator-profile", user?.id],
    enabled: !!user?.id,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: async () => {
      const { data } = await supabase
        .from("creator_profiles")
        .select("tier, status, is_verified")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data ?? null) as { tier: string; status: string; is_verified: boolean } | null;
    },
  });
  return {
    isLoading: cockpit.isLoading,
    isError: cockpit.isError,
    refetch: () => {
      void cockpit.refetch();
      void creator.refetch();
    },
    data: cockpit.data
      ? {
          tournaments: cockpit.data.counts.tournaments,
          leagues: cockpit.data.counts.leagues,
          clubs: cockpit.data.counts.clubs,
          creator: creator.data ?? null,
        }
      : undefined,
  };
}

function DirectorProfile() {
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  const { data } = useOrganizerFootprint();

  const creator = data?.creator;
  const creatorLabel = !creator
    ? "Not applied yet"
    : creator.is_verified
      ? `Verified ${creator.tier}`
      : `Application ${creator.status}`;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Organizer profile"
        description="This is the identity players see on your event pages, league nights, and club posts."
        primaryAction={
          <Button asChild size="sm">
            <Link to="/settings/profile">
              <IdCard className="mr-1 h-4 w-4" />
              Edit profile
            </Link>
          </Button>
        }
        secondaryAction={
          profile?.username ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/players/$username" params={{ username: profile.username }}>
                <ExternalLink className="mr-1 h-4 w-4" />
                View public profile
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tournaments hosted"
          value={data?.tournaments ?? "—"}
          hint="Events created under your account"
          icon={Trophy}
          tone="gold"
        />
        <StatCard
          label="Leagues run"
          value={data?.leagues ?? "—"}
          hint="Seasons you own end to end"
          icon={CalendarRange}
          tone="primary"
        />
        <StatCard
          label="Clubs you lead"
          value={data?.clubs ?? "—"}
          hint="Owner or admin access"
          icon={Building2}
          tone="green"
        />
        <StatCard
          label="Creator status"
          value={creatorLabel}
          hint="Publishing access in Creator Studio"
          icon={Sparkles}
          tone="violet"
        />
      </div>

      <DirectorModeCard />


      <ContentCard
        title="Organizer identity"
        subtitle="Shown on registration pages, league standings, and club announcements."
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-control border border-border/60 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Display name
            </dt>
            <dd className="mt-0.5 text-sm">
              {profile?.display_name || "Add your name so players know who's running the event"}
            </dd>
          </div>
          <div className="rounded-control border border-border/60 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              PDGA number
            </dt>
            <dd className="mt-0.5 text-sm">
              {profile?.pdga_number ? (
                <span className="inline-flex items-center gap-2">
                  #{profile.pdga_number}
                  {profile.pdga_rating ? (
                    <Badge variant="outline">{profile.pdga_rating} rated</Badge>
                  ) : null}
                </span>
              ) : (
                "Link your PDGA number to run sanctioned events"
              )}
            </dd>
          </div>
          <div className="rounded-control border border-border/60 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Home course
            </dt>
            <dd className="mt-0.5 text-sm">
              {profile?.home_course || "Set the course you host at most often"}
            </dd>
          </div>
          <div className="rounded-control border border-border/60 px-3 py-2.5">
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Location
            </dt>
            <dd className="mt-0.5 text-sm">
              {profile?.location || "Add a city so local players can find your events"}
            </dd>
          </div>
        </dl>
      </ContentCard>

      <ContentCard
        title="Organizer settings"
        subtitle="The settings that affect how you run events."
      >
        <ul className="space-y-2">
          <li>
            <Link
              to="/settings/profile"
              className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Public profile &amp; contact</span>
                <span className="block text-[13px] text-muted-foreground">
                  Name, bio, avatar, home course, and division.
                </span>
              </span>
              <IdCard className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
          <li>
            <Link
              to="/settings/imports"
              className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">PDGA &amp; UDisc connections</span>
                <span className="block text-[13px] text-muted-foreground">
                  Link the accounts that verify ratings and sync results.
                </span>
              </span>
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
          <li>
            <Link
              to="/settings/notifications"
              className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Event notifications</span>
                <span className="block text-[13px] text-muted-foreground">
                  Registration alerts, waitlist moves, and score submissions.
                </span>
              </span>
              <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
          <li>
            <Link
              to="/studio/settings"
              className="flex items-center justify-between gap-3 rounded-control border border-border/60 px-3 py-2.5 transition-colors hover:border-primary/60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">Creator profile</span>
                <span className="block text-[13px] text-muted-foreground">
                  Headline, pillars, and links used when you publish content.
                </span>
              </span>
              <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        </ul>
      </ContentCard>
    </div>
  );
}

function DirectorModeCard() {
  const { status, isAdmin } = useDirectorAccess();
  const label = isAdmin
    ? "Admin access"
    : status === "approved"
      ? "Approved"
      : status === "pending"
        ? "Waiting on review"
        : status === "rejected"
          ? "Not approved"
          : status === "revoked"
            ? "Access removed"
            : "Not applied";
  return (
    <ContentCard
      title="Event Director access"
      subtitle="Tournament and league creation, registrations, check-in, and payouts are only open to approved directors."
    >
      <p className="text-sm text-muted-foreground">
        Your status: <span className="font-semibold text-foreground">{label}</span>. Approval is
        handled by the DG Dashboard team — reach out if your situation has changed and you need it
        reviewed again.
      </p>
    </ContentCard>
  );
}
