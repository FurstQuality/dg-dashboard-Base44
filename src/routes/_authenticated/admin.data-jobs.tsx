import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/data-jobs")({
  component: DataJobs,
  head: () => ({
    meta: [
      { title: "Jobs & Health · Admin · DG Dashboard" },
      { name: "description", content: "Whether the background course jobs are running, and why anything failed." },
      { property: "og:title", content: "Jobs & Health · DG Dashboard" },
      { property: "og:description", content: "Background course job health and failure reasons." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Health = {
  catalog_last_run: string | null;
  catalog_runs_24h: number;
  catalog_read_24h: number;
  catalog_failed_24h: number;
  catalog_waiting: number;
  listings_last_read: string | null;
  listings_read_24h: number;
  listings_never_read: number;
  listing_errors: { reason: string; n: number }[];
  scene_events_checked: number;
  scene_links: number;
  town_centre_pins_left: number;
  par_from_listings: number;
  draft_layouts: number;
};

const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 120) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** A job counts as stalled when it hasn't run for an hour. */
function stalled(iso: string | null) {
  return !iso || Date.now() - new Date(iso).getTime() > 60 * 60 * 1000;
}

function DataJobs() {
  const { isAdmin, checking } = useAdminAccess();
  const q = useQuery({
    queryKey: ["admin", "course-jobs-health"],
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("course_jobs_health");
      if (error) throw error;
      return data as unknown as Health;
    },
  });

  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin) {
    return (
      <PageShell>
        <AdminErrorState message="Data Intelligence is limited to admins." />
      </PageShell>
    );
  }
  const h = q.data;
  const jobs: { name: string; last: string | null; lines: string[] }[] = h
    ? [
        {
          name: "Course list sweep",
          last: h.catalog_last_run,
          lines: [
            `${fmt(h.catalog_runs_24h)} runs in the last 24 hours`,
            `${fmt(h.catalog_read_24h)} listings read · ${fmt(h.catalog_failed_24h)} failed`,
            `${fmt(h.catalog_waiting)} listings still waiting`,
          ],
        },
        {
          name: "Listing re-reads",
          last: h.listings_last_read,
          lines: [
            `${fmt(h.listings_read_24h)} listings read in the last 24 hours`,
            `${fmt(h.listings_never_read)} linked listings not read yet`,
            `${fmt(h.par_from_listings)} hole pars from listings · ${fmt(h.draft_layouts)} draft layouts`,
          ],
        },
        {
          name: "Disc Golf Scene links",
          last: null,
          lines: [`${fmt(h.scene_events_checked)} tournaments checked`, `${fmt(h.scene_links)} courses linked`],
        },
        {
          name: "Pin upgrades",
          last: null,
          lines: [`${fmt(h.town_centre_pins_left)} town-centre pins left to upgrade`],
        },
      ]
    : [];

  return (
    <PageShell>
      <PageHeader
        title="Jobs & Health"
        description="Whether the background course jobs are running, how much they did, and why anything failed."
        leading={<Activity className="h-5 w-5 text-primary" />}
      />
      <DataIntelTabs />
      {q.isLoading ? (
        <AdminPanelSkeleton />
      ) : q.isError || !h ? (
        <AdminErrorState message="Job health couldn't load. Try refreshing." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {jobs.map((j) => (
              <section key={j.name} className="min-w-0 rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold">{j.name}</h2>
                  {j.last !== null || j.name === "Course list sweep" || j.name === "Listing re-reads" ? (
                    <span className={`text-xs font-medium ${stalled(j.last) ? "text-destructive" : "text-success"}`}>
                      {stalled(j.last) ? "Stalled" : "Running"}
                    </span>
                  ) : null}
                </div>
                {j.name === "Course list sweep" || j.name === "Listing re-reads" ? (
                  <p className="text-xs text-muted-foreground">Last run: {ago(j.last)}</p>
                ) : null}
                <ul className="mt-2 space-y-1 text-sm">
                  {j.lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">Why listing reads failed</h2>
            {h.listing_errors.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No failed listing reads. Nice.</p>
            ) : (
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {h.listing_errors.map((e) => (
                  <li key={e.reason} className="flex justify-between gap-3 tabular-nums">
                    <span className="truncate">{e.reason}</span>
                    <span className="text-muted-foreground">{fmt(e.n)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-sm text-muted-foreground">
            Background jobs run on the published app every 5 minutes. A job shows Stalled when it hasn't run for an hour.
          </p>
        </div>
      )}
    </PageShell>
  );
}
