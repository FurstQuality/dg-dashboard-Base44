import { CourseConditionInline } from "@/components/courses/course-condition-badge";
import { AdditionalWinners } from "@/components/events/additional-winners";
import { HostedByClub } from "@/components/hosted-by-club";
import { formatLabel } from "@/lib/league-effective";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { CollapsibleSection } from "@/components/shell/collapsible-section";
import { ExternalChatLinks } from "@/components/community/external-chat-links";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { CalendarDays, Play, Trophy, Settings } from "lucide-react";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { toast } from "sonner";
import { LeagueSignupPanel } from "@/components/events/league-signup-panel";
import { FeeBreakdown } from "@/components/event-setup/fee-breakdown";
import { LeagueNightSchedule } from "@/components/league/league-night-schedule";
import { parseNightAgenda } from "@/lib/league-night-schedule";
import { feesFromEventRow } from "@/lib/event-fees";
import { useEventAccess } from "@/components/events/event-access-panel";
import { RequestManageButton } from "@/components/events/request-manage-button";


export const Route = createFileRoute("/_authenticated/leagues/$slug")({
  component: LeagueDetail,
  head: ({ params }) => ({
    meta: [
      { title: `League — DG Dashboard` },
      {
        name: "description",
        content: `Weekly schedule, standings, and registrations for league ${params.slug}.`,
      },
      { property: "og:title", content: `League on DG Dashboard` },
      { property: "og:description", content: "Weekly disc golf league on DG Dashboard." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This league" />,
});

type League = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  season: string | null;
  status: string;
  setup?: unknown;
  agenda?: unknown;
  start_time?: string | null;
  holes_played?: number | null;
  entry_fee_cents?: number | null;
  ace_pot_cents?: number | null;
  ctp_cents?: number | null;
  payout_notes?: string | null;
  pdga_sanctioned?: boolean | null;
  pdga_tier?: string | null;
  pdga_event_number?: string | null;
};
type Event = {
  id: string;
  rounds?: number | null;
  holes_played?: number | null;
  week_number: number;
  name: string | null;
  course_id: string | null;
  layout_id: string | null;
  event_date: string;
  status: string;
  start_time?: string | null;
  check_in_time?: string | null;
  details?: string | null;
  entry_fee_cents?: number | null;
};
const fmtTime = (t: string) =>
  new Date(`2000-01-01T${t.slice(0, 5)}`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
type Reg = {
  id: string;
  user_id: string;
  division: string | null;
  profile?: { username: string; display_name: string };
};

function LeagueDetail() {
  const { slug } = Route.useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [league, setLeague] = useState<League | null>(null);
  const [missing, setMissing] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);
  const { data: access } = useEventAccess("league", league?.id);
  // Directors, club admins, and anyone they've given access to can make changes.
  const isOwner = access?.canManage ?? !!(league && user && league.owner_id === user.id);

  async function load() {
    const { data: l } = await supabase.from("leagues").select("*").eq("slug", slug).maybeSingle();
    if (!l) {
      // No such league: say so instead of spinning on "Loading…" forever.
      setMissing(true);
      return;
    }
    setMissing(false);
    setLeague(l as League);
    const [{ data: e }, { data: r }, { data: cs }] = await Promise.all([
      supabase.from("league_events").select("*").eq("league_id", l.id).order("week_number"),
      supabase.from("league_registrations").select("*").eq("league_id", l.id),
      supabase.from("courses").select("id, name").order("name").limit(200),
    ]);
    setEvents((e as Event[]) ?? []);
    setCourses((cs as any) ?? []);
    const list = (r as Reg[]) ?? [];
    if (list.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in(
          "id",
          list.map((x) => x.user_id),
        );
      const map = new Map((p ?? []).map((x: any) => [x.id, x]));
      list.forEach((x) => (x.profile = map.get(x.user_id) as any));
    }
    setRegs(list);
  }
  useEffect(() => {
    load();
  }, [slug]);

  if (missing)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">We couldn&apos;t find that league</h1>
        <p className="text-muted-foreground">
          The link may be old, or the league may have been removed. Browse what&apos;s running now
          from the events page.
        </p>
        <Link to="/events" className="text-primary font-medium hover:underline">
          Back to events
        </Link>
      </div>
    );

  if (!league) return <div className="text-sm text-muted-foreground">Loading league details…</div>;

  const mine = regs.find((r) => r.user_id === user?.id);

  return (
    <PageShell section="tournaments">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-primary">
              {league.season ?? "Season"}
            </div>
            <h1 className="mt-1 font-display text-2xl font-semibold">{league.name}</h1>
            <HostedByClub clubId={(league as { club_id?: string | null }).club_id} />
            {league.description ? (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{league.description}</p>
            ) : null}
            <div className="mt-2">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs uppercase">
                {league.status}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOwner ? (
              <Link
                to="/director/leagues/$slug"
                params={{ slug }}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Settings className="h-4 w-4" /> Manage league
              </Link>
            ) : null}
            <RequestManageButton kind="league" eventId={league.id} access={access} />
            <Link
              to="/events"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
            >
              <Trophy className="h-4 w-4" /> All standings
            </Link>
          </div>
        </div>
      </div>

      <CollapsibleSection
        title="What you pay, and what you can win"
        description="Entry, ace pot, and where the payout goes."
        storageKey="league-fees"
      >
        <FeeBreakdown fees={feesFromEventRow(league, "league")} unit="night" />
      </CollapsibleSection>

      <LeagueNightSchedule
        leagueId={league.id}
        agenda={parseNightAgenda(league.agenda)}
        canEdit={false}
        startTime={league.start_time ?? null}
        holes={league.holes_played ?? null}
      />

      <LeagueSignupPanel leagueId={league.id} />

      <ExternalChatLinks ownerType="league" ownerId={league.id} canManage={false} />

      <div className="grid gap-4 md:grid-cols-[1fr_280px]">
        <CollapsibleSection
          title="Weekly events"
          badge={`${events.length} ${events.length === 1 ? "week" : "weeks"}`}
          description="Dates and courses for each league night."
          storageKey="league-weeks"
        >
          {events.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              No league nights posted yet — check back once the director sets the schedule.
            </div>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border bg-card">
              {events.map((e) => (
                <div key={e.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="font-medium">
                      Week {e.week_number}
                      {e.name ? ` – ${e.name}` : ""}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />{" "}
                      {new Date(`${e.event_date.slice(0, 10)}T00:00:00`).toLocaleDateString()}
                      {e.start_time ? <span>· starts {fmtTime(e.start_time)}</span> : null}
                      {e.check_in_time ? <span>· check-in {fmtTime(e.check_in_time)}</span> : null}
                      {e.entry_fee_cents != null ? <span>· ${(e.entry_fee_cents / 100).toFixed(0)} this night</span> : null}
                      {(e as { format?: string | null }).format ? (
                        <span>· {formatLabel((e as { format?: string | null }).format)}</span>
                      ) : null}
                      {(e as { payout_notes?: string | null }).payout_notes ? (
                        <span>· Payout: {(e as { payout_notes?: string | null }).payout_notes}</span>
                      ) : null}
                      {e.course_id ? (
                        <span>
                          ·{" "}
                          <Link
                            to="/courses/$courseId"
                            params={{ courseId: e.course_id }}
                            className="text-primary hover:underline"
                          >
                            {courses.find((c) => c.id === e.course_id)?.name ?? "View course"}
                          </Link>{" "}
                          <CourseConditionInline courseId={e.course_id} />
                        </span>
                      ) : null}
                      {e.rounds && e.rounds > 1 ? <span>· two rounds</span> : null}
                      {e.holes_played ? <span>· {e.holes_played} holes</span> : null}
                      <span className="rounded-full bg-muted px-2 py-0.5 uppercase">
                        {e.status}
                      </span>
                    </div>
                    {e.details ? (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{e.details}</p>
                    ) : null}
                    {e.status === "completed" && <AdditionalWinners kind="league_event" eventId={e.id} className="mt-2" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {user && e.course_id && e.layout_id ? (
                      <Button
                        size="sm"
                        disabled={startingId === e.id}
                        onClick={async () => {
                          setStartingId(e.id);
                          try {
                            const { data: nr, error } = await supabase
                              .from("rounds")
                              .insert({
                                course_id: e.course_id!,
                                layout_id: e.layout_id!,
                                created_by: user.id,
                                league_event_id: e.id,
                                round_context: "league_night",
                                play_format: "singles",
                              })
                              .select("id")
                              .single();
                            if (error) throw error;
                            await supabase
                              .from("round_players")
                              .insert({ round_id: nr!.id, user_id: user.id, position: 0 });
                            navigate({ to: "/play/$roundId", params: { roundId: nr!.id } });
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "We couldn't start this. Give it another shot.",
                            );
                          } finally {
                            setStartingId(null);
                          }
                        }}
                      >
                        <Play className="mr-1 h-3.5 w-3.5" />
                        {startingId === e.id ? "Starting…" : "Start"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Members"
          badge={`${regs.length} ${regs.length === 1 ? "player" : "players"}`}
          description="Everyone signed up for the season."
          storageKey="league-members"
        >
          <div className="rounded-xl border border-border bg-card">
            {regs.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No one's signed up yet — be the first on the card.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {regs.map((r) => (
                  <Link
                    key={r.id}
                    to="/u/$username"
                    params={{ username: r.profile?.username ?? "" }}
                    className="block px-3 py-2 text-sm hover:bg-muted/40"
                  >
                    <div className="font-medium">{r.profile?.display_name ?? "Player"}</div>
                    <div className="text-xs text-muted-foreground">@{r.profile?.username}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </CollapsibleSection>
      </div>
    </PageShell>
  );
}

