import { createFileRoute, Link } from "@tanstack/react-router";
import { HeartHandshake, Sparkles, Trophy } from "lucide-react";
import { PageHeader } from "@/components/shell";
import { EVENT_GROUP_LABEL, EVENT_TYPES, type EventGroup } from "@/lib/director/event-types";

export const Route = createFileRoute("/_authenticated/director/new")({
  head: () => ({
    meta: [
      { title: "Create an event · DG Dashboard" },
      { name: "description", content: "Pick what you're running — tournament, league, cleanup, clinic and more — and get the right tools." },
      { property: "og:title", content: "Create an event — DG Dashboard" },
      { property: "og:description", content: "One place to start every disc golf event you organize." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { group?: EventGroup } => ({
    group: s["group"] === "competition" || s["group"] === "community" || s["group"] === "special" ? s["group"] : undefined,
  }),
  component: CreateEventChooser,
});

const GROUP_ICON = { competition: Trophy, community: HeartHandshake, special: Sparkles } as const;

function CreateEventChooser() {
  const { group } = Route.useSearch();
  const groups: EventGroup[] = group ? [group, ...(["competition", "community", "special"] as const).filter((g) => g !== group)] : ["competition", "community", "special"];
  return (
    <div className="space-y-6">
      <PageHeader title="Create an event" description="Pick what you're running. You can add details and tools after the event exists." />
      {groups.map((g) => {
        const Icon = GROUP_ICON[g];
        return (
          <section key={g} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-primary" /> {EVENT_GROUP_LABEL[g]}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {EVENT_TYPES.filter((t) => t.group === g).map((t) => {
                const body = (
                  <>
                    <div className="font-semibold">{t.label}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Includes {t.modules.slice(0, 4).join(", ")}</p>
                  </>
                );
                const cls = "block rounded-xl border border-border bg-card p-4 transition hover:border-primary/60";
                if (t.flow === "tournament")
                  return <Link key={t.id} to="/director/tournaments/new" className={cls}>{body}</Link>;
                if (t.flow === "series")
                  return <Link key={t.id} to="/director/series" className={cls}>{body}</Link>;
                if (t.flow === "league")
                  return <Link key={t.id} to="/director/leagues/new" className={cls}>{body}</Link>;
                return (
                  <Link key={t.id} to="/community/new" search={{ kind: t.communityKind, type: t.label }} className={cls}>
                    {body}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
