import { EventsViewTabs } from "@/components/events/events-view-tabs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Trophy, CalendarDays, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { listPublicSeries, type PublicSeriesCard } from "@/lib/series.functions";

const seriesQuery = queryOptions({ queryKey: ["public-series"], queryFn: () => listPublicSeries() });

const TITLE = "Disc golf series — leagues and tour standings | DG Dashboard";
const DESC = "Every league and tournament series scored together, with season standings, finales and event schedules.";

export const Route = createFileRoute("/series/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(seriesQuery),
  component: SeriesIndex,
});

type Kind = "all" | "tournament" | "league" | "mixed";

function kindOf(s: PublicSeriesCard): Exclude<Kind, "all"> | "empty" {
  if (s.tournaments && s.leagues) return "mixed";
  if (s.tournaments) return "tournament";
  if (s.leagues) return "league";
  return "empty";
}
const KIND_LABEL = { tournament: "Tournament series", league: "League series", mixed: "Leagues + tournaments", empty: "No events yet" };

function fmt(d: string | null) {
  return d ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
}

function SeriesIndex() {
  const { data } = useSuspenseQuery(seriesQuery);
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const rows = useMemo(
    () =>
      data.filter((s) => (kind === "all" || kindOf(s) === kind) &&
        (!q || `${s.name} ${s.host ?? ""} ${s.season ?? ""}`.toLowerCase().includes(q.toLowerCase()))),
    [data, kind, q],
  );
  const tabs: { k: Kind; label: string }[] = [
    { k: "all", label: `All (${data.length})` },
    { k: "tournament", label: "Tournament series" },
    { k: "league", label: "League series" },
    { k: "mixed", label: "Mixed" },
  ];

  return (
    <main className="mx-auto max-w-[1320px] px-5 py-6 md:px-7">
      <header className="mb-6">
        <h1 className="font-display text-3xl">Series</h1>
        <p className="mt-1 text-muted-foreground">Leagues and tournaments scored together across a season. Each event keeps its own course and schedule.</p>
      </header>

      <div className="mb-4">
        <EventsViewTabs current="series" />
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 flex-wrap rounded-lg border border-border p-1">
          {tabs.map((t) => (
            <button key={t.k} onClick={() => setKind(t.k)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${kind === t.k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search series or host" className="pl-9" />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border p-6 text-muted-foreground">
          {data.length ? "No series match that search." : "No public series yet. When a director links leagues or tournaments into a series, it shows up here."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => {
            const k = kindOf(s);
            const from = fmt(s.first_date), to = fmt(s.last_date);
            return (
              <Link key={s.id} to="/series/$slug" params={{ slug: s.slug }}
                className="block rounded-2xl bg-card p-4 ring-1 ring-border/50 transition duration-200 hover:-translate-y-0.5 hover:ring-primary/40 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{s.name}</h2>
                  <Badge variant="secondary">{KIND_LABEL[k]}</Badge>
                </div>
                {s.host && <p className="mt-1 text-sm text-muted-foreground">Hosted by {s.host}</p>}
                <ul className="mt-3 space-y-1.5 text-sm">
                  <li className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" />
                    {[s.tournaments && `${s.tournaments} tournament${s.tournaments > 1 ? "s" : ""}`, s.leagues && `${s.leagues} league${s.leagues > 1 ? "s" : ""}`].filter(Boolean).join(" · ") || "Events coming soon"}
                  </li>
                  {from && <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" />{from}{to && to !== from ? ` – ${to}` : ""}</li>}
                  {s.finale_name && <li className="flex items-center gap-2"><Trophy className="h-4 w-4 text-muted-foreground" />Finale: {s.finale_name}</li>}
                </ul>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
