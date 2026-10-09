import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { PageHeader, LoadingSkeleton } from "@/components/shell";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export const Route = createFileRoute("/_authenticated/director/team")({
  head: () => ({
    meta: [
      { title: "Event team · DG Dashboard" },
      { name: "description", content: "Everyone helping run your events and what role they hold." },
      { property: "og:title", content: "Event team — DG Dashboard" },
      { property: "og:description", content: "Co-directors, staff and volunteers across your events." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const ROLE: Record<string, string> = { owner: "Tournament Director", co_director: "Co-TD", manager: "Co-TD", staff: "Staff", editor: "Staff", viewer: "Viewer" };

function TeamPage() {
  const { user } = useSession();
  const q = useQuery({
    queryKey: ["director-team", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: mine } = await supabase.from("tournaments").select("id, name, slug, start_date").eq("owner_id", user!.id);
      const ids = (mine ?? []).map((t) => t.id);
      if (!ids.length) return { rows: [], events: new Map(), people: new Map() };
      const { data: rows } = await supabase.from("event_managers").select("id, event_id, user_id, access_level, kind").in("event_id", ids);
      const uids = [...new Set((rows ?? []).map((r) => r.user_id))];
      const { data: people } = uids.length
        ? await supabase.from("profiles").select("id, username, display_name").in("id", uids)
        : { data: [] };
      return {
        rows: rows ?? [],
        events: new Map((mine ?? []).map((t) => [t.id, t])),
        people: new Map((people ?? []).map((p) => [p.id, p])),
      };
    },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Team" description="People helping run your events. Add someone from inside an event so their role stays scoped to it." />
      {q.isLoading ? <LoadingSkeleton /> : null}
      {q.data && !q.data.rows.length ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <Users className="h-5 w-5 text-muted-foreground" />
          No co-directors or staff yet. Open an event and use its Team section to add someone.
        </div>
      ) : null}
      {q.data?.rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Event</th></tr>
            </thead>
            <tbody>
              {q.data.rows.map((r) => {
                const p = q.data!.people.get(r.user_id);
                const ev = q.data!.events.get(r.event_id);
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-2">{p?.display_name || p?.username || "Player"}</td>
                    <td className="px-3 py-2">{ROLE[r.access_level] ?? r.access_level.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">
                      {ev?.slug ? <Link to="/tournaments/$slug" params={{ slug: ev.slug }} className="hover:text-primary">{ev.name}</Link> : ev?.name}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
