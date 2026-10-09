import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Trophy, Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { fetchEventMeta, snippet } from "@/lib/public-meta";

export const Route = createFileRoute("/e/$slug")({
  loader: ({ params }) => fetchEventMeta(params.slug),
  head: ({ params, loaderData }) => {
    const url = `https://dgdashboard.app/e/${params.slug}`;
    const name = loaderData?.name ?? params.slug;
    const description =
      snippet(loaderData?.description, 155) ||
      `Register for ${name} on DG Dashboard — divisions, courses, schedule, and player list.`;
    const scripts = loaderData
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SportsEvent",
              name: loaderData.name,
              description,
              url,
              startDate: loaderData.start_date,
              endDate: loaderData.end_date,
              eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
              sport: "Disc golf",
              ...(loaderData.cover_url ? { image: loaderData.cover_url } : {}),
              ...(loaderData.location
                ? { location: { "@type": "Place", name: loaderData.location } }
                : {}),
              ...(loaderData.entry_fee_cents != null
                ? {
                    offers: {
                      "@type": "Offer",
                      price: (loaderData.entry_fee_cents / 100).toFixed(2),
                      priceCurrency: "USD",
                      url,
                      availability: "https://schema.org/InStock",
                    },
                  }
                : {}),
            }),
          },
        ]
      : [];
    return {
      meta: [
        { title: `${name} — Disc golf event · DG Dashboard` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} — register on DG Dashboard` },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        ...(loaderData?.cover_url?.startsWith("https://")
          ? [
              { property: "og:image", content: loaderData.cover_url },
              { name: "twitter:image", content: loaderData.cover_url },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts,
    };
  },
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This event" />,
  component: PublicEventPage,
});

type PublicEvent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  cover_url: string | null;
  entry_fee_cents: number;
  max_players: number | null;
  pdga_sanctioned: boolean;
  governing_ruleset?: string | null;
  pdga_tier: string | null;
  status: string;
};

function PublicEventPage() {
  const { slug } = Route.useParams();
  const [event, setEvent] = useState<PublicEvent | null | undefined>(undefined);
  const [divisions, setDivisions] = useState<
    { id: string; code: string; name: string; entry_fee_cents: number }[]
  >([]);
  const [regCount, setRegCount] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tournaments")
        .select(
          "id, name, slug, description, start_date, end_date, location, cover_url, entry_fee_cents, max_players, pdga_sanctioned, pdga_tier, status, governing_ruleset",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (!data) return setEvent(null);
      setEvent(data as PublicEvent);
      const [{ data: divs }, { count }] = await Promise.all([
        supabase
          .from("tournament_divisions")
          .select("id, code, name, entry_fee_cents")
          .eq("tournament_id", data.id)
          .order("code"),
        supabase
          .from("tournament_registrations")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", data.id),
      ]);
      setDivisions((divs as any) ?? []);
      setRegCount(count ?? 0);
    })();
  }, [slug]);

  if (event === undefined)
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading event…</div>;
  if (event === null) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <div className="text-lg font-semibold">Event not found</div>
        <Link to="/" className="mt-4 inline-block text-sm text-primary underline">
          Back to DG Dashboard
        </Link>
      </div>
    );
  }

  const spotsLeft = event.max_players ? event.max_players - regCount : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl p-4 sm:p-8">
        <div className="mb-4 text-center">
          <Link
            to="/"
            className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
          >
            ← DG Dashboard
          </Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="relative aspect-[16/9] bg-gradient-to-br from-primary/20 to-accent/10">
            {event.cover_url ? (
              <img
                src={event.cover_url}
                alt={`Event cover for ${event.name}, a disc golf tournament${event.location ? ` in ${event.location}` : ""}`}
                className="h-full w-full object-cover"
              />

            ) : (
              <div className="grid h-full place-items-center">
                <Trophy className="h-16 w-16 text-primary/60" />
              </div>
            )}
            {event.pdga_sanctioned ? (
              <div className="absolute top-3 left-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-primary-foreground backdrop-blur">
                PDGA {event.pdga_tier ?? ""} Sanctioned
              </div>
            ) : event.governing_ruleset === "dgd" ? (
              <Link to="/rules/$code" params={{ code: "rules_of_play" }} className="absolute top-3 left-3 rounded-full bg-primary/90 px-3 py-1 text-xs font-semibold text-primary-foreground">
                DGD Sanctioned · DGD Rules
              </Link>
            ) : null}
          </div>

          <div className="space-y-4 p-6">
            <div>
              <h1 className="font-display text-3xl font-bold">{event.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {fmt(event.start_date)}
                  {event.end_date !== event.start_date ? ` – ${fmt(event.end_date)}` : ""}
                </span>
                {event.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {regCount}
                  {event.max_players ? ` / ${event.max_players}` : ""}
                </span>
              </div>
            </div>

            {event.description ? (
              <p className="text-sm leading-relaxed">{event.description}</p>
            ) : null}

            {divisions.length ? (
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Divisions
                </div>
                <div className="mt-2 space-y-1">
                  {divisions.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-sm">
                      <span>
                        <span className="font-semibold">{d.code}</span> · {d.name}
                      </span>
                      <span className="text-muted-foreground">
                        ${(d.entry_fee_cents / 100).toFixed(0)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {spotsLeft !== null && spotsLeft <= 10 && spotsLeft > 0 ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
                Only {spotsLeft} spot{spotsLeft === 1 ? "" : "s"} left — register now.
              </div>
            ) : null}
            {spotsLeft === 0 ? (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                Event is full — join the waitlist by registering.
              </div>
            ) : null}

            <div className="flex flex-col gap-2 pt-2 sm:flex-row">
              <Link to="/tournaments/$slug" params={{ slug: event.slug }} className="flex-1">
                <Button className="w-full" size="lg">
                  Register on DG Dashboard <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              Sign in or create a free account to complete registration.
            </p>
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
              <h2 className="mb-1 text-sm font-semibold text-foreground">
                About tournaments on DG Dashboard
              </h2>
              <p>
                Tournament directors run registration, divisions, payouts, and live scoring for this
                event on DG Dashboard. Players get a single account for signing up, tracking round
                scores hole by hole, following the live leaderboard, and keeping a full history of
                their tournament and league results.
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
