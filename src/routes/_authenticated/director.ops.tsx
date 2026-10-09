import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Plus, Shield, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, ContentCard } from "@/components/shell";
import { DirectorErrorState } from "@/components/director/director-error-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSession } from "@/lib/current-user";
import {
  getDirectorChecklist,
  getDirectorStaff,
  mutateChecklist,
  mutateStaff,
  searchDirectorPlayers,
} from "@/lib/director.functions";
import {
  DirectorEventPicker,
  useDirectorEventOptions,
} from "@/components/director/director-event-picker";
import { directorKeys, DIRECTOR_STALE } from "@/lib/director-queries";

type Search = { event?: string };

const STAFF_ROLES = [
  { value: "co_td", label: "Co-TD" },
  { value: "scorekeeper", label: "Scorekeeper" },
  { value: "volunteer", label: "Volunteer" },
  { value: "spotter", label: "Spotter" },
  { value: "media", label: "Media" },
] as const;

type StaffRole = (typeof STAFF_ROLES)[number]["value"];

type StaffInput = {
  tournamentId: string;
  action: "add" | "remove" | "set_role";
  userId?: string;
  staffId?: string;
  role?: StaffRole;
};

type ChecklistInput = {
  tournamentId: string;
  action: "add" | "toggle" | "remove" | "seed_pdga_template";
  itemId?: string;
  label?: string;
  phase?: string;
  done?: boolean;
};

const roleLabel = (role: string) => STAFF_ROLES.find((r) => r.value === role)?.label ?? role;

/** Matches the phases used by pdgaChecklistTemplate() so seeded tasks group cleanly. */
const PHASE_LABELS: Record<string, string> = {
  prep: "Before the event",
  week_of: "Week of",
  event_day: "Event day",
  wrap_up: "Wrap-up",
};

const PHASE_ORDER = ["prep", "week_of", "event_day", "wrap_up"];

export const Route = createFileRoute("/_authenticated/director/ops")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    event: typeof s.event === "string" ? s.event : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Staff & prep · DG Dashboard" },
      {
        name: "description",
        content:
          "Build your event crew, assign co-TDs, scorekeepers, and spotters, and work a PDGA-style prep checklist to event day.",
      },
      { property: "og:title", content: "Staff & prep — DG Dashboard" },
      {
        property: "og:description",
        content: "Assign your event crew and track every prep task from sanctioning to awards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DirectorOpsPage,
});

function DirectorOpsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const fetchStaff = useServerFn(getDirectorStaff);
  const fetchChecklist = useServerFn(getDirectorChecklist);
  const findPlayers = useServerFn(searchDirectorPlayers);
  const runStaff = useServerFn(mutateStaff);
  const runChecklist = useServerFn(mutateChecklist);

  const eventsQuery = useDirectorEventOptions(userId, "");

  const events = eventsQuery.data ?? [];
  const eventId = search.event ?? events[0]?.id ?? null;

  const staffQuery = useQuery({
    queryKey: directorKeys.staff(eventId),
    enabled: !!eventId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchStaff({ data: { tournamentId: eventId! } }),
  });

  const checklistQuery = useQuery({
    queryKey: directorKeys.checklist(eventId),
    enabled: !!eventId,
    staleTime: DIRECTOR_STALE.medium,
    queryFn: () => fetchChecklist({ data: { tournamentId: eventId! } }),
  });

  const [term, setTerm] = useState("");
  const [role, setRole] = useState<StaffRole>("volunteer");
  const [task, setTask] = useState("");
  const [taskPhase, setTaskPhase] = useState("prep");

  const playerQuery = useQuery({
    queryKey: ["director-player-search", term],
    enabled: term.trim().length >= 2,
    staleTime: DIRECTOR_STALE.short,
    queryFn: () => findPlayers({ data: { q: term.trim() } }),
  });

  const staffMutation = useMutation({
    mutationFn: (input: StaffInput) => runStaff({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: directorKeys.staff(eventId) });
      void queryClient.invalidateQueries({ queryKey: directorKeys.cockpit(userId) });
      setTerm("");
    },
    onError: (error: Error) =>
      toast.error(error.message || "That crew change didn't stick. Try again."),
  });

  const checklistMutation = useMutation({
    mutationFn: (input: ChecklistInput) => runChecklist({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: directorKeys.checklist(eventId) });
      void queryClient.invalidateQueries({ queryKey: directorKeys.cockpit(userId) });
    },
    onError: (error: Error) =>
      toast.error(error.message || "That task change didn't save. Try again."),
  });

  const staff = staffQuery.data ?? [];
  const items = checklistQuery.data ?? [];
  const done = items.filter((i) => i.done).length;
  const phases = [...new Set(items.map((i) => i.phase))].sort((a, b) => {
    const ai = PHASE_ORDER.indexOf(a);
    const bi = PHASE_ORDER.indexOf(b);
    return (ai === -1 ? PHASE_ORDER.length : ai) - (bi === -1 ? PHASE_ORDER.length : bi);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Event Director
          </span>
        }
        title="Staff & prep"
        description="Give your crew the right access and work the checklist from sanctioning through awards."
        primaryAction={
          eventId ? (
            <Button size="sm" onClick={() => focusField("ops-task")}>
              <Plus className="mr-1 h-4 w-4" />
              Add task
            </Button>
          ) : undefined
        }
        secondaryAction={
          eventId ? (
            <Button size="sm" variant="outline" onClick={() => focusField("ops-player")}>
              <UserPlus className="mr-1 h-4 w-4" />
              Add crew
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-end gap-2 rounded-card border border-border bg-card p-3">
        <div className="min-w-[240px] flex-1">
          <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor="ops-event">
            Event
          </label>
          <DirectorEventPicker
            id="ops-event"
            userId={userId}
            value={eventId ?? ""}
            onChange={(v) => void navigate({ search: (prev) => ({ ...prev, event: v }) })}
          />
        </div>
      </div>

      {eventsQuery.isSuccess && events.length === 0 ? (
        <ContentCard
          title="No events to staff yet"
          subtitle="Create a tournament first — then you can add co-TDs, scorekeepers, and a prep checklist here."
        />
      ) : null}

      {eventId ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ContentCard
            title="Event crew"
            subtitle="Co-TDs can manage the event with you. Scorekeepers, spotters, volunteers, and media show up on your staffing list."
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label
                    className="mb-1 block text-[12px] text-muted-foreground"
                    htmlFor="ops-player"
                  >
                    Find a player
                  </label>
                  <Input
                    id="ops-player"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Name or username"
                  />
                </div>
                <div className="min-w-[150px]">
                  <label
                    className="mb-1 block text-[12px] text-muted-foreground"
                    htmlFor="ops-role"
                  >
                    Role
                  </label>
                  <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                    <SelectTrigger id="ops-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAFF_ROLES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {term.trim().length >= 2 ? (
                <div className="space-y-1 rounded-card border border-border p-2">
                  {playerQuery.isPending ? <Skeleton className="h-8 w-full" /> : null}
                  {playerQuery.data?.length === 0 ? (
                    <p className="px-1 py-1.5 text-[13px] text-muted-foreground">
                      No players matched that search yet.
                    </p>
                  ) : null}
                  {(playerQuery.data ?? []).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md px-1 py-1"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={p.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback>{(p.displayName ?? "P").slice(0, 1)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[14px]">{p.displayName}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={staffMutation.isPending}
                        onClick={() =>
                          staffMutation.mutate({
                            tournamentId: eventId,
                            action: "add",
                            userId: p.id,
                            role,
                          })
                        }
                      >
                        <UserPlus className="mr-1 h-3.5 w-3.5" />
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {staffQuery.isPending ? <Skeleton className="h-16 w-full" /> : null}
              {staffQuery.isError ? (
                <DirectorErrorState
                  title="Your crew list didn't load"
                  onRetry={() => void staffQuery.refetch()}
                />
              ) : null}
              {staffQuery.isSuccess && staff.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  It's just you so far. Add a co-TD or scorekeeper so you're not running the event
                  alone.
                </p>
              ) : null}

              <ul className="divide-y divide-border">
                {staff.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={s.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback>{s.displayName.slice(0, 1)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-[14px]">{s.displayName}</p>
                        <Badge variant="secondary" className="mt-0.5">
                          {roleLabel(s.role)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Select
                        value={s.role}
                        onValueChange={(v) =>
                          staffMutation.mutate({
                            tournamentId: eventId,
                            action: "set_role",
                            staffId: s.id,
                            role: v as StaffRole,
                          })
                        }
                      >
                        <SelectTrigger
                          className="h-8 w-[140px]"
                          aria-label={`Role for ${s.displayName}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ROLES.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${s.displayName} from the crew`}
                        disabled={staffMutation.isPending}
                        onClick={() =>
                          staffMutation.mutate({
                            tournamentId: eventId,
                            action: "remove",
                            staffId: s.id,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </ContentCard>

          <ContentCard
            title="Prep checklist"
            subtitle={
              items.length
                ? `${done} of ${items.length} tasks done`
                : "Start from the PDGA-style template, then add anything specific to your event."
            }
          >
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label
                    className="mb-1 block text-[12px] text-muted-foreground"
                    htmlFor="ops-task"
                  >
                    New task
                  </label>
                  <Input
                    id="ops-task"
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder="Pick up rental baskets"
                  />
                </div>
                <div className="min-w-[150px]">
                  <label
                    className="mb-1 block text-[12px] text-muted-foreground"
                    htmlFor="ops-phase"
                  >
                    When
                  </label>
                  <Select value={taskPhase} onValueChange={setTaskPhase}>
                    <SelectTrigger id="ops-phase">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PHASE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  disabled={task.trim().length < 2 || checklistMutation.isPending}
                  onClick={() => {
                    checklistMutation.mutate({
                      tournamentId: eventId,
                      action: "add",
                      label: task.trim(),
                      phase: taskPhase,
                    });
                    setTask("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add task
                </Button>
              </div>

              {checklistQuery.isPending ? <Skeleton className="h-24 w-full" /> : null}
              {checklistQuery.isError ? (
                <DirectorErrorState
                  title="The checklist didn't load"
                  onRetry={() => void checklistQuery.refetch()}
                />
              ) : null}

              {checklistQuery.isSuccess && items.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-[13px] text-muted-foreground">
                    No tasks yet. Load the sanctioned-event template to cover permits, sanctioning,
                    divisions, tee times, and payouts.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={checklistMutation.isPending}
                    onClick={() =>
                      checklistMutation.mutate({
                        tournamentId: eventId,
                        action: "seed_pdga_template",
                      })
                    }
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    Load PDGA-style template
                  </Button>
                </div>
              ) : null}

              {phases.map((phase) => (
                <div key={phase} className="space-y-1">
                  <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
                    {PHASE_LABELS[phase] ?? phase}
                  </p>
                  <ul className="divide-y divide-border">
                    {items
                      .filter((i) => i.phase === phase)
                      .map((i) => (
                        <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                          <label className="flex min-w-0 items-center gap-2 text-[14px]">
                            <Checkbox
                              checked={i.done}
                              disabled={checklistMutation.isPending}
                              onCheckedChange={(next) =>
                                checklistMutation.mutate({
                                  tournamentId: eventId,
                                  action: "toggle",
                                  itemId: i.id,
                                  done: next === true,
                                })
                              }
                            />
                            <span
                              className={
                                i.done ? "truncate text-muted-foreground line-through" : "truncate"
                              }
                            >
                              {i.label}
                            </span>
                          </label>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove task ${i.label}`}
                            disabled={checklistMutation.isPending}
                            onClick={() =>
                              checklistMutation.mutate({
                                tournamentId: eventId,
                                action: "remove",
                                itemId: i.id,
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </ContentCard>
        </div>
      ) : null}
    </div>
  );
}

/** Scrolls a form field into view and focuses it, for header shortcut buttons. */
function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  (el as HTMLElement).focus({ preventScroll: true });
}
