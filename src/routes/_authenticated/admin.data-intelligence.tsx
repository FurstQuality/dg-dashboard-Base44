import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Database, Minus } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { getDataIntelOverview } from "@/lib/data-intel.functions";
import { SOURCES, capabilityMatrix, type CapabilityStatus } from "@/lib/data-intel/registry";

export const Route = createFileRoute("/_authenticated/admin/data-intelligence")({
  component: DataIntelligenceHub,
  head: () => ({
    meta: [
      { title: "Data Intelligence · Admin · DG Dashboard" },
      { name: "description", content: "What DGD knows from PDGA, UDisc, Disc Golf Scene and its own data — coverage, health and conflicts." },
      { property: "og:title", content: "Data Intelligence · DG Dashboard" },
      { property: "og:description", content: "One home for source coverage, ingest health and conflicts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STATUS_LABEL: Record<CapabilityStatus, string> = {
  parser_built: "Parser built",
  stored: "Stored",
  canonicalized: "Linked to DGD",
};

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
const ago = (iso: string | null) => {
  if (!iso) return "Never";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? "Within the hour" : h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

function DataIntelligenceHub() {
  const { isAdmin, checking } = useAdminAccess();
  const fetchOverview = useServerFn(getDataIntelOverview);
  const q = useQuery({ queryKey: ["data-intel", "overview"], queryFn: () => fetchOverview(), enabled: isAdmin });

  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin) return <PageShell><AdminErrorState message="Data Intelligence is limited to admins." /></PageShell>;

  const d = q.data;
  const c = d?.counts ?? {};
  const queueBySource = SOURCES.map((s) => {
    const rows = (d?.queue ?? []).filter((r) => r.source === s.key);
    const n = (st: string) => rows.find((r) => r.status === st)?.count ?? 0;
    return { ...s, pending: n("pending"), running: n("running"), done: n("success"), dead: n("dead"), any: rows.length > 0 };
  }).filter((s) => s.any);

  return (
    <PageShell>
      <PageHeader
        title="Data Intelligence"
        description="How much of the disc golf world DGD knows, which sources are healthy, and what needs attention."
        leading={<Database className="h-5 w-5 text-primary" />}
      />
      <DataIntelTabs />
      {q.isLoading ? <AdminPanelSkeleton /> : q.error ? (
        <AdminErrorState message="Couldn't load the data overview. Try again in a moment." />
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
            {[
              ["Courses", c.course_sources, "source links"],
              ["Layouts", c.course_layouts, "canonical"],
              ["PDGA players", c.pdga_players, "known"],
              ["PDGA events", c.pdga_tour_events, "known"],
              ["Rounds", c.external_rounds, "canonical"],
              ["Open conflicts", d?.openConflicts, "need review"],
              ["Source copies", c.source_snapshots, "kept unchanged"],
              ["Field records", c.field_observations, "with source"],
            ].map(([label, n, sub]) => (
              <div key={label as string} className="rounded-xl border border-border bg-card p-3">
                <div className="text-sm text-muted-foreground">{label as string}</div>
                <div className="text-2xl font-semibold tabular-nums">{fmt(n as number | null)}</div>
                <div className="text-sm text-muted-foreground">{sub as string}</div>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-card">
            <header className="border-b border-border p-4">
              <h2 className="font-semibold">What each source provides</h2>
              <p className="text-sm text-muted-foreground">Built from the parsers DGD actually runs, measured against what's stored.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr><th className="p-3 font-medium">Data</th>{SOURCES.map((s) => <th key={s.key} className="p-3 font-medium">{s.label}</th>)}</tr>
                </thead>
                <tbody>
                  {capabilityMatrix(c).map((row) => (
                    <tr key={row.capability} className="border-t border-border">
                      <td className="p-3 font-medium">{row.label}</td>
                      {row.cells.map((cell) => (
                        <td key={cell.source} className="p-3">
                          {cell.status ? (
                            <span className={cell.status === "parser_built" ? "text-muted-foreground" : "text-foreground"} title={`${cell.cap?.parser} · ${fmt(c[cell.cap!.storedTable])} stored`}>
                              {cell.status === "canonicalized" && <Check className="mr-1 inline h-3.5 w-3.5 text-primary" />}
                              {STATUS_LABEL[cell.status]}{cell.cap?.authoritative ? " · owner" : ""}
                            </span>
                          ) : <Minus className="h-3.5 w-3.5 text-muted-foreground" aria-label="Not supported" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-semibold">Ingest queue by source</h2>
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground"><tr><th className="pb-2 font-medium">Source</th><th className="pb-2 font-medium">Waiting</th><th className="pb-2 font-medium">Running</th><th className="pb-2 font-medium">Done</th><th className="pb-2 font-medium">Failed</th></tr></thead>
                <tbody>{queueBySource.map((s) => (
                  <tr key={s.key} className="border-t border-border tabular-nums">
                    <td className="py-2">{s.label}</td><td>{fmt(s.pending)}</td><td>{fmt(s.running)}</td><td>{fmt(s.done)}</td>
                    <td className={s.dead ? "text-destructive" : ""}>{fmt(s.dead)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 font-semibold">Freshness</h2>
              <ul className="space-y-2 text-sm">
                {(d?.lastFetch ?? []).map((f) => (
                  <li key={f.source} className="flex justify-between"><span>{f.source} last checked</span><span className="text-muted-foreground">{ago(f.at)}</span></li>
                ))}
                <li className="flex justify-between"><span>PDGA jobs waiting</span><span className="text-muted-foreground">{fmt(d?.pdgaJobs.find((j) => j.status === "pending")?.count ?? 0)}</span></li>
                <li className="flex justify-between"><span>UDisc courses matched</span><span className="text-muted-foreground">{fmt(d?.udiscCatalog.filter((u) => u.status === "matched" || u.status === "imported").reduce((a, u) => a + u.count, 0))}</span></li>
                <li className="flex justify-between"><span>UDisc pages that failed</span><span className="text-muted-foreground">{fmt(d?.udiscCatalog.find((u) => u.status === "failed")?.count ?? 0)}</span></li>
              </ul>
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
