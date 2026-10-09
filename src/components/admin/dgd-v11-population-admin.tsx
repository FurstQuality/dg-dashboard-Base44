import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getDgdV11PopulationReport, processDgdV11Batch, startDgdV11Backfill } from "@/lib/dgd-v1.functions";

const LABELS: Record<string, string> = {
  total_players: "All players", with_canonical_rounds: "With rounds", eligible_for_v11: "Eligible for V1.1",
  calculated: "Calculated", provisional: "Provisional", established: "Established",
  insufficient_data: "Not enough data", failed: "Failed", stale: "Stale",
};

/** Admin: V1.1 shadow population, job pipeline, data quality and source-bias research. */
export function DgdV11PopulationAdmin() {
  const qc = useQueryClient();
  const fetchReport = useServerFn(getDgdV11PopulationReport);
  const backfill = useServerFn(startDgdV11Backfill);
  const process = useServerFn(processDgdV11Batch);
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["dgd-v11-population"], queryFn: () => fetchReport(), throwOnError: false, staleTime: 60_000 });
  const run = async (key: string, fn: () => Promise<any>, ok: (r: any) => string) => {
    setBusy(key);
    try {
      toast.success(ok(await fn()));
      qc.invalidateQueries({ queryKey: ["dgd-v11-population"] });
    } catch {
      toast.error("That didn't go through. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };
  const r = q.data as any;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-base font-semibold">V1.1 shadow population</h2>
          <p className="text-sm text-muted-foreground">Updates automatically when rounds change. Hidden from players except testers.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("backfill", () => backfill(), (x) => `Queued ${x.queued} of ${x.players} players`)}>
            {busy === "backfill" ? "Queuing…" : "Queue backfill"}
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => run("process", () => process(), (x) => `Processed ${x.completed} · ${x.failed} failed · ${x.retried} retrying`)}>
            {busy === "process" ? "Processing…" : "Process next batch"}
          </Button>
        </div>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Building the report…</p>
      ) : q.isError || !r ? (
        <p className="text-sm text-muted-foreground">The report didn't load. Try again in a moment.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
            {Object.entries(r.population).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-muted-foreground">{LABELS[k] ?? k}</dt><dd className="text-lg font-semibold tabular-nums">{String(v)}</dd></div>
            ))}
          </dl>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 text-sm font-semibold">Eligibility by source</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground"><tr><th className="text-left font-medium">Source</th><th className="text-right font-medium">Rounds</th><th className="text-right font-medium">Eligible</th><th className="text-left pl-3 font-medium">Top reasons not counted</th></tr></thead>
                <tbody className="tabular-nums">
                  {Object.entries(r.quality).map(([src, v]: [string, any]) => (
                    <tr key={src} className="border-t border-border/60">
                      <td className="py-1">{src === "app" ? "DGD Native" : src.toUpperCase()}</td>
                      <td className="text-right">{v.rounds}</td>
                      <td className="text-right">{v.rate == null ? "—" : `${Math.round(v.rate * 100)}%`}</td>
                      <td className="pl-3 text-xs text-muted-foreground">{Object.entries(v.reasons).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k.toLowerCase().replaceAll("_", " ")} ${n}`).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold">Prediction residuals by source</h3>
              <p className="mb-1 text-xs text-muted-foreground">Expected minus actual strokes; positive means DGD expected a worse score. No source correction is applied.</p>
              <ul className="max-h-56 overflow-y-auto text-xs tabular-nums">
                {r.bias.filter((b: any) => !b.key.includes("|")).map((b: any) => (
                  <li key={b.key} className="flex justify-between border-t border-border/60 py-1"><span>{b.key}</span><span>{b.mean_residual} (n={b.n}{b.ci95 ? `, 95% ${b.ci95[0]} to ${b.ci95[1]}` : ""})</span></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><span className="text-muted-foreground">Queue: </span>{Object.entries(r.queue ?? {}).map(([k, v]) => `${k} ${v}`).join(" · ") || "empty"}</div>
            <div><span className="text-muted-foreground">Job time (median / p95): </span>{r.performance.job_ms_median ?? "—"} / {r.performance.job_ms_p95 ?? "—"} ms</div>
            <div><span className="text-muted-foreground">Model run: </span>{r.performance.rounds_in_model} rounds in {r.performance.compute_ms} ms</div>
          </div>
          <div className="text-sm">
            <span className="text-muted-foreground">Calibration milestones: </span>
            {r.milestones.map((m: any) => `${m.players}: ${m.reached ? `mean shift ${m.mean_shift_vs_full}, spread shift ${m.sd_shift_vs_full}` : "not reached"}`).join(" · ")}
          </div>
        </>
      )}
    </section>
  );
}
