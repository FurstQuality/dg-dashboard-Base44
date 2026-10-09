import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent } from "@/components/ui/card";

import { listMyImports } from "@/lib/import-rounds.functions";
import { listRecentIngestJobs } from "@/lib/data-connectors.functions";
import { ImportSyncTool } from "@/components/imports/import-sync-tool";

const TAB_KEYS = ["overview", "rounds"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export const Route = createFileRoute("/_authenticated/settings/imports")({
  head: () => ({
    meta: [
      { title: "Data & sync · Settings · DG Dashboard" },
      {
        name: "description",
        content:
          "One place to pull your rounds, ratings, and course data from PDGA, UDisc, and Disc Golf Scene.",
      },
      { property: "og:title", content: "Data & sync · Settings · DG Dashboard" },
      {
        property: "og:description",
        content: "Sync PDGA, UDisc, and course-rating data from one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey; event?: string } => {
    const t = s.tab;
    const event = typeof s.event === "string" && s.event ? s.event : undefined;
    return {
      ...(typeof t === "string" && (TAB_KEYS as readonly string[]).includes(t)
        ? { tab: t as TabKey }
        : {}),
      ...(event ? { event } : {}),
    };
  },
  component: ImportsSettingsPage,
});

function ImportsSettingsPage() {
  const search = Route.useSearch();

  const roundsQ = useQuery({
    queryKey: ["settings-imports", "rounds"],
    queryFn: () => listMyImports(),
  });
  const ingestQ = useQuery({
    queryKey: ["settings-imports", "ingest"],
    queryFn: () => listRecentIngestJobs(),
  });

  return (
    <div className="space-y-6">
      <ImportSyncTool initialPanel={search.tab === "rounds" ? "rounds" : undefined} />

      <RecentActivity rounds={roundsQ.data ?? []} jobs={ingestQ.data?.jobs ?? []} />
    </div>
  );
}

type RoundRow = {
  id: string;
  source: string;
  course_name: string;
  event_name: string | null;
  played_on: string;
  created_at?: string | null;
  score?: number | null;
  round_rating?: number | null;
};
type JobRow = {
  id: string;
  kind: string;
  source_url: string | null;
  status: string;
  error: string | null;
  created_at: string;
};

type ActivityItem = {
  id: string;
  when: string;
  title: string;
  detail: string;
  outcome: "success" | "pending" | "failed" | "info";
  source: string;
};

function RecentActivity({ rounds, jobs }: { rounds: RoundRow[]; jobs: JobRow[] }) {
  const items: ActivityItem[] = [];

  const sourceLabel: Record<string, string> = {
    pdga: "PDGA",
    udisc: "UDisc",
    dgs: "Disc Golf Scene",
    disc_golf_scene: "Disc Golf Scene",
    scraped: "From a link",
    manual: "Added by hand",
  };

  const kindLabel: Record<string, string> = {
    club: "Club page",
    tournament: "Tournament page",
    course: "Course page",
    event: "Event page",
    facebook: "Facebook page",
    profile: "Player profile",
  };

  for (const r of rounds.slice(0, 25)) {
    items.push({
      id: `r-${r.id}`,
      when: r.played_on ?? r.created_at ?? new Date().toISOString(),
      title: r.event_name?.trim() || r.course_name || "Round",
      detail: [
        r.course_name,
        r.score != null ? `Scored ${r.score}` : null,
        r.round_rating ? `${r.round_rating} rated` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      outcome: "success",
      source: sourceLabel[r.source] ?? r.source,
    });
  }

  for (const j of jobs.slice(0, 25)) {
    const outcome: ActivityItem["outcome"] =
      j.status === "completed" ? "success" : j.status === "failed" ? "failed" : "pending";
    const kind = kindLabel[j.kind] ?? "Link";
    const outcomeText =
      outcome === "success"
        ? "Added to your library"
        : outcome === "pending"
          ? "Working on it…"
          : j.error?.trim() || "Couldn't read this link — try a different URL";
    items.push({
      id: `j-${j.id}`,
      when: j.created_at,
      title: `${kind} imported`,
      detail: outcomeText,
      outcome,
      source: "From a link",
    });
  }

  items.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
  const recent = items.slice(0, 12);
  if (recent.length === 0) return null;

  const relative = (iso: string) => {
    const then = new Date(iso).getTime();
    if (isNaN(then)) return "";
    const diff = Date.now() - then;
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const dot = {
    success: "bg-emerald-500",
    pending: "bg-amber-500 animate-pulse",
    failed: "bg-rose-500",
    info: "bg-muted-foreground",
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-semibold">What we've added recently</h2>
        <p className="text-xs text-muted-foreground">
          Everything imported into your account, in plain language. Tap "Add data" above to bring in
          more.
        </p>
      </div>
      <Card>
        <CardContent className="p-0">
          <ol className="divide-y divide-border/60">
            {recent.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[item.outcome]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.source}
                    </span>
                  </div>
                  {item.detail && (
                    <p
                      className={`truncate text-xs ${item.outcome === "failed" ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"}`}
                    >
                      {item.detail}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {relative(item.when)}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
