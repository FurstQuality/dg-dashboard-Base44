import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Crosshair, Ruler, Disc } from "lucide-react";
import { getShotStats } from "@/lib/stats.functions";
import { statsKeys, STATS_STALE } from "@/lib/stats-queries";
import { useSession } from "@/lib/current-user";
import { StatlinkErrorState, StatlinkPanelSkeleton } from "@/components/statlink/statlink-states";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-border/40 py-2 last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-foreground">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="tabular-nums text-lg font-semibold text-primary">{value}</div>
    </div>
  );
}

export function CareerShotStatsPanel({ source }: { source?: "pdga" | "udisc" | "chainlink" }) {
  const fetchShots = useServerFn(getShotStats);
  const { session } = useSession();
  const gated = source === "pdga" || source === "udisc";
  const q = useQuery({
    queryKey: statsKeys.shots(session?.user?.id),
    queryFn: () => fetchShots({ data: {} }),
    staleTime: STATS_STALE.ratings,
    enabled: !gated,
  });
  const { data, isLoading } = q;


  if (gated) {
    const label = source === "pdga" ? "PDGA" : "UDisc";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-primary" />
            Career shot tracking
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            {label} rounds are imports — DG Dashboard doesn't have per-shot data for them. Switch
            the Round Source to <span className="font-medium text-foreground">DG Dashboard</span> to
            see fairway, C1/C2, and putting stats from rounds you scored in the app.
          </p>
        </CardHeader>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Career shot tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <StatlinkErrorState
            title="Shot tracking didn't load"
            message="We couldn't reach your scored-round details just now."
            onRetry={() => void q.refetch()}
            retrying={q.isFetching}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Career shot tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <StatlinkPanelSkeleton label="Loading shot data…" rows={2} />
        </CardContent>
      </Card>
    );
  }


  const d = data;
  const empty = !d || d.holesLogged === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-primary" />
          Career shot tracking
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Aggregates every hole where you logged fairway, C1/C2 in reg, putting, drive distance, or
          disc choices in the Round Companion.
        </p>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
            No shots logged yet. Open the <span className="font-medium text-foreground">Shots</span>{" "}
            tab inside a live round to start tracking fairway hits, putting, and disc usage.
          </div>
        ) : (
          <div className={`grid gap-6 ${d.discsInBag > 0 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Off the tee & in reg
              </h4>
              <Stat label="Fairway hit" value={d.fairwayPct != null ? `${d.fairwayPct}%` : "—"} />
              <Stat label="C1 in reg" value={d.c1RegPct != null ? `${d.c1RegPct}%` : "—"} />
              <Stat label="C2 in reg" value={d.c2RegPct != null ? `${d.c2RegPct}%` : "—"} />
              <Stat label="Scramble" value={d.scramblePct != null ? `${d.scramblePct}%` : "—"} />
            </section>
            <section>
              <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <Ruler className="h-3.5 w-3.5" /> Putting & distance
              </h4>
              <Stat label="C1 putting" value={d.c1PuttPct != null ? `${d.c1PuttPct}%` : "—"} />
              <Stat label="C2 putting" value={d.c2PuttPct != null ? `${d.c2PuttPct}%` : "—"} />
              <Stat label="Avg drive" value={d.avgDriveFt != null ? `${d.avgDriveFt} ft` : "—"} />
              <Stat
                label="Longest drive"
                value={d.maxDriveFt != null ? `${d.maxDriveFt} ft` : "—"}
              />
            </section>
            {d.discsInBag > 0 ? (
              <section>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                  <Disc className="h-3.5 w-3.5" /> Most-used discs
                </h4>
                <div className="text-xs uppercase text-muted-foreground mt-1">Drivers</div>
                {d.topDrivers.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-1">No drivers logged yet.</div>
                ) : (
                  d.topDrivers.map((x) => (
                    <div key={`d-${x.name}`} className="flex justify-between py-1 text-sm">
                      <span className="truncate">{x.name}</span>
                      <span className="tabular-nums text-muted-foreground">{x.count}</span>
                    </div>
                  ))
                )}
                <div className="text-xs uppercase text-muted-foreground mt-3">Putters</div>
                {d.topPutters.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-1">No putters logged yet.</div>
                ) : (
                  d.topPutters.map((x) => (
                    <div key={`p-${x.name}`} className="flex justify-between py-1 text-sm">
                      <span className="truncate">{x.name}</span>
                      <span className="tabular-nums text-muted-foreground">{x.count}</span>
                    </div>
                  ))
                )}
              </section>
            ) : null}
          </div>
        )}
        {!empty ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Based on {d.holesLogged} holes across {d.roundsLogged} round
            {d.roundsLogged === 1 ? "" : "s"} you scored in DG Dashboard
            {d.lastLoggedOn ? <> · last logged {d.lastLoggedOn.slice(0, 10)}</> : null}.
            {d.discsInBag === 0 ? " Add discs to My Bag to see which discs you throw most." : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
