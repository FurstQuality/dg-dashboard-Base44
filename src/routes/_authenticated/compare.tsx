import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  ArrowLeftRight,
  Sparkles,
  Share2,
  Swords,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { toast } from "sonner";
import { lookupPdgaPlayer, getMyPdgaLab } from "@/lib/pdga-lab.functions";
import { RatingStudio } from "./rating-studio";
import {
  currentRating,
  monthlyHistory,
  ratingExtremes,
  type RatedRound,
} from "@/lib/rating-projection";
import { PageShell, PageHeader } from "@/components/shell";
import { StatlinkSubnav } from "@/components/statlink/statlink-subnav";
import { chartColors } from "@/lib/chart-colors";

export const Route = createFileRoute("/_authenticated/compare")({
  head: () => ({
    meta: [
      { title: "PDGA Player Stat Search · DG Statboard · DG Dashboard" },
      {
        name: "description",
        content:
          "Look up any PDGA player and go head-to-head — ratings, form, and win probability.",
      },
      { property: "og:title", content: "PDGA Player Stat Search · DG Statboard · DG Dashboard" },
      { property: "og:description", content: "Head-to-head PDGA rating showdown with friends." },
    ],
  }),
  component: ComparePage,
});

type LookupResult = Awaited<ReturnType<typeof lookupPdgaPlayer>>;

type PlayerBundle = {
  pdgaNumber: string;
  profile: LookupResult["profile"];
  rounds: RatedRound[];
  division: string | null;
};

type LookupOutcome = { ok: true; bundle: PlayerBundle } | { ok: false; error: string };

/**
 * Infer the player's current competitive division from their most recent
 * rated PDGA rounds. Ratings are meaningful only within a division, so
 * head-to-head Face Offs are gated on matching divisions.
 */
function inferDivision(
  rounds: Array<{ played_on?: string | null; division?: string | null }>,
): string | null {
  const recent = [...rounds]
    .filter((r) => r.division)
    .sort((a, b) => (b.played_on ?? "").localeCompare(a.played_on ?? ""))
    .slice(0, 12);
  if (!recent.length) return null;
  const counts = new Map<string, number>();
  for (const r of recent) {
    const d = r.division as string;
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestN = 0;
  for (const [d, n] of counts) {
    if (n > bestN) {
      best = d;
      bestN = n;
    }
  }
  return best;
}

function useLookup() {
  const fn = useServerFn(lookupPdgaPlayer);
  return useCallback(
    async (pdga: string): Promise<LookupOutcome> => {
      const n = Number(pdga.replace(/\D/g, ""));
      if (!n) return { ok: false, error: "Enter a valid PDGA number." };
      try {
        const res = await fn({ data: { pdgaNumber: n } });
        if (!res?.profile) return { ok: false, error: `PDGA #${n} not found on pdga.com.` };
        const rawRounds = res.rounds ?? [];
        const rounds = rawRounds.map((r) => ({
          played_on: r.played_on ?? "",
          round_rating: r.round_rating ?? 0,
          included: r.included ?? true,
          event_name: r.event_name,
        })) as RatedRound[];
        const division = inferDivision(rawRounds);
        return {
          ok: true,
          bundle: { pdgaNumber: String(n), profile: res.profile, rounds, division },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Lookup failed";
        return { ok: false, error: `PDGA #${n}: ${msg}` };
      }
    },
    [fn],
  );
}

function analyze(rounds: RatedRound[], officialRating: number | null | undefined) {
  const rated = rounds.filter((r) => r.round_rating > 0);
  const now = new Date();
  // Projection from recent rated rounds — used for momentum, NOT as the displayed rating.
  const projected = currentRating(rated, now);
  // Always prefer the live PDGA rating for the player's actual stat line.
  const rating = officialRating && officialRating > 0 ? officialRating : projected;
  const ext = ratingExtremes(rated);
  // Rolling rating extremes from monthly history
  const history = monthlyHistory(rated, 12);
  const history3y = monthlyHistory(rated, 36);
  const ratingsSeries = history3y.map((h) => h.rating).filter((v) => v > 0);
  const bestRating = ratingsSeries.length ? Math.max(...ratingsSeries) : rating;
  const worstRating = ratingsSeries.length ? Math.min(...ratingsSeries) : rating;
  // Trend / momentum: last 8 rounds vs prior 8, plus projected-vs-official delta.
  const chrono = [...rated].sort((a, b) => b.played_on.localeCompare(a.played_on));
  const last8 = chrono.slice(0, 8);
  const prior8 = chrono.slice(8, 16);
  const avgLast = last8.length
    ? Math.round(last8.reduce((a, b) => a + b.round_rating, 0) / last8.length)
    : 0;
  const avgPrior = prior8.length
    ? Math.round(prior8.reduce((a, b) => a + b.round_rating, 0) / prior8.length)
    : 0;
  // Momentum blends recent-vs-prior with (projected - official) so a player
  // rated 990 who's been throwing 1010s registers as heating up.
  const projDelta = projected && officialRating ? projected - officialRating : 0;
  const windowDelta = avgPrior ? avgLast - avgPrior : 0;
  const trendDelta = Math.round(windowDelta * 0.6 + projDelta * 0.4);
  // Consistency: stddev of last 20
  const recent = chrono.slice(0, 20).map((r) => r.round_rating);
  const mean = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const sd = recent.length
    ? Math.sqrt(recent.reduce((a, b) => a + (b - mean) ** 2, 0) / recent.length)
    : 0;
  return {
    rating,
    projected,
    bestRating,
    worstRating,
    ext,
    history,
    trendDelta,
    sd,
    roundCount: rated.length,
    avgLast,
    avgPrior,
  };
}

type Analysis = ReturnType<typeof analyze>;

/** Elo-style win probability from PDGA rating diff. 40-pt swing ≈ 62%, 100 ≈ 82%. */
function winProbability(ra: number, rb: number): number {
  if (!ra || !rb) return 0.5;
  return 1 / (1 + Math.pow(10, (rb - ra) / 80));
}

function StatRow({
  label,
  hint,
  left,
  right,
  higherWins = true,
  suffix = "",
}: {
  label: string;
  hint?: string;
  left: number | string;
  right: number | string;
  higherWins?: boolean;
  suffix?: string;
}) {
  const l = typeof left === "number" ? left : Number(left);
  const r = typeof right === "number" ? right : Number(right);
  const leftWin = higherWins ? l > r : l < r;
  const rightWin = higherWins ? r > l : r < l;
  const max = Math.max(Math.abs(l), Math.abs(r), 1);
  const lPct = Math.min(100, (Math.abs(l) / max) * 100);
  const rPct = Math.min(100, (Math.abs(r) / max) * 100);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 py-2 sm:gap-3">
      <div className="flex min-w-0 items-center justify-end gap-2">
        <div className="hidden h-2 flex-1 rounded-full bg-muted/40 overflow-hidden sm:block">
          <div
            className={`h-full ml-auto rounded-full bg-gradient-to-l ${leftWin ? "from-sky-400 to-blue-600" : "from-slate-500 to-slate-600"}`}
            style={{ width: `${lPct}%`, marginLeft: "auto" }}
          />
        </div>
        <span
          className={`text-sm tabular-nums font-semibold w-12 text-right sm:w-16 ${leftWin ? "text-sky-300" : "text-muted-foreground"}`}
        >
          {left}
          {suffix}
        </span>
      </div>
      <div
        className="min-w-[84px] text-center text-[11px] uppercase tracking-wider text-muted-foreground sm:min-w-[130px] sm:text-xs"
        title={hint}
      >
        {label}
        {hint ? (
          <div className="mt-0.5 hidden text-[10px] normal-case tracking-normal text-muted-foreground/80 sm:block">
            {hint}
          </div>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`text-sm tabular-nums font-semibold w-12 sm:w-16 ${rightWin ? "text-rose-300" : "text-muted-foreground"}`}
        >
          {right}
          {suffix}
        </span>
        <div className="hidden h-2 flex-1 rounded-full bg-muted/40 overflow-hidden sm:block">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${rightWin ? "from-rose-500 to-pink-600" : "from-slate-500 to-slate-600"}`}
            style={{ width: `${rPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TrendBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) < 3)
    return (
      <span className="inline-flex items-center gap-1 text-slate-300">
        <Minus className="h-3 w-3" /> Steady
      </span>
    );
  if (delta > 0)
    return (
      <span className="inline-flex items-center gap-1 text-emerald-400">
        <TrendingUp className="h-3 w-3" /> Heating up +{delta}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-rose-400">
      <TrendingDown className="h-3 w-3" /> Cooling {delta}
    </span>
  );
}

function PlayerHeader({
  bundle,
  analysis,
  side,
}: {
  bundle: PlayerBundle;
  analysis: Analysis;
  side: "left" | "right";
}) {
  const color = side === "left" ? "text-sky-300" : "text-rose-300";
  const align = side === "left" ? "items-start text-left" : "items-end text-right";
  return (
    <div className={`flex flex-col ${align} gap-1`}>
      <div className="text-xs uppercase tracking-widest text-muted-foreground">
        #{bundle.pdgaNumber}
      </div>
      <div className="text-xl font-bold">{bundle.profile?.name ?? "Unknown player"}</div>
      <div className="text-xs text-muted-foreground">{bundle.profile?.location ?? ""}</div>
      {bundle.division ? (
        <div
          className={`inline-flex ${side === "right" ? "self-end" : "self-start"} items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-primary`}
        >
          {bundle.division} division
        </div>
      ) : null}
      <div className={`text-6xl font-black tabular-nums ${color}`}>{analysis.rating || "—"}</div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        PDGA player rating
      </div>
      {analysis.projected > 0 && analysis.projected !== analysis.rating ? (
        <div className="text-[11px] text-muted-foreground">
          DGD projection for next PDGA update:{" "}
          <span className="font-semibold text-foreground">{analysis.projected}</span>
        </div>
      ) : null}
      <TrendBadge delta={analysis.trendDelta} />
    </div>
  );
}

function ComparePage() {
  const lookup = useLookup();
  const [leftInput, setLeftInput] = useState("");
  const [rightInput, setRightInput] = useState("");
  const [left, setLeft] = useState<PlayerBundle | null>(null);
  const [right, setRight] = useState<PlayerBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const didAutoRun = useRef(false);
  // The signed-in player's PDGA number seeds the left side of a Face Off that
  // starts from a lookup, and enables the Face Off share link in the lookup.
  const [myPdga, setMyPdga] = useState<string | null>(null);
  const getMine = useServerFn(getMyPdgaLab);
  const lookupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const a = params.get("a");
    const b = params.get("b");
    if (a) setLeftInput(a);
    if (b) setRightInput(b);
  }, []);

  useEffect(() => {
    getMine()
      .then((mine) => setMyPdga(mine?.pdgaNumber ?? null))
      .catch(() => setMyPdga(null));
  }, [getMine]);

  const runCompare = useCallback(async () => {
    if (!leftInput.trim() || !rightInput.trim()) {
      toast.error("Enter both PDGA numbers");
      return;
    }
    setLoading(true);
    // Independent lookups: one failure no longer blanks the other player.
    const [a, b] = await Promise.all([lookup(leftInput), lookup(rightInput)]);
    if (a.ok) setLeft(a.bundle);
    else {
      setLeft(null);
      toast.error(a.error);
    }
    if (b.ok) setRight(b.bundle);
    else {
      setRight(null);
      toast.error(b.error);
    }
    if (a.ok && b.ok) {
      if (a.bundle.rounds.length === 0 && b.bundle.rounds.length === 0) {
        toast.warning(
          "Neither player has rated PDGA rounds — comparison uses profile ratings only.",
        );
      } else if (a.bundle.rounds.length === 0) {
        toast.warning(
          `${a.bundle.profile?.name ?? `#${a.bundle.pdgaNumber}`} has no rated rounds — history chart will be empty on their side.`,
        );
      } else if (b.bundle.rounds.length === 0) {
        toast.warning(
          `${b.bundle.profile?.name ?? `#${b.bundle.pdgaNumber}`} has no rated rounds — history chart will be empty on their side.`,
        );
      }
    }
    setLoading(false);
  }, [leftInput, rightInput, lookup]);

  useEffect(() => {
    if (didAutoRun.current) return;
    if (leftInput && rightInput && !left && !right && !loading) {
      didAutoRun.current = true;
      runCompare();
    }
  }, [leftInput, rightInput, left, right, loading, runCompare]);

  /**
   * Face Off straight from a lookup: the looked-up player takes the right
   * slot, the signed-in player fills the left slot when it is empty.
   */
  const faceOffWith = useCallback(
    async (pdgaNumber: string) => {
      const leftPdga = leftInput.trim() || myPdga;
      if (!leftPdga) {
        toast.error("Add your PDGA number in your profile, or enter Player 1 above.");
        return;
      }
      setLeftInput(leftPdga);
      setRightInput(pdgaNumber);
      setLoading(true);
      const [a, b] = await Promise.all([lookup(leftPdga), lookup(pdgaNumber)]);
      if (a.ok) setLeft(a.bundle);
      else toast.error(a.error);
      if (b.ok) setRight(b.bundle);
      else toast.error(b.error);
      setLoading(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [leftInput, myPdga, lookup],
  );

  const swap = () => {
    setLeftInput(rightInput);
    setRightInput(leftInput);
    setLeft(right);
    setRight(left);
  };

  const share = async () => {
    if (!left || !right) {
      toast.error("Run a Face Off first, then share the results.");
      return;
    }
    const url = `${window.location.origin}/compare?a=${left.pdgaNumber}&b=${right.pdgaNumber}&ref=invite`;
    const leftName = left.profile?.name ?? `PDGA #${left.pdgaNumber}`;
    const rightName = right.profile?.name ?? `PDGA #${right.pdgaNumber}`;
    const la = analyze(left.rounds, left.profile?.current_rating ?? null);
    const ra = analyze(right.rounds, right.profile?.current_rating ?? null);
    const p = winProbability(la.rating, ra.rating);
    const favored = p >= 0.5 ? leftName : rightName;
    const pct = Math.round((p >= 0.5 ? p : 1 - p) * 100);
    const title = `${leftName} vs ${rightName} — DG Statboard Face Off`;
    const text = `${leftName} (${la.rating}) vs ${rightName} (${ra.rating}) — ${favored} favored ${pct}%. See the full head-to-head and join me on DG Statboard:`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success("Matchup + invite link copied — send it to your player!");
    } catch {
      toast.error("Copy failed");
    }
  };

  const analyzed = useMemo(() => {
    if (!left || !right) return null;
    const la = analyze(left.rounds, left.profile?.current_rating ?? null);
    const ra = analyze(right.rounds, right.profile?.current_rating ?? null);
    const p = winProbability(la.rating, ra.rating);
    return { la, ra, p };
  }, [left, right]);

  const historyData = useMemo(() => {
    if (!left || !right) return [];
    const la = monthlyHistory(
      left.rounds.filter((r) => r.round_rating > 0),
      12,
    );
    const ra = monthlyHistory(
      right.rounds.filter((r) => r.round_rating > 0),
      12,
    );
    return la.map((row, i) => ({
      month: row.month,
      left: row.rating || null,
      right: ra[i]?.rating || null,
    }));
  }, [left, right]);

  return (
    <PageShell section="statlink">
      <PageHeader
        eyebrow="DG Statboard"
        leading={<Swords className="h-6 w-6 text-primary" aria-hidden />}
        title="PDGA Player Stat Search"
        description="Look up any PDGA player, then go head-to-head — ratings, form, and win probability."
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            onClick={share}
            disabled={!left || !right}
            title={left && right ? "Share these results" : "Run a Face Off to share"}
          >
            <Share2 className="mr-2 h-4 w-4" /> Share results
          </Button>
        }
        secondaryAction={
          <Button asChild variant="ghost" size="sm">
            <Link to="/stats">← DG Statboard</Link>
          </Button>
        }
      />

      <StatlinkSubnav activeTool="compare" />

      {/* Input */}
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
          <div>
            <Label>Player 1 PDGA #</Label>
            <Input
              placeholder="e.g. 12345"
              value={leftInput}
              onChange={(e) => setLeftInput(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={swap} title="Swap" className="mb-1">
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
          <div>
            <Label>Player 2 PDGA #</Label>
            <Input
              placeholder="e.g. 12345"
              value={rightInput}
              onChange={(e) => setRightInput(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <Button onClick={runCompare} disabled={loading}>
            <Sparkles className="h-4 w-4 mr-1" /> {loading ? "Fetching…" : "Face Off"}
          </Button>
        </div>
      </Card>

      {analyzed && left && right && (
        <>
          {left.division && right.division && left.division !== right.division ? (
            <Card className="p-3 border-amber-500/50 bg-amber-500/10">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
                <div className="text-amber-100">
                  <strong className="font-semibold">
                    {left.profile?.name ?? `#${left.pdgaNumber}`}
                  </strong>{" "}
                  plays <span className="font-semibold">{left.division}</span> and{" "}
                  <strong className="font-semibold">
                    {right.profile?.name ?? `#${right.pdgaNumber}`}
                  </strong>{" "}
                  plays <span className="font-semibold">{right.division}</span>. They don't compete
                  against each other in sanctioned play — this Face Off is informational only.
                </div>
              </div>
            </Card>
          ) : null}
          {/* Hero */}
          <Card className="p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-slate-800">
            <div className="grid grid-cols-1 gap-4 items-center sm:grid-cols-3">
              <PlayerHeader bundle={left} analysis={analyzed.la} side="left" />
              <div className="flex flex-col items-center gap-2">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">VS</div>
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${analyzed.p >= 0.5 ? "text-sky-300" : "text-rose-300"}`}
                  >
                    {Math.round((analyzed.p >= 0.5 ? analyzed.p : 1 - analyzed.p) * 100)}%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    win probability ·{" "}
                    {(analyzed.p >= 0.5 ? left : right).profile?.name?.split(" ")[0] ?? "leader"}{" "}
                    favored
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 className="h-3 w-3 mr-1" /> Share matchup
                </Button>
              </div>
              <PlayerHeader bundle={right} analysis={analyzed.ra} side="right" />
            </div>
          </Card>

          {/* Matchup bars */}
          <Card className="p-5">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3 text-center">
              Matchup
            </div>
            <StatRow
              label="PDGA player rating"
              hint="Official current rating from pdga.com"
              left={analyzed.la.rating}
              right={analyzed.ra.rating}
            />
            <StatRow
              label="Peak projected rating (DGD)"
              hint="Highest rolling rating DG Dashboard projects from PDGA round ratings — not an official PDGA rating"
              left={analyzed.la.bestRating}
              right={analyzed.ra.bestRating}
            />
            <StatRow
              label="Lowest projected rating (DGD)"
              hint="Lowest rolling projection over the same span — not an official PDGA rating"
              left={analyzed.la.worstRating}
              right={analyzed.ra.worstRating}
            />
            <StatRow
              label="Highest rated single PDGA round"
              hint="Best round rating published by the PDGA"
              left={analyzed.la.ext.highest ?? 0}
              right={analyzed.ra.ext.highest ?? 0}
            />
            <StatRow
              label="Average PDGA round rating"
              hint="Average of every PDGA-rated round"
              left={analyzed.la.ext.average ?? 0}
              right={analyzed.ra.ext.average ?? 0}
            />
            <StatRow
              label="Lowest rated single PDGA round"
              hint="Worst round rating published by the PDGA"
              left={analyzed.la.ext.lowest ?? 0}
              right={analyzed.ra.ext.lowest ?? 0}
            />
            <StatRow
              label="Round-to-round consistency (±SD)"
              hint="Spread of the last 20 PDGA round ratings — lower is steadier"
              left={analyzed.la.sd.toFixed(1)}
              right={analyzed.ra.sd.toFixed(1)}
              higherWins={false}
            />
            <StatRow
              label="Recent form swing"
              hint="Last 8 PDGA rounds against the 8 before them, blended with the projection gap"
              left={analyzed.la.trendDelta}
              right={analyzed.ra.trendDelta}
            />
            <StatRow
              label="PDGA rated rounds"
              hint="Count of rounds with a published PDGA rating"
              left={analyzed.la.roundCount}
              right={analyzed.ra.roundCount}
            />
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Ratings marked DGD are DG Dashboard projections built from published PDGA round
              ratings. Only the PDGA player rating is official.
            </p>
          </Card>

          {/* History chart */}
          <Card className="p-5">
            <div className="text-xs uppercase tracking-widest text-sky-400 mb-3">
              DGD projected rating history · 12 mo
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="cmpLeftFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.sky} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartColors.sky} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="cmpRightFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.rose} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={chartColors.rose} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                  <XAxis dataKey="month" stroke={chartColors.neutral} fontSize={11} />
                  <YAxis stroke={chartColors.neutral} fontSize={11} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{
                      background: chartColors.bgTooltip,
                      border: `1px solid ${chartColors.grid}`,
                    }}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="left"
                    name={left.profile?.name ?? "Player 1"}
                    stroke={chartColors.sky}
                    strokeWidth={2.5}
                    fill="url(#cmpLeftFill)"
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="right"
                    name={right.profile?.name ?? "Player 2"}
                    stroke={chartColors.rose}
                    strokeWidth={2.5}
                    fill="url(#cmpRightFill)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Fun verdict */}
          <Card className="p-5 bg-gradient-to-r from-sky-950/40 to-rose-950/40">
            <div className="text-center space-y-1">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                The Verdict
              </div>
              <div className="text-lg">
                On paper,{" "}
                <span className="font-bold text-sky-300">
                  {analyzed.p >= 0.5 ? left.profile?.name : right.profile?.name}
                </span>{" "}
                takes it — but{" "}
                {Math.abs(analyzed.la.trendDelta) > Math.abs(analyzed.ra.trendDelta)
                  ? left.profile?.name
                  : right.profile?.name}{" "}
                has the momentum.
              </div>
              <div className="text-xs text-muted-foreground">
                Rating gap: {Math.abs(analyzed.la.rating - analyzed.ra.rating)} pts
              </div>
            </div>
          </Card>
        </>
      )}

      {/* Player Lookup lives here so a lookup can flow straight into a Face
          Off. It starts blank — type any PDGA number to load that player. */}
      <Card className="p-4 space-y-3" ref={lookupRef}>
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold">Player lookup</h2>
          <p className="text-sm text-muted-foreground">
            Look up any PDGA player's rating history and projections, then Face Off with them or
            share either page with a link.
          </p>
        </div>
        <RatingStudio
          hideHeader
          autoLoadMine={false}
          onFaceOff={faceOffWith}
          faceOffPdga={myPdga}
        />
      </Card>
    </PageShell>
  );
}
