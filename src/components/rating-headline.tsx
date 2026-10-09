import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getAllRatings, getRatingSnapshot } from "@/lib/stats.functions";
import { listMySchedule } from "@/lib/scheduled-events.functions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Link2,
  TrendingDown,
  TrendingUp,
  Users,
  Sparkles,
  Trophy,
  CalendarClock,
  CalendarDays,
} from "lucide-react";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { ratingDraft } from "@/lib/share-to-feed";

/**
 * Compact headline card — big rating number, quick trend, key insights,
 * and CTA to the DG Statboard. Drop into the feed, profile header,
 * dashboards, or anywhere the player benefits from "where do I stand?"
 * at a glance.
 */
import { useMyDgdRating } from "@/lib/dgd-identity";

export function RatingHeadline({ variant = "full" }: { variant?: "full" | "compact" }) {
  const ratingsFn = useServerFn(getAllRatings);
  const snapshotFn = useServerFn(getRatingSnapshot);
  const scheduleFn = useServerFn(listMySchedule);

  const dgdQ = useMyDgdRating();
  const { data, isLoading } = useQuery({
    queryKey: ["all-ratings"],
    queryFn: () => ratingsFn(),
    staleTime: 60_000,
  });
  const { data: snap } = useQuery({
    queryKey: ["stats", "snapshot", "pdga"],
    // DG Statboard outside the DG Statboard switcher is PDGA-driven.
    queryFn: () => snapshotFn({ data: { source: "pdga" } }),
    enabled: variant === "full",
    staleTime: 60_000,
  });
  const { data: schedule } = useQuery({
    queryKey: ["my-schedule-mini"],
    queryFn: () => scheduleFn(),
    enabled: variant === "full",
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card className="p-4 flex items-center justify-between gap-3 bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/30">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your Rating
          </div>
          <div className="font-display text-3xl font-bold tabular-nums text-muted-foreground">
            …
          </div>
        </div>
        <Link
          to="/stats"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 shrink-0"
        >
          DG Statboard <ArrowRight className="h-3 w-3" />
        </Link>
      </Card>
    );
  }

  const pdga = data.pdga.rating;
  // Public DGD Rating is V1.3 on the 500–1200 scale; it is never compared point-for-point with PDGA.
  const chain: number | null = dgdQ.data?.available ? (dgdQ.data.display_rating ?? null) : null;
  const primary = chain;
  const delta = 0;

  if (variant === "compact") {
    return (
      <Link
        to="/stats"
        className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
        title="Open DG Statboard"
      >
        <Link2 className="h-3.5 w-3.5" />
        <span className="tabular-nums">{primary ?? "—"}</span>
        {delta !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </Link>
    );
  }

  // ── Insights ─────────────────────────────────────────────────────────
  const bestRound = snap?.current.bestRound ?? null;
  const projected = snap?.projected.rating ?? null;
  const projDelta = snap?.projected.delta ?? null;
  const nextUpdate = snap?.nextUpdateIso
    ? new Date(snap.nextUpdateIso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  // Next event: earliest upcoming across scheduled + hosted tournaments
  type NextEvt = { name: string; date: string | null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming: NextEvt[] = [];
  for (const s of schedule?.scheduled ?? []) {
    const row = s as { name?: string | null; starts_on?: string | null; status?: string | null };
    if (row.status === "cancelled" || row.status === "declined") continue;
    if (!row.starts_on) continue;
    if (new Date(row.starts_on).getTime() >= today.getTime()) {
      upcoming.push({ name: row.name ?? "Event", date: row.starts_on });
    }
  }
  for (const t of schedule?.hosted_tournaments ?? []) {
    const row = t as { name?: string | null; start_date?: string | null };
    if (!row.start_date) continue;
    if (new Date(row.start_date).getTime() >= today.getTime()) {
      upcoming.push({ name: row.name ?? "Tournament", date: row.start_date });
    }
  }
  for (const t of schedule?.registered_tournaments ?? []) {
    const row = t as { name?: string | null; start_date?: string | null };
    if (!row.start_date) continue;
    if (new Date(row.start_date).getTime() >= today.getTime()) {
      upcoming.push({ name: row.name ?? "Tournament", date: row.start_date });
    }
  }
  upcoming.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const nextEvent = upcoming[0] ?? null;
  const nextEventDate = nextEvent?.date
    ? new Date(nextEvent.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <Card className="p-4 bg-gradient-to-br from-primary/15 via-primary/5 to-background border-primary/30 space-y-4">
      {/* Rating headline row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <Link2 className="h-3 w-3" /> DGD Rating
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <div className="font-display text-4xl font-bold leading-none tabular-nums text-primary">
              {primary ?? "—"}
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">of 1200</span>
            {delta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {delta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {delta > 0 ? "+" : ""}
                {delta} vs official
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-0.5">
            {pdga != null && (
              <span>
                Official PDGA{" "}
                <span className="font-medium text-foreground tabular-nums">{pdga}</span>
              </span>
            )}
            {data.chainlink.ceiling != null && (
              <span>
                High form{" "}
                <span className="font-medium text-emerald-600 tabular-nums">
                  {data.chainlink.ceiling}
                </span>
              </span>
            )}
            {data.chainlink.sampleSize > 0 && (
              <Badge variant="secondary" className="h-4 text-[10px] px-1.5">
                {data.chainlink.sampleSize} rated
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ShareToFeedButton
            label="Share rating"
            title="Post ratings update"
            draft={() =>
              ratingDraft({
                rating: primary,
                change: delta || null,
                roundsCounted: data.chainlink.sampleSize || null,
              })
            }
          />
          <Link
            to="/stats"
            className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors shrink-0"
          >
            DG Statboard <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Insight strip */}
      <div className="grid grid-cols-1 gap-2">
        <InsightTile
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Top Round"
          value={bestRound != null ? String(bestRound) : "—"}
          hint="Highest-rated round"
          tone="amber"
        />
        <InsightTile
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Projected"
          value={projected != null ? String(projected) : "—"}
          hint={
            nextUpdate
              ? projDelta != null && projDelta !== 0
                ? `${projDelta > 0 ? "+" : ""}${projDelta} · ${nextUpdate}`
                : `Update ${nextUpdate}`
              : "Next update"
          }
          tone="primary"
        />
        <InsightTile
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Next Event"
          value={nextEvent ? nextEvent.name : "—"}
          hint={nextEventDate ?? "Nothing scheduled"}
          tone="emerald"
          truncate
        />
      </div>

      {/* Footer links */}
      <div className="flex items-center justify-between gap-3 pt-1 text-[11px] text-muted-foreground border-t border-border/50">
        <Link to="/compare" className="hover:text-primary inline-flex items-center gap-1 py-1">
          <Users className="h-3 w-3" /> Compare
        </Link>
        <Link to="/game-plan" className="hover:text-primary inline-flex items-center gap-1 py-1">
          <Sparkles className="h-3 w-3" /> Project
        </Link>
        <Link to="/game-plan" className="hover:text-primary inline-flex items-center gap-1 py-1">
          <CalendarDays className="h-3 w-3" /> Game Plan
        </Link>
      </div>
    </Card>
  );
}

function InsightTile({
  icon,
  label,
  value,
  hint,
  tone,
  truncate,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "amber" | "primary" | "emerald";
  truncate?: boolean;
}) {
  const toneClasses = {
    amber: "text-amber-600",
    primary: "text-primary",
    emerald: "text-emerald-600",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <div
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-md bg-background ${toneClasses}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`text-[10px] font-semibold uppercase tracking-wide leading-tight ${toneClasses}`}
        >
          {label}
        </div>
        <div
          className={`text-sm font-semibold leading-snug text-foreground tabular-nums ${truncate ? "truncate" : "break-words"}`}
          title={value}
        >
          {value}
        </div>
        <div className="text-[10px] leading-tight text-muted-foreground truncate" title={hint}>
          {hint}
        </div>
      </div>
    </div>
  );
}
