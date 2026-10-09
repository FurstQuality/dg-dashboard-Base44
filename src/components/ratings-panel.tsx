import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAllRatings, getRatingSnapshot } from "@/lib/stats.functions";
import { formatUpdateDate, daysUntil } from "@/lib/stats/pdga-update";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BadgeCheck, CalendarClock, Link2, TrendingDown, TrendingUp, Users } from "lucide-react";
import {
  PdgaCalculationDrawer,
  DgdRatingCalculationDrawer,
} from "@/components/statlink/calculation-drawer";

type Verified = "verified" | "provisional" | "insufficient";

type Forecast = {
  nextDate: Date;
  daysAway: number;
  projected: number | null;
  delta: number | null;
  roundsSinceLastUpdate: number;
};

const VERIFIED_LABEL: Record<Verified, string> = {
  verified: "Verified",
  provisional: "Provisional",
  insufficient: "Not rated yet",
};

const VERIFIED_TONE: Record<Verified, string> = {
  verified: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  provisional: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  insufficient: "bg-muted text-muted-foreground border-border",
};

import { useMyDgdRating } from "@/lib/dgd-identity";

/** Public DGD Rating (V1.3, 500–1200). Replaces the retired DG Dashboard projection card. */
function DgdNowCard() {
  const q = useMyDgdRating();
  const s = q.data;
  const rating: number | null = s?.available ? (s.display_rating ?? null) : null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-base leading-tight">
          <Link2 className="h-4 w-4 text-accent" /> DGD Rating
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          One rating from every eligible round — PDGA, UDisc singles with cardmates, and rounds scored here — on a 500–1200 scale. It sits beside your PDGA rating and never replaces it.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end gap-3">
          <div className="font-display text-4xl font-bold tabular-nums text-accent">{q.isLoading ? "…" : (rating ?? "—")}</div>
          {rating != null ? <span className="mb-1.5 text-xs text-muted-foreground">Form {s?.form_value ?? "—"} · Confidence {s?.confidence ?? "—"}%</span> : null}
        </div>
        {rating == null && !q.isLoading ? (
          <p className="text-xs text-muted-foreground">Not rated yet. Import PDGA or UDisc rounds, or score a round with cardmates.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RatingsPanel() {
  const fn = useServerFn(getAllRatings);
  const snap = useServerFn(getRatingSnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["all-ratings"],
    queryFn: () => fn(),
  });
  // Share cache with the StatLink Overview so we don't refetch.
  const { data: snapshot } = useQuery({
    queryKey: ["stats", "snapshot", "pdga"],
    // StatLink outside the DG Statboard switcher is PDGA-driven.
    queryFn: () => snap({ data: { source: "pdga" } }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ratings</CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Crunching your rounds…
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;
  const { pdga, chainlink } = data;

  const forecast: Forecast | null = snapshot
    ? {
        nextDate: new Date(snapshot.nextUpdateIso),
        daysAway: daysUntil(new Date(snapshot.nextUpdateIso)),
        projected: snapshot.projected.rating,
        delta: snapshot.projected.delta,
        roundsSinceLastUpdate: snapshot.roundsSinceLastUpdate ?? 0,
      }
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Your Ratings</h2>
        <p className="text-xs text-muted-foreground">
          Anchored on PDGA, tuned by in-app head-to-head.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SourceCard
          title="PDGA Rating"
          badge="Sanctioned events"
          tint="from-blue-500/10 to-blue-500/0"
          rating={pdga.rating}
          verified={pdga.verified}
          usedRounds={pdga.usedRounds}
          windowMonths={pdga.windowMonths}
          best={pdga.bestRound}
          average={pdga.average}
          emptyHint="No PDGA-rated singles rounds in the last 24 months. Import them from PDGA.com under Progress → Import Rounds."
          forecast={forecast}
        />
        <DgdNowCard />
      </div>
    </div>
  );
}

function SourceCard(props: {
  title: string;
  badge: string;
  tint: string;
  rating: number | null;
  verified: Verified;
  usedRounds: number;
  windowMonths: number;
  best: number | null;
  average: number | null;
  emptyHint: string;
  forecast?: Forecast | null;
}) {
  const {
    title,
    badge,
    tint,
    rating,
    verified,
    usedRounds,
    windowMonths,
    best,
    average,
    emptyHint,
    forecast,
  } = props;
  return (
    <Card className={`overflow-hidden bg-gradient-to-br ${tint}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base leading-tight">{title}</CardTitle>
          {verified === "verified" && <BadgeCheck className="h-5 w-5 text-emerald-600" />}
        </div>
        <p className="text-xs text-muted-foreground">{badge}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-end gap-3">
          <div className="font-display text-4xl font-bold tabular-nums">
            {rating != null ? rating : "—"}
          </div>
          <Badge variant="outline" className={`mb-1 ${VERIFIED_TONE[verified]}`}>
            {VERIFIED_LABEL[verified]}
          </Badge>
        </div>
        {rating != null ? (
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>
              {usedRounds} rounds used · last {windowMonths} months
            </p>
            {best != null && average != null && (
              <p>
                Best {best} · Avg {average}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{emptyHint}</p>
        )}

        <div className="-mx-2 -mb-1">
          <PdgaCalculationDrawer
            rating={rating}
            usedRounds={usedRounds}
            windowMonths={windowMonths}
          />
        </div>

        {forecast && rating != null && (
          <div className="mt-3 rounded-lg border border-border/60 bg-background/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <CalendarClock className="h-3 w-3" /> Next PDGA update
              </div>
              <span className="text-[10px] text-muted-foreground">
                {forecast.daysAway === 0 ? "Today" : `${forecast.daysAway}d away`}
              </span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm font-semibold leading-tight">
                  {formatUpdateDate(forecast.nextDate)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {forecast.roundsSinceLastUpdate} rated round
                  {forecast.roundsSinceLastUpdate === 1 ? "" : "s"} since last update
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Projected
                </div>
                <div className="flex items-baseline justify-end gap-1.5">
                  <div className="text-xl font-bold tabular-nums text-primary">
                    {forecast.projected ?? "—"}
                  </div>
                  {forecast.delta != null && forecast.delta !== 0 && (
                    <Badge
                      variant={forecast.delta > 0 ? "default" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {forecast.delta > 0 ? "+" : ""}
                      {forecast.delta}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DgdRatingCard({
  chainlink,
}: {
  chainlink: {
    rating: number | null;
    base: number | null;
    pdgaComponent: number | null;
    headToHeadDelta: number;
    headToHeadRounds: number;
    headToHeadImplied: number | null;
    confidence: "high" | "medium" | "low" | "insufficient";
    weightPdga: number;
    ceiling: number | null;
    floor: number | null;
    average: number | null;
    ceilingHitRate: number;
    upsideFrequency: number;
    downsideFrequency: number;
    recentTrend: number;
    ceilingBonus: number;
    sampleSize: number;
  };
}) {
  const {
    rating,
    base,
    headToHeadDelta,
    headToHeadRounds,
    headToHeadImplied,
    confidence,
    ceiling,
    floor,
    average,
    ceilingHitRate,
    upsideFrequency,
    downsideFrequency,
    recentTrend,
    ceilingBonus,
    sampleSize,
  } = chainlink;

  const confLabel = {
    high: "High confidence",
    medium: "Medium confidence",
    low: "Low confidence",
    insufficient: "Not rated yet",
  }[confidence];
  const confTone = {
    high: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
    medium: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
    low: "bg-muted text-muted-foreground border-border",
    insufficient: "bg-muted text-muted-foreground border-border",
  }[confidence];

  const totalDelta = base != null && rating != null ? rating - base : 0;

  return (
    <Card className="overflow-hidden bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent border-cyan-500/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-base leading-tight">
            <Link2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
            DGD Rating
          </CardTitle>
          <Badge
            variant="outline"
            className="text-[10px] border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 uppercase tracking-wide"
            title="DG Dashboard calculated. Not an official PDGA rating."
          >
            Estimate
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Compiled from <b>all</b> your rounds in the app — PDGA, UDisc, and DG Dashboard. The more
          rounds you upload, the more accurate it becomes. Not an official PDGA rating and does not
          affect division eligibility.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="font-display text-4xl font-bold tabular-nums text-cyan-700 dark:text-cyan-300">
            {rating != null ? rating : "—"}
          </div>
          <span className="mb-1.5 text-xs font-medium text-muted-foreground">estimated</span>
          <Badge variant="outline" className={`mb-1 ${confTone}`}>
            {confLabel}
          </Badge>
          {totalDelta !== 0 && (
            <span
              className={`mb-1.5 inline-flex items-center gap-0.5 text-xs font-semibold ${totalDelta > 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {totalDelta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {totalDelta > 0 ? "+" : ""}
              {totalDelta} vs official
            </span>
          )}
        </div>

        {rating == null ? (
          <p className="text-xs text-muted-foreground">
            Import PDGA or UDisc rounds, or play scored in-app rounds, to unlock your DGD Rating.
          </p>
        ) : (
          <>
            {/* High / Average / Low form levels — peak capability shown separately, not baked into the rating. */}
            {ceiling != null && floor != null && average != null && (
              <div className="grid grid-cols-3 gap-2 rounded-md border border-border/60 bg-background/60 p-2">
                <Stat label="High form" value={ceiling} tone="emerald" />
                <Stat label="Central" value={average} />
                <Stat label="Low form" value={floor} tone="red" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Upside rounds</span>
              <span className="text-right text-foreground font-medium">{upsideFrequency}%</span>
              <span>High-form frequency</span>
              <span className="text-right text-foreground font-medium">{ceilingHitRate}%</span>
              <span>Blow-up rate</span>
              <span className="text-right text-foreground font-medium">{downsideFrequency}%</span>
              <span>Recent trend</span>
              <span
                className={`text-right font-medium ${recentTrend > 0 ? "text-emerald-600" : recentTrend < 0 ? "text-red-600" : "text-foreground"}`}
              >
                {recentTrend > 0 ? "+" : ""}
                {recentTrend}
              </span>
            </div>

            <div className="space-y-1 border-t border-border/60 pt-2 text-xs text-muted-foreground">
              {base != null && (
                <p>
                  Anchored to official PDGA rating <span className="text-foreground">{base}</span>
                </p>
              )}
              {base == null && headToHeadImplied != null && (
                <p>
                  Implied from in-app play:{" "}
                  <span className="text-foreground">{headToHeadImplied}</span>
                </p>
              )}
              {headToHeadRounds > 0 && (
                <p className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {headToHeadRounds} in-app round{headToHeadRounds === 1 ? "" : "s"} vs PDGA-rated
                  {headToHeadDelta !== 0 && (
                    <span className={headToHeadDelta > 0 ? "text-emerald-600" : "text-red-600"}>
                      {" · "}
                      {headToHeadDelta > 0 ? "+" : ""}
                      {headToHeadDelta}
                    </span>
                  )}
                </p>
              )}
              <p>
                Based on {sampleSize} rated round{sampleSize === 1 ? "" : "s"} · model v1.0
              </p>
              {/* ceilingBonus intentionally not displayed — removed in Phase 1. */}
              {ceilingBonus > 0 && null}
            </div>

            <div className="-mx-2 -mb-1">
              <DgdRatingCalculationDrawer
                rating={rating}
                base={base}
                average={average}
                ceiling={ceiling}
                floor={floor}
                recentTrend={recentTrend}
                headToHeadDelta={headToHeadDelta}
                headToHeadRounds={headToHeadRounds}
                sampleSize={sampleSize}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "emerald" | "red" }) {
  const color =
    tone === "emerald" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-foreground";
  return (
    <div className="text-center">
      <div className={`font-display text-lg font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
