import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, Crosshair, ArrowRight, Flame, Trophy, Wind, Clock } from "lucide-react";
import { PageShell, PageHeader } from "@/components/shell";
import { getPracticeHistory, getPracticeSummary } from "@/lib/play.functions";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { practiceDraft } from "@/lib/share-to-feed";
import { PLAY_LIMITS, PLAY_STALE, playKeys } from "@/lib/play-queries";
import { PlayPracticeCard } from "@/components/play/play-practice-card";

export const Route = createFileRoute("/_authenticated/practice")({
  component: PracticePage,
  head: () => ({
    meta: [
      { title: "Practice \u00b7 Driving range & putting green \u00b7 DG Dashboard" },
      {
        name: "description",
        content:
          "Track your driving range and putting practice with unified history and GPS coaching.",
      },
      { property: "og:title", content: "Practice \u2014 DG Dashboard" },
      {
        property: "og:description",
        content: "Driving range and putting green drills, side by side.",
      },
    ],
  }),
});

function PracticePage() {
  const { user } = useSession();
  const fetchSummary = useServerFn(getPracticeSummary);
  const fetchHistory = useServerFn(getPracticeHistory);

  const summaryQuery = useQuery({
    queryKey: playKeys.practiceSummary(user?.id),
    enabled: !!user,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchSummary({}),
  });
  const historyQuery = useQuery({
    queryKey: playKeys.practiceHistory(user?.id),
    enabled: !!user,
    staleTime: PLAY_STALE.short,
    queryFn: () => fetchHistory({ data: { limit: PLAY_LIMITS.practiceHistory } }),
  });

  const rangeStats = {
    sessions: summaryQuery.data?.range.sessions ?? 0,
    throws: summaryQuery.data?.range.throws ?? 0,
    lastAt: summaryQuery.data?.range.lastAt ?? null,
  };
  const puttStats = {
    sessions: summaryQuery.data?.putting.sessions ?? 0,
    putts: summaryQuery.data?.putting.putts ?? 0,
    makePct: summaryQuery.data?.putting.makePct ?? 0,
    lastAt: summaryQuery.data?.putting.lastAt ?? null,
  };
  const sessions = historyQuery.isPending ? null : (historyQuery.data ?? []);

  return (
    <PageShell section="practice">
      <PageHeader
        title="Practice"
        description="Two coaches, one history. Drop GPS markers, run drills, watch your numbers move."
      />

      <PlayPracticeCard userId={user?.id} />



      {/* Primary entry points */}
      <section className="grid gap-3 sm:grid-cols-2">
        <Button
          asChild
          size="lg"
          className="h-auto min-h-11 justify-start gap-3 rounded-2xl px-5 py-4 text-left"
        >
          <Link to="/range">
            <Target className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              <span className="block font-display text-base font-semibold">
                Head to the Driving Range
              </span>
              <span className="block text-xs opacity-80">
                GPS cones and wind-aware coaching
              </span>
            </span>
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="secondary"
          className="h-auto min-h-11 justify-start gap-3 rounded-2xl px-5 py-4 text-left"
        >
          <Link to="/putting">
            <Crosshair className="h-6 w-6 shrink-0" />
            <span className="min-w-0">
              <span className="block font-display text-base font-semibold">
                Head to the Putting Green
              </span>
              <span className="block text-xs opacity-80">
                Circle 1 &amp; 2 drills and make %
              </span>
            </span>
          </Link>
        </Button>
      </section>

      {/* Twin hero cards */}

      <section className="grid gap-4 md:grid-cols-2">
        <PracticeHero
          to="/range"
          title="Digital Driving Range"
          desc="GPS cones at 100/200/300/400 ft with wind-aware coaching."
          icon={Target}
          accent="from-primary/20"
          stat1={{ label: "Sessions", value: String(rangeStats.sessions) }}
          stat2={{ label: "Throws logged", value: String(rangeStats.throws) }}
          lastAt={rangeStats.lastAt}
        />
        <PracticeHero
          to="/putting"
          title="Digital Putting Green"
          desc="Circle 1 & 2 drills, make % by distance, wind-aware feedback."
          icon={Crosshair}
          accent="from-emerald-500/20"
          stat1={{ label: "Make %", value: `${puttStats.makePct}%` }}
          stat2={{ label: "Putts logged", value: String(puttStats.putts) }}
          lastAt={puttStats.lastAt}
        />
      </section>

      {/* Quick tips row */}
      <section className="grid gap-3 sm:grid-cols-3">
        <TipCard icon={Flame} title="Warm up short">
          Start every session inside 25 ft — build make % before extending range.
        </TipCard>
        <TipCard icon={Wind} title="Read the wind">
          Coach adjusts calls based on real-time gusts at your location.
        </TipCard>
        <TipCard icon={Trophy} title="Beat your best">
          Streaks and PRs are tracked automatically across both tools.
        </TipCard>
      </section>

      {/* Unified history */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Recent practice history</h2>
          {sessions && sessions.length > 0 ? (
            <div className="text-xs text-muted-foreground">{sessions.length} recent</div>
          ) : null}
        </div>
        {historyQuery.isError ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              We couldn't load your practice history. Refresh to try again.
            </CardContent>
          </Card>
        ) : sessions === null ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Loading practice sessions\u2026
            </CardContent>
          </Card>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You haven't logged a practice session yet. Fire up the Range or Putting Green to bank
              your first reps.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-right">Reps</th>
                  <th className="px-3 py-2 text-right">Make %</th>
                  <th className="px-3 py-2 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={`${s.kind}-${s.id}`}
                    className="border-t border-border/60 hover:bg-muted/20"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {timeAgo(s.started_at)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          s.kind === "range"
                            ? "border-primary/40 text-primary"
                            : "border-emerald-500/40 text-emerald-500"
                        }
                      >
                        {s.kind === "range" ? "Range" : "Putting"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{s.location ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.reps}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.makePct != null ? `${s.makePct}%` : "\u2014"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ShareToFeedButton
                        variant="ghost"
                        iconOnly
                        label="Share session"
                        title="Share this practice session"
                        draft={() =>
                          practiceDraft({
                            kind: s.kind,
                            reps: s.reps,
                            makePct: s.makePct,
                            location: s.location,
                            startedAt: s.started_at,
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function PracticeHero({
  to,
  title,
  desc,
  icon: Icon,
  accent,
  stat1,
  stat2,
  lastAt,
}: {
  to: "/range" | "/putting";
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  stat1: { label: string; value: string };
  stat2: { label: string; value: string };
  lastAt: string | null;
}) {
  return (
    <Link
      to={to}
      className={`group relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br ${accent} via-card to-card p-5 transition hover:border-primary/60`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h3 className="font-display text-lg font-semibold">{title}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Stat label={stat1.label} value={stat1.value} />
        <Stat label={stat2.label} value={stat2.value} />
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        {lastAt ? `Last session ${timeAgo(lastAt)}` : "No sessions yet — start your first"}
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TipCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-xs text-muted-foreground">{children}</CardContent>
    </Card>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
