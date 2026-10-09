import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowLeft,
  Disc,
  ExternalLink,
  Loader2,
  MapPin,
  Trophy,
  TrendingUp,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPdgaPublicPreview } from "@/lib/pdga-public.functions";
import { jsonLd } from "@/lib/jsonld";

export const Route = createFileRoute("/preview/$number")({
  head: ({ params }) => {
    const n = params.number;
    const canonical = `https://dgdashboard.app/preview/${n}`;
    return {
      meta: [
        { title: `PDGA #${n} — DG Dashboard preview` },
        {
          name: "description",
          content: `Live preview of PDGA #${n} on DG Dashboard — rating, top rounds, career highlights. Sign up to unlock the full experience.`,
        },
        { property: "og:title", content: `PDGA #${n} — DG Dashboard preview` },
        {
          property: "og:description",
          content: `A live look at PDGA #${n} on DG Dashboard, straight from real career data.`,
        },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: canonical }],
    };
  },
  component: PreviewPlayer,
});

function PreviewPlayer() {
  const { number } = Route.useParams();
  const navigate = useNavigate();
  const pdgaNumber = Number(number);
  const fetchPreview = useServerFn(getPdgaPublicPreview);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pdga-public-preview", pdgaNumber],
    queryFn: () => fetchPreview({ data: { pdgaNumber } }),
    enabled: Number.isFinite(pdgaNumber) && pdgaNumber > 0,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Disc className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-semibold">DG Dashboard</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/auth" search={{ mode: "signup" } as never}>
            <Button>Create account</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4">
        <button
          onClick={() => navigate({ to: "/preview" })}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Search another number
        </button>

        {isLoading && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">
              Pulling PDGA #{pdgaNumber} straight from pdga.com…
            </p>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-2xl border border-destructive/40 bg-card p-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
            <h2 className="mt-3 font-display text-xl font-semibold">
              We couldn't find PDGA #{pdgaNumber}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Double-check the number, or head back and try again. If PDGA.com is having a moment,
              wait a few seconds and retry.
            </p>
            <Button className="mt-4" onClick={() => navigate({ to: "/preview" })}>
              Try another number
            </Button>
          </div>
        )}

        {data && !isLoading && (
          <>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: jsonLd({
                  "@context": "https://schema.org",
                  "@type": "Person",
                  name: data.name ?? `PDGA #${data.pdgaNumber}`,
                  identifier: `PDGA:${data.pdgaNumber}`,
                  image: data.avatarUrl ?? undefined,
                  address: data.location ?? undefined,
                  url: data.profileUrl,
                  memberOf: {
                    "@type": "SportsOrganization",
                    name: "Professional Disc Golf Association",
                    url: "https://www.pdga.com/",
                  },
                }),
              }}
            />
            {/* Hero card */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr_auto] md:items-center">
                <div className="mx-auto h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted ring-2 ring-primary/20 md:mx-0">
                  {data.avatarUrl ? (
                    <img
                      src={data.avatarUrl}
                      alt={data.name ?? `PDGA #${data.pdgaNumber}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl font-bold text-muted-foreground">
                      {(data.name ?? "?").slice(0, 1)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 text-center md:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
                    {data.classification && (
                      <Badge variant="secondary">{data.classification}</Badge>
                    )}
                    <Badge variant="outline">PDGA #{data.pdgaNumber}</Badge>
                    {data.memberSince && (
                      <Badge variant="outline">Member since {data.memberSince}</Badge>
                    )}
                  </div>
                  <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                    {data.name ?? `PDGA #${data.pdgaNumber}`}
                  </h1>
                  {data.location && (
                    <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-muted-foreground md:justify-start">
                      <MapPin className="h-4 w-4" /> {data.location}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Current rating
                  </div>
                  <div className="font-display text-4xl font-bold text-primary">
                    {data.currentRating ?? "—"}
                  </div>
                  {data.roundsUsed != null && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {data.roundsUsed} rated rounds
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* Stat strip */}
            <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={TrendingUp} label="Rating" value={data.currentRating ?? "—"} />
              <StatTile icon={Sparkles} label="Rated rounds" value={data.roundsUsed ?? "—"} />
              <StatTile icon={Trophy} label="Career wins" value={data.careerWins ?? "—"} />
              <StatTile icon={Disc} label="Events tracked" value={data.careerEvents ?? "—"} />
            </section>

            {/* Highlight rounds */}
            {data.highlightRounds.length > 0 && (
              <section className="mt-6 rounded-2xl border border-border bg-card p-6">
                <h2 className="font-display text-xl font-semibold">Top rated rounds</h2>
                <p className="text-sm text-muted-foreground">
                  Your best PDGA-rated rounds on record.
                </p>
                <div className="mt-4 space-y-2">
                  {data.highlightRounds.map((r, i) => (
                    <div
                      key={`${r.tournament}-${r.date}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{r.tournament}</div>
                        <div className="text-xs text-muted-foreground">{r.date}</div>
                      </div>
                      <div className="shrink-0 font-display text-2xl font-bold text-primary">
                        {r.rating}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Signup CTA */}
            <section className="mt-6 overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
              <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
                <div>
                  <h2 className="font-display text-2xl font-bold">
                    This is just the surface, {data.name?.split(" ")[0] ?? "player"}.
                  </h2>
                  <p className="mt-2 text-muted-foreground">
                    Create your free account to unlock the full DG Dashboard: rating projections,
                    live scoring, tournaments, leagues, friend trackers, and your personal course
                    library — all wired to your PDGA profile.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row md:flex-col">
                  <Link to="/auth" search={{ mode: "signup" } as never}>
                    <Button size="lg" className="w-full">
                      Claim my profile <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                  <a href={data.profileUrl} target="_blank" rel="noreferrer">
                    <Button size="lg" variant="outline" className="w-full">
                      View on PDGA.com <ExternalLink className="ml-1.5 h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>
            </section>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Data pulled live from pdga.com. DG Dashboard is not affiliated with the PDGA.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-primary" />
      <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
