/**
 * Small shared Statboard building blocks: view tabs, help popovers, recent
 * performance, recent rounds, insights. Pure presentation — every number is
 * passed in, nothing is recalculated here.
 */
import { formatToPar } from "@/lib/score-display";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  STATBOARD_VIEWS,
  recentAverages,
  recentTrend,
  type StatboardView,
} from "@/lib/stats/statboard-views";
import { SOURCE_CHIP_CLASS } from "./source-compare-table";

export function StatboardTabs({
  value,
  onChange,
  showResearch,
}: {
  value: StatboardView;
  onChange: (v: StatboardView) => void;
  showResearch: boolean;
}) {
  const views = showResearch
    ? [...STATBOARD_VIEWS, { id: "research" as const, label: "Research" }]
    : STATBOARD_VIEWS;
  return (
    <div
      role="tablist"
      aria-label="Statboard views"
      className="sticky top-[64px] z-20 -mx-1 flex gap-1 flex-wrap border-b border-border bg-background/95 px-1 backdrop-blur"
    >
      {views.map((v) => {
        const active = v.id === value;
        return (
          <button
            key={v.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(v.id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export function HelpPopover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 text-[13px] text-muted-foreground"
        >
          <Info className="h-4 w-4" aria-hidden />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70vh] w-[min(92vw,28rem)] space-y-2 overflow-y-auto text-sm"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function SectionTitle({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

const trendView = {
  up: { icon: ArrowUpRight, text: "Improving", cls: "text-emerald-500" },
  down: { icon: ArrowDownRight, text: "Cooling", cls: "text-red-500" },
  flat: { icon: Minus, text: "Stable", cls: "text-muted-foreground" },
} as const;

/** Last 5/10/20 per source. Sources are never averaged together — their scales differ. */
export function RecentPerformanceCard({
  sources,
}: {
  sources: { key: "pdga" | "udisc"; label: string; ratings: number[]; threshold: number }[];
}) {
  const shown = sources.filter((s) => s.ratings.length > 0);
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent performance</CardTitle>
        <p className="text-[13px] text-muted-foreground">
          Average round rating over your latest rated rounds, per source.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Rated rounds will show up here once you sync PDGA or upload UDisc.
          </p>
        ) : (
          shown.map((s) => {
            const avgs = recentAverages(s.ratings);
            const t = recentTrend(s.ratings, s.threshold);
            const T = t ? trendView[t] : null;
            return (
              <div key={s.key} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${SOURCE_CHIP_CLASS[s.key]}`}
                  >
                    {s.label}
                  </span>
                  {T ? (
                    <span
                      className={`flex items-center gap-1 text-[13px] font-medium ${T.cls}`}
                      title="Your last 5 rated rounds against the 5 before them."
                    >
                      <T.icon className="h-4 w-4" aria-hidden /> {T.text}
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">
                      Need 10 rated rounds for a trend
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  {avgs.map((a) => (
                    <div key={a.n} className="rounded-lg bg-muted/40 px-2 py-1.5">
                      <dt className="text-[12px] text-muted-foreground">Last {a.n}</dt>
                      <dd className="text-lg font-bold tabular-nums">{a.avg ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export type RecentRoundRow = {
  played_on: string;
  event_name: string | null;
  score: number | null;
  to_par?: number | null;
  round_rating: number | null;
  source: string | null;
};

const sourceKey = (s: string | null) =>
  s === "udisc" ? "udisc" : s === "pdga" || s === "pdga_official" ? "pdga" : "chainlink";
const sourceLabel = (s: string | null) =>
  sourceKey(s) === "udisc" ? "UDisc" : sourceKey(s) === "pdga" ? "PDGA" : "DG Dashboard";

export function RecentRoundsCard({
  rows,
  onViewAll,
}: {
  rows: RecentRoundRow[];
  onViewAll: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Recent rounds</CardTitle>
        <Button variant="ghost" size="sm" onClick={onViewAll} className="gap-1">
          View all rounds <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto pt-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rounds on file yet. Add some from Data &amp; sync.
          </p>
        ) : (
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-[13px] text-muted-foreground">
                <th className="py-1.5 font-medium">Date</th>
                <th className="py-1.5 font-medium">Event / course</th>
                <th className="py-1.5 font-medium">Source</th>
                <th className="py-1.5 text-right font-medium">Score</th>
                <th className="py-1.5 text-right font-medium">To par</th>
                <th className="py-1.5 text-right font-medium">Par</th>
                <th className="py-1.5 text-right font-medium">Round rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1.5 tabular-nums">{String(r.played_on).slice(0, 10)}</td>
                  <td className="max-w-[18rem] truncate py-1.5">{r.event_name ?? "—"}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SOURCE_CHIP_CLASS[sourceKey(r.source)]}`}
                    >
                      {sourceLabel(r.source)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{r.score ?? "—"}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{formatToPar(r.to_par)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                    {r.score != null && r.to_par != null ? r.score - r.to_par : "—"}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.round_rating ?? "Not rated"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function InsightsCard({
  insights,
}: {
  insights: { label: string; value: string; note?: string }[];
}) {
  if (insights.length === 0) return null;
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Key insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {insights.slice(0, 4).map((x) => (
          <div key={x.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-muted-foreground">{x.label}</div>
              {x.note ? <div className="text-[13px] text-muted-foreground/90">{x.note}</div> : null}
            </div>
            <div className="shrink-0 font-semibold tabular-nums">{x.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
