/**
 * Division advisor — which division should I enter?
 *
 * Scores every division in the synced field for the signed-in player: field
 * strength, rating eligibility, simulated win/podium/cash odds, and a plain
 * language recommendation. Rating ceilings are PDGA guidelines, so the card
 * always shows the number it used.
 */
import { useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Award, Check, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDivisionAdvice } from "@/lib/game-plan-prep.functions";
import { setPreferredDivision } from "@/lib/game-plan.functions";
import type { DivisionOption } from "@/lib/game-plan/prep-model";

const LABELS: Record<DivisionOption["recommendation"], { label: string; className: string }> = {
  recommended: { label: "Best fit", className: "bg-emerald-500/15 text-emerald-600" },
  viable: { label: "Competitive", className: "bg-sky-500/15 text-sky-600" },
  stretch: { label: "Stretch", className: "bg-amber-500/15 text-amber-600" },
  too_easy: { label: "Below your level", className: "bg-muted text-muted-foreground" },
  over_cap: { label: "Not eligible", className: "bg-destructive/15 text-destructive" },
};

export function DivisionAdvisor({ eventId }: { eventId: string }) {
  const fn = useServerFn(getDivisionAdvice);
  const savePreferred = useServerFn(setPreferredDivision);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["game-plan", "division-advice", eventId],
    queryFn: () => fn({ data: { eventId } }),
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: (division: string) => savePreferred({ data: { division } }),
    onSuccess: (_r, division) => {
      toast.success(`${division} saved as your default division`);
      void qc.invalidateQueries({ queryKey: ["game-plan"] });
    },
    onError: () => toast.error("Could not save your division"),
  });

  const eligible = useMemo(
    () => (data?.options ?? []).filter((o) => o.recommendation !== "over_cap"),
    [data],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!data || !data.options.length) {
    return (
      <Card className="p-5 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          No field data yet
        </div>
        <p className="text-sm text-muted-foreground">
          Sync this event&apos;s field on the Odds tab. Once registered players and their ratings are
          cached, this tab compares every division and recommends where you should play.
        </p>
      </Card>
    );
  }

  const best = data.options.find((o) => o.code === data.recommendedCode);

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Award className="h-4 w-4 text-primary" />
          <span className="font-semibold">
            {best ? `Play ${best.code}` : "No clear recommendation"}
          </span>
          {data.registeredDivision ? (
            <Badge variant="outline">Registered: {data.registeredDivision}</Badge>
          ) : null}
          {data.preferredDivision ? (
            <Badge variant="secondary">Default: {data.preferredDivision}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {best
            ? best.rationale
            : "Every division in this field is either above your rating ceiling or has no rated players yet."}
        </p>
        <p className="text-xs text-muted-foreground">
          Based on your {data.meRating ?? "unrated"} rating against {eligible.length} eligible
          division{eligible.length === 1 ? "" : "s"} from{" "}
          {data.fieldSource === "pdga_cache"
            ? "the cached PDGA field"
            : data.fieldSource === "internal"
              ? "in-app registrations"
              : "no synced field"}
          . Odds come from a 500-run simulation with ±45 rating points of round-to-round variance.
        </p>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {data.options.map((opt) => {
          const meta = LABELS[opt.recommendation];
          const isBest = opt.code === data.recommendedCode;
          return (
            <Card
              key={opt.code}
              className={`p-4 space-y-3 ${isBest ? "ring-1 ring-primary/40" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{opt.code}</div>
                  {opt.name && opt.name !== opt.code ? (
                    <div className="text-xs text-muted-foreground">{opt.name}</div>
                  ) : null}
                </div>
                <Badge className={meta.className}>{meta.label}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <Cell label="Win" value={`${opt.odds.winPct}%`} />
                <Cell label="Top 3" value={`${opt.odds.top3Pct}%`} />
                <Cell label="Cash" value={`${opt.odds.cashPct}%`} />
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Field <strong className="tabular-nums text-foreground">{opt.fieldSize}</strong>
                </span>
                <span>
                  Avg rating{" "}
                  <strong className="tabular-nums text-foreground">{opt.avgRating ?? "—"}</strong>
                </span>
                <span>
                  Top rated{" "}
                  <strong className="tabular-nums text-foreground">{opt.topRating ?? "—"}</strong>
                </span>
                <span>
                  You beat{" "}
                  <strong className="tabular-nums text-foreground">
                    {opt.yourPercentile == null ? "—" : `${opt.yourPercentile}%`}
                  </strong>
                </span>
                {opt.maxRating != null ? (
                  <span className="col-span-2 flex items-center gap-1">
                    <ShieldAlert className="h-3 w-3" />
                    Rating ceiling {opt.maxRating}
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">{opt.rationale}</p>

              {opt.recommendation !== "over_cap" ? (
                <Button
                  size="sm"
                  variant={isBest ? "default" : "outline"}
                  disabled={save.isPending || data.preferredDivision === opt.code}
                  onClick={() => save.mutate(opt.code)}
                >
                  {data.preferredDivision === opt.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Your division
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3.5 w-3.5 mr-1.5" />
                      Set as my division
                    </>
                  )}
                </Button>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="text-base font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
