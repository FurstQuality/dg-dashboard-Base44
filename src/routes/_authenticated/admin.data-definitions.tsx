import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { DataIntelTabs } from "@/components/admin/data-intel-tabs";
import { useAdminAccess } from "@/lib/admin-access";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/data-definitions")({
  component: DataDefinitions,
  head: () => ({
    meta: [
      { title: "Data definitions · Admin · DG Dashboard" },
      { name: "description", content: "What every course count in Data Intelligence measures." },
      { property: "og:title", content: "Data definitions · DG Dashboard" },
      { property: "og:description", content: "What every course count in Data Intelligence measures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TERMS: { term: string; means: string; notes: string }[] = [
  { term: "Source listing", means: "A course page found on PDGA, UDisc or Disc Golf Scene.", notes: "The UDisc list includes courses worldwide, so it is larger than the number of US courses." },
  { term: "Set aside", means: "A source listing we read but didn't turn into a course.", notes: "Outside the US, or the page couldn't be read. Course Atlas lists the reasons." },
  { term: "Source course", means: "What one source says about a course: name, holes, layouts, par, location.", notes: "Each reading is kept as a saved copy with its field history." },
  { term: "Canonical course", means: "One real course with one DG Dashboard record.", notes: "Excludes entries hidden as not a course and duplicates joined into another course." },
  { term: "Directory ready", means: "A canonical course approved for the public directory.", notes: "New courses wait for review first." },
  { term: "Directory pin ready", means: "A directory-ready course with a map spot.", notes: "It must appear on the Courses map. Exact and approximate (town-centre) spots both count; approximate ones are labelled." },
  { term: "Missing location", means: "A directory-ready course with no map spot yet.", notes: "Fixed from a listing, an address, a park lookup, or by hand. Never a guessed town centre." },
  { term: "Scoring ready", means: "Has a published layout where every hole has a tee, a basket and a par.", notes: "Draft layouts from listings don't count until someone builds and publishes them." },
  { term: "Hole map ready", means: "Every tee and basket on a layout is placed on the map.", notes: "Separate from pin ready: a course can be on the map without any holes mapped." },
  { term: "Caddy ready", means: "Hole map ready, plus the course rules and hazards Ace needs.", notes: "Comes after hole mapping." },
  { term: "Par from a listing", means: "Hole par read from a UDisc or Disc Golf Scene listing.", notes: "Only used when the listing's hole count matches the layout exactly. Labelled by source and never overrides par a steward confirmed." },
];

function DataDefinitions() {
  const { isAdmin, checking } = useAdminAccess();
  if (checking) return <AdminPanelSkeleton />;
  if (!isAdmin) {
    return (
      <PageShell>
        <AdminErrorState message="Data Intelligence is limited to admins." />
      </PageShell>
    );
  }
  return (
    <PageShell>
      <PageHeader
        title="Data definitions"
        description="What every course number in Data Intelligence counts, so the same word always means the same thing."
        leading={<BookOpen className="h-5 w-5 text-primary" />}
      />
      <DataIntelTabs />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <dl className="divide-y divide-border">
          {TERMS.map((t) => (
            <div key={t.term} className="grid gap-1 p-4 md:grid-cols-[200px_1fr]">
              <dt className="font-semibold">{t.term}</dt>
              <dd className="space-y-1 text-sm">
                <p>{t.means}</p>
                <p className="text-muted-foreground">{t.notes}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </PageShell>
  );
}
