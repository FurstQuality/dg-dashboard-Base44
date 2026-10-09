import { Badge } from "@/components/ui/badge";
import { fmtToPar, type HolePlanRow } from "@/lib/stats/course-fit";

const STANCE_LABEL: Record<HolePlanRow["stance"], string> = {
  attack: "Attack",
  hold: "Birdie look",
  danger: "Par-safe birdie",
  unknown: "No data",
};

const STANCE_CLASS: Record<HolePlanRow["stance"], string> = {
  attack: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  hold: "border-border bg-muted text-muted-foreground",
  danger: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  unknown: "border-border bg-muted text-muted-foreground",
};

export function HolePlanTable({ holes }: { holes: HolePlanRow[] }) {
  if (holes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hole detail on file for this layout yet. Add the holes on the course page and this plan
        fills in automatically.
      </p>
    );
  }

  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Hole</th>
            <th className="py-2 pr-3 font-medium">Par</th>
            <th className="py-2 pr-3 font-medium">Distance</th>
            <th className="py-2 pr-3 font-medium">You project</th>
            <th className="py-2 pr-3 font-medium">Your avg here</th>
            <th className="py-2 pr-3 font-medium">Field avg</th>
            <th className="py-2 pr-3 font-medium">Play it</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => (
            <tr key={h.number} className="border-t border-border/60 align-top">
              <td className="py-2 pr-3 font-semibold">{h.number}</td>
              <td className="py-2 pr-3">{h.par ?? "—"}</td>
              <td className="py-2 pr-3 text-muted-foreground">
                {h.distanceFt ? `${h.distanceFt.toLocaleString()} ft` : "—"}
              </td>
              <td className="py-2 pr-3">
                {h.projected != null ? (
                  <span>
                    {h.projected}
                    {h.projectedVsPar != null ? (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({fmtToPar(h.projectedVsPar)})
                      </span>
                    ) : null}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-3">
                {h.yourAvgShown != null ? (
                  <span className={h.yourAvgEstimated ? "text-muted-foreground" : undefined}>
                    {h.yourAvgShown.toFixed(2)}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {h.yourRoundsHere > 0
                        ? `(${h.yourRoundsHere} rd${h.yourRoundsHere === 1 ? "" : "s"})`
                        : "(estimate)"}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">
                {h.fieldAvgStrokes != null ? h.fieldAvgStrokes.toFixed(2) : "—"}
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={STANCE_CLASS[h.stance]}>
                    {STANCE_LABEL[h.stance]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{h.note}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
