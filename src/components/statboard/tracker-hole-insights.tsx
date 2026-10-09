import { formatToPar as toParLabel } from "@/lib/score-display";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getTrackerHoleStats } from "@/lib/tracker-stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { useSession } from "@/lib/current-user";
import { StatlinkErrorState } from "@/components/statlink/statlink-states";
import { ShieldCheck, MapPin, Ruler, Flag } from "lucide-react";



function toneFor(v: number) {
  if (v < 0) return "text-primary font-medium";
  if (v > 0) return "text-orange-400";
  return "";
}

/**
 * Statboard panel powered by the friend tracker's verified PDGA hole data.
 * Adds hole-level accuracy (pars, distances, per-hole strokes) that imports
 * from UDisc/DGS can't provide.
 */
export function TrackerHoleInsightsCard() {
  const fetchStats = useServerFn(getTrackerHoleStats);
  const { session } = useSession();
  const q = useQuery({
    queryKey: statsKeys.trackerHoles(session?.user?.id),
    queryFn: () => fetchStats(),
    staleTime: STATS_STALE.ratings,
  });

  if (q.isError) {
    return (
      <StatlinkErrorState
        title="Verified hole data didn't load"
        message="We couldn't reach the tracker's PDGA hole records just now."
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  if (q.isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />;
  }
  const res = q.data;
  if (!res) return null;


  if (!res.linked) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verified PDGA hole data
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Add your PDGA number in your profile and the tracker will pull your official hole-by-hole
          scores — pars, distances, and every stroke — straight into these stats.
        </CardContent>
      </Card>
    );
  }

  const ins = res.insights;
  if (!ins || ins.roundsCounted === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verified PDGA event rounds
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No posted rounds yet for PDGA #{res.pdgaNumber}. As soon as the tracker syncs a live round
          you played, your breakdowns land here.
        </CardContent>
      </Card>
    );
  }

  const s = ins.summary;
  const hasHoleDetail = s.holesTracked > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Verified PDGA event rounds
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            {ins.roundsCounted} round{ins.roundsCounted === 1 ? "" : "s"} · {ins.eventsCounted}{" "}
            event
            {ins.eventsCounted === 1 ? "" : "s"}
            {hasHoleDetail ? ` · ${s.holesTracked} holes` : ""}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {hasHoleDetail
            ? `Pulled from live PDGA scoring in your friend tracker for PDGA #${res.pdgaNumber} — official pars and tee distances, so these splits are event-accurate.`
            : `Pulled from live PDGA scoring in your friend tracker for PDGA #${res.pdgaNumber}. Hole pars aren't posted for these rounds yet, so only round totals are shown.`}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {hasHoleDetail ? (
            <>
              <Stat
                label="Birdie or better"
                value={`${s.birdiePct}%`}
                sub={`${s.aces + s.eagles + s.birdies} holes`}
              />
              <Stat label="Par rate" value={`${s.parPct}%`} sub={`${s.pars} holes`} />
              <Stat
                label="Bogey+ rate"
                value={`${s.bogeyPlusPct}%`}
                sub={`${s.bogeys + s.doublePlus} holes`}
              />
            </>
          ) : (
            <>
              <Stat
                label="Rounds synced"
                value={ins.roundsCounted}
                sub={`${ins.eventsCounted} event${ins.eventsCounted === 1 ? "" : "s"}`}
              />
              <Stat
                label="Courses"
                value={ins.coursesCounted || "—"}
                sub="from the posted schedule"
              />
              <Stat
                label="Best round"
                value={toParLabel(
                  ins.rounds.reduce<number | null>(
                    (best, r) =>
                      r.toPar == null ? best : best == null ? r.toPar : Math.min(best, r.toPar),
                    null,
                  ),
                )}
                sub="to par"
              />
            </>
          )}
          <Stat
            label="Avg round"
            value={toParLabel(
              (() => {
                const scored = ins.rounds.filter((r) => r.toPar != null);
                return scored.length
                  ? +(scored.reduce((t, r) => t + (r.toPar ?? 0), 0) / scored.length).toFixed(1)
                  : null;
              })(),
            )}
            sub="to par per round"
          />
        </div>

        {ins.byDistance.length > 0 && (
          <Section icon={<Ruler className="h-3.5 w-3.5" />} title="Scoring by tee distance">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Distance</th>
                  <th className="text-left">Holes</th>
                  <th className="text-left">Avg to par</th>
                  <th className="text-left">Birdie %</th>
                </tr>
              </thead>
              <tbody>
                {ins.byDistance.map((d) => (
                  <tr key={d.bucket} className="border-t border-border">
                    <td className="py-1.5">{d.bucket}</td>
                    <td className="tabular-nums">{d.holes}</td>
                    <td className={`tabular-nums ${toneFor(d.scoringAvg)}`}>
                      {d.scoringAvg > 0 ? "+" : ""}
                      {d.scoringAvg}
                    </td>
                    <td className="tabular-nums">{d.birdiePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {ins.byCourse.length > 0 && (
          <Section icon={<MapPin className="h-3.5 w-3.5" />} title="Course splits">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left py-1">Course</th>
                  <th className="text-left">Rounds</th>
                  <th className="text-left">Avg to par</th>
                  <th className="text-left">Birdie %</th>
                </tr>
              </thead>
              <tbody>
                {ins.byCourse.map((c) => (
                  <tr key={c.course} className="border-t border-border">
                    <td className="py-1.5">{c.course}</td>
                    <td className="tabular-nums">{c.rounds}</td>
                    <td className={`tabular-nums ${toneFor(c.avgToPar)}`}>
                      {toParLabel(c.avgToPar)}
                    </td>
                    <td className="tabular-nums">{c.birdiePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {hasHoleDetail && (ins.toughestHoles.length > 0 || ins.bestHoles.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2">
            <Section icon={<Flag className="h-3.5 w-3.5" />} title="Holes that cost you strokes">
              <HoleList holes={ins.toughestHoles} />
            </Section>
            <Section icon={<Flag className="h-3.5 w-3.5" />} title="Your best scoring holes">
              <HoleList holes={ins.bestHoles} />
            </Section>
          </div>
        )}

        <Section title="Rounds included">
          <ul className="space-y-1.5 text-sm">
            {ins.rounds.slice(0, 8).map((r, i) => (
              <li
                key={`${r.eventId}-${r.roundNumber}-${i}`}
                className="flex flex-wrap items-baseline justify-between gap-x-3 border-t border-border pt-1.5 first:border-0 first:pt-0"
              >
                <span className="min-w-0">
                  <span className="font-medium">{r.eventName}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · R{r.roundNumber ?? "?"}
                    {r.courseName ? ` · ${r.courseName}` : ""}
                  </span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {r.strokes ?? "—"}{" "}
                  <span className={toneFor(r.toPar ?? 0)}>({toParLabel(r.toPar)})</span>
                  {r.place != null ? ` · ${r.division ?? ""} #${r.place}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </CardContent>
    </Card>
  );
}

function HoleList({
  holes,
}: {
  holes: Array<{
    course: string;
    hole: number;
    par: number;
    length: number | null;
    plays: number;
    scoringAvg: number;
  }>;
}) {
  if (!holes.length)
    return <p className="text-sm text-muted-foreground">Not enough posted holes yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {holes.map((h) => (
        <li key={`${h.course}-${h.hole}`} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate">
            Hole {h.hole}{" "}
            <span className="text-muted-foreground">
              · par {h.par}
              {h.length ? ` · ${h.length} ft` : ""} · {h.course}
            </span>
          </span>
          <span className={`tabular-nums ${toneFor(h.scoringAvg)}`}>
            {h.scoringAvg > 0 ? "+" : ""}
            {h.scoringAvg}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
