import { CourseConditionInline } from "@/components/courses/course-condition-badge";
import { AdditionalWinners } from "@/components/events/additional-winners";
import { HostedByClub } from "@/components/hosted-by-club";
import { channelNonce } from "@/lib/realtime";
import { EventRoundMapControls } from "@/components/events/event-round-map-controls";
import { PageShell } from "@/components/shell/page-shell";
import { CollapsibleSection } from "@/components/shell/collapsible-section";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalChatLinks } from "@/components/community/external-chat-links";
import { EventOddsInsight } from "@/components/statboard/event-odds-insight";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EventPlaybook } from "@/components/event-setup/event-playbook";
import {
  buildEventPlaybook,
  buildTdChecklist,
  playbookForPhase,
  tierLabel,
} from "@/lib/sanctioning-plan";
import {
  Trophy,
  Calendar,
  MapPin,
  Users,
  Plus,
  Trash2,
  ClipboardCheck,
  BookOpen,
  Share2,
  Play,
  Send,
} from "lucide-react";
import { TdChecklist } from "@/components/td-checklist";
import { TdLiveScoring } from "@/components/td-live-scoring";
import { CheckInWidget } from "@/components/director/checkin-widget";
import { JoinCodePanel } from "@/components/scoring/join-code-panel";

import { TournamentCaddyGuide } from "@/components/tournament-caddy-guide";
import { TournamentSharePanel } from "@/components/tournament-share-panel";
import { TournamentScheduleSection } from "@/components/tournament-schedule-section";
import { parseAgenda, type AgendaItem } from "@/lib/tournament-schedule";
import { FeeBreakdown } from "@/components/event-setup/fee-breakdown";
import { feesFromEventRow } from "@/lib/event-fees";
import { allowsPreRegistration } from "@/lib/event-setup";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { toast } from "sonner";
import { EventAccessPanel, useEventAccess } from "@/components/events/event-access-panel";
import { RequestManageButton } from "@/components/events/request-manage-button";
import { ClaimEventButton } from "@/components/events/claim-event-button";
import { TournamentManageForm } from "@/components/event-manage-form";
import { EventInvitePanel } from "@/components/events/event-invite-panel";
import { PlayerPassButton } from "@/components/events/player-pass";
import { EventAlertsBanner } from "@/components/events/event-alerts";
import { SelfCheckInButton } from "@/components/events/self-check-in";
import { TrackEventButton } from "@/components/tracker/track-event-button";
import { z } from "zod";

const SearchSchema = z
  .object({
    tab: z
      .enum([
        "overview",
        "registrations",
        "leaderboard",
        "caddy",
        "share",
        "td",
        "prep",
        "dayof",
        "manage",
        "invite",
      ])
      .optional(),
  })
  .partial();

export const Route = createFileRoute("/_authenticated/tournaments/$slug")({
  component: TournamentDetail,
  validateSearch: (raw) => SearchSchema.parse(raw),
  head: ({ params }) => ({
    meta: [
      { title: `Tournament — DG Dashboard` },
      {
        name: "description",
        content: `Tournament details, divisions, registrations, and the TD checklist for ${params.slug}.`,
      },
      { property: "og:title", content: `Tournament on DG Dashboard` },
      { property: "og:description", content: "Divisions, registrations, and TD tools." },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This tournament" />,
});

type Tournament = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  format: string;
  start_date: string;
  end_date: string;
  location: string | null;
  pdga_sanctioned: boolean;
  pdga_tier: string | null;
  entry_fee_cents: number;
  max_players: number | null;
  cover_url: string | null;
  agenda: unknown;
  setup: unknown;
  signup_type: string | null;
  registration_opens: string | null;
  registration_closes: string | null;
};

type Division = {
  id: string;
  code: string;
  name: string;
  entry_fee_cents: number;
  max_players: number | null;
};
type Round = {
  id: string;
  round_number: number;
  course_id: string | null;
  layout_id: string | null;
  starts_at: string | null;
  status: string;
};
type Registration = {
  id: string;
  user_id: string;
  division_id: string;
  status: string;
  payment_status: string;
  pdga_number: string | null;
  profile?: { username: string; display_name: string; avatar_url: string | null };
};

function firstRoundTime(rounds: Round[]): string | null {
  const first = [...rounds]
    .sort((a, b) => a.round_number - b.round_number)
    .find((r) => !!r.starts_at);
  if (!first?.starts_at) return null;
  const d = new Date(first.starts_at);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function TournamentDetail() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useSession();
  const navigate = useNavigate();

  const [t, setT] = useState<Tournament | null>(null);
  const [missing, setMissing] = useState(false);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [startingRoundId, setStartingRoundId] = useState<string | null>(null);

  const { data: access } = useEventAccess("tournament", t?.id);
  // Directors, club admins, and anyone they've given access to can make changes.
  const isOwner = access?.canManage ?? !!(t && user && t.owner_id === user.id);
  const myReg = user ? (regs.find((r) => r.user_id === user.id) ?? null) : null;

  async function reload() {
    const { data: tt } = await supabase
      .from("tournaments")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (!tt) {
      // No such tournament: say so instead of spinning on "Loading…" forever.
      setMissing(true);
      return setT(null);
    }
    setMissing(false);
    setT(tt as Tournament);
    const [{ data: d }, { data: r }, { data: rg }, { data: cs }] = await Promise.all([
      supabase.from("tournament_divisions").select("*").eq("tournament_id", tt.id).order("code"),
      supabase
        .from("tournament_rounds")
        .select("*")
        .eq("tournament_id", tt.id)
        .order("round_number"),
      supabase
        .from("tournament_registrations")
        .select("*")
        .eq("tournament_id", tt.id)
        .order("created_at"),
      supabase.from("courses").select("id, name").order("name").limit(200),
    ]);
    setDivisions((d as Division[]) ?? []);
    setRounds((r as Round[]) ?? []);
    setCourses((cs as any) ?? []);
    const regsList = (rg as Registration[]) ?? [];
    if (regsList.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in(
          "id",
          regsList.map((x) => x.user_id),
        );
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      regsList.forEach((x) => (x.profile = map.get(x.user_id) as any));
    }
    setRegs(regsList);
  }

  useEffect(() => {
    reload();
  }, [slug]);

  if (t === null && !slug) return null;
  if (missing)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">We couldn&apos;t find that tournament</h1>
        <p className="text-muted-foreground">
          The link may be old, or the tournament may have been removed. Browse what&apos;s coming up
          from the events page.
        </p>
        <Link to="/events" className="text-primary font-medium hover:underline">
          Back to events
        </Link>
      </div>
    );
  if (t === null)
    return <div className="text-sm text-muted-foreground">Loading tournament details…</div>;

  return (
    <PageShell section="tournaments">
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="relative aspect-[21/6] bg-gradient-to-br from-primary/20 to-accent/10">
          {t.cover_url ? (
            <img src={t.cover_url} alt={t.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center">
              <Trophy className="h-14 w-14 text-primary/60" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-2xl font-semibold">{t.name}</h1>
            <HostedByClub clubId={(t as { club_id?: string | null }).club_id} />
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(t.start_date).toLocaleDateString()} –{" "}
                  {new Date(t.end_date).toLocaleDateString()}
                </span>
                {t.location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {t.location}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {regs.length}
                  {t.max_players ? `/${t.max_players}` : ""}
                </span>
                {t.pdga_sanctioned ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                    PDGA {t.pdga_tier ?? ""}
                  </span>
                ) : null}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t.status.replace(/_/g, " ")}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {t.format.replace(/_/g, " ")}
                </span>
              </div>
              {t.description ? <p className="mt-3 max-w-2xl text-sm">{t.description}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <RegisterButton tournament={t} divisions={divisions} regs={regs} onChange={reload} />
              {myReg ? (
                <>
                  <SelfCheckInButton
                    target={{ kind: "tournament", id: t.id }}
                    registered
                    alreadyCheckedIn={myReg.status === "checked_in"}
                    onDone={reload}
                  />
                  <PlayerPassButton />
                  <Link
                    to="/my-event/$slug"
                    params={{ slug: t.slug }}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                  >
                    My event
                  </Link>
                  <Link
                    to="/play/staging"
                    search={{ event: t.id }}
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                  >
                    Event clubhouse
                  </Link>
                </>
              ) : null}
              <TrackEventButton
                size="default"
                event={{
                  eventRef: `dgd-tournament-${t.id}`,
                  name: t.name,
                  eventDate: t.start_date,
                  location: t.location,
                  tier: t.pdga_sanctioned ? (t.pdga_tier ?? "PDGA") : null,
                }}
              />
              {(t as { management_status?: string }).management_status === "unclaimed_external" ? (
                access?.canManage ? null : <ClaimEventButton tournamentId={t.id} userId={user?.id} />
              ) : (
                <RequestManageButton kind="tournament" eventId={t.id} access={access} />
              )}
              <Link
                to="/events"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
              >
                <Trophy className="h-4 w-4" /> All standings
              </Link>
            </div>
          </div>
        </div>
      </div>

      <EventAlertsBanner tournamentId={t.id} />

      {isOwner ? (
        <Link
          to="/volunteer/$slug"
          params={{ slug: t.slug }}
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Open volunteer phone view
        </Link>
      ) : null}

      <EventOddsInsight tournamentId={t.id} />

      <ExternalChatLinks ownerType="tournament" ownerId={t.id} canManage={isOwner} />

      <Tabs
        defaultValue={
          search.tab === "td" || search.tab === "prep" ? "dayof" : (search.tab ?? "overview")
        }
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">Players ({regs.length})</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="caddy">
            <BookOpen className="mr-1 h-3.5 w-3.5" />
            Caddy Guide
          </TabsTrigger>
          {isOwner ? (
            <TabsTrigger value="invite">
              <Send className="mr-1 h-3.5 w-3.5" />
              Invite
            </TabsTrigger>
          ) : null}
          {isOwner ? (
            <TabsTrigger value="share">
              <Share2 className="mr-1 h-3.5 w-3.5" />
              Promote
            </TabsTrigger>
          ) : null}
          {isOwner ? (
            <TabsTrigger value="dayof">
              <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
              Event prep
            </TabsTrigger>
          ) : null}
          {isOwner ? <TabsTrigger value="manage">Manage</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <FeeBreakdown fees={feesFromEventRow(t, "tournament")} unit="event" />
          <CollapsibleSection
            title="Divisions"
            badge={`${divisions.length} ${divisions.length === 1 ? "division" : "divisions"}`}
            description="Entry fee, field cap, and how many players are in each."
            storageKey="tournament-divisions"
          >
            {divisions.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No divisions set up yet — add one so players know where to register.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {divisions.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium">
                        {d.code} – {d.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        ${(d.entry_fee_cents / 100).toFixed(2)}
                        {d.max_players ? ` · cap ${d.max_players}` : ""}
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {regs.filter((r) => r.division_id === d.id).length} registered
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <TournamentScheduleSection
            tournamentId={t.id}
            agenda={parseAgenda(t.agenda)}
            canEdit={isOwner}
            startDate={t.start_date}
            firstRoundTime={firstRoundTime(rounds)}
            rounds={rounds.length || 2}
            onChange={(next) => setT((prev) => (prev ? { ...prev, agenda: next } : prev))}
          />

          <CollapsibleSection
            title="Rounds"
            badge={`${rounds.length} ${rounds.length === 1 ? "round" : "rounds"}`}
            description="Tee times, courses, and where to start scoring."
            storageKey="tournament-rounds"
          >
            {rounds.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                Rounds aren't scheduled yet — add tee times so players know when to show up.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {rounds.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2">
                    <div className="text-sm">
                      <div className="font-medium">Round {r.round_number}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.starts_at ? new Date(r.starts_at).toLocaleString() : "TBD"}
                        {r.course_id ? (
                          <>
                            {" · "}
                            <Link
                              to="/courses/$courseId"
                              params={{ courseId: r.course_id }}
                              className="text-primary hover:underline"
                            >
                              {courses.find((c) => c.id === r.course_id)?.name ?? "View course"}
                            </Link>{" "}
                            <CourseConditionInline courseId={r.course_id} />
                          </>
                        ) : (
                          ""
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{r.status}</span>
                      {user && r.course_id && r.layout_id ? (
                        <Button
                          size="sm"
                          disabled={startingRoundId === r.id}
                          onClick={async () => {
                            if (!t) return;
                            setStartingRoundId(r.id);
                            try {
                              const { data: nr, error } = await supabase
                                .from("rounds")
                                .insert({
                                  course_id: r.course_id!,
                                  layout_id: r.layout_id!,
                                  created_by: user.id,
                                  tournament_id: t.id,
                                  tournament_round_id: r.id,
                                  round_context: "tournament_round",
                                })
                                .select("id")
                                .single();
                              if (error) throw error;
                              await supabase
                                .from("round_players")
                                .insert({ round_id: nr!.id, user_id: user.id, position: 0 });
                              navigate({ to: "/play/$roundId", params: { roundId: nr!.id } });
                            } catch (e) {
                              toast.error(
                                e instanceof Error
                                  ? e.message
                                  : "We couldn't start this round. Give it another shot.",
                              );
                            } finally {
                              setStartingRoundId(null);
                            }
                          }}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" />
                          {startingRoundId === r.id ? "Starting…" : "Start scoring"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="registrations">
          <RegistrationsList
            tournamentId={t.id}
            regs={regs}
            divisions={divisions}
            isOwner={isOwner}
            onChange={reload}
          />
        </TabsContent>

        <TabsContent value="leaderboard">
          <Leaderboard tournamentId={t.id} rounds={rounds} regs={regs} divisions={divisions} />
          <AdditionalWinners kind="tournament" eventId={t.id} />
        </TabsContent>

        <TabsContent value="caddy">
          <TournamentCaddyGuide tournamentName={t.name} rounds={rounds} />
        </TabsContent>

        {isOwner ? (
          <TabsContent value="invite">
            <EventInvitePanel
              eventKind="tournament"
              eventId={t.id}
              eventTitle={t.name}
              eventStartsAt={t.start_date}
              eventLocation={t.location ?? undefined}
            />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="share">
            <TournamentSharePanel
              event={{
                id: t.id,
                name: t.name,
                slug: t.slug,
                start_date: t.start_date,
                end_date: t.end_date,
                location: t.location,
                description: t.description,
                cover_url: t.cover_url,
                pdga_sanctioned: t.pdga_sanctioned,
                pdga_tier: t.pdga_tier,
                entry_fee_cents: t.entry_fee_cents,
                max_players: t.max_players,
              }}
              registeredCount={regs.length}
            />
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="dayof" className="space-y-4">
            {(() => {
              const playbook = buildEventPlaybook({
                sanctioned: t.pdga_sanctioned,
                tier: t.pdga_tier,
                rounds: rounds.length,
                hasEntryFee: (t.entry_fee_cents ?? 0) > 0,
              });
              const suggestions = buildTdChecklist({
                sanctioned: t.pdga_sanctioned,
                tier: t.pdga_tier,
                hasEntryFee: (t.entry_fee_cents ?? 0) > 0,
                rounds: rounds.length,
              });
              const tool = (
                to: "/director/kit" | "/director/ops" | "/director/check-in" | "/director/kiosk",
                label: string,
                blurb: string,
              ) => (
                <Link
                  key={to}
                  to={to}
                  search={{ event: t.id }}
                  className="rounded-xl border border-border bg-card p-3 hover:bg-muted/40"
                >
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{blurb}</div>
                </Link>
              );
              return (
                <>
                  <div className="rounded-xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
                    Built from this event&apos;s settings:{" "}
                    <span className="font-medium text-foreground">
                      {t.pdga_sanctioned
                        ? `Sanctioned · ${tierLabel(t.pdga_tier)}`
                        : "Unsanctioned"}
                    </span>{" "}
                    ·{" "}
                    <span className="font-medium text-foreground">
                      {(t.entry_fee_cents ?? 0) > 0 ? "Entry fee and payouts" : "No entry fee"}
                    </span>{" "}
                    ·{" "}
                    <span className="font-medium text-foreground">
                      {rounds.length} {rounds.length === 1 ? "round" : "rounds"}
                    </span>
                  </div>

                  <CollapsibleSection
                    title="Before the event"
                    description="Sanctioning, registration, course prep, staff, and sponsors."
                    storageKey="tournament-prep-pre"
                  >
                    <TdChecklist tournamentId={t.id} phase="pre" suggestions={suggestions} />
                    <div className="grid gap-2 sm:grid-cols-2">
                      {tool(
                        "/director/kit",
                        "Event kit",
                        "Tee signs, caddy guide, and player packs from this event's layouts.",
                      )}
                      {tool(
                        "/director/ops",
                        "Staff and prep tasks",
                        "Add co-TDs, scorekeepers, spotters, and volunteers.",
                      )}
                    </div>
                    <EventPlaybook sections={playbookForPhase(playbook, "pre")} />
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="During the event"
                    description="Check-in, players meeting, scoring, and side games."
                    storageKey="tournament-prep-during"
                  >
                    <TdChecklist tournamentId={t.id} phase="day_of" suggestions={suggestions} />
                    <CheckInWidget tournamentId={t.id} bare />
                    <JoinCodePanel
                      scope={{ target_kind: "tournament_round", tournament_id: t.id }}
                      eventName={t.name}
                      description="Two matching cards make the round rateable."
                    />
                    <TdLiveScoring rounds={rounds} divisions={divisions} regs={regs} />
                    <EventPlaybook sections={playbookForPhase(playbook, "day_of")} />
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="After the event"
                    description={
                      (t.entry_fee_cents ?? 0) > 0
                        ? "Payouts, reporting, cleanup, and the wrap-up message."
                        : "Prizes, cleanup, reporting, and the wrap-up message."
                    }
                    storageKey="tournament-prep-post"
                  >
                    <TdChecklist tournamentId={t.id} phase="post" suggestions={suggestions} />
                    <EventPlaybook sections={playbookForPhase(playbook, "post")} />
                  </CollapsibleSection>
                </>
              );
            })()}
          </TabsContent>
        ) : null}

        {isOwner ? (
          <TabsContent value="manage" className="space-y-4">
            <CollapsibleSection
              title="Staff and access"
              description="Who can edit this event, run scoring, and handle check-in."
              storageKey="tournament-manage-access"
              defaultOpen={false}
            >
              <EventAccessPanel kind="tournament" eventId={t.id} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Event details"
              description="Name, dates, location, fees, cover photo, and sanctioning."
              storageKey="tournament-manage-details"
            >
              <TournamentManageForm
                tournament={t as unknown as Record<string, unknown> & { id: string; name: string }}
                onSaved={reload}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Divisions"
              description="Add, edit, or remove the divisions players can register for."
              storageKey="tournament-manage-divisions"
              defaultOpen={false}
            >
              <ManageDivisions tournamentId={t.id} divisions={divisions} onChange={reload} />
            </CollapsibleSection>

            <CollapsibleSection
              title="Rounds and tee times"
              description="Set the course, layout, and start time for each round."
              storageKey="tournament-manage-rounds"
              defaultOpen={false}
            >
              <ManageRounds
                tournamentId={t.id}
                rounds={rounds}
                courses={courses}
                onChange={reload}
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="Event status"
              description="Move the event between draft, published, live, and complete."
              storageKey="tournament-manage-status"
              defaultOpen={false}
            >
              <ManageStatus tournament={t} onChange={reload} />
            </CollapsibleSection>
          </TabsContent>
        ) : null}
      </Tabs>
    </PageShell>
  );
}

function RegisterButton({
  tournament,
  divisions,
  regs,
  onChange,
}: {
  tournament: Tournament;
  divisions: Division[];
  regs: Registration[];
  onChange: () => void;
}) {
  const { user } = useSession();
  const mine = regs.find((r) => r.user_id === user?.id);
  const [divId, setDivId] = useState(divisions[0]?.id ?? "");
  const [pdga, setPdga] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!divId && divisions[0]) setDivId(divisions[0].id);
  }, [divisions.length]);

  if (!user) return null;

  if (mine) {
    const canCheckIn =
      (tournament.status === "registration_closed" || tournament.status === "in_progress") &&
      mine.status !== "checked_in";
    return (
      <div className="flex gap-2">
        {canCheckIn ? (
          <Button
            onClick={async () => {
              const { error } = await supabase
                .from("tournament_registrations")
                .update({ status: "checked_in" })
                .eq("id", mine.id);
              if (error) return toast.error(error.message);
              toast.success("Checked in!");
              onChange();
            }}
          >
            Check in
          </Button>
        ) : (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs text-primary">
            {mine.status === "checked_in" ? "Checked in" : "Registered"}
          </span>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            if (!confirm("Withdraw from this tournament?")) return;
            const { error } = await supabase
              .from("tournament_registrations")
              .delete()
              .eq("id", mine.id);
            if (error) return toast.error(error.message);
            toast.success("Withdrew");
            onChange();
          }}
        >
          Withdraw
        </Button>
      </div>
    );
  }

  if (!allowsPreRegistration(tournament.signup_type)) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Players sign up at the event
      </span>
    );
  }

  const closesAt = tournament.registration_closes ? new Date(tournament.registration_closes) : null;
  if (closesAt && closesAt.getTime() <= Date.now()) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Registration closed
      </span>
    );
  }

  const opensAt = tournament.registration_opens ? new Date(tournament.registration_opens) : null;
  if (opensAt && opensAt.getTime() > Date.now()) {
    return (
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        Registration opens {opensAt.toLocaleDateString()}
      </span>
    );
  }

  if (divisions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={divId}
        onChange={(e) => setDivId(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-2 text-sm"
      >
        {divisions.map((d) => (
          <option key={d.id} value={d.id}>
            {d.code}
          </option>
        ))}
      </select>
      {tournament.pdga_sanctioned ? (
        <Input
          value={pdga}
          onChange={(e) => setPdga(e.target.value)}
          placeholder="PDGA #"
          className="h-10 w-28"
        />
      ) : null}
      <Button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          if (closesAt && closesAt.getTime() <= Date.now()) {
            setBusy(false);
            return toast.error("Registration closed for this event.");
          }
          const { error } = await supabase.from("tournament_registrations").insert({
            tournament_id: tournament.id,
            division_id: divId,
            user_id: user.id,
            pdga_number: pdga || null,
            status: "confirmed",
          });
          setBusy(false);
          if (error) return toast.error(error.message);
          toast.success("Registered!");
          onChange();
        }}
      >
        Register
      </Button>
    </div>
  );
}

const REG_STATUS_LABEL: Record<string, string> = {
  registered: "Registered",
  checked_in: "Checked in",
  waitlisted: "Waitlisted",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  paid: "Paid",
  pending: "Payment pending",
  unpaid: "Unpaid",
  refunded: "Refunded",
  waived: "Fee waived",
};

function RegistrationsList({
  tournamentId,
  regs,
  divisions,
  isOwner,
  onChange,
}: {
  tournamentId: string;
  regs: Registration[];
  divisions: Division[];
  isOwner: boolean;
  onChange: () => void;
}) {
  const byDiv = divisions.map((d) => ({ d, list: regs.filter((r) => r.division_id === d.id) }));
  const checkedIn = regs.filter((r) => r.status === "checked_in").length;
  const registered = regs.filter((r) => r.status === "registered").length;
  const waitlisted = regs.filter((r) => r.status === "waitlisted").length;
  const owed = regs.filter((r) => r.payment_status !== "paid").length;
  const unassigned = regs.filter((r) => !divisions.some((d) => d.id === r.division_id));
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-sm font-semibold">Who&apos;s in the field</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-border px-2 py-0.5">
            {regs.length} signed up
          </span>
          <span className="rounded-full border border-border px-2 py-0.5">
            {checkedIn} checked in
          </span>
          <span className="rounded-full border border-border px-2 py-0.5">
            {registered} not checked in yet
          </span>
          {waitlisted > 0 ? (
            <span className="rounded-full border border-border px-2 py-0.5">
              {waitlisted} on the waitlist
            </span>
          ) : null}
          <span className="rounded-full border border-border px-2 py-0.5">
            {owed} still owe an entry fee
          </span>
        </div>
        {isOwner ? (
          <Link
            to="/director/check-in"
            search={{ kind: "tournament" as const, id: tournamentId }}
            className="mt-3 inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted"
          >
            <ClipboardCheck className="h-4 w-4" /> Open check-in
          </Link>
        ) : null}
      </div>
      {byDiv.map(({ d, list }) => (
        <div key={d.id} className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">
            {d.code} – {d.name} ({list.length})
          </div>
          {list.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">
              No one's registered for this division yet.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {list.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <div>
                    <Link
                      to="/u/$username"
                      params={{ username: r.profile?.username ?? "" }}
                      className="font-medium hover:text-primary"
                    >
                      {r.profile?.display_name ?? "Player"}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      @{r.profile?.username}
                    </span>
                    {r.pdga_number ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        PDGA #{r.pdga_number}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {REG_STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] " +
                        (r.payment_status === "paid" ? "bg-primary/15 text-primary" : "bg-muted")
                      }
                    >
                      {PAYMENT_LABEL[r.payment_status] ?? r.payment_status}
                    </span>
                    {isOwner ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          if (!confirm("Remove this player?")) return;
                          await supabase.from("tournament_registrations").delete().eq("id", r.id);
                          onChange();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {unassigned.length > 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-sm font-semibold">
            No division picked yet ({unassigned.length})
          </div>
          <div className="divide-y divide-border">
            {unassigned.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <div>
                  <span className="font-medium">{r.profile?.display_name ?? "Player"}</span>
                  <span className="ml-2 text-xs text-muted-foreground">@{r.profile?.username}</span>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  {REG_STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Leaderboard({
  tournamentId,
  rounds,
  regs,
  divisions,
}: {
  tournamentId: string;
  rounds: Round[];
  regs: Registration[];
  divisions: Division[];
}) {
  const [scores, setScores] = useState<
    {
      round_id: string;
      registration_id: string;
      strokes: number;
      penalties: number;
      hole_number: number;
    }[]
  >([]);
  const [holes, setHoles] = useState<{ layout_id: string; number: number; par: number }[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (rounds.length === 0) return;
      const roundIds = rounds.map((r) => r.id);
      const { data: sc } = await supabase
        .from("tournament_scores")
        .select("round_id, registration_id, strokes, penalties, hole_number")
        .in("round_id", roundIds);
      if (alive) setScores((sc as any) ?? []);
      const layoutIds = [...new Set(rounds.map((r) => r.layout_id).filter(Boolean))] as string[];
      if (layoutIds.length) {
        const { data: h } = await supabase
          .from("holes")
          .select("layout_id, number, par")
          .in("layout_id", layoutIds);
        if (alive) setHoles((h as any) ?? []);
      }
    })();

    // Live updates — refresh scores when any tournament_scores row changes for this tournament's rounds.
    const roundIdSet = new Set(rounds.map((r) => r.id));
    const channel = supabase
      .channel(`tournament-scores-${tournamentId}-${channelNonce()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tournament_scores" },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            round_id?: string;
            registration_id?: string;
            hole_number?: number;
            strokes?: number;
            penalties?: number;
          } | null;
          if (!row?.round_id || !roundIdSet.has(row.round_id)) return;
          setScores((prev) => {
            const next = prev.filter(
              (s) =>
                !(
                  s.round_id === row.round_id &&
                  s.registration_id === row.registration_id &&
                  s.hole_number === row.hole_number
                ),
            );
            if (
              payload.eventType !== "DELETE" &&
              row.strokes != null &&
              row.hole_number != null &&
              row.registration_id
            ) {
              next.push({
                round_id: row.round_id!,
                registration_id: row.registration_id!,
                hole_number: row.hole_number!,
                strokes: row.strokes ?? 0,
                penalties: row.penalties ?? 0,
              });
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [tournamentId, rounds]);

  const parByRoundHole = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rounds)
      if (r.layout_id) {
        const layoutHoles = holes.filter((h) => h.layout_id === r.layout_id);
        for (const h of layoutHoles) map.set(`${r.id}:${h.number}`, h.par);
      }
    return map;
  }, [rounds, holes]);

  // Aggregate per registration with per-round breakdown for PDGA countback tiebreakers.
  const aggByReg = useMemo(() => {
    // rounds sorted by number so "last round" is deterministic
    const orderedRounds = [...rounds].sort((a, b) => a.round_number - b.round_number);
    const perReg = new Map<
      string,
      {
        total: number;
        toPar: number;
        thru: number;
        parMissing: number;
        // finishedRoundScores: net total per completed round, in round order
        finishedRoundScores: number[];
        // lastRoundHoles: net-to-par by hole for the latest round with scores (used for hole-by-hole countback)
        lastRoundHoles: Map<number, number>;
        lastRoundIndex: number;
      }
    >();

    for (const s of scores) {
      // Never guess par: a hole without a known par leaves to-par unknown.
      const par = parByRoundHole.get(`${s.round_id}:${s.hole_number}`);
      const net = s.strokes + s.penalties;
      const cur = perReg.get(s.registration_id) ?? {
        total: 0,
        toPar: 0,
        thru: 0,
        parMissing: 0,
        finishedRoundScores: [] as number[],
        lastRoundHoles: new Map<number, number>(),
        lastRoundIndex: -1,
      };
      cur.total += net;
      if (par == null) cur.parMissing += 1;
      else cur.toPar += net - par;
      cur.thru += 1;
      perReg.set(s.registration_id, cur);
    }

    // Second pass — build per-round buckets to compute finished-round scores and last-round hole map.
    for (const [regId, cur] of perReg) {
      const byRound = new Map<
        string,
        { holes: Map<number, number>; total: number; roundIdx: number; n: number }
      >();
      for (const s of scores) {
        if (s.registration_id !== regId) continue;
        const par = parByRoundHole.get(`${s.round_id}:${s.hole_number}`);
        const net = s.strokes + s.penalties;
        const roundIdx = orderedRounds.findIndex((r) => r.id === s.round_id);
        if (roundIdx < 0) continue;
        const bucket = byRound.get(s.round_id) ?? {
          holes: new Map<number, number>(),
          total: 0,
          roundIdx,
          n: 0,
        };
        bucket.n += 1;
        if (par != null) bucket.holes.set(s.hole_number, net - par);
        bucket.total += net;
        byRound.set(s.round_id, bucket);
      }
      // A round counts as "finished" if we have 18 holes; otherwise it's the active round.
      const finished: Array<{ roundIdx: number; total: number }> = [];
      let latest: { roundIdx: number; holes: Map<number, number> } | null = null;
      for (const [, b] of byRound) {
        if (b.n >= 18) finished.push({ roundIdx: b.roundIdx, total: b.total });
        if (!latest || b.roundIdx > latest.roundIdx)
          latest = { roundIdx: b.roundIdx, holes: b.holes };
      }
      finished.sort((a, b) => a.roundIdx - b.roundIdx);
      cur.finishedRoundScores = finished.map((f) => f.total);
      if (latest) {
        cur.lastRoundHoles = latest.holes;
        cur.lastRoundIndex = latest.roundIdx;
      }
    }

    return perReg;
  }, [scores, parByRoundHole, rounds]);

  // PDGA-style tiebreaker sort: to-par asc → more thru (further along) → last finished round score → hole-by-hole from 18 backward.
  const compareRegs = (
    a: {
      toPar: number;
      thru: number;
      finishedRoundScores: number[];
      lastRoundHoles: Map<number, number>;
    },
    b: {
      toPar: number;
      thru: number;
      finishedRoundScores: number[];
      lastRoundHoles: Map<number, number>;
    },
  ): number => {
    if (a.toPar !== b.toPar) return a.toPar - b.toPar;
    // Same to-par: more holes played = further along the course (in-progress round tiebreak).
    if (a.thru !== b.thru) return b.thru - a.thru;
    // Last finished round score (lower wins).
    const aLast = a.finishedRoundScores.at(-1);
    const bLast = b.finishedRoundScores.at(-1);
    if (aLast != null && bLast != null && aLast !== bLast) return aLast - bLast;
    // Hole-by-hole countback: compare score on 18, then 17, … 1 (lower wins).
    for (let h = 18; h >= 1; h--) {
      const av = a.lastRoundHoles.get(h);
      const bv = b.lastRoundHoles.get(h);
      if (av != null && bv != null && av !== bv) return av - bv;
    }
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
          </span>
          Live · updates as players score
        </div>
        <div title="PDGA-style: to par, then holes thru, then last-round total, then hole-by-hole from 18.">
          Ties broken by PDGA countback
        </div>
      </div>
      {divisions.map((d) => {
        const list = regs
          .filter((r) => r.division_id === d.id)
          .map((r) => ({
            r,
            agg: aggByReg.get(r.id) ?? {
              total: 0,
              toPar: 0,
              thru: 0,
              parMissing: 0,
              finishedRoundScores: [] as number[],
              lastRoundHoles: new Map<number, number>(),
              lastRoundIndex: -1,
            },
          }))
          .sort((a, b) => compareRegs(a.agg, b.agg));

        // Compute display position with T for ties on primary key (to-par + thru).
        const positions: string[] = [];
        for (let i = 0; i < list.length; i++) {
          const prev = i > 0 ? list[i - 1].agg : null;
          const cur = list[i].agg;
          const tiedWithPrev = prev && prev.toPar === cur.toPar && prev.thru === cur.thru;
          positions.push(tiedWithPrev ? positions[i - 1] : String(i + 1));
        }
        // Add "T" prefix where two adjacent rows share a position.
        const tCount: Record<string, number> = {};
        positions.forEach((p) => (tCount[p] = (tCount[p] ?? 0) + 1));
        const displayPos = positions.map((p) => (tCount[p] > 1 ? `T${p}` : p));

        return (
          <div key={d.id} className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-semibold">
              {d.code} – {d.name}
            </div>
            {list.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                Scores land here once the round tees off.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Pos</th>
                    <th className="px-3 py-2 text-left">Player</th>
                    <th className="px-3 py-2 text-right">Thru</th>
                    <th className="px-3 py-2 text-right">To par</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(({ r, agg }, i) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">
                        {displayPos[i]}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          to="/u/$username"
                          params={{ username: r.profile?.username ?? "" }}
                          className="hover:text-primary"
                        >
                          {r.profile?.display_name ?? "Player"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                        {agg.thru || "—"}
                      </td>
                      <td
                        className={
                          "px-3 py-2 text-right font-semibold tabular-nums " +
                          (agg.toPar < 0 ? "text-primary" : agg.toPar > 0 ? "text-destructive" : "")
                        }
                      >
                        {agg.thru === 0 || agg.parMissing > 0
                          ? "—"
                          : agg.toPar === 0
                            ? "E"
                            : agg.toPar > 0
                              ? `+${agg.toPar}`
                              : agg.toPar}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {agg.total ? (
                          <>
                            {agg.total}
                            <span className="block text-[12px] text-muted-foreground">
                              {agg.parMissing > 0 ? "Par unknown" : `Par ${agg.total - agg.toPar}`}
                            </span>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ManageDivisions({
  tournamentId,
  divisions,
  onChange,
}: {
  tournamentId: string;
  divisions: Division[];
  onChange: () => void;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [fee, setFee] = useState("0");

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">Divisions</div>
      <div className="mb-3 space-y-2">
        {divisions.map((d) => (
          <div
            key={d.id}
            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">{d.code}</span>
              <span className="ml-2 text-muted-foreground">
                {d.name} · ${(d.entry_fee_cents / 100).toFixed(2)}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await supabase.from("tournament_divisions").delete().eq("id", d.id);
                onChange();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="MPO" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mixed Pro Open"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fee</Label>
          <Input type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          onClick={async () => {
            if (!code || !name) return toast.error("Code and name required");
            const { error } = await supabase.from("tournament_divisions").insert({
              tournament_id: tournamentId,
              code,
              name,
              entry_fee_cents: Math.round(parseFloat(fee) * 100),
            });
            if (error) return toast.error(error.message);
            setCode("");
            setName("");
            setFee("0");
            onChange();
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add division
        </Button>
      </div>
    </div>
  );
}

function ManageRounds({
  tournamentId,
  rounds,
  courses,
  onChange,
}: {
  tournamentId: string;
  rounds: Round[];
  courses: { id: string; name: string }[];
  onChange: () => void;
}) {
  const [courseId, setCourseId] = useState("");
  const [starts, setStarts] = useState("");
  const [layouts, setLayouts] = useState<{ id: string; name: string }[]>([]);
  const [layoutId, setLayoutId] = useState("");

  useEffect(() => {
    if (!courseId) return setLayouts([]);
    (async () => {
      const { data } = await supabase
        .from("course_layouts")
        .select("id, name")
        .eq("course_id", courseId);
      setLayouts((data as any) ?? []);
      setLayoutId((data as any)?.[0]?.id ?? "");
    })();
  }, [courseId]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 text-sm font-semibold">Rounds</div>
      <div className="mb-3 space-y-2">
        {rounds.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
          >
            <div>
              <span className="font-medium">Round {r.round_number}</span>
              <span className="ml-2 text-muted-foreground">
                {r.starts_at ? new Date(r.starts_at).toLocaleString() : "TBD"}
                {r.course_id ? ` · ${courses.find((c) => c.id === r.course_id)?.name ?? ""}` : ""}
              </span>
              <div className="mt-1.5">
                <EventRoundMapControls
                  kind="tournament"
                  roundId={r.id}
                  eventId={tournamentId}
                  courseId={r.course_id}
                  layoutId={r.layout_id}
                  layoutVersionId={(r as { layout_version_id?: string | null }).layout_version_id ?? null}
                  rulesSnapshot={(r as { rules_snapshot?: unknown }).rules_snapshot}
                  label={`Round ${r.round_number}`}
                  onChange={onChange}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await supabase.from("tournament_rounds").delete().eq("id", r.id);
                onChange();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Course</Label>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">Choose course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Layout</Label>
          <select
            value={layoutId}
            onChange={(e) => setLayoutId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tee time</Label>
          <Input type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          onClick={async () => {
            const nextNum = (rounds[rounds.length - 1]?.round_number ?? 0) + 1;
            const { error } = await supabase.from("tournament_rounds").insert({
              tournament_id: tournamentId,
              round_number: nextNum,
              course_id: courseId || null,
              layout_id: layoutId || null,
              starts_at: starts ? new Date(starts).toISOString() : null,
            });
            if (error) return toast.error(error.message);
            setStarts("");
            onChange();
          }}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add round
        </Button>
      </div>
    </div>
  );
}

function ManageStatus({ tournament, onChange }: { tournament: Tournament; onChange: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 text-sm font-semibold">Status</div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            "published",
            "registration_open",
            "registration_closed",
            "in_progress",
            "completed",
            "cancelled",
          ] as const
        ).map((s) => (
          <Button
            key={s}
            variant={tournament.status === s ? "default" : "outline"}
            size="sm"
            onClick={async () => {
              await supabase.from("tournaments").update({ status: s }).eq("id", tournament.id);
              onChange();
            }}
          >
            {s.replace(/_/g, " ")}
          </Button>
        ))}
      </div>
    </div>
  );
}
