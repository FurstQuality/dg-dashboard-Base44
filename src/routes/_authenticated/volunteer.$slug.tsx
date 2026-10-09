import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ScanLine, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { EventAlertsBanner, EventAlertsManager } from "@/components/events/event-alerts";
import { TaskStatusButton, useVolunteerTasks } from "@/components/events/volunteer-tasks";

export const Route = createFileRoute("/_authenticated/volunteer/$slug")({
  head: () => ({
    meta: [
      { title: "Volunteer · DG Dashboard | Ace" },
      { name: "description", content: "Your volunteer jobs, live event updates and course-issue reporting on one phone screen." },
      { property: "og:title", content: "Volunteer · DG Dashboard | Ace" },
      { property: "og:description", content: "Your volunteer jobs and live event updates on one phone screen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VolunteerPage,
});

function VolunteerPage() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const [t, setT] = useState<{ id: string; name: string } | null>(null);
  const [isTeam, setIsTeam] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("tournaments").select("id, name").eq("slug", slug).maybeSingle();
      setT(data);
      if (data) {
        const { data: ok } = await supabase.rpc("can_manage_event", { _kind: "tournament", _event: data.id, _user: user.id });
        setIsTeam(!!ok);
      }
      setLoaded(true);
    })();
  }, [slug, user]);

  if (!loaded) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!t) return <div className="p-6 text-sm">We couldn't find that event.</div>;
  return <VolunteerBody t={t} slug={slug} userId={user!.id} isTeam={isTeam} />;
}

function VolunteerBody({ t, slug, userId, isTeam }: { t: { id: string; name: string }; slug: string; userId: string; isTeam: boolean }) {
  const { tasks, loading, reload } = useVolunteerTasks(t.id, userId);
  const open = tasks.filter((x) => x.status !== "done");
  const done = tasks.filter((x) => x.status === "done");

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/tournaments/$slug" params={{ slug }}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Event page
        </Link>
      </Button>
      <header>
        <h1 className="font-display text-2xl">Volunteering · {t.name}</h1>
        <p className="text-sm text-muted-foreground">Your jobs for today. Tap to start, tap again when it's done.</p>
      </header>

      <EventAlertsBanner tournamentId={t.id} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">My jobs {open.length ? `(${open.length} left)` : ""}</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading your jobs…</p>
        ) : tasks.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
            No jobs assigned to you yet. Check back with the director — new jobs appear here instantly.
          </p>
        ) : (
          <ul className="space-y-2">
            {[...open, ...done].map((x) => (
              <li key={x.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className={`text-base font-medium ${x.status === "done" ? "line-through text-muted-foreground" : ""}`}>{x.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {x.hole_number ? `Hole ${x.hole_number}` : "Anywhere"}
                    {x.status === "doing" ? " · In progress" : ""}
                  </div>
                  {x.notes ? <p className="mt-1 text-sm text-muted-foreground">{x.notes}</p> : null}
                </div>
                <TaskStatusButton t={x} onDone={reload} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isTeam ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild className="h-12">
              <Link to="/director/check-in" search={{ kind: "tournament", id: t.id }}>
                <ScanLine className="mr-2 h-4 w-4" /> Check in players
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-12">
              <Link to="/tournaments/$slug" params={{ slug }} search={{ tab: "leaderboard" }}>
                <Trophy className="mr-2 h-4 w-4" /> Leaderboard
              </Link>
            </Button>
          </div>
          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Report to players</h2>
            <EventAlertsManager tournamentId={t.id} />
          </section>
        </>
      ) : null}
    </div>
  );
}
