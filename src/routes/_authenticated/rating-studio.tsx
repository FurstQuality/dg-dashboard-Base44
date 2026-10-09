import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sparkles,
  TrendingUp,
  Search,
  Trash2,
  Plus,
  RefreshCw,
  Trophy,
  Calendar,
  Target,
  Info,
  Share2,
  Swords,
} from "lucide-react";
import { SharePlayerDialog } from "@/components/statboard/share-player-dialog";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Legend,
} from "recharts";
import { toast } from "sonner";
import {
  lookupPdgaPlayer,
  listMyPlans,
  savePlan,
  deletePlan,
  getMyPdgaLab,
} from "@/lib/pdga-lab.functions";
import { getMyPlayerBreakdowns, type PlayerBreakdowns } from "@/lib/player-breakdowns.functions";
import { readTargetRating, writeTargetRating } from "@/lib/use-target-rating";
import { RatingsPanel } from "@/components/ratings-panel";
import { MascotEmptyState } from "@/components/shell";

import {
  currentRating,
  monthlyHistory,
  expiringSoon,
  pdgaUpdateOnOrAfter,
  ratingExtremes,
  projectPlan,
  solveRequiredAverage,
  suggestPlannedRounds,
  assessRealism,
  statsSummary,
  ratingBreakdown,
  type RatedRound,
  type PlanStrategy,
} from "@/lib/rating-projection";

const searchSchema = z.object({
  pdga: z.string().catch("").default(""),
});

// The Ratings Calculator now lives on the DG Statboard Overview tab. This
// route stays as a compatibility forwarder so saved links keep working.
export const Route = createFileRoute("/_authenticated/rating-studio")({
  validateSearch: searchSchema,
  beforeLoad: () => {
    throw redirect({ to: "/stats", search: { tab: "overview" } });
  },
});

type PlayerProfile = {
  pdga_number: string;
  name: string | null;
  location: string | null;
  classification: string | null;
  current_rating: number | null;
  rounds_used: number | null;
  std_dev: number | null;
  drop_below: number | null;
  last_changed: string | null;
  next_update: string | null;
};

type LookupResult = Awaited<ReturnType<typeof lookupPdgaPlayer>>;

import { chartColors, chartSeriesPalette } from "@/lib/chart-colors";

const PLAN_COLORS = chartSeriesPalette;

export function RatingStudio({
  initialPdga = "",
  onPdgaChange,
  sharedTarget,
  onSharedTargetChange,
  section,
  hideHeader,
  hideLookup,
  hideScoringBreakdown,
  hideEventHighlights,
  hideRatingsPanel,
  hideCareerHistory,
  hideExpiring,
  autoLoadMine = true,
  onFaceOff,
  faceOffPdga,
  udiscRounds = [],
  chainRounds = [],
}: {
  initialPdga?: string;
  onPdgaChange?: (pdga: string) => void;
  sharedTarget?: number | null;
  onSharedTargetChange?: (n: number) => void;
  /** UDisc rated rounds, plotted alongside PDGA on the momentum chart. */
  udiscRounds?: RatedRound[];
  /** DG Dashboard rated rounds, plotted alongside PDGA on the momentum chart. */
  chainRounds?: RatedRound[];
  /** When set, hides the inner tab bar and renders only this section. */
  section?:
    | "overview"
    | "history"
    | "projection"
    | "planner"
    | "scoringBreakdown"
    | "expiring"
    | "career"
    | "momentum"
    | "events";
  hideHeader?: boolean;
  hideLookup?: boolean;
  hideScoringBreakdown?: boolean;
  /** Hides Event Highlights when another view shows it. */
  hideEventHighlights?: boolean;
  /** Hides the inner "Your Ratings" summary when the page already shows it. */
  hideRatingsPanel?: boolean;
  /** Hides the career totals card when another view shows it. */
  hideCareerHistory?: boolean;
  /** Hides the rolling-off rounds panel when another view shows it. */
  hideExpiring?: boolean;
  /** When false, the lookup starts blank instead of loading the signed-in player. */
  autoLoadMine?: boolean;
  /** Shown after a lookup so the player can jump straight into a Face Off. */
  onFaceOff?: (pdgaNumber: string) => void;
  /** The signed-in player's PDGA number — enables the Face Off share link. */
  faceOffPdga?: string | null;
} = {}) {
  const lookup = useServerFn(lookupPdgaPlayer);
  const getMine = useServerFn(getMyPdgaLab);
  const listPlans = useServerFn(listMyPlans);
  const save = useServerFn(savePlan);
  const remove = useServerFn(deletePlan);

  const [pdgaInput, setPdgaInput] = useState(initialPdga);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rounds, setRounds] = useState<RatedRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [isMine, setIsMine] = useState(false);
  const [plans, setPlans] = useState<{ plans: any[]; events: any[] }>({ plans: [], events: [] });
  const [syncMeta, setSyncMeta] = useState<{ refreshedAt: string | null; isStale: boolean }>({
    refreshedAt: null,
    isStale: false,
  });
  const [shareOpen, setShareOpen] = useState(false);

  const runLookup = useCallback(
    async (num: string) => {
      const n = parseInt(num.replace(/\D/g, ""), 10);
      if (!n) return;
      setLoading(true);
      try {
        const res = (await lookup({ data: { pdgaNumber: n } })) as LookupResult;
        setProfile(res.profile as PlayerProfile);
        setRounds(((res as any).rounds ?? []) as RatedRound[]);
        setIsMine(false);
        onPdgaChange?.(String(n));
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Lookup failed");
      } finally {
        setLoading(false);
      }
    },
    [lookup, onPdgaChange],
  );

  const loadMine = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await getMine();
      if (mine?.pdgaNumber) {
        setProfile(mine.profile as PlayerProfile);
        setRounds((mine.rounds ?? []) as RatedRound[]);
        setPdgaInput(mine.pdgaNumber);
        setIsMine(true);
        setSyncMeta({ refreshedAt: mine.refreshedAt ?? null, isStale: !!mine.isStale });
        return mine;
      }
    } catch {
      /* not signed in or no data */
    } finally {
      setLoading(false);
    }
    return null;
  }, [getMine]);

  useEffect(() => {
    if (initialPdga) {
      runLookup(initialPdga);
    } else if (!autoLoadMine) {
      /* Blank by default: the player types a PDGA number to load someone. */
    } else {
      // Read-only: show the signed-in player's saved PDGA data. Refreshing it
      // happens only in Settings → Data & sync.
      void loadMine();
    }
    listPlans()
      .then((res) => setPlans(res as any))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const includedRounds = useMemo(() => rounds.filter((r) => r.included ?? true), [rounds]);
  const baseRating = profile?.current_rating ?? currentRating(includedRounds);
  const extremes = ratingExtremes(includedRounds);
  const events = useMemo(() => {
    const s = new Set<string>();
    for (const r of rounds) s.add(`${r.event_name}|${r.played_on}`);
    return s.size;
  }, [rounds]);

  const history = useMemo(() => monthlyHistory(includedRounds, 12), [includedRounds]);
  // monthlyHistory only counts PDGA-eligible rounds, so the UDisc and DG
  // Dashboard series are computed on source-stripped copies of their rounds.
  const udiscHistory = useMemo(
    () =>
      udiscRounds.length
        ? monthlyHistory(
            udiscRounds.map((r) => ({ ...r, source: null })),
            12,
          )
        : [],
    [udiscRounds],
  );
  const chainHistory = useMemo(
    () =>
      chainRounds.length
        ? monthlyHistory(
            chainRounds.map((r) => ({ ...r, source: null })),
            12,
          )
        : [],
    [chainRounds],
  );

  const expiring = useMemo(() => expiringSoon(includedRounds), [includedRounds]);

  return (
    <div className="space-y-4">
      {hideHeader ? null : (
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <h1 className="font-display text-2xl font-semibold">Ratings Calculator</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Type a PDGA number to pull the player's rating history, project future rounds, and build
            a plan to hit a goal rating.
          </p>
        </header>
      )}

      {hideLookup ? null : (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="pdga">PDGA Number</Label>
              <Input
                id="pdga"
                inputMode="numeric"
                placeholder="e.g. 12345"
                value={pdgaInput}
                onChange={(e) => setPdgaInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runLookup(pdgaInput);
                }}
              />
            </div>
            <Button onClick={() => runLookup(pdgaInput)} disabled={loading}>
              {loading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Look up
            </Button>
            {profile ? (
              <>
                {isMine ? null : (
                  <Button variant="outline" onClick={() => runLookup(pdgaInput)} disabled={loading}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                  </Button>
                )}
                <Button variant="outline" onClick={() => setShareOpen(true)} disabled={loading}>
                  <Share2 className="mr-2 h-4 w-4" /> Share
                </Button>
                {onFaceOff && !isMine ? (
                  <Button
                    variant="secondary"
                    onClick={() => onFaceOff(profile.pdga_number)}
                    disabled={loading}
                  >
                    <Swords className="mr-2 h-4 w-4" /> Face off with this player
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
          {isMine ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span className="text-primary">
                Showing your saved PDGA data — live across the app.
              </span>
              {syncMeta.refreshedAt ? (
                <span className={syncMeta.isStale ? "text-amber-500" : "text-muted-foreground"}>
                  Last synced {new Date(syncMeta.refreshedAt).toLocaleString()}
                  {syncMeta.isStale ? " · refreshing…" : ""}
                </span>
              ) : (
                <span className="text-muted-foreground">Not yet synced from PDGA</span>
              )}
            </div>
          ) : null}
        </div>
      )}

      {profile && !hideLookup ? (
        <PlayerHeader profile={profile} rating={baseRating} rounds={includedRounds} />
      ) : null}

      {!profile ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Add your PDGA number in your profile to auto-load your data, or type any PDGA number above
          to explore another player.
        </div>
      ) : (
        <Tabs value={section ?? undefined} defaultValue={section ?? "overview"}>
          {section ? null : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>

                <TabsTrigger value="planner">Planner</TabsTrigger>
              </TabsList>
              <Link
                to="/compare"
                className="text-sm text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                ⚔ Compare vs another player →
              </Link>
            </div>
          )}

          <TabsContent value="overview" className="space-y-4">
            <StatsOverview
              rounds={rounds}
              baseRating={baseRating}
              history={history}
              isMine={isMine}
              hideScoringBreakdown={hideScoringBreakdown}
              hideEventHighlights={hideEventHighlights}
              hideRatingsPanel={hideRatingsPanel}
              hideCareerHistory={hideCareerHistory}
            />
            {!hideExpiring && expiring.length ? <ExpiringSection expiring={expiring} /> : null}
          </TabsContent>

          <TabsContent value="career" className="space-y-4">
            <CareerHistoryCard rounds={rounds} />
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <EventHighlightsSection isMine={isMine} />
          </TabsContent>

          <TabsContent value="momentum" className="space-y-4">
            <MomentumFormPanel
              rounds={rounds}
              baseRating={baseRating}
              history={history}
              udiscHistory={udiscHistory}
              chainHistory={chainHistory}
            />
          </TabsContent>

          <TabsContent value="expiring" className="space-y-4">
            {expiring.length ? <ExpiringSection expiring={expiring} /> : null}
          </TabsContent>

          <TabsContent value="planner" className="space-y-4">
            <PlannerPanel
              hideHeader={hideHeader}
              sharedTarget={sharedTarget}
              onSharedTargetChange={onSharedTargetChange}
              baseRating={baseRating}
              rounds={includedRounds}
              pdgaNumber={profile.pdga_number}
              plans={plans.plans}
              planEvents={plans.events}
              onSave={async (payload) => {
                await save({ data: payload });
                const fresh = await listPlans();
                setPlans(fresh as any);
              }}
              onDelete={async (id) => {
                await remove({ data: { id } });
                setPlans((p) => ({
                  plans: p.plans.filter((x) => x.id !== id),
                  events: p.events.filter((e) => e.plan_id !== id),
                }));
              }}
            />
          </TabsContent>
        </Tabs>
      )}

      {profile ? (
        <SharePlayerDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          pdgaNumber={profile.pdga_number}
          playerName={profile.name}
          currentRating={profile.current_rating}
          faceOff={
            faceOffPdga && faceOffPdga !== profile.pdga_number
              ? { a: faceOffPdga, b: profile.pdga_number }
              : null
          }
        />
      ) : null}
    </div>
  );
}

/* --------------------------------- Header -------------------------------- */

function PlayerHeader({
  profile,
  rating,
  rounds,
}: {
  profile: PlayerProfile;
  rating: number;
  rounds: RatedRound[];
}) {
  const derived = useMemo(() => {
    const ratings = rounds
      .map((r) => Number(r.round_rating))
      .filter((n) => Number.isFinite(n)) as number[];
    const n = ratings.length;
    const mean = n ? ratings.reduce((a, b) => a + b, 0) / n : 0;
    const variance = n > 1 ? ratings.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
    const stdDev = Math.sqrt(variance);
    const min = n ? Math.min(...ratings) : null;
    // PDGA drops a round only if it is more than 2.5 std deviations below the average.
    const dropBelow = n ? Math.round(mean - 2.5 * stdDev) : null;

    // Next PDGA update = 2nd Tuesday of the next month (PDGA monthly cadence).
    let nextUpdate: string | null = profile.next_update ?? null;
    if (!nextUpdate) {
      const base = profile.last_changed ? new Date(profile.last_changed) : new Date();
      if (Number.isFinite(base.getTime())) {
        const y = base.getFullYear();
        const m = base.getMonth();
        const first = new Date(y, m + 1, 1);
        // Advance to first Tuesday, then +7 days for the second Tuesday.
        const offset = (2 - first.getDay() + 7) % 7;
        const d = new Date(y, m + 1, 1 + offset + 7);
        nextUpdate = d.toISOString();
      }
    }

    return {
      roundsUsed: profile.rounds_used ?? (n || null),
      stdDev: profile.std_dev ?? (n > 1 ? Math.round(stdDev * 10) / 10 : null),
      dropBelow: profile.drop_below ?? (min !== null ? Math.max(dropBelow ?? 0, min) : null),
      nextUpdate,
    };
  }, [rounds, profile]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-br from-primary/15 via-primary/5 to-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-primary">
            PDGA #{profile.pdga_number}
          </div>
          <div className="mt-1 font-display text-2xl font-semibold">
            {profile.name ?? `Player ${profile.pdga_number}`}
          </div>
          <div className="text-sm text-muted-foreground">
            {profile.classification ?? ""}
            {profile.location ? ` · ${profile.location}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div
            className="text-xs uppercase tracking-widest text-muted-foreground"
            title="Published by the PDGA on the second Tuesday of every month."
          >
            Official PDGA Rating
          </div>
          <div className="font-display text-5xl font-bold">
            {profile.current_rating ?? rating ?? "—"}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MiniStat
          label="Drop Below"
          value={derived.dropBelow}
          hint="Rounds rated below this number get dropped from your rating calculation (roughly 2.5σ below your average)."
        />
        <MiniStat
          label="Rounds Used"
          value={derived.roundsUsed}
          hint="Number of rated rounds currently included in your PDGA rating (typically the last ~24 months)."
        />
        <MiniStat
          label="Std Dev"
          value={derived.stdDev}
          hint="Standard deviation of your included round ratings. Lower = more consistent play."
        />
        <MiniStat
          label="Last Changed"
          value={fmtDate(profile.last_changed)}
          hint="Date your PDGA rating was last officially updated."
        />
        <MiniStat
          label="Next Update"
          value={fmtDate(derived.nextUpdate)}
          hint="Estimated next PDGA rating update. PDGA updates ratings monthly on the second Tuesday."
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{value ?? "—"}</div>
      {hint ? (
        <div className="mt-1 text-[10px] leading-snug text-muted-foreground/80">{hint}</div>
      ) : null}
    </div>
  );
}

function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isFinite(dt.getTime())
    ? dt.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })
    : null;
}

/* ------------------------------- Overview -------------------------------- */

/** Career totals across every rated round on file. Shown on its own so pages
 *  can place it with round history instead of the rating summaries. */
function CareerHistoryCard({ rounds }: { rounds: RatedRound[] }) {
  const s = useMemo(() => statsSummary(rounds as any), [rounds]);
  if (s.count === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4" /> Career round history
          <InfoHint text="Career totals across every rated round on file — all seasons, not just the rounds inside your current official rating window. The rating cards count only the rounds PDGA is using right now, so that number is smaller." />
        </div>
        <div className="text-xs text-muted-foreground">
          {s.firstDate ? `First rated round ${fmtDate(s.firstDate)}` : ""}
          {s.firstDate ? " · " : ""}
          {s.count.toLocaleString()} career rated {s.count === 1 ? "round" : "rounds"}
          {rounds.length > s.count
            ? ` (${(rounds.length - s.count).toLocaleString()} dropped by PDGA)`
            : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
        <KPI
          label="Average Rating"
          value={s.average ?? "—"}
          accent
          hint="Straight (unweighted) average of every currently-counted rated round in this player's history."
        />
        <KPI
          label="Highest"
          value={s.highest ?? "—"}
          sub={s.best ? (fmtDate(s.best.played_on) ?? undefined) : undefined}
          tone="success"
          hint="Best single rated round on record."
        />
        <KPI
          label="Lowest"
          value={s.lowest ?? "—"}
          sub={s.worst ? (fmtDate(s.worst.played_on) ?? undefined) : undefined}
          tone="danger"
          hint="Worst single rated round still counted in career totals."
        />
        <KPI
          label="Career Rated Rounds"
          value={s.count}
          hint="Every rated round on file across your whole career (rounds PDGA has dropped are shown separately in the header). Your current rating uses only the rounds inside the active window."
        />
        <KPI
          label="Events"
          value={s.totalEvents}
          hint="Distinct sanctioned events counted (unique event + month)."
        />
        <KPI
          label="Std Dev"
          value={`±${s.stddev ?? 0}`}
          sub="volatility"
          hint="Standard deviation of round ratings. Lower = more consistent."
        />
      </div>
    </div>
  );
}

/** Momentum trend chart and current-form snapshot. Separate so pages can show
 *  it with round history. */
function MomentumFormPanel({
  rounds,
  baseRating,
  history,
  udiscHistory = [],
  chainHistory = [],
}: {
  rounds: RatedRound[];
  baseRating: number;
  history: ReturnType<typeof monthlyHistory>;
  udiscHistory?: ReturnType<typeof monthlyHistory>;
  chainHistory?: ReturnType<typeof monthlyHistory>;
}) {
  const s = useMemo(() => statsSummary(rounds as any), [rounds]);
  const merged = useMemo(() => {
    const byMonth = new Map<string, Record<string, number | string>>();
    const add = (key: string, rows: ReturnType<typeof monthlyHistory>) => {
      for (const r of rows) {
        const point = byMonth.get(r.month) ?? { month: r.month };
        if (Number.isFinite(r.rating) && r.rating > 0) point[key] = r.rating;
        byMonth.set(r.month, point);
      }
    };
    add("pdga", history);
    add("udisc", udiscHistory);
    add("dgd", chainHistory);
    // Month order follows the PDGA series, which always spans the full window.
    const order = history.map((r) => r.month);
    for (const m of byMonth.keys()) if (!order.includes(m)) order.push(m);
    return order.map((m) => byMonth.get(m) ?? { month: m });
  }, [history, udiscHistory, chainHistory]);
  if (s.count === 0) return null;

  const hasUdisc = merged.some((p) => p['udisc'] != null);
  const hasChain = merged.some((p) => p['dgd'] != null);
  const trendUp = s.momentum > 2;
  const trendDown = s.momentum < -2;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
        <div className="mb-2 flex items-center justify-between text-sm">
          <div className="font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Momentum
            <InfoHint text="Compares your last 5 rated rounds against your last 20. Positive = trending up." />
          </div>
          <div
            className={`text-xs font-semibold ${trendUp ? "text-emerald-400" : trendDown ? "text-red-400" : "text-muted-foreground"}`}
          >
            {trendUp ? "▲ Heating up" : trendDown ? "▼ Cooling off" : "Stable"}
            {s.momentum
              ? ` · ${s.momentum > 0 ? "+" : ""}${s.momentum} pts vs last ${s.baselineCount}`
              : ""}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <MiniStat label="Last 5 Avg" value={s.recent5 ?? "—"} />
          <MiniStat label={`Last ${s.baselineCount || 20} Avg`} value={s.baseline20 ?? "—"} />
          <MiniStat label="Career Avg" value={s.average ?? "—"} />
        </div>
        <div className="mt-4 h-40">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={merged} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="ratingFillMini" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                stroke="var(--chart-axis)"
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
                stroke="var(--chart-axis)"
                width={38}
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
              <ReferenceLine
                y={baseRating}
                stroke="var(--chart-neutral)"
                strokeDasharray="4 4"
              />
              <Area
                type="monotone"
                dataKey="pdga"
                name="PDGA"
                stroke="#38BDF8"
                strokeWidth={2.5}
                fill="url(#ratingFillMini)"
                connectNulls
                dot={{ r: 3, fill: "#38BDF8", stroke: "#38BDF8" }}
                activeDot={{ r: 5 }}
              />
              {hasUdisc && (
                <Line
                  type="monotone"
                  dataKey="udisc"
                  name="UDisc"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  connectNulls
                  dot={{ r: 3, fill: "#F59E0B", stroke: "#F59E0B" }}
                  activeDot={{ r: 5 }}
                />
              )}
              {hasChain && (
                <Line
                  type="monotone"
                  dataKey="dgd"
                  name="DG Dashboard"
                  stroke="#22D3EE"
                  strokeWidth={2.5}
                  connectNulls
                  dot={{ r: 3, fill: "#22D3EE", stroke: "#22D3EE" }}
                  activeDot={{ r: 5 }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold flex items-center gap-2">
          <Trophy className="h-4 w-4" /> Form
          <InfoHint text="A snapshot of your current shape — best 10 vs worst 10 rounds and year-to-date activity." />
        </div>
        <div className="space-y-3">
          <FormRow label="Best 10 Avg" value={s.best10 ?? "—"} tone="success" />
          <FormRow label="Worst 10 Avg" value={s.worst10 ?? "—"} tone="danger" />
          <FormRow label="Rounds This Year" value={s.roundsThisYear} />
          <FormRow label="Events This Year" value={s.eventsThisYear} />
          <FormRow label="Years Active" value={s.yearsActive} />
        </div>
      </div>
    </div>
  );
}

function StatsOverview({
  rounds,
  baseRating,
  history,
  isMine,
  hideScoringBreakdown,
  hideEventHighlights,
  hideRatingsPanel,
  hideCareerHistory,
}: {
  rounds: RatedRound[];
  baseRating: number;
  history: ReturnType<typeof monthlyHistory>;
  isMine: boolean;
  hideScoringBreakdown?: boolean;
  /** Hide Event Highlights when it is rendered elsewhere on the page. */
  hideEventHighlights?: boolean;
  hideRatingsPanel?: boolean;
  hideCareerHistory?: boolean;
}) {
  const s = useMemo(() => statsSummary(rounds as any), [rounds]);
  const getBreakdowns = useServerFn(getMyPlayerBreakdowns);
  const [bd, setBd] = useState<PlayerBreakdowns | null>(null);

  useEffect(() => {
    if (!isMine) {
      setBd(null);
      return;
    }
    getBreakdowns()
      .then((r) => setBd(r as PlayerBreakdowns))
      .catch(() => setBd(null));
  }, [isMine, getBreakdowns]);

  if (s.count === 0) {
    return (
      <MascotEmptyState
        intent="analytics"
        title="Rating Studio is ready when your rounds are."
        description="Sync from the PDGA or import rounds and this dashboard will unlock momentum, projections, and target planning."
      />
    );
  }

  const trendUp = s.momentum > 2;
  const trendDown = s.momentum < -2;

  return (
    <div className="space-y-4">
      {isMine && !hideRatingsPanel ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <RatingsPanel />
        </div>
      ) : null}

      {hideCareerHistory ? null : <CareerHistoryCard rounds={rounds} />}

      {hideCareerHistory ? null : (
        <MomentumFormPanel rounds={rounds} baseRating={baseRating} history={history} />
      )}


      {/* Per-year breakdown */}
      {s.byYear.length > 1 ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4" /> Year-by-Year
            <InfoHint text="Rated round count, average rating, and best round for each competitive year." />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-left font-normal">Year</th>
                  <th className="py-2 text-right font-normal">Rounds</th>
                  <th className="py-2 text-right font-normal">Avg</th>
                  <th className="py-2 text-right font-normal">Best</th>
                  <th className="py-2 pl-4 text-left font-normal w-1/2">Trend</th>
                </tr>
              </thead>
              <tbody>
                {s.byYear.map((y) => {
                  const max = Math.max(...s.byYear.map((x) => x.avg));
                  const min = Math.min(...s.byYear.map((x) => x.avg));
                  const range = Math.max(1, max - min);
                  const pct = ((y.avg - min) / range) * 100;
                  return (
                    <tr key={y.year} className="border-b border-border/50">
                      <td className="py-2 font-semibold">{y.year}</td>
                      <td className="py-2 text-right">{y.count}</td>
                      <td className="py-2 text-right font-semibold">{y.avg}</td>
                      <td className="py-2 text-right text-emerald-400">{y.best}</td>
                      <td className="py-2 pl-4">
                        <div className="h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* Event Highlights + Scoring Breakdown — signed-in user only */}
      {isMine && !(hideEventHighlights && hideScoringBreakdown) ? (
        <div
          className={`grid grid-cols-1 gap-4 ${
            hideScoringBreakdown || hideEventHighlights ? "" : "lg:grid-cols-2"
          }`}
        >
          {hideEventHighlights ? null : <EventHighlightsPanel bd={bd} />}
          {hideScoringBreakdown ? null : <ScoringBreakdownPanel bd={bd} isMine={isMine} />}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
          Sign in and sync your own PDGA number to unlock the Event Highlights
          {hideScoringBreakdown ? "" : " and Scoring Breakdown"} widgets for your account.
        </div>
      )}
    </div>
  );
}

function InfoHint({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center text-muted-foreground/70" title={text}>
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}

/** Event Highlights on its own, for pages that place it outside the overview. */
function EventHighlightsSection({ isMine }: { isMine: boolean }) {
  const getBreakdowns = useServerFn(getMyPlayerBreakdowns);
  const [bd, setBd] = useState<PlayerBreakdowns | null>(null);

  useEffect(() => {
    if (!isMine) {
      setBd(null);
      return;
    }
    getBreakdowns()
      .then((r) => setBd(r as PlayerBreakdowns))
      .catch(() => setBd(null));
  }, [isMine, getBreakdowns]);

  if (!isMine) return null;
  return <EventHighlightsPanel bd={bd} />;
}

function EventHighlightsPanel({ bd }: { bd: PlayerBreakdowns | null }) {
  const h = bd?.highlights;
  const by = bd?.eventsBySource;
  const hasFinishes = !!h && h.finishesRecorded > 0;
  const groups = by
    ? ([
        { key: "pdga", label: "PDGA", split: by.pdga },
        { key: "udisc", label: "UDisc", split: by.udisc },
        { key: "dgd", label: "DG Dashboard", split: by.dgd },
      ] as const)
    : [];
  const any = groups.some((g) => g.split.tournament.rounds + g.split.league.rounds > 0);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Trophy className="h-4 w-4" /> Event Highlights
      </div>
      <p className="mb-3 text-[13px] text-muted-foreground">
        Tournaments and leagues, kept apart by where the round came from — each source rates on its
        own scale.
      </p>
      {!bd ? (
        <div className="text-sm text-muted-foreground">Crunching your history…</div>
      ) : !any ? (
        <div className="text-sm text-muted-foreground">
          Sync your PDGA number, upload UDisc league or tournament rounds, or score an event in DG
          Dashboard to fill this in.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 text-left">Source</th>
                <th className="text-left">Type</th>
                <th className="text-right">Events</th>
                <th className="text-right">Rounds</th>
                <th className="text-right">Rated</th>
                <th className="pl-4 text-left">Best round</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((g) =>
                (["tournament", "league"] as const).map((k, i) => {
                  const b = g.split[k];
                  return (
                    <tr key={`${g.key}-${k}`} className={i === 0 ? "border-t border-border" : ""}>
                      <td className="py-2 font-medium">{i === 0 ? g.label : ""}</td>
                      <td>{k === "tournament" ? "Tournaments" : "Leagues"}</td>
                      <td className="text-right tabular-nums">{b.events || "—"}</td>
                      <td className="text-right tabular-nums">{b.rounds || "—"}</td>
                      <td className="text-right tabular-nums">{b.ratedRounds || "—"}</td>
                      <td className="pl-4">
                        {b.bestRating != null ? (
                          <span>
                            <span className="font-semibold">{b.bestRating}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {b.bestEvent}
                              {b.bestDate ? ` · ${fmtDate(b.bestDate)}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                }),
              )}
            </tbody>
          </table>
          <div className="mt-3 border-t border-border/60 pt-3 text-[13px] text-muted-foreground">
            PDGA wins: <span className="font-semibold text-foreground">{hasFinishes ? h!.wins : "—"}</span>
            {" · "}PDGA podiums:{" "}
            <span className="font-semibold text-foreground">{hasFinishes ? h!.podiums : "—"}</span>
            {!hasFinishes ? " (appear once your PDGA finishes sync)" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

export function ScoringBreakdownStandalone() {
  const getBreakdowns = useServerFn(getMyPlayerBreakdowns);
  const [bd, setBd] = useState<PlayerBreakdowns | null>(null);
  useEffect(() => {
    getBreakdowns()
      .then((r) => setBd(r as PlayerBreakdowns))
      .catch(() => setBd(null));
  }, [getBreakdowns]);
  return <ScoringBreakdownPanel bd={bd} isMine={true} />;
}

function ScoringBreakdownPanel({ bd, isMine }: { bd: PlayerBreakdowns | null; isMine: boolean }) {
  const getBreakdowns = useServerFn(getMyPlayerBreakdowns);
  const [scopeKind, setScopeKind] = useState<"all" | "course" | "event" | "round">("all");
  const [scopeValue, setScopeValue] = useState<string>("");
  const [local, setLocal] = useState<PlayerBreakdowns | null>(null);
  const [loading, setLoading] = useState(false);

  const active = local ?? bd;
  const s = active?.scoring;
  const filters = active?.filters ?? bd?.filters;

  useEffect(() => {
    if (!isMine) return;
    if (scopeKind === "all") {
      setLocal(null);
      return;
    }
    if (!scopeValue) return;
    setLoading(true);
    getBreakdowns({ data: { scope: scopeKind, value: scopeValue } })
      .then((r) => setLocal(r as PlayerBreakdowns))
      .catch(() => setLocal(null))
      .finally(() => setLoading(false));
  }, [isMine, scopeKind, scopeValue, getBreakdowns]);

  const scopeLabel =
    scopeKind === "all"
      ? "All rounds"
      : scopeKind === "course"
        ? "By course"
        : scopeKind === "event"
          ? "By event"
          : "Single round";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Target className="h-4 w-4" /> Scoring Breakdown
        <InfoHint text="Hole-by-hole scoring from PDGA rounds and every round you've logged live in DG Dashboard. Requires per-hole stroke data." />
      </div>
      {isMine ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
          {(["all", "course", "event", "round"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setScopeKind(k);
                setScopeValue("");
              }}
              className={`rounded-full border px-2 py-0.5 transition ${
                scopeKind === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "all"
                ? "All rounds"
                : k === "course"
                  ? "Course"
                  : k === "event"
                    ? "Event"
                    : "Round"}
            </button>
          ))}
          {scopeKind !== "all" ? (
            <select
              value={scopeValue}
              onChange={(e) => setScopeValue(e.target.value)}
              className="ml-1 max-w-[220px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="">Select {scopeKind}…</option>
              {scopeKind === "course" &&
                filters?.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              {scopeKind === "event" &&
                filters?.events.map((ev) => (
                  <option key={ev.name} value={ev.name}>
                    {ev.name}
                  </option>
                ))}
              {scopeKind === "round" &&
                filters?.rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
            </select>
          ) : null}
        </div>
      ) : null}
      {!bd || loading ? (
        <div className="text-xs text-muted-foreground">Building your scoring breakdown…</div>
      ) : scopeKind !== "all" && !scopeValue ? (
        <div className="text-xs text-muted-foreground">
          Choose a {scopeKind} above to see its scoring breakdown.
        </div>
      ) : (
        <>
          <RoundsSummaryBlock summary={active?.roundsSummary} scopeLabel={scopeLabel} />
          {s && s.totalHoles > 0 ? (
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                <span>Per-hole detail · {s.totalHoles.toLocaleString()} holes</span>
                {(active?.scopeMeta?.sources ?? [])
                  .filter((src) => src !== "udisc")
                  .map((src) => (
                    <span
                      key={src}
                      className="rounded-full border border-border px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-foreground/80"
                    >
                      {src === "chainlink" ? "DGD" : "PDGA"}
                    </span>
                  ))}
              </div>
              <ScoreRow label="Aces" count={s.aces} pct={s.acePct} color="bg-amber-400" />
              <ScoreRow label="Eagles" count={s.eagles} pct={s.eaglePct} color="bg-sky-400" />
              <ScoreRow
                label="Birdies"
                count={s.birdies}
                pct={s.birdiePct}
                color="bg-emerald-400"
              />
              <ScoreRow label="Pars" count={s.pars} pct={s.parPct} color="bg-muted-foreground/60" />
              <ScoreRow label="Bogeys" count={s.bogeys} pct={s.bogeyPct} color="bg-orange-400" />
              <ScoreRow
                label="Double+"
                count={s.doublePlus}
                pct={s.doublePlusPct}
                color="bg-red-400"
              />
            </div>
          ) : active?.scopeMeta?.totalsOnly ? (
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              This round was imported as a total only (typical for PDGA rounds). Per-hole detail
              isn't available — the summary above still reflects it.
            </div>
          ) : active?.roundsSummary && active.roundsSummary.totalsOnly > 0 ? (
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              {active.roundsSummary.totalsOnly.toLocaleString()} of your{" "}
              {active.roundsSummary.totalRounds.toLocaleString()} rounds in this view have totals
              only (typical for PDGA event results). Score rounds in DG Dashboard to add per-hole
              detail.
            </div>
          ) : (
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              No per-hole scoring data for this selection yet. Play a live round in the DG Dashboard
              scorecard to build per-hole detail.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">
          <span className="font-semibold">{count.toLocaleString()}</span>{" "}
          <span className="text-muted-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function RoundsSummaryBlock({
  summary,
  scopeLabel,
}: {
  summary: PlayerBreakdowns["roundsSummary"] | undefined;
  scopeLabel: string;
}) {
  if (!summary || summary.totalRounds === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        No rounds match this filter yet.
      </div>
    );
  }
  const {
    totalRounds,
    bySource,
    withHoleData,
    totalsOnly,
    avgToPar,
    bestToPar,
    worstToPar,
    subParPct,
    atParPct,
    overParPct,
  } = summary;
  const fmtToPar = (n: number | null) =>
    n == null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground">
        <span>
          {scopeLabel} · {totalRounds.toLocaleString()} rounds
        </span>
        {bySource.chainlink > 0 && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-foreground/80">
            DGD {bySource.chainlink.toLocaleString()}
          </span>
        )}
        {bySource.pdga > 0 && (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-foreground/80">
            PDGA {bySource.pdga.toLocaleString()}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryStat label="Avg to par" value={fmtToPar(avgToPar)} />
        <SummaryStat label="Best" value={fmtToPar(bestToPar)} tone="success" />
        <SummaryStat label="Worst" value={fmtToPar(worstToPar)} tone="danger" />
        <SummaryStat
          label="Per-hole detail"
          value={`${withHoleData.toLocaleString()} / ${totalRounds.toLocaleString()}`}
          sub={totalsOnly > 0 ? `${totalsOnly.toLocaleString()} totals only` : undefined}
        />
      </div>
      {subParPct + atParPct + overParPct > 0 ? (
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Under par {subParPct}%</span>
            <span>Even {atParPct}%</span>
            <span>Over par {overParPct}%</span>
          </div>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-emerald-400" style={{ width: `${subParPct}%` }} />
            <div className="h-full bg-muted-foreground/60" style={{ width: `${atParPct}%` }} />
            <div className="h-full bg-orange-400" style={{ width: `${overParPct}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "success" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-500"
      : tone === "danger"
        ? "text-orange-500"
        : "text-foreground";
  return (
    <div className="rounded-md border border-border bg-background/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function KPI({
  label,
  value,
  sub,
  accent,
  tone,
  hint,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent?: boolean;
  tone?: "success" | "danger";
  hint?: string;
}) {
  const color =
    tone === "success"
      ? "text-emerald-400"
      : tone === "danger"
        ? "text-red-400"
        : accent
          ? "text-primary"
          : "";
  return (
    <div>
      <div className="flex items-center gap-1 text-xs uppercase tracking-widest text-muted-foreground">
        {label}
        {hint ? <InfoHint text={hint} /> : null}
      </div>
      <div className={`mt-1 font-display text-3xl font-semibold ${color}`}>{value}</div>
      {sub ? (
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{sub}</div>
      ) : null}
    </div>
  );
}

function FormRow({
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
    <div className="flex items-baseline justify-between border-b border-border/50 pb-1.5 last:border-b-0 last:pb-0">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-display text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function PlaceholderPanel({
  icon,
  title,
  note,
  rows,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  rows: [string, string][];
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/50 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k}</div>
            <div className="font-display text-2xl font-semibold text-muted-foreground/60">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">{note}</div>
    </div>
  );
}
function ExpiringSection({ expiring }: { expiring: RatedRound[] }) {
  const DAY = 24 * 60 * 60 * 1000;
  const groups = useMemo(() => {
    const map = new Map<string, { update: Date; rounds: (RatedRound & { expiresOn: Date })[] }>();
    for (const r of expiring) {
      const expiresOn = new Date(new Date(r.played_on).getTime() + 365 * DAY);
      const update = pdgaUpdateOnOrAfter(expiresOn);
      const key = update.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { update, rounds: [] });
      map.get(key)!.rounds.push({ ...r, expiresOn });
    }
    return Array.from(map.values())
      .sort((a, b) => a.update.getTime() - b.update.getTime())
      .map((g) => ({
        ...g,
        rounds: g.rounds.sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime()),
      }));
  }, [expiring]);

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-amber-500">
        <Calendar className="h-4 w-4" /> Rounds rolling off before the next 3 rating updates
      </div>
      <div className="text-xs text-muted-foreground">
        Grouped by the PDGA rating update (2nd Tuesday of each month) that removes them from your
        365-day window.
      </div>
      <div className="mt-3 space-y-3">
        {groups.map((g) => {
          const label = g.update.toLocaleDateString("en", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          const avg = Math.round(
            g.rounds.reduce((s, r) => s + r.round_rating, 0) / g.rounds.length,
          );
          return (
            <div
              key={g.update.toISOString()}
              className="rounded-lg border border-amber-500/20 bg-background/30"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/20 px-3 py-2">
                <div className="text-sm font-semibold">{label} update</div>
                <div className="text-xs text-muted-foreground">
                  <span className="text-foreground tabular-nums">{g.rounds.length}</span> round
                  {g.rounds.length === 1 ? "" : "s"} rolling off · avg{" "}
                  <span className="text-foreground tabular-nums">{avg}</span>
                </div>
              </div>
              <div className="grid gap-2 p-3 sm:grid-cols-2">
                {g.rounds.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border/50 bg-background/40 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{r.round_rating}</span>
                      <span className="text-xs text-muted-foreground">
                        Played {fmtDate(r.played_on)}
                      </span>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{r.event_name}</div>
                    <div className="text-[11px] text-muted-foreground/80">
                      Expires{" "}
                      {r.expiresOn.toLocaleDateString("en", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Projection ------------------------------- */

function ProjectionPanel({
  baseRating,
  rounds,
  sharedTarget,
  onSharedTargetChange,
}: {
  baseRating: number;
  rounds: RatedRound[];
  sharedTarget?: number | null;
  onSharedTargetChange?: (n: number) => void;
}) {
  const [pending, setPending] = useState<RatedRound[]>([]);
  const [newRating, setNewRating] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newName, setNewName] = useState("");
  const [targetRating, setTargetRating] = useState<string>(String(sharedTarget ?? baseRating + 10));
  useEffect(() => {
    if (sharedTarget != null) setTargetRating(String(sharedTarget));
  }, [sharedTarget]);
  const [numRounds, setNumRounds] = useState<number>(9);
  const [realism, setRealism] = useState<ReturnType<typeof assessRealism> | null>(null);

  const combined = useMemo(() => [...rounds, ...pending], [rounds, pending]);
  const projected = currentRating(combined);
  const delta = projected - baseRating;

  function addRound() {
    const rating = parseInt(newRating, 10);
    if (!Number.isFinite(rating) || rating < 500 || rating > 1200)
      return toast.error("Rating must be 500–1200");
    setPending((p) => [
      ...p,
      { played_on: newDate, round_rating: rating, event_name: newName || "Hypothetical" },
    ]);
    setNewRating("");
  }

  function addPendingCurrent() {
    const round = Math.round(baseRating);
    const today = new Date().toISOString().slice(0, 10);
    setPending((p) => [
      ...p,
      ...Array.from({ length: 8 }, () => ({
        played_on: today,
        round_rating: round,
        event_name: "Pending @ current form",
      })),
    ]);
  }

  const targetNum = parseInt(targetRating, 10) || baseRating;
  const requiredAvg = useMemo(
    () => solveRequiredAverage(rounds, targetNum, numRounds),
    [rounds, targetNum, numRounds],
  );
  const planned = useMemo(
    () => suggestPlannedRounds(rounds, requiredAvg, numRounds),
    [rounds, requiredAvg, numRounds],
  );

  function applyPlannedRounds() {
    const today = new Date().toISOString().slice(0, 10);
    setPending((p) => [
      ...p,
      ...planned.map((pr, i) => ({
        played_on: today,
        round_rating: pr.rating,
        event_name: `Planned round ${i + 1}`,
      })),
    ]);
    toast.success(`Added ${planned.length} planned rounds`);
  }

  // Derived scorecard stats
  const usedCount = Math.min(combined.length, Math.max(25, Math.floor(combined.length * 0.75)));
  const droppedCount = Math.max(0, combined.length - usedCount);
  const stdDev = useMemo(() => {
    const vals = combined.map((r) => r.round_rating);
    if (!vals.length) return 0;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const v = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
    return Math.round(Math.sqrt(v) * 10) / 10;
  }, [combined]);

  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  return (
    <div className="space-y-6">
      {/* Projection Summary — compact strip */}
      <div className="rounded-2xl border border-border bg-card/40 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-[9rem]">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">
              Projected Rating
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold tabular-nums leading-none">
                {projected}
              </span>
              <span
                className={`text-sm font-bold ${
                  trend === "up"
                    ? "text-emerald-400"
                    : trend === "down"
                      ? "text-red-400"
                      : "text-muted-foreground"
                }`}
                title={`Change vs current rating (${baseRating})`}
              >
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "="}
                {delta !== 0 ? Math.abs(delta) : 0}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground">vs current {baseRating}</div>
          </div>

          <Stat
            label="Used"
            value={usedCount}
            hint="Rounds counted toward your projected rating (most recent, after outlier drop)."
          />
          <Stat
            label="Dropped"
            value={droppedCount}
            hint="Older or outlier rounds excluded from the projection."
            dim={droppedCount === 0}
          />
          <Stat
            label="Pending"
            value={pending.length}
            hint="Planned rounds you've added to model the next update."
            accent={pending.length > 0}
          />
          <Stat
            label="Volatility"
            value={stdDev}
            hint="Standard deviation of round ratings — lower means more consistent."
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  dim,
  accent,
}: {
  label: string;
  value: number | string;
  hint: string;
  dim?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[5.5rem]" title={hint}>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono text-lg font-bold leading-tight ${
          accent ? "text-primary" : dim ? "text-muted-foreground/40" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground/80 max-w-[10rem]">{hint}</div>
    </div>
  );
}

/* -------------------------------- Planner -------------------------------- */

const DAY_MS = 86_400_000;

function monthsBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(0, ms / (30 * DAY_MS));
}

function paceRoundsPerMonth(rounds: RatedRound[]): number {
  const cutoff = Date.now() - 180 * DAY_MS;
  const recent = rounds.filter((r) => new Date(r.played_on).getTime() >= cutoff);
  if (!recent.length) return 4;
  return Math.max(1, Math.round(recent.length / 6));
}

function PlannerPanel({
  baseRating,
  rounds,
  pdgaNumber,
  plans,
  onSave,
  onDelete,
  sharedTarget,
  onSharedTargetChange,
  hideHeader,
}: {
  baseRating: number;
  rounds: RatedRound[];
  pdgaNumber: string;
  plans: any[];
  planEvents: any[];
  onSave: (payload: any) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  sharedTarget?: number | null;
  onSharedTargetChange?: (n: number) => void;
  hideHeader?: boolean;
}) {
  // The overall player rating goal is only changed when the player edits this
  // field and saves. It is seeded once from the saved goal (or a suggestion)
  // and never re-synced from course- or event-specific targets.
  const [targetRating, setTargetRating] = useState<string>(() =>
    String(sharedTarget ?? readTargetRating() ?? baseRating + 25),
  );

  const defaultDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().slice(0, 10);
  }, []);
  const [targetDate, setTargetDate] = useState<string>(defaultDate);
  const [shuffle, setShuffle] = useState(0);

  const targetNum = parseInt(targetRating, 10) || baseRating;
  const dateObj = useMemo(() => new Date(targetDate), [targetDate]);
  const now = useMemo(() => new Date(), []);
  const monthsLeft = useMemo(
    () => Math.max(1, Math.ceil(monthsBetween(now, dateObj))),
    [now, dateObj],
  );
  const ratingUpdates = monthsLeft; // PDGA updates monthly
  const pace = useMemo(() => paceRoundsPerMonth(rounds), [rounds]);
  const suggestedRounds = Math.max(1, pace * monthsLeft);
  const [numRoundsStr, setNumRoundsStr] = useState<string>(String(suggestedRounds));
  useEffect(() => {
    setNumRoundsStr(String(suggestedRounds));
  }, [suggestedRounds]);
  const numRounds = Math.max(1, parseInt(numRoundsStr, 10) || suggestedRounds);

  const requiredAvg = useMemo(
    () => solveRequiredAverage(rounds, targetNum, numRounds, dateObj),
    [rounds, targetNum, numRounds, dateObj],
  );

  const planned = useMemo(() => {
    const base = suggestPlannedRounds(rounds, requiredAvg, numRounds);
    if (!shuffle) return base;
    // Deterministic jitter based on shuffle index — keeps average, varies distribution
    const jittered = base.map((p, i) => {
      const delta = ((i * 37 + shuffle * 13) % 11) - 5; // -5..+5
      return { ...p, rating: p.rating + delta };
    });
    // Rebalance to preserve target sum
    const targetSum = base.reduce((a, b) => a + b.rating, 0);
    const gotSum = jittered.reduce((a, b) => a + b.rating, 0);
    const adjust = Math.round((targetSum - gotSum) / jittered.length);
    return jittered.map((p) => ({ ...p, rating: p.rating + adjust }));
  }, [rounds, requiredAvg, numRounds, shuffle]);

  const realism = useMemo(
    () =>
      targetNum > baseRating
        ? assessRealism(rounds, targetNum, baseRating, numRounds, dateObj)
        : null,
    [rounds, targetNum, baseRating, numRounds, dateObj],
  );

  // Trajectory: monthly checkpoints from today → target date
  const trajectory = useMemo(() => {
    const points: { label: string; goal: number; pace: number; rating: number }[] = [];
    const perMonth = Math.max(1, Math.ceil(planned.length / monthsLeft));
    let cursor: RatedRound[] = [...rounds];
    let paceCursor: RatedRound[] = [...rounds];
    // Start point (today)
    points.push({
      label: now.toLocaleDateString("en", { month: "short", year: "2-digit" }),
      goal: baseRating,
      pace: baseRating,
      rating: baseRating,
    });
    let placed = 0;
    for (let m = 1; m <= monthsLeft; m++) {
      const anchor = new Date(now.getFullYear(), now.getMonth() + m, 15);
      const chunk = planned.slice(placed, placed + perMonth);
      placed += chunk.length;
      cursor = [
        ...cursor,
        ...chunk.map((p) => ({
          played_on: anchor.toISOString().slice(0, 10),
          round_rating: p.rating,
          event_name: "Planned",
          included: true,
        })),
      ];
      // Pace baseline: play at historical average
      const paceRating = Math.round(baseRating); // stays flat unless we add average rounds
      paceCursor = [
        ...paceCursor,
        ...Array.from({ length: perMonth }, () => ({
          played_on: anchor.toISOString().slice(0, 10),
          round_rating: paceRating,
          event_name: "Pace",
          included: true,
        })),
      ];
      points.push({
        label: anchor.toLocaleDateString("en", { month: "short", year: "2-digit" }),
        goal: targetNum,
        rating: currentRating(cursor, anchor),
        pace: currentRating(paceCursor, anchor),
      });
    }
    return points;
  }, [rounds, planned, monthsLeft, baseRating, targetNum, now]);

  // Rounds expiring before target date (365-day window)
  const expiring = useMemo(() => {
    const targetMs = dateObj.getTime();
    return rounds
      .filter((r) => {
        const expiresMs = new Date(r.played_on).getTime() + 365 * DAY_MS;
        return expiresMs <= targetMs && expiresMs >= now.getTime();
      })
      .sort((a, b) => a.played_on.localeCompare(b.played_on));
  }, [rounds, dateObj, now]);

  const [saving, setSaving] = useState(false);
  async function saveGoal() {
    setSaving(true);
    try {
      await onSave({
        pdgaNumber,
        name: `${targetNum} by ${new Date(targetDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}`,
        strategy: "goal" as const,
        targetRating: targetNum,
        offsetPoints: 0,
        months: monthsLeft,
        roundsPerMonth: Math.max(1, Math.round(numRounds / monthsLeft)),
        events: planned.map((p, i) => ({
          event_name: `Planned round ${i + 1}`,
          event_date: new Date(
            now.getFullYear(),
            now.getMonth() +
              Math.min(
                monthsLeft,
                Math.floor(i / Math.max(1, Math.ceil(planned.length / monthsLeft))) + 1,
              ),
            15,
          )
            .toISOString()
            .slice(0, 10),
          rounds: 1,
          expected_rating: p.rating,
        })),
      });
      // Saving is the only action that changes the player's overall rating goal.
      writeTargetRating(targetNum);
      onSharedTargetChange?.(targetNum);
      toast.success("Player rating goal saved");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't save your changes. Give it another shot.",
      );
    } finally {
      setSaving(false);
    }
  }

  const savedGoals = plans.filter((p: any) => p.strategy === "goal");

  return (
    <div className="space-y-4">
      {/* Header — hidden when the Goals tab already titles this section. */}
      {hideHeader ? null : (
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Crush Your Goals</h2>
            <p className="text-sm text-muted-foreground">
              Set a target rating and date — see the rounds and averages to get there.
            </p>
          </div>
        </div>
      )}


      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* LEFT — Goal inputs */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400">
              Set Your Goal
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Target Rating
                </Label>
                <Input
                  inputMode="numeric"
                  value={targetRating}
                  onChange={(e) => setTargetRating(e.target.value)}
                  className="text-2xl font-black h-12"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  By Date
                </Label>
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="h-12"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {ratingUpdates} rating update{ratingUpdates === 1 ? "" : "s"} before{" "}
              {dateObj.toLocaleDateString("en", { month: "long", day: "numeric" })}.
            </div>

            <div>
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Rounds You'll Play
              </Label>
              <Input
                inputMode="numeric"
                value={numRoundsStr}
                onChange={(e) => setNumRoundsStr(e.target.value)}
                className="h-12 text-lg font-bold"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Suggested from your pace (~{pace}/mo) — edit freely.
              </div>
            </div>

            {/* Required average card */}
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Required Average
              </div>
              {targetNum > baseRating ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <div className="text-5xl font-black tabular-nums">{requiredAvg}</div>
                    <div className="text-sm text-muted-foreground">/ round</div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {numRounds} rounds ·{" "}
                    <span
                      className={
                        requiredAvg - baseRating > 30 ? "text-amber-400" : "text-emerald-400"
                      }
                    >
                      {requiredAvg - baseRating > 0 ? "+" : ""}
                      {requiredAvg - baseRating} from current {baseRating}.
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground mt-1">
                  Set a target above your current rating ({baseRating}).
                </div>
              )}
            </div>

            {realism ? (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  realism.verdict === "very_realistic"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : realism.verdict === "realistic"
                      ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
                      : realism.verdict === "stretch"
                        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        : "border-red-500/40 bg-red-500/10 text-red-300"
                }`}
              >
                {realism.message}
              </div>
            ) : null}
          </div>

          <Button
            className="w-full h-11 text-sm font-black uppercase tracking-widest"
            onClick={saveGoal}
            disabled={saving || targetNum <= baseRating}
          >
            {saving ? "Saving…" : "Save Goal"}
          </Button>
        </div>

        {/* RIGHT — Trajectory + Expiring */}
        <div className="space-y-4">
          {/* Plain-English explanation of the math */}
          {(() => {
            const windowRounds = rounds.filter((r) => {
              const t = new Date(r.played_on).getTime();
              return t >= now.getTime() - 365 * DAY_MS && (r.included ?? true);
            });
            const bd = ratingBreakdown(windowRounds);
            const remainingAfterExpiry = windowRounds.length - expiring.length;
            const newDoubled =
              numRounds >= 9 ? Math.max(1, Math.ceil((remainingAfterExpiry + numRounds) / 4)) : 0;
            return (
              <details className="rounded-2xl border border-border bg-card/40 p-5 open:pb-4">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-sky-400 list-none flex items-center justify-between">
                  <span>How this is calculated</span>
                  <span className="text-muted-foreground normal-case tracking-normal text-[11px] font-normal">
                    tap to expand
                  </span>
                </summary>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    <strong className="text-foreground">PDGA rating math (official rules):</strong>{" "}
                    your rating is a weighted average of rated rounds in the last 12 months. When
                    you have 9+ rounds, the
                    <span className="text-sky-300"> most recent 25% by date</span> (not by score)
                    get double weight — that's why your next rounds move the needle faster. Rounds
                    more than 100 points, or 2.5σ, below your average are excluded.
                  </p>
                  <ul className="space-y-1 pl-1">
                    <li>
                      • <span className="text-foreground tabular-nums">{windowRounds.length}</span>{" "}
                      rounds in your 12-month window ·{" "}
                      <span className="text-foreground tabular-nums">{bd.included}</span> counted ·{" "}
                      <span className="tabular-nums">{bd.droppedLow}</span> dropped as low outliers.
                    </li>
                    <li>
                      • Simple mean of your window:{" "}
                      <span className="text-foreground tabular-nums">{bd.simpleMean || "—"}</span>.
                      Weighted rating:{" "}
                      <span className="text-foreground tabular-nums">{bd.rating || "—"}</span>.
                    </li>
                    <li>
                      • <span className="text-foreground tabular-nums">{expiring.length}</span>{" "}
                      round{expiring.length === 1 ? "" : "s"} will age out before{" "}
                      {dateObj.toLocaleDateString("en", { month: "short", day: "numeric" })} →{" "}
                      <span className="text-foreground tabular-nums">{remainingAfterExpiry}</span>{" "}
                      of your current rounds still count on the target date.
                    </li>
                    <li>
                      • You plan <span className="text-foreground tabular-nums">{numRounds}</span>{" "}
                      new rounds. Of the combined pool, the newest{" "}
                      <span className="text-foreground tabular-nums">{newDoubled}</span> get 2×
                      weight — and since your new rounds are the most recent, they land in that
                      bucket first.
                    </li>
                    <li>
                      • Solving the weighted average for target {targetNum} → each new round must
                      average{" "}
                      <span className="text-foreground tabular-nums font-semibold">
                        {requiredAvg}
                      </span>
                      .
                    </li>
                  </ul>
                  {requiredAvg >= 1150 ? (
                    <p className="text-red-300">
                      This target isn't reachable with {numRounds} rounds by that date — even 1150+
                      tournament-pro rounds wouldn't get there. Play more rounds or push the date
                      out.
                    </p>
                  ) : requiredAvg <= targetNum + 5 ? (
                    <p className="text-emerald-300">
                      Because new rounds are recency-doubled, the required average sits right around
                      your target — that's expected math, not a bug.
                    </p>
                  ) : null}
                </div>
              </details>
            );
          })()}

          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-3">
              Trajectory with Suggested Rounds
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trajectory} margin={{ top: 8, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="planFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.amber} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartColors.amber} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.neutral} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={chartColors.neutral} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                    }}
                  />
                  <ReferenceLine
                    y={targetNum}
                    stroke={chartColors.axis}
                    strokeDasharray="4 4"
                    label={{
                      value: `Goal ${targetNum}`,
                      fill: chartColors.slateText,
                      fontSize: 11,
                      position: "right",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="pace"
                    name="Current pace"
                    stroke={chartColors.neutral}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    fill="url(#paceFill)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="rating"
                    name="With plan"
                    stroke={chartColors.amber}
                    strokeWidth={2.5}
                    fill="url(#planFill)"
                    dot={{ r: 3, fill: chartColors.amber }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/40 p-5">
            <div className="text-[10px] font-black uppercase tracking-widest text-sky-400 mb-1">
              ROUNDS EXPIRING BEFORE YOUR NEXT UPDATE
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              These rounds leave your rating window along the way — the required average already
              accounts for them.
            </div>
            {expiring.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No rounds expire before{" "}
                {dateObj.toLocaleDateString("en", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                .
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {expiring.map((r, i) => {
                  const expires = new Date(new Date(r.played_on).getTime() + 365 * DAY_MS);
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2"
                    >
                      <div className="font-mono text-lg font-bold tabular-nums w-14">
                        {r.round_rating}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {r.event_name ?? "Round"}
                        </div>
                        <div className="text-[11px] text-amber-400">
                          Expires if you play on or after{" "}
                          {expires.toLocaleDateString("en", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                        {fmtDate(r.played_on)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Saved goals */}
      {savedGoals.length ? (
        <div className="rounded-2xl border border-border bg-card/40 p-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
            Saved Goals
          </div>
          <div className="space-y-2">
            {savedGoals.map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2"
              >
                <div>
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Target {p.target_rating} · {p.months}mo × {p.rounds_per_month}/mo
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => onDelete(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
