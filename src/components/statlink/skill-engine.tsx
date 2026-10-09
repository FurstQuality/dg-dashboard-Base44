import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Flag, Target as TargetIcon, Info } from "lucide-react";
import { getSkillEngine } from "@/lib/stats.functions";
import { RATING_PER_STROKE } from "@/lib/stats/skill-engine";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { useSession } from "@/lib/current-user";
import { StatlinkErrorState, StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";

type Report = Awaited<ReturnType<typeof getSkillEngine>>;

/**
 * Skill Engine tab (Phase 6). Reads hole-level scored rounds and translates
 * them into coaching insight: rating leaks by category, par + distance
 * scoring baselines, putt/OB reliability, and estimated rating upside.
 *
 * All numbers are DG Dashboard Calculated — the report explains its own math so
 * users can trust or discard each tile.
 */
export function SkillEngineTab({ source }: { source?: "pdga" | "udisc" | "chainlink" }) {
  const skill = useServerFn(getSkillEngine);
  const { session } = useSession();
  const gated = source === "pdga" || source === "udisc";
  const q = useQuery<Report>({
    queryKey: statsKeys.skills(session?.user?.id, source ?? "all"),
    queryFn: () => skill({ data: { source: source ?? null } }),
    staleTime: STATS_STALE.aggregates,
    enabled: !gated,
  });
  const { data, isLoading } = q;


  const empty = !data || data.holesTracked === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TargetIcon className="h-4 w-4 text-primary" />
                Skill Engine
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                DG Dashboard Calculated · derived from your hole-by-hole scored rounds. Not a PDGA
                metric — use it to prioritize practice.
              </p>
            </div>
            <Badge
              variant="outline"
              className="shrink-0 border-accent/40 text-[10px] uppercase tracking-widest text-accent"
            >
              Coaching
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {gated ? (
            <GatedNotice source={source!} />
          ) : q.isError ? (
            <StatlinkErrorState
              title="Skill Engine didn't load"
              message="We couldn't analyze your scored rounds just now."
              onRetry={() => void q.refetch()}
              retrying={q.isFetching}
            />
          ) : isLoading ? (
            <StatlinkPanelSkeleton label="Analyzing your scored rounds…" rows={2} />
          ) : empty ? (
            <EmptyState />
          ) : (
            <UpsideStrip data={data!} />
          )}
        </CardContent>

      </Card>

      {!gated && !empty && (
        <>
          <Leaks data={data!} />
        </>
      )}
    </div>
  );
}

/** By par, reliability and distance tables — shown on the Scoring tab. Shares the Skill Engine query cache. */
export function SkillScoringBreakdown() {
  const skill = useServerFn(getSkillEngine);
  const { session } = useSession();
  const q = useQuery<Report>({
    queryKey: statsKeys.skills(session?.user?.id, "all"),
    queryFn: () => skill({ data: { source: null } }),
    staleTime: STATS_STALE.aggregates,
  });
  const data = q.data;
  if (!data || data.holesTracked === 0) return null;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ParTable data={data} />
        <ReliabilityTiles data={data} />
      </div>
      <DistanceTable data={data} />
    </div>
  );
}

function GatedNotice({ source }: { source: "pdga" | "udisc" }) {
  const label = source === "pdga" ? "PDGA" : "UDisc";
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
      <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-semibold">Skill Engine requires DG Dashboard scored rounds</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {label} rounds don't include hole-by-hole strokes, putts, or penalties, so the Skill Engine
        can't analyze them. Switch the Round Source picker to
        <span className="font-medium text-foreground"> DG Dashboard</span> to see coaching insight
        from rounds you've scored in the app.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-6 text-center">
      <Info className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <div className="text-sm font-semibold">No hole-by-hole rounds yet</div>
      <p className="mt-1 text-xs text-muted-foreground">
        Score a round with the DG Dashboard scorecard — the Skill Engine needs per-hole strokes,
        putts, and penalties to build coaching insight. Rating history from PDGA/UDisc lives in the
        History tab.
      </p>
    </div>
  );
}

function UpsideStrip({ data }: { data: Report }) {
  const tiles = [
    {
      label: "Holes analyzed",
      value: data.holesTracked.toString(),
      sub: `${data.roundsTracked} scored rounds`,
    },
    {
      label: "Strokes lost / round",
      value: data.totalStrokesLostPerRound.toFixed(1),
      sub: "vs elite baseline",
    },
    {
      label: "Rating upside",
      value: `+${data.totalRatingUpside}`,
      sub: `≈ ${RATING_PER_STROKE} pts / stroke`,
    },
    {
      label: "Leaks identified",
      value: data.leaks.length.toString(),
      sub: `${data.strengths.length} strengths`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t.label}
          </div>
          <div className="mt-0.5 text-2xl font-bold tabular-nums leading-none">{t.value}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">{t.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Leaks({ data }: { data: Report }) {
  const leaks = data.leaks;
  const strengths = data.strengths;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Rating leaks
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Categories costing the most strokes per round vs an elite baseline.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaks.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No significant leaks detected — you match or beat the baseline everywhere with a large
              enough sample.
            </div>
          ) : (
            leaks.map((l) => (
              <div key={l.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{l.category}</div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-amber-500/40 text-[10px] text-amber-600"
                  >
                    −{l.strokesPerRound.toFixed(1)} str/rd · ~{l.ratingImpact} rating
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{l.suggestion}</p>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Sample · {l.sample} holes
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Strengths
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Categories where you already beat the elite baseline. Protect these.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {strengths.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              Not enough over-performing samples yet.
            </div>
          ) : (
            strengths.map((s) => (
              <div
                key={s.id}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-semibold">{s.category}</div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-emerald-500/40 text-[10px] text-emerald-600"
                  >
                    +{Math.abs(s.strokesPerRound).toFixed(1)} str/rd
                  </Badge>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Sample · {s.sample} holes
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ParTable({ data }: { data: Report }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Flag className="h-4 w-4 text-primary" />
          By par
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Scoring average per par type vs elite baseline.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Par</th>
                <th className="px-2 py-1 text-right">Holes</th>
                <th className="px-2 py-1 text-right">Your avg</th>
                <th className="px-2 py-1 text-right">Elite</th>
                <th className="px-2 py-1 text-right">Δ</th>
                <th className="px-2 py-1 text-right">Birdie%</th>
                <th className="px-2 py-1 text-right">Bogey+%</th>
              </tr>
            </thead>
            <tbody>
              {data.byPar.map((b) => (
                <tr key={b.par} className="border-t border-border/40">
                  <td className="px-2 py-1.5 font-semibold">Par {b.par}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.holes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(b.scoringAvg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmt(b.eliteVsPar)}
                  </td>
                  <td
                    className={
                      "px-2 py-1.5 text-right tabular-nums font-semibold " +
                      (b.strokesLost > 0 ? "text-amber-600" : "text-emerald-600")
                    }
                  >
                    {b.strokesLost > 0 ? "+" : ""}
                    {b.strokesLost.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.birdiePct}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.bogeyPlusPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DistanceTable({ data }: { data: Report }) {
  if (data.distance.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By distance bucket</CardTitle>
        <p className="text-xs text-muted-foreground">
          Uses your course's hole distances. Buckets with fewer than 6 holes are shown but excluded
          from leak scoring.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-2 py-1 text-left">Bucket</th>
                <th className="px-2 py-1 text-right">Holes</th>
                <th className="px-2 py-1 text-right">Your avg</th>
                <th className="px-2 py-1 text-right">Elite</th>
                <th className="px-2 py-1 text-right">Δ str/hole</th>
                <th className="px-2 py-1 text-right">Birdie%</th>
              </tr>
            </thead>
            <tbody>
              {data.distance.map((b) => (
                <tr key={b.key} className="border-t border-border/40">
                  <td className="px-2 py-1.5 font-medium">{b.label}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.holes}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(b.scoringAvg)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmt(b.eliteVsPar)}
                  </td>
                  <td
                    className={
                      "px-2 py-1.5 text-right tabular-nums font-semibold " +
                      (b.strokesLost > 0 ? "text-amber-600" : "text-emerald-600")
                    }
                  >
                    {b.strokesLost > 0 ? "+" : ""}
                    {b.strokesLost.toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{b.birdiePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReliabilityTiles({ data }: { data: Report }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Reliability</CardTitle>
        <p className="text-xs text-muted-foreground">
          Putting and penalty exposure across all scored holes.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tile
          label="Avg putts per green"
          value={data.putts.avg != null ? data.putts.avg.toFixed(2) : "—"}
          sub={
            data.putts.avg != null
              ? `${data.putts.holes} holes tracked · elite ≈ 1.55`
              : "Log putts while scoring"
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="One-putt rate"
            value={data.putts.holes ? `${data.putts.onePuttPct}%` : "Not tracked"}
            sub={data.putts.holes ? `${data.putts.holes} holes` : "Log putts while scoring"}
          />
          <Tile
            label="Three-putt rate"
            value={data.putts.holes ? `${data.putts.threePuttPct}%` : "Not tracked"}
            sub={data.putts.holes ? `${data.putts.holes} holes` : "Log putts while scoring"}
            tone={data.putts.threePuttPct > 5 ? "warn" : undefined}
          />
        </div>
        <Tile
          label="OB / penalty rate"
          value={data.ob.rate != null ? `${data.ob.rate}%` : "Not tracked"}
          sub={
            data.ob.rate != null
              ? `${data.ob.holesWithPenalty} of ${data.ob.holes} holes · elite ≈ 3%`
              : "Log penalties while scoring"
          }
          tone={data.ob.rate != null && data.ob.rate > 6 ? "warn" : undefined}
        />
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "warn";
}) {
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (tone === "warn" ? "border-amber-500/40 bg-amber-500/5" : "border-border/60 bg-card")
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xl font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function fmt(v: number): string {
  const s = v.toFixed(2);
  return v > 0 ? `+${s}` : s;
}
