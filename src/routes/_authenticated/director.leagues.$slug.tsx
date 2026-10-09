import { AdditionalPrizesPanel } from "@/components/director/additional-prizes-panel";
import { Dialog as PrizeDialogShell, DialogContent as PrizeDialogContent, DialogHeader as PrizeDialogHeader, DialogTitle as PrizeDialogTitle } from "@/components/ui/dialog";
import { EventCancelActions } from "@/components/director/event-cancel-actions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EventRoundMapControls } from "@/components/events/event-round-map-controls";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, CollapsibleSection } from "@/components/shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trash2, CalendarDays, Shield, ExternalLink, Pencil, Plus, Copy } from "lucide-react";
import { LeagueRotationDialog } from "@/components/league/league-rotation-dialog";
import { LeagueBulkBar } from "@/components/league/league-bulk-bar";
import { nightReadiness, READINESS_LABEL } from "@/lib/league-effective";
import { LeagueDefaultsDialog } from "@/components/league/league-defaults-dialog";
import { LeagueWeekEditDialog } from "@/components/league/league-week-edit-dialog";
import { ExternalChatLinks } from "@/components/community/external-chat-links";
import type { DirectorTaskContext } from "@/lib/director-task-links";
import { toast } from "sonner";
import { RouteErrorBoundary, RouteNotFound } from "@/components/route-boundaries";
import { LeagueChecklist } from "@/components/league/league-checklist";
import { CheckInWidget } from "@/components/director/checkin-widget";
import { JoinCodePanel } from "@/components/scoring/join-code-panel";
import { EventPlaybook } from "@/components/event-setup/event-playbook";
import {
  buildEventPlaybook,
  buildTdChecklist,
  playbookForPhase,
  tierLabel,
} from "@/lib/sanctioning-plan";
import { LeagueManageForm } from "@/components/event-manage-form";
import { EventInvitePanel } from "@/components/events/event-invite-panel";
import { EventAccessPanel, useEventAccess } from "@/components/events/event-access-panel";
import { LeagueNightSchedule } from "@/components/league/league-night-schedule";
import { parseNightAgenda } from "@/lib/league-night-schedule";

export const Route = createFileRoute("/_authenticated/director/leagues/$slug")({
  component: DirectorLeagueDetail,
  head: () => ({
    meta: [
      { title: "Run this league · DG Dashboard" },
      {
        name: "description",
        content:
          "Director tools for one league — weeks, sign-ups, join codes, invites, and settings.",
      },
      { property: "og:title", content: "Run this league — DG Dashboard" },
      {
        property: "og:description",
        content: "Manage league nights, registrations, and payouts in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: RouteErrorBoundary,
  notFoundComponent: () => <RouteNotFound label="This league" />,
});

type League = {
  id: string;
  owner_id: string;
  name: string;
  season: string | null;
  status: string;
  entry_fee_cents?: number | null;
  agenda?: unknown;
  start_time?: string | null;
  holes_played?: number | null;
  pdga_sanctioned?: boolean | null;
  pdga_tier?: string | null;
  pdga_event_number?: string | null;
};

type Event = {
  id: string;
  week_number: number;
  name: string | null;
  course_id: string | null;
  layout_id: string | null;
  event_date: string;
  status: string;
  holes_played?: number | null;
  rounds?: number | null;
  rules_snapshot?: unknown;
};

type Reg = {
  id: string;
  user_id: string;
  division: string | null;
  status?: string | null;
  payment_status?: string | null;
  pdga_number?: string | null;
  profile?: { username: string; display_name: string };
};

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

function DirectorLeagueDetail() {
  const { slug } = Route.useParams();
  const [league, setLeague] = useState<League | null>(null);
  const [missing, setMissing] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [prizeNight, setPrizeNight] = useState<Event | null>(null);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([]);
  const [editWeek, setEditWeek] = useState<Event | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [rotationOpen, setRotationOpen] = useState(false);
  const [layouts, setLayouts] = useState<{ id: string; name: string; course_id: string }[]>([]);
  const { data: access } = useEventAccess("league", league?.id);
  const canManage = access?.canManage ?? false;

  async function load() {
    const { data: l } = await supabase.from("leagues").select("*").eq("slug", slug).maybeSingle();
    if (!l) {
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
    const list0 = (cs as { id: string; name: string }[]) ?? [];
    // Always include the courses this league's nights actually use.
    const used = [...new Set(((e as Event[]) ?? []).map((x) => x.course_id).filter((x): x is string => !!x))].filter(
      (id) => !list0.some((c) => c.id === id),
    );
    if (used.length) {
      const { data: extra } = await supabase.from("courses").select("id, name").in("id", used);
      list0.push(...((extra as { id: string; name: string }[]) ?? []));
      list0.sort((a, b) => a.name.localeCompare(b.name));
    }
    setCourses(list0);
    const nightCourses = [...new Set(((e as Event[]) ?? []).map((x) => x.course_id).filter((x): x is string => !!x))];
    if (nightCourses.length) {
      const { data: ls } = await supabase
        .from("course_layouts")
        .select("id, name, course_id")
        .in("course_id", nightCourses)
        .order("name");
      setLayouts((ls as { id: string; name: string; course_id: string }[]) ?? []);
    } else setLayouts([]);
    const list = (r as Reg[]) ?? [];
    if (list.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in(
          "id",
          list.map((x) => x.user_id),
        );
      const map = new Map((p ?? []).map((x) => [x.id, x]));
      list.forEach((x) => (x.profile = map.get(x.user_id) as Reg["profile"]));
    }
    setRegs(list);
  }

  useEffect(() => {
    void load();
  }, [slug]);

  if (missing)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">We couldn&apos;t find that league</h1>
        <p className="text-muted-foreground">
          The link may be old, or the league may have been removed.
        </p>
        <Link to="/director/leagues" className="font-medium text-primary hover:underline">
          Back to your league desk
        </Link>
      </div>
    );

  if (!league) return <div className="text-sm text-muted-foreground">Loading league details…</div>;

  if (access && !canManage)
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">You don&apos;t run this league</h1>
        <p className="text-muted-foreground">
          Ask the director for access, or open the player page to sign up.
        </p>
        <Link
          to="/leagues/$slug"
          params={{ slug }}
          className="font-medium text-primary hover:underline"
        >
          Open the player page
        </Link>
      </div>
    );

  async function addNight() {
    if (!league) return;
    const last = events.length ? events[events.length - 1] : null;
    const base = last?.event_date ? new Date(`${last.event_date.slice(0, 10)}T12:00:00`) : new Date();
    if (last?.event_date) base.setDate(base.getDate() + 7);
    const nextDate = base.toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("league_events")
      .insert({
        league_id: league.id,
        week_number: (last?.week_number ?? 0) + 1,
        event_date: nextDate,
        course_id: last?.course_id ?? null,
        layout_id: last?.layout_id ?? null,
        holes_played: last?.holes_played ?? league.holes_played ?? null,
        rounds: last?.rounds ?? 1,
        status: "scheduled",
      })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Couldn't add that night.");
      return;
    }
    await load();
    setEditWeek(data as Event);
    setEditOpen(true);
    toast.success("Night added — set its date and course.");
  }

  async function copyNight(src: Event) {
    if (!league) return;
    const last = events[events.length - 1];
    const d = new Date(`${(last?.event_date ?? src.event_date).slice(0, 10)}T12:00:00`);
    d.setDate(d.getDate() + 7);
    const extra = src as Event & { start_time?: string | null; check_in_time?: string | null; details?: string | null; entry_fee_cents?: number | null };
    const { error } = await supabase.from("league_events").insert({
      league_id: league.id,
      week_number: (last?.week_number ?? 0) + 1,
      event_date: d.toISOString().slice(0, 10),
      course_id: src.course_id,
      layout_id: src.layout_id,
      holes_played: src.holes_played ?? null,
      rounds: src.rounds ?? 1,
      start_time: extra.start_time ?? null,
      check_in_time: extra.check_in_time ?? null,
      details: extra.details ?? null,
      entry_fee_cents: extra.entry_fee_cents ?? null,
      status: "scheduled",
    });
    if (error) return toast.error(error.message);
    toast.success(`Copied Week ${src.week_number} to the end of the schedule.`);
    void load();
  }

  async function setNightCourse(e: Event, courseId: string) {
    const { error } = await supabase
      .from("league_events")
      .update({ course_id: courseId || null, layout_id: null })
      .eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(`Week ${e.week_number} course updated — pick its layout.`);
    void load();
  }

  async function setNightLayout(e: Event, layoutId: string) {
    const { error } = await supabase
      .from("league_events")
      .update({ layout_id: layoutId || null })
      .eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(`Week ${e.week_number} layout updated.`);
    void load();
  }

  const taskContext: DirectorTaskContext = {
    kind: "league",
    slug,
    courseId: events.find((e) => e.course_id)?.course_id ?? null,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title={league.name}
        description="Set the schedule, invite players, hand out join codes, and edit league settings."
        primaryAction={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button size="sm" onClick={() => setDefaultsOpen(true)}>
                Edit league settings
              </Button>
            )}
            <Button asChild size="sm" variant="outline">
              <Link to="/leagues/$slug" params={{ slug }}>
                <ExternalLink className="mr-1 h-4 w-4" />
                View player page
              </Link>
            </Button>
          </div>
        }
        secondaryAction={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link to="/director/leagues">League desk</Link>
            </Button>
            {canManage && (
              <EventCancelActions
                kind="league"
                id={league.id}
                name={league.name}
                cancelled={league.status === "cancelled"}
                onChanged={() => void load()}
              />
            )}
          </div>
        }
      />

      <LeagueDefaultsDialog
        open={defaultsOpen}
        onOpenChange={setDefaultsOpen}
        league={{
          id: league.id,
          name: league.name,
          description: (league as { description?: string | null }).description ?? null,
          entry_fee_cents: (league as { entry_fee_cents?: number | null }).entry_fee_cents ?? null,
          format: (league as { format?: string | null }).format ?? null,
          payout_notes: (league as { payout_notes?: string | null }).payout_notes ?? null,
          start_time: league.start_time ?? null,
        }}
        nights={events.map((e) => ({
          id: e.id,
          status: e.status,
          course_id: e.course_id,
          layout_id: e.layout_id,
          holes_played: e.holes_played ?? null,
          entry_fee_cents: (e as { entry_fee_cents?: number | null }).entry_fee_cents ?? null,
          start_time: (e as { start_time?: string | null }).start_time ?? null,
        }))}
        onSaved={() => void load()}
      />
      <Tabs defaultValue="schedule">
        <TabsList>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="players">Players ({regs.length})</TabsTrigger>
          <TabsTrigger value="dayof">Event prep</TabsTrigger>
          <TabsTrigger value="invite">Invite</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="schedule" className="space-y-4">
          <CollapsibleSection
            id="schedule"
            title="League nights"
            badge={`${events.length} ${events.length === 1 ? "week" : "weeks"}`}
            description="Dates, courses, and the running order for each night."
            storageKey="director-league-schedule"
          >
            <div className="mb-3 flex justify-end gap-2">
              {canManage && (
                <Button size="sm" variant="outline" onClick={() => setRotationOpen(true)}>
                  Add a course rotation
                </Button>
              )}
              <LeagueRotationDialog
                open={rotationOpen}
                onOpenChange={setRotationOpen}
                leagueId={league.id}
                nextWeek={(events[events.length - 1]?.week_number ?? 0) + 1}
                nextDate={(() => {
                  const l = events[events.length - 1];
                  const d = l ? new Date(`${l.event_date.slice(0, 10)}T12:00:00`) : new Date();
                  if (l) d.setDate(d.getDate() + 7);
                  return d.toISOString().slice(0, 10);
                })()}
                courses={courses}
                onSaved={() => void load()}
              />
              <Button size="sm" onClick={() => void addNight()}>
                <Plus className="mr-1 h-4 w-4" />
                Add a league night
              </Button>
            </div>
            {events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing on the schedule yet — add a league night so players know when to show up.
              </div>
            ) : (
              <div className="space-y-2">
              <LeagueBulkBar
                selected={selected}
                nights={events}
                courses={courses}
                onDone={() => void load()}
                onClear={() => setSelected([])}
              />
              <div className="divide-y divide-border rounded-xl border border-border bg-card">
                {events.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 p-3">
                    {canManage && (
                      <input
                        type="checkbox"
                        aria-label={`Select week ${e.week_number}`}
                        className="h-4 w-4 shrink-0"
                        checked={selected.includes(e.id)}
                        onChange={(ev) =>
                          setSelected((cur) =>
                            ev.target.checked ? [...cur, e.id] : cur.filter((x) => x !== e.id),
                          )
                        }
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        Week {e.week_number}
                        {e.name ? ` – ${e.name}` : ""}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />{" "}
                        {new Date(e.event_date).toLocaleDateString()}
                        {canManage && e.status !== "completed" && e.status !== "cancelled" ? (
                          <select
                            aria-label={`Course for week ${e.week_number}`}
                            value={e.course_id ?? ""}
                            onChange={(ev) => void setNightCourse(e, ev.target.value)}
                            className="h-7 max-w-[200px] rounded-md border border-input bg-background px-1 text-xs"
                          >
                            <option value="">Course TBD</option>
                            {courses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span>
                            · {e.course_id ? courses.find((c) => c.id === e.course_id)?.name ?? "Course set" : "Course TBD"}
                          </span>
                        )}
                        {canManage && e.course_id && e.status !== "completed" && e.status !== "cancelled" && (
                          <select
                            aria-label={`Layout for week ${e.week_number}`}
                            value={e.layout_id ?? ""}
                            onChange={(ev) => void setNightLayout(e, ev.target.value)}
                            className="h-7 max-w-[160px] rounded-md border border-input bg-background px-1 text-xs"
                          >
                            <option value="">Layout not set</option>
                            {layouts
                              .filter((l) => l.course_id === e.course_id)
                              .map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.name}
                                </option>
                              ))}
                          </select>
                        )}
                        {e.rounds && e.rounds > 1 ? <span>· two rounds</span> : null}
                        {e.holes_played ? <span>· {e.holes_played} holes</span> : null}
                        <span className="rounded-full bg-muted px-2 py-0.5">
                          {READINESS_LABEL[nightReadiness({ ...e, entry_fee_cents: null, start_time: null, holes_played: e.holes_played ?? null })]}
                        </span>
                      </div>
                      <div className="mt-1.5">
                        <EventRoundMapControls
                          kind="league"
                          roundId={e.id}
                          eventId={league.id}
                          courseId={e.course_id}
                          layoutId={e.layout_id}
                          layoutVersionId={(e as { layout_version_id?: string | null }).layout_version_id ?? null}
                          rulesSnapshot={(e as { rules_snapshot?: unknown }).rules_snapshot}
                          label={`Week ${e.week_number}`}
                          onChange={() => void load()}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditWeek(e);
                          setEditOpen(true);
                        }}
                      >
                        <Pencil className="mr-1 h-3.5 w-3.5" />
                        Edit night
                      </Button>
                      {canManage && e.status !== "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const next = e.status === "cancelled" ? "scheduled" : "cancelled";
                            if (next === "cancelled" && !confirm(`Cancel week ${e.week_number}? Players will see it as cancelled.`)) return;
                            const { error } = await supabase.from("league_events").update({ status: next }).eq("id", e.id);
                            if (error) return toast.error("We couldn't update this night.");
                            toast.success(next === "cancelled" ? `Week ${e.week_number} cancelled.` : `Week ${e.week_number} is back on.`);
                            void load();
                          }}
                        >
                          {e.status === "cancelled" ? "Restore" : "Cancel night"}
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => setPrizeNight(e)}>
                          Prizes & pots
                        </Button>
                      )}
                      {canManage && (
                        <Button variant="ghost" size="sm" onClick={() => void copyNight(e)}>
                          <Copy className="mr-1 h-3.5 w-3.5" />
                          Copy
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove week ${e.week_number}`}
                        onClick={async () => {
                          await supabase.from("league_events").delete().eq("id", e.id);
                          void load();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              </div>
            )}
            <LeagueWeekEditDialog
              week={editWeek}
              courses={courses}
              defaults={{
                entry_fee_cents: (league as { entry_fee_cents?: number | null }).entry_fee_cents ?? null,
                start_time: league.start_time ?? null,
                format: (league as { format?: string | null }).format ?? null,
                payout_notes: (league as { payout_notes?: string | null }).payout_notes ?? null,
              }}
              open={editOpen}
              onOpenChange={setEditOpen}
              onSaved={() => void load()}
            />
            <LeagueNightSchedule
              leagueId={league.id}
              agenda={parseNightAgenda(league.agenda)}
              canEdit={canManage}
              startTime={league.start_time ?? null}
              holes={league.holes_played ?? null}
              onChange={() => void load()}
            />
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="players" className="space-y-4">
          <CollapsibleSection
            id="signups"
            title="Players"
            badge={`${regs.length} ${regs.length === 1 ? "player" : "players"}`}
            description="Who's registered, who's checked in, and each player's league details."
            storageKey="director-league-signups"
          >
            <div className="mb-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border px-2 py-0.5">
                {regs.filter((r) => (r.status ?? "registered") === "checked_in").length} checked in
              </span>
              <span className="rounded-full border border-border px-2 py-0.5">
                {regs.filter((r) => (r.status ?? "registered") === "registered").length} registered
              </span>
              <span className="rounded-full border border-border px-2 py-0.5">
                {regs.filter((r) => r.payment_status && r.payment_status !== "paid").length}{" "}
                awaiting payment
              </span>
            </div>
            <div className="rounded-xl border border-border bg-card">
              {regs.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No one&apos;s signed up yet — share the league link to fill the card.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {regs.map((r) => (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{r.profile?.display_name ?? "Player"}</div>
                        <div className="text-xs text-muted-foreground">
                          @{r.profile?.username}
                          {r.pdga_number ? ` · PDGA #${r.pdga_number}` : ""}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        {r.division ? (
                          <span className="rounded-full bg-muted px-2 py-0.5">{r.division}</span>
                        ) : null}
                        <span className="rounded-full border border-border px-2 py-0.5">
                          {REG_STATUS_LABEL[r.status ?? "registered"] ?? r.status ?? "Registered"}
                        </span>
                        {r.payment_status ? (
                          <span className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                            {PAYMENT_LABEL[r.payment_status] ?? r.payment_status}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="invite" className="space-y-4">
          <CollapsibleSection
            id="invite"
            title="Invite players"
            description="Reach out to friends, crews, email, or phone — RSVPs land in one place."
            storageKey="director-league-invite"
            defaultOpen={false}
          >
            <EventInvitePanel
              eventKind="league"
              eventId={league.id}
              eventTitle={league.name}
              eventLocation={undefined}
            />
          </CollapsibleSection>
        </TabsContent>

        <TabsContent value="dayof" className="space-y-4">
          {(() => {
            const sanctioned = !!league.pdga_sanctioned;
            const tier = sanctioned ? (league.pdga_tier ?? "L") : null;
            const hasEntryFee = (league.entry_fee_cents ?? 0) > 0;
            const playbook = buildEventPlaybook({
              sanctioned,
              tier,
              rounds: events.length || 1,
              hasEntryFee,
            });
            const suggestions = buildTdChecklist({
              sanctioned,
              tier,
              hasEntryFee,
              rounds: 1,
            });
            return (
              <>
                <div className="rounded-xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
                  Built from this league&apos;s settings:{" "}
                  <span className="font-medium text-foreground">
                    {sanctioned
                      ? `Sanctioned · ${tierLabel(tier)}${league.pdga_event_number ? ` · PDGA #${league.pdga_event_number}` : ""}`
                      : "Unsanctioned"}
                  </span>{" "}
                  ·{" "}
                  <span className="font-medium text-foreground">
                    {hasEntryFee ? "Entry fee and payouts" : "No entry fee"}
                  </span>{" "}
                  ·{" "}
                  <span className="font-medium text-foreground">
                    {events.length || 1} {events.length === 1 ? "week" : "weeks"}
                  </span>
                </div>

                <CollapsibleSection
                  id="scoring"
                  title="Before league night"
                  description="Sanctioning, sign-ups, course prep, staff, and the weekly reminder."
                  storageKey="director-league-prep-pre"
                >
                  <LeagueChecklist
                    leagueId={league.id}
                    canManage={canManage}
                    taskContext={taskContext}
                    phase="pre"
                    suggestions={suggestions}
                  />
                  <EventPlaybook
                    sections={playbookForPhase(playbook, "pre")}
                    taskContext={taskContext}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="During league night"
                  description="Check-in, cards, scoring codes, and side games."
                  storageKey="director-league-prep-during"
                >
                  <LeagueChecklist
                    leagueId={league.id}
                    canManage={canManage}
                    taskContext={taskContext}
                    phase="day_of"
                    suggestions={suggestions}
                  />
                  <CheckInWidget leagueId={league.id} bare />
                  <JoinCodePanel
                    scope={{ target_kind: "league_event", league_id: league.id }}
                    eventName={league.name}
                    description="Post a code at league night so players score in a browser — no download, no account. Two matching cards make the night rateable."
                  />
                  <EventPlaybook
                    sections={playbookForPhase(playbook, "day_of")}
                    taskContext={taskContext}
                  />
                </CollapsibleSection>

                <CollapsibleSection
                  title="After league night"
                  description={
                    hasEntryFee
                      ? "Payouts, standings, reporting, and the recap message."
                      : "Prizes, standings, reporting, and the recap message."
                  }
                  storageKey="director-league-prep-post"
                >
                  <LeagueChecklist
                    leagueId={league.id}
                    canManage={canManage}
                    taskContext={taskContext}
                    phase="post"
                    suggestions={suggestions}
                  />
                  <EventPlaybook
                    sections={playbookForPhase(playbook, "post")}
                    taskContext={taskContext}
                  />
                </CollapsibleSection>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <CollapsibleSection
            id="access"
            title="Staff and access"
            description="Who can edit this league, run scoring, and handle check-in."
            storageKey="director-league-access"
            defaultOpen={false}
          >
            <EventAccessPanel kind="league" eventId={league.id} />
          </CollapsibleSection>

          <CollapsibleSection
            id="chats"
            title="Community chats"
            description="Group chat links players see on the league page."
            storageKey="director-league-chats"
            defaultOpen={false}
          >
            <ExternalChatLinks ownerType="league" ownerId={league.id} canManage={canManage} />
          </CollapsibleSection>

          <CollapsibleSection
            id="settings"
            title="League settings"
            description="Name, season, fees, cover photo, sanctioning, and payout details."
            storageKey="director-league-settings"
            defaultOpen={false}
          >
            <LeagueManageForm
              league={league as unknown as Record<string, unknown> & { id: string; name: string }}
              onSaved={load}
            />
          </CollapsibleSection>
        </TabsContent>
      </Tabs>
      <PrizeDialogShell open={!!prizeNight} onOpenChange={(o) => !o && setPrizeNight(null)}>
        <PrizeDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <PrizeDialogHeader>
            <PrizeDialogTitle>Prizes & pots · Week {prizeNight?.week_number}</PrizeDialogTitle>
          </PrizeDialogHeader>
          {prizeNight && <AdditionalPrizesPanel kind="league_event" eventId={prizeNight.id} />}
        </PrizeDialogContent>
      </PrizeDialogShell>
    </div>
  );
}
