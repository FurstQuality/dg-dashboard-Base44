import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { PageHeader, ContentCard } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { computePayoutSchedule, PAYOUT_CURVES, PAYOUT_CURVE_VERSION } from "@/lib/payout-engine";
import { money } from "@/lib/event-fees";
import { createCurveSet, curveSchema, listCurveSets, setCurveSetStatus, type CurveDef } from "@/lib/payouts.functions";

export const Route = createFileRoute("/_authenticated/admin/payout-curves")({
  head: () => ({
    meta: [
      { title: "Payout curve sets · Admin · DG Dashboard" },
      { name: "description", content: "Install, compare and publish official PDGA payout curve versions." },
      { property: "og:title", content: "Payout curve sets — DG Dashboard admin" },
      { property: "og:description", content: "Versioned PDGA payout curves for the shared payout engine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutCurvesAdmin,
});

const EXAMPLE = JSON.stringify(
  PAYOUT_CURVES.map((c) => ({ key: c.value, label: c.label, division_type: c.value.endsWith("_am") ? "am" : "pro", b: c.b })),
  null,
  2,
);

function preview(b: number, version: string) {
  return computePayoutSchedule({ pool_cents: 50000, team_size: 1, requested_places: 5, min_player_cents: 500, round_player_cents: 0, curve_b: b, curve_version: version }).places;
}

function PayoutCurvesAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(listCurveSets);
  const create = useServerFn(createCurveSet);
  const setStatus = useServerFn(setCurveSetStatus);
  const q = useQuery({ queryKey: ["payout-curve-sets"], queryFn: () => list() });
  const [version, setVersion] = useState("");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState("PDGA");
  const [json, setJson] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, curves: z.array(curveSchema).min(1).parse(JSON.parse(json)) as CurveDef[] };
    } catch (e) {
      return { ok: false as const, error: e instanceof SyntaxError ? "That isn't valid JSON." : "Each curve needs key (lowercase), label, division_type (pro/am) and b (a negative number)." };
    }
  }, [json]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["payout-curve-sets"] });

  const save = async () => {
    if (!parsed.ok) return;
    setBusy(true);
    try {
      await create({ data: { version, label, source, curves: parsed.curves } });
      toast.success("Curve set saved as a draft");
      setVersion("");
      setLabel("");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const change = async (id: string, status: "published" | "retired") => {
    try {
      await setStatus({ data: { id, status } });
      toast.success(status === "published" ? "Published — directors can pick these curves now" : "Retired — past events keep using it");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payout curve sets"
        description={`Install new official payout curves without touching old ones. Built-in set: ${PAYOUT_CURVE_VERSION}.`}
      />
      <ContentCard title="Add a curve set" subtitle="Saved as a draft. Compare it, then publish.">
        <div className="grid gap-3 md:grid-cols-3">
          <Input placeholder="Version, e.g. pdga-2026@1" value={version} onChange={(e) => setVersion(e.target.value.trim())} />
          <Input placeholder="Name, e.g. PDGA 2026 Pay Tables" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} />
        </div>
        <Textarea className="mt-3 min-h-[220px] font-mono text-[13px]" value={json} onChange={(e) => setJson(e.target.value)} />
        <p className={`mt-1 text-[13px] ${parsed.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {parsed.ok ? `${parsed.curves.length} curves look valid. Shares follow (paid × place)^b.` : parsed.error}
        </p>
        {parsed.ok ? <Compare curves={parsed.curves} version={version || "draft"} /> : null}
        <Button className="mt-3" disabled={!parsed.ok || busy || version.length < 3 || label.length < 3} onClick={save}>
          {busy ? "Saving…" : "Save draft"}
        </Button>
      </ContentCard>

      <ContentCard title="Installed versions" subtitle="Published sets can't be edited. Locked event payouts keep the version they used.">
        {(q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No curve sets installed yet. The built-in set is in use.</p>
        ) : (
          <ul className="space-y-4">
            {(q.data ?? []).map((set) => (
              <li key={set.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold">{set.label}</span>{" "}
                    <span className="text-[13px] text-muted-foreground">{set.version} · {set.source}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={set.status === "published" ? "default" : "outline"}>{set.status === "draft" ? "Draft" : set.status === "published" ? "Published" : "Retired"}</Badge>
                    {set.status === "draft" ? <Button size="sm" onClick={() => change(set.id, "published")}>Publish</Button> : null}
                    {set.status === "published" ? <Button size="sm" variant="outline" onClick={() => change(set.id, "retired")}>Retire</Button> : null}
                  </div>
                </div>
                <Compare curves={set.curves} version={set.version} />
              </li>
            ))}
          </ul>
        )}
      </ContentCard>
    </div>
  );
}

/** Side-by-side: built-in exponent vs this set's, on a $500 pool paying 5. */
function Compare({ curves, version }: { curves: CurveDef[]; version: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-left text-muted-foreground">
          <tr><th className="py-1">Curve</th><th>b</th><th>Built-in b</th><th>$500 pool, 5 paid</th></tr>
        </thead>
        <tbody>
          {curves.map((c) => {
            const builtIn = PAYOUT_CURVES.find((x) => x.value === c.key);
            return (
              <tr key={c.key} className="border-t border-border">
                <td className="py-1.5">{c.label} <span className="text-muted-foreground">({c.division_type})</span></td>
                <td>{c.b}</td>
                <td>{builtIn ? builtIn.b : "new"}</td>
                <td>{preview(c.b, version).map((p) => money(p.cents)).join(" · ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
