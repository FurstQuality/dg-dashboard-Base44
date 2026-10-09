import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPdgaInviteByToken } from "@/lib/pdga-friends.functions";
import { Button } from "@/components/ui/button";
import { Sparkles, Trophy, MapPin, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/invite/pdga/$token")({
  head: ({ params }) => ({
    meta: [
      { title: `Join me on DG Dashboard — PDGA #${params.token.slice(0, 6)}` },
      {
        name: "description",
        content:
          "Your friend invited you to DG Dashboard — the modern disc golf app for rounds, ratings, and tournaments.",
      },
      { property: "og:title", content: "Join me on DG Dashboard" },
      {
        property: "og:description",
        content: "See your PDGA stats, track rounds, and play tournaments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const { token } = Route.useParams();
  const fetchInvite = useServerFn(getPdgaInviteByToken);
  const [data, setData] = useState<Awaited<ReturnType<typeof getPdgaInviteByToken>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchInvite({ data: { token } })
      .then((res) => setData(res as any))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Invite not found"));
  }, [token, fetchInvite]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="text-lg font-semibold">Invite not available</div>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link to="/" className="mt-4 text-sm text-primary underline">
          Go home
        </Link>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="p-10 text-center text-sm text-muted-foreground">Loading your invite…</div>
    );
  }

  const inv = data.invite as any;
  const inviter = data.inviter as any;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <div className="mx-auto max-w-lg space-y-6 p-6 pt-16">
        <div className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">
            You've been invited to DG Dashboard
          </h1>
          {inviter ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{inviter.display_name}</span> added
              you as a friend using your PDGA number.
            </p>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-primary">
                PDGA #{inv.pdga_number}
              </div>
              <div className="mt-1 font-display text-2xl font-semibold">
                {inv.display_name ?? `Player ${inv.pdga_number}`}
              </div>
              {inv.location ? (
                <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {inv.location}
                </div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Rating
              </div>
              <div className="font-display text-4xl font-bold">{inv.pdga_rating ?? "—"}</div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Trophy className="h-4 w-4 text-amber-500" />
            Join to unlock full history, projections, and a personal rating plan.
          </div>
        </div>

        <div className="space-y-2">
          <Button asChild size="lg" className="w-full">
            <Link to="/auth" search={{ pdga: inv.pdga_number, invite: token } as never}>
              Create free account <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            When you sign up and add your PDGA number to your profile, you'll be connected
            automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
