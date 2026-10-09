import type * as React from "react";
import { formatToPar as fmtToPar } from "@/lib/score-display";
import { createFileRoute, useSearch, useNavigate, Link } from "@tanstack/react-router";

import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { runTierJobsNow } from "@/lib/dgd-tier.functions";
import { DgdLeaderboard } from "@/components/dgd/dgd-leaderboard";
import { TierProgressCard } from "@/components/dgd/tier-progress";
import { useDgdIdentity } from "@/lib/dgd-identity";
import { DgdModelSection, DgdRatingSection, DgdDevelopmentCard } from "@/components/stats/dgd-preview-panel";
import { getMyDgdPreview, getMyDgdPreviewHistory } from "@/lib/dgd-v1.functions";
import {
  DEFAULT_VIEW_STORAGE_KEY,
  resolveStatboardView,
  type StatboardView,
} from "@/lib/stats/statboard-views";
import {
  HelpPopover,
  InsightsCard,
  RecentPerformanceCard,
  RecentRoundsCard,
  SectionTitle,
  StatboardTabs,
} from "@/components/statlink/statboard-parts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ThrowStatsCard } from "@/components/stats/throw-stats-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Target,
  TrendingUp,
  Flag,
  Calendar,
  MapPin,
  Swords,
  LineChart as LineChartIcon,
  ClipboardList,
  Download,
  ArrowRight,
  ChevronDown,
} from "lucide-react";
import {
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  getRatingSnapshot,
  getTargetPlan,
  getScoringStats,
  getCourseBook,
  getSourceRounds,
} from "@/lib/stats.functions";
import { getMyPdgaLab } from "@/lib/pdga-lab.functions";
import { statsKeys, STATS_STALE, STATS_LIMITS } from "@/lib/stats-queries";
import { StatlinkErrorState, StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";

// Chart-heavy planner/breakdown panels live on secondary tabs — load their code
// only when that tab is opened.
const RatingStudio = lazy(() =>
  import("./rating-studio").then((m) => ({ default: m.RatingStudio })),
);
import { CareerShotStatsPanel } from "@/components/stats/career-shot-stats-panel";
import { formatUpdateDate, daysUntil } from "@/lib/stats/pdga-update";
import type { ScoringSummary } from "@/lib/stats/scoring-stats";
import { TrackerHoleInsightsCard } from "@/components/statboard/tracker-hole-insights";
import { RoundDatabase } from "@/components/statlink/round-database";
import { MascotEmptyState, WidgetNote, WidgetSourceNote } from "@/components/shell";

import { RatingLifecyclePanel } from "@/components/statlink/rating-lifecycle-panel";
import { AllRatingsBoard } from "@/components/statlink/all-ratings-board";
import {
  SourceCompareTable,
  SOURCE_CHIP_CLASS,
  type CompareColumn,
  type CompareRow,
} from "@/components/statlink/source-compare-table";
import { PageShell, PageHeader } from "@/components/shell";
import { DataSourceTrustPanel } from "@/components/import/data-health-widgets";
import { GoalsPanel } from "@/components/statlink/goals-panel";
import { useSession } from "@/lib/current-user";

import { useTargetRating } from "@/lib/use-target-rating";
import { SkillEngineTab, SkillScoringBreakdown } from "@/components/statlink/skill-engine";
import { DiscPerformanceCard } from "@/components/statlink/disc-performance-card";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { TargetSimulator } from "@/components/statlink/target-simulator";
import type { RatedRound } from "@/lib/rating-projection";
import { coursePrDraft, scoringMilestoneDraft } from "@/lib/share-to-feed";

type StatsSearch = { view?: string; tab?: string; source?: "pdga" | "udisc" | "chainlink" };

/** Shared placeholder while a deferred panel's code arrives. */
function PanelFallback() {
  return <StatlinkPanelSkeleton label="Loading this panel…" rows={3} />;
}

export const Route = createFileRoute("/_authenticated/stats")({
  head: () => ({
    meta: [
      { title: "DG Statboard · DG Dashboard" },
      {
        name: "description",
        content:
          "Track your PDGA-style rating, forecast the next update, and analyze your scoring.",
      },
      { property: "og:title", content: "DG Statboard · DG Dashboard" },
      {
        property: "og:description",
        content:
          "Track your PDGA-style rating, forecast the next update, and analyze your scoring.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): StatsSearch => ({
    view: typeof s.view === "string" ? s.view : undefined,
    tab: typeof s.tab === "string" ? s.tab : undefined,
    source:
      s.source === "udisc" || s.source === "chainlink" || s.source === "pdga"
        ? s.source
        : undefined,
  }),
  component: StatsPage,
});

type Snapshot = Awaited<ReturnType<typeof getRatingSnapshot>>;
type TargetPlan = Awaited<ReturnType<typeof getTargetPlan>>;
type ScoringRes = Awaited<ReturnType<typeof getScoringStats>>;
type CourseBook = Awaited<ReturnType<typeof getCourseBook>>;
type PdgaLab = Awaited<ReturnType<typeof getMyPdgaLab>>;

type StatboardSource = "pdga" | "udisc" | "chainlink";

function StatsPage() {
  // Tab and source live in the URL so a DG Statboard view is shareable and
  // survives a refresh. Source falls back to the player's last choice.
  const search = useSearch({ from: "/_authenticated/stats" });
  const navigate = useNavigate();
  const { session } = useSession();

  // Player Lookup merged into Face Off (/compare); legacy links redirect there.
  useEffect(() => {
    if (search.tab === "lookup") {
      void navigate({ to: "/compare", replace: true });
    }
  }, [search.tab, navigate]);

  // Research appears only for testers/admins; the server gates its data too.
  const previewFn = useServerFn(getMyDgdPreview);
  const researchQ = useQuery({
    queryKey: ["dgd-preview-summary", "v12"],
    queryFn: async () => {
      try {
        return (await previewFn({ data: { model: "v12" } })) as { allowed?: boolean };
      } catch {
        return { allowed: false };
      }
    },
    staleTime: 5 * 60_000,
  });
  const researchAllowed = !!researchQ.data?.allowed;
  const [defaultView, setDefaultView] = useState<StatboardView>("overview");
  useEffect(() => {
    const v = window.localStorage.getItem(DEFAULT_VIEW_STORAGE_KEY);
    if (v) setDefaultView(resolveStatboardView(v, undefined, false));
  }, []);
  const view = resolveStatboardView(search.view, search.tab, researchAllowed, defaultView);
  const tab = view;
  const setView = (next: StatboardView) => {
    void navigate({ to: "/stats", search: { view: next }, replace: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  // Highlights one source row on the ratings board.
  const [focusSource, setFocusSource] = useState<StatboardSource>("pdga");

  const snap = useServerFn(getRatingSnapshot);
  const plan = useServerFn(getTargetPlan);
  const scoring = useServerFn(getScoringStats);
  const book = useServerFn(getCourseBook);
  const sourceRoundsFn = useServerFn(getSourceRounds);
  const getLab = useServerFn(getMyPdgaLab);
  const queryClient = useQueryClient();

  // Shared target rating — sourced from useTargetRating so a change in the
  // "Crush your goals" planner propagates across every tool in the app.
  const [targetRating, setTargetRatingRaw] = useTargetRating();
  const setTargetRating = (n: number) => setTargetRatingRaw(n);

  // Every source loads together — there is no switcher. `snapshot` is the
  // combined all-source snapshot; the per-source snapshots feed the PDGA,
  // UDisc, and DG Dashboard panels that all render on this page.
  const uid = session?.user?.id;
  const snapshotQ = useQuery({
    queryKey: statsKeys.snapshot(uid, "all"),
    queryFn: () => snap({ data: { source: null } }),
    staleTime: STATS_STALE.ratings,
  });
  const pdgaSnapQ = useQuery({
    queryKey: statsKeys.snapshot(uid, "pdga"),
    queryFn: () => snap({ data: { source: "pdga" as const } }),
    staleTime: STATS_STALE.ratings,
  });
  const udiscSnapQ = useQuery({
    queryKey: statsKeys.snapshot(uid, "udisc"),
    queryFn: () => snap({ data: { source: "udisc" as const } }),
    staleTime: STATS_STALE.ratings,
  });
  const chainSnapQ = useQuery({
    queryKey: statsKeys.snapshot(uid, "chainlink"),
    queryFn: () => snap({ data: { source: "chainlink" as const } }),
    staleTime: STATS_STALE.ratings,
  });
  const labQ = useQuery({
    // Let a failed PDGA read surface as an error instead of silently looking
    // like a player with no sanctioned rounds.
    queryFn: () => getLab(),
    queryKey: statsKeys.pdgaLab(uid),
    staleTime: STATS_STALE.ratings,
  });

  // Scoring: combined totals plus the per-source breakdowns the UDisc and
  // DG Dashboard panels show.
  const scoringQ = useQuery({
    queryKey: statsKeys.scoring(uid, "all"),
    queryFn: () => scoring({ data: { source: null } }),
    staleTime: STATS_STALE.aggregates,
    enabled: tab === "scoring" || tab === "pdga" || tab === "udisc",
  });
  const pdgaScoringQ = useQuery({
    queryKey: statsKeys.scoring(uid, "pdga"),
    queryFn: () => scoring({ data: { source: "pdga" as const } }),
    staleTime: STATS_STALE.aggregates,
    enabled: tab === "scoring" || tab === "pdga" || tab === "udisc",
  });
  const udiscScoringQ = useQuery({
    queryKey: statsKeys.scoring(uid, "udisc"),
    queryFn: () => scoring({ data: { source: "udisc" as const } }),
    staleTime: STATS_STALE.aggregates,
    enabled: tab === "scoring" || tab === "pdga" || tab === "udisc",
  });
  const chainScoringQ = useQuery({
    queryKey: statsKeys.scoring(uid, "chainlink"),
    queryFn: () => scoring({ data: { source: "chainlink" as const } }),
    staleTime: STATS_STALE.aggregates,
    enabled: tab === "scoring" || tab === "pdga" || tab === "udisc",
  });
  // Course Book is a global directory of every course played across all sources.
  const courseBookQ = useQuery({
    queryKey: statsKeys.courseBook(uid),
    queryFn: () => book({ data: { source: null } }),
    staleTime: STATS_STALE.aggregates,
    enabled: tab === "courses",
  });
  // UDisc and DG Dashboard round lists; PDGA history comes from `lab.rounds`
  // (the sanctioned cache) for full metadata.
  const udiscRoundsQ = useQuery({
    queryKey: statsKeys.sourceRounds(uid, "udisc"),
    queryFn: () =>
      sourceRoundsFn({ data: { source: "udisc" as const, limit: STATS_LIMITS.historyRounds } }),
    staleTime: STATS_STALE.rounds,
  });
  const chainRoundsQ = useQuery({
    queryKey: statsKeys.sourceRounds(uid, "chainlink"),
    queryFn: () =>
      sourceRoundsFn({ data: { source: "chainlink" as const, limit: STATS_LIMITS.historyRounds } }),
    staleTime: STATS_STALE.rounds,
  });

  // DGD series in rating charts = V1.3 DGD Round Ratings (0–1000), never the retired projection.
  const dgdHistoryFn = useServerFn(getMyDgdPreviewHistory);
  const dgdTrendQ = useQuery({
    queryKey: ["dgd-rating-v13-trend"],
    queryFn: () => dgdHistoryFn({ data: { model: "v13", rated: true, limit: 50 } }),
    staleTime: 5 * 60_000,
  });
  const dgdTrendRounds = ((dgdTrendQ.data?.rounds ?? []) as any[])
    .filter((r) => r.round_performance_display != null)
    .map((r) => ({ played_on: r.played_on, round_rating: Number(r.round_performance_display), course_name: r.course_name, score: r.score })) as unknown as TrendRow[];
  const snapshot = snapshotQ.data ?? null;
  const pdgaSnapshot = pdgaSnapQ.data ?? null;
  const lab = labQ.data ?? null;
  const scoringData = scoringQ.data ?? null;
  const courseBook = courseBookQ.data ?? null;
  const udiscRounds = udiscRoundsQ.data?.rounds ?? [];
  const chainRounds = chainRoundsQ.data?.rounds ?? [];
  const loading = snapshotQ.isLoading || labQ.isLoading;
  // A failed read must never look like a panel that is still loading.
  const overviewError = snapshotQ.isError || labQ.isError;
  const retryOverview = () => {
    void snapshotQ.refetch();
    void pdgaSnapQ.refetch();
    void labQ.refetch();
    void scoringQ.refetch();
  };
  const roundsError = udiscRoundsQ.isError || chainRoundsQ.isError;
  const roundsFetching = udiscRoundsQ.isFetching || chainRoundsQ.isFetching;
  const retryRounds = () => {
    void snapshotQ.refetch();
    void udiscRoundsQ.refetch();
    void chainRoundsQ.refetch();
  };

  // Initialize target rating from current rating if user has not set one.
  useEffect(() => {
    if (targetRating == null && snapshot?.current.rating != null) {
      setTargetRating(Math.max(950, snapshot.current.rating + 25));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.current.rating]);

  // DG Statboard is read-only for round and rating data. Every PDGA/UDisc pull
  // happens in Settings → Data & sync, so this page never syncs on its own.

  const nextDate = snapshot ? new Date(snapshot.nextUpdateIso) : null;
  const hasPdga = !!lab?.pdgaNumber;

  // One history table for every source: sanctioned PDGA rounds plus the
  // UDisc and DG Dashboard lists, newest first.
  type HistoryRow = {
    played_on: string;
    round_rating: number | null;
    event_name: string | null;
    division?: string | null;
    score: number | null;
    to_par?: number | null;
    included?: boolean | null;
    evaluated_on?: string | null;
    event_ref?: string | null;
    source: string | null;
  };
  const historyRounds = useMemo<HistoryRow[]>(() => {
    const pdgaRows: HistoryRow[] = (lab?.rounds ?? []).map((r) => ({
      played_on: r.played_on,
      round_rating: r.round_rating ?? null,
      event_name: r.event_name ?? null,
      division: r.division ?? null,
      score: r.score ?? null,
      to_par: (r as { to_par?: number | null }).to_par ?? null,
      included: r.included ?? null,
      evaluated_on: r.evaluated_on ?? null,
      event_ref: r.event_ref ?? null,
      source: r.source ?? "pdga",
    }));
    const otherRows: HistoryRow[] = [...udiscRounds, ...chainRounds].map((r) => ({
      played_on: r.played_on,
      round_rating: r.round_rating ?? null,
      event_name: r.event_name ?? r.course_name ?? null,
      score: r.score ?? null,
      to_par: (r as { to_par?: number | null }).to_par ?? null,
      source: r.source ?? null,
    }));
    // The same round can arrive from two pulls (a PDGA event that also came in
    // through an import). Keep one row per day + event + score so the table
    // never counts a round twice.
    const seen = new Set<string>();
    const merged: HistoryRow[] = [];
    for (const row of [...pdgaRows, ...otherRows]) {
      const key = [
        String(row.played_on ?? "").slice(0, 10),
        (row.event_name ?? "").trim().toLowerCase(),
        row.score ?? "",
        row.round_rating ?? "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(row);
    }
    return merged.sort((a, b) => {
      const at = Date.parse(String(a.played_on ?? ""));
      const bt = Date.parse(String(b.played_on ?? ""));
      if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
      return String(b.played_on ?? "").localeCompare(String(a.played_on ?? ""));
    });
  }, [lab?.rounds, udiscRounds, chainRounds]);

  const isPdgaRow = (r: HistoryRow) => (r.source ?? "").toLowerCase().startsWith("pdga");
  const isUdiscRow = (r: HistoryRow) => (r.source ?? "").toLowerCase().startsWith("udisc");
  const pdgaHistoryRounds = historyRounds.filter(isPdgaRow);
  const udiscHistoryRounds = historyRounds.filter(isUdiscRow);
  const dgdHistoryRounds = historyRounds.filter((r) => !isPdgaRow(r) && !isUdiscRow(r));
  const pdgaIncluded = ((lab?.rounds ?? []) as TrendRow[]).filter(
    (r) => (r as { included?: boolean }).included ?? true,
  );

  // ---- Side-by-side source comparison -------------------------------------
  // One column per source so every rating and scoring number can be read
  // across PDGA, UDisc, and DG Dashboard without changing views.
  const udiscPublished = udiscSnapQ.data?.current.source === "udisc_official";
  const compareColumns: CompareColumn[] = [
    {
      key: "pdga",
      label: "PDGA",
      sublabel:
        pdgaSnapshot?.current.source === "pdga_official"
          ? "Official PDGA ratings"
          : "PDGA rated rounds",
      chipClass: SOURCE_CHIP_CLASS.pdga,
      loading: pdgaSnapQ.isPending,
    },
    {
      key: "udisc",
      label: "UDisc",
      sublabel: udiscPublished
        ? "Native UDisc ratings"
        : "Imported rounds · no UDisc ratings on file yet",
      chipClass: SOURCE_CHIP_CLASS.udisc,
      loading: udiscSnapQ.isPending,
    },
    {
      key: "chainlink",
      label: "DG Dashboard",
      sublabel: "Rounds scored in the app",
      chipClass: SOURCE_CHIP_CLASS.chainlink,
      loading: chainSnapQ.isPending,
    },
  ];

  const snapByKey: Record<string, Snapshot | null> = {
    pdga: pdgaSnapshot,
    udisc: udiscSnapQ.data ?? null,
    chainlink: chainSnapQ.data ?? null,
  };
  const scoringByKey: Record<string, ScoringRes | null> = {
    pdga: pdgaScoringQ.data ?? null,
    udisc: udiscScoringQ.data ?? null,
    chainlink: chainScoringQ.data ?? null,
  };
  const perKey = <T,>(pick: (key: string) => T): Record<string, T> => ({
    pdga: pick("pdga"),
    udisc: pick("udisc"),
    chainlink: pick("chainlink"),
  });

  // UDisc preservation rule: the UDisc column shows only native UDisc ratings,
  // never a DGD Legacy estimate standing in for one.
  const ratingKey = <T,>(pick: (key: string) => T): Record<string, T | null> => {
    const v = perKey(pick) as Record<string, T | null>;
    if (!udiscPublished) v.udisc = null;
    return v;
  };
  const ratingCompareRows: CompareRow[] = [
    {
      label: "Rating",
      hint: "The rating each source stands behind — official where published, an estimate otherwise.",
      emphasis: true,
      values: ratingKey((k) => snapByKey[k]?.current.rating ?? null),
    },
    {
      label: "Rounds counted",
      values: ratingKey((k) => snapByKey[k]?.current.usedRounds ?? null),
    },
    {
      label: "Best round rating",
      values: ratingKey((k) => snapByKey[k]?.current.bestRound ?? null),
    },
    {
      label: "Average round rating",
      values: ratingKey((k) => snapByKey[k]?.current.average ?? null),
    },
    {
      label: "Lowest round rating",
      values: ratingKey((k) => scoringByKey[k]?.rated?.worstRating ?? null),
    },
    {
      label: "Projected next update",
      hint: "Where this source's rating is heading if you keep playing like this.",
      values: ratingKey((k) => {
        const s = snapByKey[k];
        if (s?.projected.rating == null) return null;
        const d = s.projected.delta;
        return `${s.projected.rating}${d == null ? "" : ` (${d > 0 ? "+" : ""}${d})`}`;
      }),
    },
    {
      label: "Rounds since last update",
      values: ratingKey((k) => snapByKey[k]?.roundsSinceLastUpdate ?? null),
    },
    {
      label: "Last round played",
      values: ratingKey((k) => scoringByKey[k]?.rated?.lastPlayed ?? null),
    },
  ];

  const scoringCompareRows: CompareRow[] = [
    {
      label: "Rounds on file",
      emphasis: true,
      values: perKey((k) => scoringByKey[k]?.rated?.total ?? null),
    },
    {
      label: "Rated rounds",
      hint: "Rounds the source gave a rating. UDisc counts only its own ratings (150–350).",
      values: perKey((k) => scoringByKey[k]?.rated?.ratedCount ?? null),
    },
    {
      label: "Courses played",
      values: perKey((k) => scoringByKey[k]?.courseCount ?? null),
    },
    {
      label: "Average score to par",
      hint: "Across rounds where the source recorded score to par. Each layout has its own par.",
      values: perKey((k) => {
        const r = scoringByKey[k]?.rated;
        if (r?.avgToPar == null) return "Not recorded";
        return `${r.avgToPar > 0 ? "+" : ""}${r.avgToPar === 0 ? "E" : r.avgToPar} (${r.toParRounds} rds)`;
      }),
    },
    {
      label: "Best score to par",
      values: perKey((k) => {
        const v = scoringByKey[k]?.rated?.bestToPar;
        return v == null ? "Not recorded" : v === 0 ? "E" : `${v > 0 ? "+" : ""}${v}`;
      }),
    },
    {
      label: "Holes with scores tracked",
      hint: "Hole-by-hole detail only exists for rounds scored inside DG Dashboard.",
      values: perKey((k) => scoringByKey[k]?.summary?.holesTracked ?? null),
    },
    {
      label: "Birdie or better",
      values: perKey((k) => {
        const s = scoringByKey[k]?.summary;
        return s && s.holesTracked > 0 ? `${s.birdiePct}%` : "No hole data";
      }),
    },
    {
      label: "Par",
      values: perKey((k) => {
        const s = scoringByKey[k]?.summary;
        return s && s.holesTracked > 0 ? `${s.parPct}%` : "No hole data";
      }),
    },
    {
      label: "Bogey or worse",
      values: perKey((k) => {
        const s = scoringByKey[k]?.summary;
        return s && s.holesTracked > 0 ? `${s.bogeyPlusPct}%` : "No hole data";
      }),
    },
    {
      label: "Holes with a penalty",
      values: perKey((k) => {
        const s = scoringByKey[k]?.summary;
        return s && s.holesTracked > 0 ? (s.obRate != null ? `${s.obRate}%` : "Not tracked") : "No hole data";
      }),
    },
    {
      label: "Putts per hole",
      values: perKey((k) => scoringByKey[k]?.summary?.avgPutts ?? null),
    },
  ];

  // ---- Overview inputs (per source, never mixed across scales) -------------
  const pdgaRatedNewest = (lab?.rounds ?? [])
    .filter((r) => r.round_rating != null && Number(r.round_rating) > 0)
    .sort((a, b) => String(b.played_on).localeCompare(String(a.played_on)))
    .map((r) => Number(r.round_rating));
  const udiscRatedNewest = udiscRounds
    .filter(
      (r) => r.round_rating != null && Number(r.round_rating) > 0 && Number(r.round_rating) < 400,
    )
    .sort((a, b) => String(b.played_on).localeCompare(String(a.played_on)))
    .map((r) => Number(r.round_rating));
  const insights: { label: string; value: string; note?: string }[] = [];
  if (
    pdgaSnapshot?.projected.rating != null &&
    pdgaSnapshot.projected.delta != null &&
    pdgaSnapshot.roundsSinceLastUpdate >= 2
  ) {
    const d = pdgaSnapshot.projected.delta;
    insights.push({
      label: "Next PDGA update",
      value: `${d > 0 ? "+" : ""}${d}`,
      note: `Projected from ${pdgaSnapshot.roundsSinceLastUpdate} rounds since the last update`,
    });
  }
  if (pdgaRatedNewest.length >= 20) {
    const best = Math.max(...pdgaRatedNewest.slice(0, 20));
    insights.push({ label: "Best of your last 20 PDGA rounds", value: String(best) });
  }
  if (udiscRatedNewest.length >= 8) {
    insights.push({
      label: "Best UDisc round, last 20",
      value: String(Math.max(...udiscRatedNewest.slice(0, 20))),
    });
  }
  const pl = lab?.profile;
  const synced = lab?.refreshedAt
    ? new Date(lab.refreshedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const methodology = (
    <>
      <RatingLifecyclePanel />
      <p className="text-muted-foreground">
        <span className="font-semibold text-foreground">Rounds</span> are everything you played,
        from every source. <span className="font-semibold text-foreground">Rated rounds</span> are
        the smaller set with a published or estimated rating — those are the ones that move your
        number.
      </p>
    </>
  );

  return (
    <PageShell section="statlink">
      <PageHeader
        title="DG Statboard"
        description={
          pl?.name
            ? [
                pl.name,
                pl.pdga_number || lab?.pdgaNumber
                  ? `PDGA #${pl.pdga_number ?? lab?.pdgaNumber}`
                  : null,
                pl.location,
              ]
                .filter(Boolean)
                .join(" · ")
            : "How you're playing, where it's heading, and what's driving it."
        }
        primaryAction={
          <div className="flex flex-wrap items-center justify-end gap-1">
            <span className="hidden px-2 text-[13px] text-muted-foreground sm:inline">
              {synced
                ? `PDGA synced ${synced}`
                : hasPdga
                  ? "Not synced yet"
                  : "No PDGA number linked"}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/imports">Sync data</Link>
            </Button>
            <HelpPopover label="How DGD works">{methodology}</HelpPopover>
            <HelpPopover label="Data sources">
              <DataSourceTrustPanel />
            </HelpPopover>
          </div>
        }
      />

      <StatboardTabs value={view} onChange={setView} showResearch={researchAllowed} />

      {view === "overview" ? (
        <div className="space-y-5">
          {overviewError ? (
            <StatlinkErrorState
              title="We couldn't load your rating"
              message="Your ratings didn't come back this time. Try again — nothing about your rounds has changed."
              onRetry={retryOverview}
              retrying={snapshotQ.isFetching}
            />
          ) : null}
          <DgdRatingSection />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CombinedRatingTrend chainRounds={dgdTrendRounds} />
            </div>
            <InsightsCard insights={insights} />
          </div>
          <RecentRoundsCard rows={dgdHistoryRounds.slice(0, 5)} onViewAll={() => setView("rounds")} />
          <SourceShortcuts hasPdga={hasPdga} udiscCount={udiscRounds.length} onOpen={setView} />
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                window.localStorage.setItem(DEFAULT_VIEW_STORAGE_KEY, "overview");
                setDefaultView("overview");
              }}
            >
              Open Statboard here by default
            </Button>
          </div>
        </div>
      ) : null}

      {view === "ratings" ? (
        <div className="space-y-6">
          <DgdRatingSection />
          <StatboardTier userId={uid} />
          <DgdLeaderboard meId={uid} />
          <CombinedRatingTrend chainRounds={dgdTrendRounds} />
        </div>
      ) : null}

      {view === "rounds" ? (
        <div className="space-y-4">
          <SectionTitle
            title="DG Dashboard rounds"
            note="Rounds you scored in DG Dashboard, newest first. PDGA and UDisc rounds live in their own Statboards."
          />
          {roundsError ? (
            <StatlinkErrorState
              title="Round history didn't load"
              message="We couldn't pull your rounds just now."
              onRetry={retryRounds}
              retrying={roundsFetching}
            />
          ) : (
            <RoundDatabase rounds={dgdHistoryRounds} />
          )}
        </div>
      ) : null}

      {view === "courses" ? (
        <div className="space-y-4">
          {courseBookQ.isError ? (
            <StatlinkErrorState
              title="Course Book didn't load"
              message="We couldn't gather the courses you've played just now."
              onRetry={() => void courseBookQ.refetch()}
              retrying={courseBookQ.isFetching}
            />
          ) : courseBookQ.isPending ? (
            <StatlinkPanelSkeleton label="Loading your courses…" rows={4} />
          ) : (
            <CourseBookTab data={courseBook} />
          )}
        </div>
      ) : null}

      {view === "scoring" ? (
        <div className="space-y-6">
          <SourceScoring q={chainScoringQ} source="chainlink" />
          <SkillScoringBreakdown />
          <CareerShotStatsPanel />
          <ThrowStatsCard />
          <TrackerHoleInsightsCard />
        </div>
      ) : null}

      {view === "development" ? (
        <div className="space-y-6">
          <DgdDevelopmentCard />
          <SkillEngineTab />
          <DiscPerformanceCard userId={session?.user.id ?? null} />
          <GoalsPanel userId={session?.user.id} compact />
        </div>
      ) : null}

      {view === "pdga" ? (
        <div className="space-y-6">
          {!hasPdga ? (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <p className="text-sm text-muted-foreground">Link your PDGA number to see your official rating, rounds and rating tools here.</p>
                <Button asChild size="sm"><Link to="/settings/imports">Link PDGA number</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <StatFold defaultOpen title="Rating overview" note="Your current rating, trend and recent form.">
              <PdgaIdentityHero lab={lab} snapshot={pdgaSnapshot} target={targetRating} />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <CombinedRatingTrend pdgaRounds={pdgaIncluded} />
                </div>
                <RecentPerformanceCard sources={[{ key: "pdga", label: "PDGA", ratings: pdgaRatedNewest, threshold: 10 }]} />
              </div>
              </StatFold>
              <StatFold title="PDGA rating calculator" note="Your PDGA rating window, the rounds counting right now, and what changes at the next update.">
                <Suspense fallback={<PanelFallback />}>
                  <RatingStudio
                    section="overview"
                    hideHeader
                    hideLookup
                    hideScoringBreakdown
                    hideEventHighlights
                    hideRatingsPanel
                    hideCareerHistory
                    hideExpiring
                    sharedTarget={targetRating}
                    onSharedTargetChange={setTargetRating}
                  />
                </Suspense>
                <Suspense fallback={<PanelFallback />}>
                  <RatingStudio section="expiring" hideHeader hideLookup />
                </Suspense>
              </StatFold>
              <StatFold title="PDGA rounds" note="Every sanctioned round on file, newest first.">
                <RoundDatabase rounds={pdgaHistoryRounds} />
              </StatFold>
              <StatFold title="PDGA events & career" note="Event finishes, earnings and your career by year.">
                <Suspense fallback={<PanelFallback />}>
                  <RatingStudio section="events" hideHeader hideLookup />
                </Suspense>
                <Suspense fallback={<PanelFallback />}>
                  <RatingStudio section="career" hideHeader hideLookup />
                </Suspense>
              </StatFold>
              <StatFold title="PDGA scoring" note="Birdies, pars, bogeys and scoring by hole type.">
                <SourceScoring q={pdgaScoringQ} source="pdga" />
              </StatFold>
              <StatFold title="PDGA target rating plan" note="Set the PDGA rating and date you're chasing, then test rounds before you play them.">
                <Suspense fallback={<PanelFallback />}>
                  <RatingStudio
                    section="planner"
                    hideHeader
                    hideLookup
                    sharedTarget={targetRating}
                    onSharedTargetChange={setTargetRating}
                  />
                </Suspense>
                <TargetSimulator
                  rounds={(lab?.rounds ?? []) as unknown as RatedRound[]}
                  officialRating={lab?.profile?.current_rating ?? null}
                />
              </StatFold>
            </>
          )}
        </div>
      ) : null}

      {view === "udisc" ? (
        <div className="space-y-6">
          {udiscRounds.length === 0 ? (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <p className="text-sm text-muted-foreground">Import your UDisc rounds to see your UDisc ratings, rounds and scoring here.</p>
                <Button asChild size="sm"><Link to="/settings/imports">Import UDisc rounds</Link></Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <StatFold defaultOpen title="Rating overview" note="Your UDisc rating, trend and recent form.">
              <SourceIdentityHero source="udisc" snapshot={udiscSnapQ.data ?? null} target={null} />
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <CombinedRatingTrend udiscRounds={udiscRounds as TrendRow[]} />
                </div>
                <RecentPerformanceCard sources={[{ key: "udisc", label: "UDisc", ratings: udiscRatedNewest, threshold: 5 }]} />
              </div>
              </StatFold>
              <StatFold title="UDisc rounds" note="Every imported UDisc round, newest first. UDisc ratings are shown exactly as UDisc gave them.">
                <RoundDatabase rounds={udiscHistoryRounds} />
              </StatFold>
              <StatFold title="UDisc scoring" note="Birdies, pars, bogeys and scoring by hole type.">
                <SourceScoring q={udiscScoringQ} source="udisc" />
              </StatFold>
            </>
          )}
        </div>
      ) : null}

      {view === "research" && researchAllowed ? (
        <div className="space-y-4">
          <SectionTitle
            title="Research"
            note="Preview models and calibration. Only testers and admins see this."
          />
          <DgdModelSection />
          <TierJobsButton />
        </div>
      ) : null}
    </PageShell>
  );
}

/**
 * Unified section navigation — replaces the old "All player tools" bar, the
 * inline tab strip, and the rating-studio inner tabs. Every DG Statboard section
 * and every external player tool lives here with a title + explanation.
 */
// SectionNav removed in Phase 3 — replaced by the sticky StatlinkSubnav.

/**
 * PDGA-driven Overview. Every widget on this tab is derived from the PDGA
 * number lookup (`getMyPdgaLab`) — profile, cached rounds, source counts,
 * and refresh state — with the next-update forecast layered in from the
 * rating snapshot (also seeded by PDGA rounds).
 */
/**
 * PDGA identity + official rating. Pinned to the top of DG Statboard so the
 * player's rating context is visible on every tab, not just Overview.
 */
function PdgaIdentityHero({
  lab,
  snapshot,
  target,
  embedded = false,
  extras,
}: {
  lab: PdgaLab | null;
  snapshot: Snapshot | null;
  target: number | null;
  /** Render the identity block only, for use inside a larger card. */
  embedded?: boolean;
  /** Compact explainers folded into this card so they don't take page space. */
  extras?: React.ReactNode;
}) {
  if (!lab || !lab.pdgaNumber) return null;
  const p = lab.profile;
  const included = (lab.rounds ?? []).filter((r) => r.included ?? true);
  const ratings = included.filter((r) => r.round_rating != null).map((r) => Number(r.round_rating)).filter((n) => n > 0);
  const avg = ratings.length
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : null;
  const current = p?.current_rating ?? snapshot?.current.rating ?? avg ?? null;
  const gapToTarget = target != null && current != null ? target - current : null;
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-display text-lg font-semibold">
              {p?.name ?? `Player ${lab.pdgaNumber}`}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              PDGA #{p?.pdga_number ?? lab.pdgaNumber}
            </span>
            {lab.isStale && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-500">
                Stale
              </span>
            )}
          </div>
          <div className="truncate text-[13px] text-muted-foreground">
            {p?.classification ?? ""}
            {p?.location ? `${p?.classification ? " · " : ""}${p.location}` : ""}
          </div>
        </div>
        <div className="flex items-baseline gap-2 text-right">
          <span
            className="text-[11px] uppercase tracking-widest text-muted-foreground"
            title="Published by the PDGA on the second Tuesday of every month."
          >
            Official PDGA rating
          </span>
          <span className="font-display text-2xl font-bold leading-none tabular-nums text-primary">
            {current ?? "—"}
          </span>
          {gapToTarget != null && (
            <span className="text-[13px] text-muted-foreground">
              Target {target}:{" "}
              {gapToTarget <= 0 ? (
                <span className="font-semibold text-primary">on pace</span>
              ) : (
                <b className="tabular-nums">{gapToTarget} to go</b>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {lab.refreshedAt ? (
            <>Last synced {new Date(lab.refreshedAt).toLocaleString()}</>
          ) : (
            "Never synced from PDGA"
          )}
        </span>
        <span className="text-muted-foreground/90">
          · Refresh it any time from Settings → Data &amp; sync.
        </span>
      </div>
    </>
  );

  if (embedded) return body;

  return (
    <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-background">
      <CardContent className="p-3 sm:p-4">
        {body}
        {extras ? (
          <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2 text-[13px]">
            {extras}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type TrendRow = { played_on?: string | null; round_rating?: number | string | null };

const SOURCE_SERIES = [
  { key: "pdga", name: "PDGA", color: "#38BDF8" },
  { key: "udisc", name: "UDisc", color: "#F59E0B" },
  { key: "dgd", name: "DGD", color: "#22D3EE" },
] as const;

/** Last 25 rated rounds per source, merged onto one oldest → newest timeline. */
function buildSourceTrend(sources: Record<string, TrendRow[]>) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const [key, rows] of Object.entries(sources)) {
    const recent = rows
      // Unrated rounds (null/blank/0) are skipped — Number(null) is 0 and would plot a fake crash.
      .filter((r) => r.round_rating != null && Number(r.round_rating) > 0)
      .slice(0, 25)
      .reverse();
    for (const r of recent) {
      const iso = String(r.played_on ?? "").slice(0, 10);
      if (!iso) continue;
      const point = byDate.get(iso) ?? { iso, date: iso.slice(5) };
      point[key] = Number(r.round_rating);
      byDate.set(iso, point);
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.iso).localeCompare(String(b.iso)));
}

/** One rating timeline for all three sources — the only rating trend chart on the page. */
function CombinedRatingTrend({
  pdgaRounds = [],
  udiscRounds = [],
  chainRounds = [],
}: {
  pdgaRounds?: TrendRow[];
  udiscRounds?: TrendRow[];
  chainRounds?: TrendRow[];
}) {
  // One source at a time: PDGA, UDisc and DG Dashboard ratings sit on
  // different scales, so plotting them on one axis would mislead.
  const counts = {
    pdga: pdgaRounds.length,
    udisc: udiscRounds.filter((r) => r.round_rating != null).length,
    dgd: chainRounds.filter((r) => r.round_rating != null).length,
  };
  const [picked, setPicked] = useState<"pdga" | "udisc" | "dgd" | null>(null);
  const series = picked ?? (counts.pdga ? "pdga" : counts.udisc ? "udisc" : "dgd");
  const multi = buildSourceTrend(
    series === "pdga"
      ? { pdga: pdgaRounds }
      : series === "udisc"
        ? { udisc: udiscRounds }
        : { dgd: chainRounds },
  );
  const pdgaRatings = pdgaRounds
    .filter((r) => r.round_rating != null)
    .map((r) => Number(r.round_rating))
    .filter((n) => n > 0);
  const avg = pdgaRatings.length
    ? Math.round(pdgaRatings.reduce((a, b) => a + b, 0) / pdgaRatings.length)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Rating history</CardTitle>
          <div
            role="group"
            aria-label="Rating source"
            className="flex rounded-lg border border-border p-0.5"
          >
            {SOURCE_SERIES.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={series === x.key}
                disabled={counts[x.key] === 0}
                onClick={() => setPicked(x.key)}
                className={`rounded-md px-2.5 py-1 text-[13px] font-medium disabled:opacity-40 ${series === x.key ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              >
                {x.name}
              </button>
            ))}
          </div>
        </div>
        <WidgetNote>
          Your last 25 rated rounds from one source, oldest on the left. Pick a source above.
        </WidgetNote>
        <WidgetSourceNote sources={["PDGA rated rounds", "UDisc rounds", "DG Dashboard rounds"]} />
      </CardHeader>
      <CardContent className="h-64">
        {multi.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={multi} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                domain={["dataMin - 20", "dataMax + 20"]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={{ stroke: "var(--border)" }}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--card-foreground)",
                }}
                labelStyle={{ color: "var(--card-foreground)" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {avg != null && series === "pdga" && (
                <ReferenceLine
                  y={avg}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: `PDGA avg ${avg}`,
                    fontSize: 11,
                    position: "insideTopRight",
                    fill: "var(--muted-foreground)",
                  }}
                />
              )}
              {SOURCE_SERIES.filter((x) => x.key === series).map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={2.5}
                  connectNulls
                  dot={{ r: 3, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: s.color, stroke: "var(--card)", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sync your rounds to see your rating trend across PDGA, UDisc, and DG Dashboard.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewTab({ lab, loading }: { lab: PdgaLab | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading your ratings data…</p>;
  if (!lab || !lab.pdgaNumber) {
    return (
      <Card>
        <CardContent className="py-8 space-y-3 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-primary" />
          <p className="font-medium">Add your PDGA number to unlock DG Statboard</p>
          <p className="text-sm text-muted-foreground">
            Set your PDGA number in your profile, then sync to pull your full rating history, event
            finishes, and round-by-round data.
          </p>
          <Link to="/me/edit">
            <Button variant="outline" className="mt-2">
              Edit profile
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }
  const p = lab.profile;
  const rounds = lab.rounds ?? [];
  const included = rounds.filter((r) => r.included ?? true);
  const ratings = included.filter((r) => r.round_rating != null).map((r) => Number(r.round_rating)).filter((n) => n > 0);
  const best = ratings.length ? Math.max(...ratings) : null;
  const worst = ratings.length ? Math.min(...ratings) : null;
  const avg = ratings.length
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)
    : null;
  const sc = lab.sourceCounts ?? { pdga: 0, tournament: 0, league: 0, casual: 0 };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-background p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-primary">
              PDGA #{p?.pdga_number ?? lab.pdgaNumber}
            </div>
            <div className="mt-1 font-display text-2xl font-semibold">
              {p?.name ?? `Player ${lab.pdgaNumber}`}
            </div>
            <div className="text-sm text-muted-foreground">
              {p?.classification ?? ""}
              {p?.location ? ` · ${p.location}` : ""}
            </div>
          </div>
          <div className="text-right">
            <div
              className="text-xs uppercase tracking-widest text-muted-foreground"
              title="Published by the PDGA on the second Tuesday of every month."
            >
              Official PDGA Rating
            </div>
            <div className="font-display text-5xl font-bold text-primary tabular-nums">
              {p?.current_rating ?? avg ?? "—"}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          {lab.refreshedAt ? (
            <span className={lab.isStale ? "text-amber-500" : "text-muted-foreground"}>
              Last synced {new Date(lab.refreshedAt).toLocaleString()}
              {lab.isStale ? " · stale" : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Never synced from PDGA</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniKPI label="PDGA rated rounds" value={ratings.length} />
        <MiniKPI label="Highest round rating" value={best ?? "—"} tone="success" />
        <MiniKPI label="Average round rating" value={avg ?? "—"} />
        <MiniKPI label="Lowest round rating" value={worst ?? "—"} tone="danger" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rounds by source</CardTitle>
          <p className="text-xs text-muted-foreground">
            Verified rounds imported from your connected platforms.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-3">
          <SourceStat label="PDGA" count={sc.pdga} tint="text-primary" />
          <SourceStat label="UDisc" count={sc.udisc ?? 0} tint="text-emerald-400" />
          <SourceStat label="Disc Golf Scene" count={sc.dgs ?? 0} tint="text-sky-400" />
        </CardContent>
      </Card>
    </div>
  );
}

type SourceRoundRow = {
  played_on: string;
  round_rating: number | null;
  course_name: string | null;
  score: number | null;
  to_par: number | null;
  source: string;
  event_name?: string | null;
};

function MiniKPI({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "danger";
}) {
  const color = tone === "success" ? "text-emerald-400" : tone === "danger" ? "text-red-400" : "";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function SourceStat({ label, count, tint }: { label: string; count: number; tint: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-2xl font-bold tabular-nums ${tint}`}>{count}</div>
    </div>
  );
}

function sourceClass(src: string): string {
  switch (src) {
    case "pdga":
      return "border-primary/40 bg-primary/10 text-primary";
    case "tournament":
      return "border-amber-500/40 bg-amber-500/10 text-amber-400";
    case "league":
      return "border-sky-500/40 bg-sky-500/10 text-sky-400";
    case "casual":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function TargetTab({
  planFn,
  currentRating,
  nextDate,
  target: sharedTarget,
  onTargetChange,
}: {
  planFn: (args: {
    data: { targetRating: number; remainingRounds: number };
  }) => Promise<TargetPlan>;
  currentRating: number | null;
  nextDate: Date | null;
  target?: number | null;
  onTargetChange?: (n: number) => void;
}) {
  const [target, setTarget] = useState(
    String(sharedTarget ?? Math.max(950, (currentRating ?? 900) + 25)),
  );
  useEffect(() => {
    if (sharedTarget != null) setTarget(String(sharedTarget));
  }, [sharedTarget]);
  const [rounds, setRounds] = useState("6");
  const [result, setResult] = useState<TargetPlan | null>(null);
  const [busy, setBusy] = useState(false);

  async function calc() {
    setBusy(true);
    try {
      const r = await planFn({
        data: { targetRating: Number(target), remainingRounds: Number(rounds) },
      });
      setResult(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="space-y-0">
          <div className="flex flex-row items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Rating target planner</CardTitle>
          </div>
          <WidgetNote>
            Pick the rating you're chasing and how many rounds you'll play — we'll show the scoring
            it takes to get there.
          </WidgetNote>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="target">Target rating</Label>
              <Input
                id="target"
                inputMode="numeric"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) onTargetChange?.(n);
                }}
              />
            </div>
            <div>
              <Label htmlFor="rounds">Rounds ahead</Label>
              <Input
                id="rounds"
                inputMode="numeric"
                value={rounds}
                onChange={(e) => setRounds(e.target.value)}
              />
            </div>
          </div>
          {nextDate && (
            <p className="text-xs text-muted-foreground">
              Aim before <b>{formatUpdateDate(nextDate)}</b> to affect the next update.
            </p>
          )}
          <Button onClick={calc} disabled={busy} className="w-full">
            {busy ? "Calculating…" : "Show me what to shoot"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your plan</CardTitle>
          <WidgetNote>
            The round ratings you'd need to average to reach the target above, worked out from your
            current rating window.
          </WidgetNote>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {!result ? (
            <p className="text-muted-foreground">
              Enter a target and rounds to see the required scoring.
            </p>
          ) : (
            <>
              <p className="text-base">{result.message}</p>
              {result.requiredRoundRating != null && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="text-xs uppercase text-muted-foreground">
                    Required avg round rating
                  </div>
                  <div className="text-3xl font-bold text-primary tabular-nums">
                    {result.requiredRoundRating}
                  </div>
                </div>
              )}
              <div>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  Score examples
                </div>
                <ul className="space-y-1">
                  {result.scoreExamples.map((e) => (
                    <li key={e.ssa} className="flex items-center gap-2">
                      <Flag className="h-3.5 w-3.5 text-muted-foreground" /> {e.label}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScoringTab({
  summary,
  rounds,
  courses,
  rated,
  source,
  holesMissingPar = 0,
}: {
  summary: ScoringSummary | null;
  rounds: number;
  courses: number;
  rated?: ScoringRes["rated"] | null;
  source?: StatboardSource;
  holesMissingPar?: number;
}) {
  void source;
  const hasHoles = summary && summary.holesTracked > 0;

  const hasRated = rated && rated.total > 0;
  if (!hasHoles && !hasRated) {
    return (
      <MascotEmptyState
        intent="analytics"
        title="Nothing scored yet."
        description="Play a round in DG Dashboard or sync your PDGA/UDisc history to unlock par, birdie, and bogey breakdowns."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ShareToFeedButton
          label="Share scoring stats"
          title="Share your scoring"
          draft={() =>
            scoringMilestoneDraft({
              birdiePct: summary?.birdiePct ?? null,
              parPct: summary?.parPct ?? null,
              bogeyPlusPct: summary?.bogeyPlusPct ?? null,
              holesTracked: summary?.holesTracked ?? null,
              ratedRounds: rated?.total ?? null,
              avgRoundRating: rated?.avgRating ?? null,
              bestRoundRating: rated?.bestRating ?? null,
            })
          }
        />
      </div>
      {/* Rated-round totals live on the Ratings view — Scoring stays hole-by-hole. */}

      {hasHoles && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MetricCard
              label="Birdie or better"
              value={`${summary!.birdiePct}%`}
              sub={`${summary!.aces + summary!.eagles + summary!.birdies} holes`}
            />
            <MetricCard
              label="Par rate"
              value={`${summary!.parPct}%`}
              sub={`${summary!.pars} holes`}
            />
            <MetricCard
              label="Bogey+ rate"
              value={`${summary!.bogeyPlusPct}%`}
              sub={`${summary!.bogeys + summary!.doublePlus} holes`}
            />
            <MetricCard
              label="OB rate"
              value={summary!.obRate != null ? `${summary!.obRate}%` : "Not tracked"}
              sub={summary!.avgPutts != null ? `avg putts ${summary!.avgPutts}` : ""}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hole outcomes</CardTitle>
              <WidgetNote>
                Every hole you've recorded, split by result — aces through bogeys and worse — with
                each share of your total holes.
              </WidgetNote>
              <WidgetSourceNote
                sources={["Hole-by-hole scorecards"]}
                note="Rounds saved as a total score only can't be broken down here."
              />
            </CardHeader>
            <CardContent>
              {(() => {
                const t = summary!.holesTracked || 1;
                const rows: Array<{ label: string; count: number; tone?: string }> = [
                  { label: "Aces", count: summary!.aces, tone: "text-amber-400" },
                  { label: "Eagles", count: summary!.eagles, tone: "text-emerald-500" },
                  { label: "Birdies", count: summary!.birdies, tone: "text-primary" },
                  { label: "Pars", count: summary!.pars },
                  { label: "Bogeys", count: summary!.bogeys, tone: "text-orange-400" },
                  { label: "Double+", count: summary!.doublePlus, tone: "text-red-400" },
                ];
                return (
                  <div className="space-y-2">
                    {rows.map((r) => {
                      const pct = +((100 * r.count) / t).toFixed(1);
                      return (
                        <div key={r.label} className="flex items-center gap-3">
                          <div className={`w-20 text-sm font-medium ${r.tone ?? ""}`}>
                            {r.label}
                          </div>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-primary/70"
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                          <div className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                            <span className="font-mono font-semibold text-foreground">
                              {r.count}
                            </span>{" "}
                            · {pct}%
                          </div>
                        </div>
                      );
                    })}
                    <p className="pt-2 text-xs text-muted-foreground">
                      {summary!.holesTracked} holes tracked across {rounds} round
                      {rounds === 1 ? "" : "s"} on {courses} course{courses === 1 ? "" : "s"}.
                      {holesMissingPar > 0 && (
                        <>
                          {" "}
                          {holesMissingPar} scored hole{holesMissingPar === 1 ? "" : "s"} are left
                          out because their layout has no par on file — add pars in the course
                          builder to include them.
                        </>
                      )}
                    </p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scoring by par</CardTitle>
              <WidgetNote>
                How you score on par 3s, 4s and 5s — average strokes and how often you birdie each
                type.
              </WidgetNote>
              <WidgetSourceNote
                sources={["Hole-by-hole scorecards"]}
                note="Only rounds with every hole recorded are counted."
              />
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left py-1">Par</th>
                    <th className="text-left">Holes</th>
                    <th className="text-left">Avg to par</th>
                  </tr>
                </thead>
                <tbody>
                  {summary!.byPar.map((r) => (
                    <tr key={r.par} className="border-t border-border">
                      <td className="py-1.5">Par {r.par}</td>
                      <td>{r.count}</td>
                      <td className={r.scoringAvg <= 0 ? "text-primary font-medium" : ""}>
                        {r.scoringAvg > 0 ? "+" : ""}
                        {r.scoringAvg}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const LAYOUT_SOURCE_LABEL: Record<string, string> = {
  app: "DG Dashboard",
  pdga: "PDGA",
  udisc: "UDisc",
  disc_golf_scene: "PDGA",
};


function CourseBookRows({ c }: { c: CourseBook["courses"][number] }) {
  const layouts = c.layouts ?? [];
  const single = layouts.length === 1 ? layouts[0] : null;
  const [open, setOpen] = useState(false);
  const multi = layouts.length > 1;
  return (
    <>
      <tr className="border-t border-border">
        <td className="px-3 py-2 font-medium">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{c.name ?? "Course"}</span>
            {single ? (
              <Badge variant="outline" className="text-xs">
                {LAYOUT_SOURCE_LABEL[single.source]}
              </Badge>
            ) : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {[c.city ? `${c.city}${c.region ? `, ${c.region}` : ""}` : null,
              single ? (single.layoutName ?? "Layout not recorded") : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {multi ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
              {open ? "Hide" : "Show"} {layouts.length} layouts
            </button>
          ) : null}
        </td>
        <td>{c.rounds}</td>
        {single ? (
          <>
            <td>{single.bestScore ?? "—"}</td>
            <td>{fmtToPar(single.bestToPar)}</td>
            <td>{fmtToPar(single.avgToPar)}</td>
            <td>{single.bestRating ?? "—"}</td>
            <td>{single.avgRating ?? "—"}</td>
          </>
        ) : multi ? (
          <td colSpan={5} className="text-xs text-muted-foreground">
            Played on {layouts.length} layouts — open to see each one.
          </td>
        ) : (
          <>
            <td>{c.bestScore ?? "—"}</td>
            <td>—</td>
            <td>{fmtToPar(c.avgToPar)}</td>
            <td>{c.bestRating ?? "—"}</td>
            <td>{c.avgRating ?? "—"}</td>
          </>
        )}
        <td className="text-muted-foreground">{c.lastPlayed?.slice(0, 10)}</td>
        <td className="px-3 py-2 text-right">
          <ShareToFeedButton
            iconOnly
            variant="ghost"
            label="Share course best"
            title={`Share your best at ${c.name ?? "this course"}`}
            draft={() =>
              coursePrDraft({
                courseName: c.name ?? null,
                bestScore: (single ?? c).bestScore ?? null,
                bestRating: (single ?? c).bestRating ?? null,
                rounds: c.rounds,
                city: c.city ? `${c.city}${c.region ? `, ${c.region}` : ""}` : null,
              })
            }
          />
        </td>
      </tr>
      {multi && open
        ? layouts.map((l) => (
            <tr key={l.key} className="bg-muted/20">
              <td className="py-2 pl-9 pr-3">
                <div className="text-sm">{l.layoutName ?? "Layout not recorded"}</div>
                <div className="text-xs text-muted-foreground">{LAYOUT_SOURCE_LABEL[l.source]}</div>
              </td>
              <td>{l.rounds}</td>
              <td>{l.bestScore ?? "—"}</td>
              <td>{fmtToPar(l.bestToPar)}</td>
              <td>{fmtToPar(l.avgToPar)}</td>
              <td>{l.bestRating ?? "—"}</td>
              <td>{l.avgRating ?? "—"}</td>
              <td className="text-muted-foreground">{l.lastPlayed.slice(0, 10)}</td>
              <td />
            </tr>
          ))
        : null}
    </>
  );
}

function CourseBookTab({ data }: { data: CourseBook | null }) {
  if (!data || data.courses.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Play a rated round to start your personal course book.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Your courses</CardTitle>
        <WidgetNote>
          Every course you've scored a round on. Numbers are shown per layout and per rating
          source, since the same score rates differently on each layout.
        </WidgetNote>
        <WidgetSourceNote
          sources={["PDGA", "UDisc imports", "DG Dashboard rounds"]}
          note="Practice sessions are left out, and tournament rounds only appear here when the round lists an actual course."
        />
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-xs uppercase text-muted-foreground bg-muted/30">
            <tr>
              <th className="text-left px-3 py-2">Course / layout</th>
              <th className="text-left">Rounds</th>
              <th className="text-left">Best</th>
              <th className="text-left">Best to par</th>
              <th className="text-left">Avg to par</th>
              <th className="text-left">Best rating</th>
              <th className="text-left">Avg rating</th>
              <th className="text-left">Last played</th>
              <th className="text-right px-3 py-2">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.courses.map((c) => (
              <CourseBookRows key={c.course_id} c={c} />
            ))}
          </tbody>
        </table>
        </div>
        {(() => {
          const latest = data.courses.reduce<string | null>(
            (acc, c) => (c.lastPlayed && (acc == null || c.lastPlayed > acc) ? c.lastPlayed : acc),
            null,
          );
          const unrated = data.courses.filter((c) => c.avgRating == null).length;
          const sourceLabel =
            data.source === "pdga"
              ? "PDGA-verified rounds"
              : data.source === "udisc"
                ? "UDisc imports"
                : "rounds scored in DG Dashboard";
          return (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              {data.courses.length} course{data.courses.length === 1 ? "" : "s"} from {sourceLabel}
              {latest ? <> · last played {latest.slice(0, 10)}</> : null}.
              {unrated > 0 ? (
                <>
                  {" "}
                  {unrated} course{unrated === 1 ? " has" : "s have"} no round rating on file yet,
                  so rating columns stay blank there.
                </>
              ) : null}
            </p>
          );
        })()}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-primary">{value}</div>
        {sub != null && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/**
 * SourceOverview — dashboard for UDisc and DG Dashboard round sources.
 * PDGA has its own bespoke Overview tied to the sanctioned profile lookup;
 * for the other sources we render a clean, source-scoped summary built
 * entirely from `getRatingSnapshot(source)` + `getScoringStats(source)`.
 */
/** Shared labels for the non-PDGA statboards so the hero and overview stay in sync. */
function sourceMeta(source: "udisc" | "chainlink", published = false) {
  return source === "udisc"
    ? {
        title: "UDisc Statboard",
        chip: "UDisc",
        chipClass: "border-orange-500/40 bg-orange-500/10 text-orange-500",
        ratingLabel: published ? "UDisc Round Ratings" : "Mock DGD Rating (UDisc)",
        ratingHint: published
          ? "Built from the round ratings UDisc published for your rounds."
          : "DGD Rating estimate from your UDisc-imported rounds. Not an official PDGA rating.",
        gradient: "from-orange-500/10 via-background to-background border-orange-500/30",
        blurb: published
          ? "These numbers use the round ratings UDisc published for your rounds — UDisc's own rating is the true rating here. Rounds UDisc never rated fall back to a DG Dashboard estimate."
          : "UDisc rounds are imported from your UDisc account. Ratings shown are UDisc's own round ratings. Eligible singles rounds also count toward your DGD Rating.",
      }
    : {
        title: "DG Dashboard Statboard",
        chip: "DG Dashboard",
        chipClass: "border-primary/40 bg-primary/10 text-primary",
        ratingLabel: "DG Dashboard Rating",
        ratingHint: "Estimated from rounds you scored inside DG Dashboard using PDGA-style logic.",
        gradient: "from-primary/10 via-background to-background border-primary/30",
        blurb:
          "Rounds scored live in DG Dashboard. These use identical PDGA-style methodology as the sanctioned tab, but the data is tracked separately from your UDisc and PDGA rounds.",
      };
}

/** Same slot and shape as PdgaIdentityHero, for the UDisc and DG Dashboard sources. */
function SourceIdentityHero({
  source,
  snapshot,
  target,
}: {
  source: "udisc" | "chainlink";
  snapshot: Snapshot | null;
  target: number | null;
}) {
  const meta = sourceMeta(source, snapshot?.current.source === "udisc_official");
  const current = snapshot?.current.rating ?? null;
  const used = snapshot?.current.usedRounds ?? 0;
  const gapToTarget = target != null && current != null ? target - current : null;
  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${meta.gradient}`}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-widest ${meta.chipClass}`}
            >
              {meta.chip}
            </div>
            <div className="mt-1 font-display text-2xl font-semibold sm:text-3xl truncate">
              {meta.title}
            </div>
            <div className="max-w-xl text-base text-muted-foreground">{meta.blurb}</div>
          </div>
          <div className="text-right">
            <div
              className="text-xs uppercase tracking-widest text-muted-foreground"
              title={meta.ratingHint}
            >
              {meta.ratingLabel}
            </div>
            <div className="font-display text-5xl font-bold tabular-nums text-primary leading-none">
              {current ?? "—"}
            </div>
            {gapToTarget != null && (
              <div className="mt-1 text-sm text-muted-foreground">
                Target {target}:{" "}
                {gapToTarget <= 0 ? (
                  <span className="text-primary font-semibold">on pace</span>
                ) : (
                  <b className="tabular-nums">{gapToTarget} to go</b>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {used > 0
              ? `Estimated from ${used} rated round${used === 1 ? "" : "s"}`
              : `No rated ${meta.chip} rounds yet`}
          </span>
          <span className="text-sm text-muted-foreground/90">
            Import or sync rounds any time from Settings → Data &amp; sync.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function StatboardTier({ userId }: { userId: string | undefined }) {
  const me = useDgdIdentity(userId);
  const r = me.data?.dgd_rating;
  return <TierProgressCard userId={userId} rating={r == null ? null : Math.round(r)} />;
}

function TierJobsButton() {
  const run = useServerFn(runTierJobsNow);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await run();
          toast.success(`Tiers updated for ${r.tier_done} player${r.tier_done === 1 ? "" : "s"}${r.tier_failed ? ` · ${r.tier_failed} need another try` : ""}.`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't update Tiers.");
        } finally { setBusy(false); }
      }}
    >
      {busy ? "Updating Tiers…" : "Update player Tiers now"}
    </Button>
  );
}

/** Scoring for one source — each Statboard counts its own rounds only. */
function SourceScoring({
  q,
  source,
}: {
  q: { data?: ScoringRes; isError: boolean; isPending: boolean; isFetching: boolean; refetch: () => unknown };
  source: StatboardSource;
}) {
  if (q.isError)
    return (
      <StatlinkErrorState
        title="Scoring didn't load"
        message="We couldn't add up your birdies and bogeys just now."
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  if (q.isPending) return <StatlinkPanelSkeleton label="Adding up your scoring…" rows={3} />;
  return (
    <ScoringTab
      summary={q.data?.summary ?? null}
      rounds={q.data?.roundCount ?? 0}
      courses={q.data?.courseCount ?? 0}
      rated={q.data?.rated ?? null}
      holesMissingPar={q.data?.holesMissingPar ?? 0}
      source={source}
    />
  );
}

/** Overview pointers to the separate PDGA and UDisc Statboards. */
function SourceShortcuts({
  hasPdga,
  udiscCount,
  onOpen,
}: {
  hasPdga: boolean;
  udiscCount: number;
  onOpen: (v: StatboardView) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button type="button" onClick={() => onOpen("pdga")} className="rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/50">
        <div className="font-semibold">PDGA Statboard</div>
        <div className="text-sm text-muted-foreground">
          {hasPdga ? "Official rating, rating calculator, sanctioned rounds and events." : "Link your PDGA number to see your sanctioned stats."}
        </div>
      </button>
      <button type="button" onClick={() => onOpen("udisc")} className="rounded-xl border border-border bg-card p-4 text-left hover:bg-muted/50">
        <div className="font-semibold">UDisc Statboard</div>
        <div className="text-sm text-muted-foreground">
          {udiscCount ? `${udiscCount} imported rounds, UDisc ratings and scoring.` : "Import your UDisc rounds to see them here."}
        </div>
      </button>
    </div>
  );
}

function StatFold({
  title,
  note,
  defaultOpen,
  children,
}: {
  title: string;
  note: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-foreground">{title}</span>
          <span className="block text-sm text-muted-foreground">{note}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 border-t border-border p-4">{children}</div>
    </details>
  );
}
