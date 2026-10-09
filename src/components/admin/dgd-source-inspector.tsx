import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getDgdSourceIntegrityReport } from "@/lib/dgd-v1.functions";

const SRC: Record<string, string> = { pdga: "PDGA", udisc: "UDisc", app: "DG Dashboard", multi_source: "Linked" };
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Admin: how each source feeds the ONE DGD model per player. Not separate ratings. */
export function DgdSourceInspector() {
  const fetchReport = useServerFn(getDgdSourceIntegrityReport);
  const q = useQuery({ queryKey: ["dgd-source-integrity"], queryFn: () => fetchReport(), throwOnError: false, staleTime: 5 * 60_000 });
  const r = q.data as any;
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-semibold">Source contribution inspector</h2>
        <p className="text-sm text-muted-foreground">How PDGA, UDisc and DG Dashboard rounds feed each player's single DGD rating.</p>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Checking every source…</p>
      ) : q.isError || !r ? (
        <p className="text-sm text-muted-foreground">The inspector didn't load. Try again in a moment.</p>
      ) : (
        <>
          <div>
            <h3 className="mb-1 text-sm font-semibold">UDisc records by format</h3>
            <dl className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
              {Object.entries(r.population).filter(([, v]) => typeof v === "number").map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted-foreground">{k.replaceAll("_", " ").toLowerCase()}</dt><dd className="text-lg font-semibold tabular-nums">{String(v)}</dd></div>
              ))}
            </dl>
            <p className="mt-1 text-sm text-muted-foreground">
              Native UDisc ratings on qualifying rounds: {r.population.native_rating.with_rating} of {r.population.native_rating.qualifying}.
              {" "}Linked PDGA + UDisc rounds: {r.overlap.physical_rounds} ({r.overlap.observations} counted once in DGD).
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th>Player</th><th className="text-right">Rated rounds</th><th>Only one source</th><th className="text-right">Linked</th><th>Evidence share</th><th>Last 20</th><th className="text-right">Effective / raw</th></tr>
              </thead>
              <tbody>
                {r.players.map((p: any) => {
                  const a = p.audit_after;
                  return (
                    <tr key={p.pid} className="border-t border-border align-top">
                      <td className="py-2 font-mono text-xs">{p.pid}</td>
                      <td className="text-right tabular-nums">{a.eligible_physical_rounds}</td>
                      <td>PDGA {a.pdga_only} · UDisc {a.udisc_only} · DG Dashboard {a.app_only}</td>
                      <td className="text-right tabular-nums">{a.multi_source}</td>
                      <td>{Object.entries(a.effective_evidence_share).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${SRC[k]} ${pct(v as number)}`).join(" · ") || "—"}</td>
                      <td>{Object.entries(a.recent20_mix).filter(([, v]) => (v as number) > 0).map(([k, v]) => `${SRC[k]} ${v}`).join(" · ") || "—"}</td>
                      <td className="text-right tabular-nums">{a.evidence.kish_effective} / {a.evidence.raw_rounds}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">Evidence share is each source's part of one rating, not a separate rating.</p>
        </>
      )}
    </section>
  );
}
