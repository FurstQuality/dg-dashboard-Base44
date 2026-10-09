/** Phase 3.7 calibration cohort panel. Admin-only research view; players never see it. */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addDgdCalibrationPlayers, getDgdCalibration, runDgdCalibration, saveDgdCalibrationNote } from "@/lib/dgd-v1.functions";

const f = (v: unknown, d = 1) => (typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—");

export function DgdCalibrationPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getDgdCalibration);
  const addFn = useServerFn(addDgdCalibrationPlayers);
  const runFn = useServerFn(runDgdCalibration);
  const noteFn = useServerFn(saveDgdCalibrationNote);
  const q = useQuery({ queryKey: ["dgd-cal"], queryFn: () => getFn() });
  const [nums, setNums] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => addFn({ data: { numbers: nums.split(/[\s,]+/).filter(Boolean) } }),
    onSuccess: (r: any[]) => { toast.success(`Read ${r.filter((x) => !x.error).length} of ${r.length} players`); setNums(""); qc.invalidateQueries({ queryKey: ["dgd-cal"] }); },
    onError: () => toast.error("Couldn't add those players"),
  });
  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => { toast.success("Calibration report updated"); qc.invalidateQueries({ queryKey: ["dgd-cal"] }); },
    onError: () => toast.error("The calibration run failed"),
  });
  const players: any[] = (q.data?.report?.players as any[]) ?? [];
  const rep: any = q.data?.report?.report;
  const p = players.find((x) => x.subject_id === sel);
  const note = useMemo(() => (q.data?.notes ?? []).find((n: any) => n.subject_id === sel), [q.data, sel]);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Calibration cohort</h2>
          <p className="text-sm text-muted-foreground">PDGA players used to test DGD V1. No accounts, no public profiles. Display numbers are uncalibrated.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-56" placeholder="PDGA numbers, comma separated" value={nums} onChange={(e) => setNums(e.target.value)} />
          <Button size="sm" variant="outline" disabled={!nums.trim() || add.isPending} onClick={() => add.mutate()}>Add players</Button>
          <Button size="sm" disabled={run.isPending} onClick={() => run.mutate()}>{run.isPending ? "Running…" : "Run calibration"}</Button>
        </div>
      </div>
      {rep && (
        <p className="text-sm text-muted-foreground">
          {rep.sufficient_players} players with enough rounds · {rep.canonical_rounds} rounds · model {rep.model_version} · PDGA round correlation r={f(rep.pdga_correlation?.pearson_r, 2)} (diagnostic only)
        </p>
      )}
      <div className="max-h-80 overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-muted-foreground">
            <tr><th className="p-2">Player</th><th className="p-2">PDGA</th><th className="p-2">Rounds</th><th className="p-2">Skill</th><th className="p-2">Form (value)</th><th className="p-2">Conf.</th><th className="p-2">Last 10 vs prior</th><th className="p-2">Flags</th></tr>
          </thead>
          <tbody>
            {players.map((x) => (
              <tr key={x.subject_id} onClick={() => setSel(x.subject_id)} className={`cursor-pointer border-t border-border hover:bg-muted/50 ${sel === x.subject_id ? "bg-muted" : ""}`}>
                <td className="p-2">{x.name ?? x.pdga_number}</td><td className="p-2">{x.official_pdga_rating ?? "—"}</td><td className="p-2">{x.rated_events}</td>
                <td className="p-2">{f(x.skill_mu, 2)} ± {f(x.skill_sigma, 2)}</td><td className="p-2">{f(x.form)}</td><td className="p-2">{f(x.confidence, 0)}%</td>
                <td className="p-2">{f(x.recent_10_vs_prior_baseline)}</td><td className="p-2 text-xs">{(x.flags ?? []).join(", ") || "—"}</td>
              </tr>
            ))}
            {!players.length && <tr><td colSpan={8} className="p-3 text-muted-foreground">Add players, then run calibration to see results.</td></tr>}
          </tbody>
        </table>
      </div>
      {p && (
        <div className="space-y-3">
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={p.history}>
                <XAxis dataKey="d" tick={{ fontSize: 11 }} minTickGap={40} />
                <YAxis yAxisId="s" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip />
                <Line yAxisId="s" dataKey="skill" name="DGD skill (strokes)" stroke="hsl(var(--primary))" dot={false} />
                <Line yAxisId="p" dataKey="pdga" name="PDGA round rating" stroke="hsl(var(--muted-foreground))" dot={false} strokeOpacity={0.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
            <span>PDGA last 10: {f(p.pdga_last10, 0)}</span><span>Change 90d: {f(p.skill_change_90d, 2)}</span>
            <span>Volatility: {f(p.volatility_residual_sd, 2)}</span><span>Avg miss: {f(p.expected_vs_actual?.mae, 2)}</span>
            <span>Weight on rounds &gt;1y old: {f((p.influence_share_older_365d ?? 0) * 100, 0)}%</span><span>Exact layouts: {f((p.exact_layout_share ?? 0) * 100, 0)}%</span>
            <span>Course breadth: {f(p.course_breadth)}</span><span>Home vs away: {f(p.home_vs_away?.diff, 2)}</span>
          </div>
          <NoteEditor key={p.subject_id} initial={note?.note ?? ""} onSave={(text) => noteFn({ data: { subjectId: p.subject_id, note: text, tags: [] } }).then(() => { toast.success("Note saved"); qc.invalidateQueries({ queryKey: ["dgd-cal"] }); }, () => toast.error("Couldn't save that note"))} />
        </div>
      )}
    </section>
  );
}

function NoteEditor({ initial, onSave }: { initial: string; onSave: (t: string) => void }) {
  const [t, setT] = useState(initial);
  return (
    <div className="space-y-2">
      <Textarea value={t} onChange={(e) => setT(e.target.value)} placeholder="Private admin note. Never used in any calculation." />
      <Button size="sm" variant="outline" onClick={() => onSave(t)}>Save note</Button>
    </div>
  );
}
