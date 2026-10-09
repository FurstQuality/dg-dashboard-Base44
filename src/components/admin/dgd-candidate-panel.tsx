/** Phase 3.8 V1.1 candidate comparison. Admin-only research view; players never see it. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDgdCandidate, runDgdCandidate } from "@/lib/dgd-v1.functions";

const f = (v: unknown, d = 2) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");
const MODELS = ["A_v1_baseline", "B_robust_post_break", "C_cold_start_layouts", "D_trend_aware", "E_volatility_confidence", "F_best_validated"];
const GROUPS = ["overall", "established_layout", "cold_start_layout", "post_inactivity_90d", "rapid_improver_player", "stable_player"];

export function DgdCandidatePanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDgdCandidate);
  const runFn = useServerFn(runDgdCandidate);
  const q = useQuery({ queryKey: ["dgd-cand"], queryFn: () => getFn() });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => { toast.success("Candidate comparison updated"); qc.invalidateQueries({ queryKey: ["dgd-cand"] }); },
    onError: () => toast.error("The candidate run failed"),
  });
  const r: any = q.data?.report?.report;
  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">V1.1 candidate comparison</h2>
          <p className="text-sm text-muted-foreground">Each change tested against V1 on the test group. Shadow only — no rating changes.</p>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Running…" : "Run comparison"}</Button>
      </div>
      {!r ? (
        <p className="text-sm text-muted-foreground">No comparison yet. Run it once the test group is loaded.</p>
      ) : (
        <>
          <p className="text-sm">Best combination: <span className="font-medium">{(r.f_components as string[]).join(", ") || "none"}</span> · {r.protocol.rounds_scored} rounds scored</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-3">Average miss (strokes)</th>{MODELS.map((m) => <th key={m} className="px-2">{m.split("_")[0]}</th>)}</tr></thead>
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g} className="border-t border-border">
                    <td className="py-1 pr-3">{g.replace(/_/g, " ")}</td>
                    {MODELS.map((m) => <td key={m} className="px-2 tabular-nums">{f(r.error_table[g]?.[m]?.mae)}</td>)}
                  </tr>
                ))}
                <tr className="border-t border-border">
                  <td className="py-1 pr-3">80% range hit rate</td>
                  {MODELS.map((m) => <td key={m} className="px-2 tabular-nums">{f(r.intervals[m]?.raw?.p80, 0)}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
