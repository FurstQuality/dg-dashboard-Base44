import { Link, useNavigate } from "@tanstack/react-router";
import { formatTeeTime, dayTeeSortKey } from "@/lib/tee-time";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Users,
  Plus,
  Trash2,
  ChevronRight,
  Wand2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  X,
  Loader2,
  Link as LinkIcon,
  Clock,
  AlertTriangle,
  RefreshCw,
  Info,
  Search,
  Pencil,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { matchesOmnisearch } from "@/lib/omnisearch";
import {
  listTrackerGroups,
  createTrackerGroup,
  deleteTrackerGroup,
  updateTrackerGroup,
  addTrackerMember,
  importTrackerEventFromUrl,
  refreshTrackerGroup,
  ensureAllTimeCrew,
} from "@/lib/tracker.functions";
import { useSession } from "@/lib/current-user";
import { Skeleton } from "@/components/ui/skeleton";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";
import { CommunityErrorState } from "@/components/community/community-error-state";

type GroupRow = Awaited<ReturnType<typeof listTrackerGroups>>[number];

/**
 * Friend Trackers hub. Rendered as a full page at `/tracker` and embedded as
 * the "Trackers" tab of the Friends page. When `variant="embedded"` the
 * caller supplies the outer page shell + header, so we render only the tab
 * body (toolbar + list + wizard).
 */
export function TrackersHub({ variant = "embedded" }: { variant?: "page" | "embedded" }) {
  const list = useServerFn(listTrackerGroups);
  const ensureAllTime = useServerFn(ensureAllTimeCrew);
  const del = useServerFn(deleteTrackerGroup);
  const update = useServerFn(updateTrackerGroup);
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"active" | "upcoming" | "past" | "all">("active");
  const [sortBy, setSortBy] = useState<"next" | "updated" | "start" | "name" | "size">("next");

  // Shared cache key: the embedded Friends tab and the /tracker page read once.
  const groupsQuery = useQuery({
    queryKey: communityKeys.trackerGroups(user?.id),
    queryFn: async () => ((await list()) ?? []) as GroupRow[],
    staleTime: COMMUNITY_STALE.short,
  });
  // The auto-provisioned personal event watchlist is the Event Tracker, not a
  // crew — keep it out of the crew list so the two tools stay distinct.
  const allGroups = (groupsQuery.data ?? []).filter(
    (g) => !/^my tracker$/i.test((g.name ?? "").trim()),
  );
  // The all-time crew is permanent and pinned above the temporary crews.
  const allTimeCrew = allGroups.find((g) => g.is_all_time) ?? null;
  const groups = allGroups.filter((g) => !g.is_all_time);
  const loading = groupsQuery.isLoading;

  // Every player has exactly one forever crew — create it the first time here.
  const [ensuring, setEnsuring] = useState(false);
  useEffect(() => {
    if (!user?.id || groupsQuery.isLoading || groupsQuery.isError) return;
    if (allTimeCrew || ensuring) return;
    setEnsuring(true);
    void ensureAllTime()
      .then(() =>
        queryClient.invalidateQueries({ queryKey: communityKeys.trackerGroups(user?.id) }),
      )
      .catch(() => undefined)
      .finally(() => setEnsuring(false));
  }, [user?.id, groupsQuery.isLoading, groupsQuery.isError, allTimeCrew, ensuring]);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: communityKeys.trackerGroups(user?.id) });
  }

  async function remove(id: string) {
    if (!confirm("Delete this tracker group?")) return;
    try {
      await del({ data: { id } });
      void refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  function statusOf(g: GroupRow): "active" | "upcoming" | "past" {
    if (g.trip_start && g.trip_end && g.trip_start <= today && g.trip_end >= today) return "active";
    if (g.trip_start && g.trip_start > today) return "upcoming";
    if (g.trip_end && g.trip_end < today) return "past";
    return "active";
  }
  const q = query.trim().toLowerCase();
  const filtered = groups.filter((g) => {
    if (tab !== "all" && statusOf(g) !== tab) return false;
    return matchesOmnisearch(g, q);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "size") return (b.member_count ?? 0) - (a.member_count ?? 0);
    if (sortBy === "updated") return (b.updated_at ?? "").localeCompare(a.updated_at ?? "");
    if (sortBy === "start") return (a.trip_start ?? "9999").localeCompare(b.trip_start ?? "9999");
    const na = (g: GroupRow) =>
      g.next_activity ? dayTeeSortKey(g.next_activity.event_date, g.next_activity.tee_time) : "z";
    return na(a).localeCompare(na(b));
  });

  const counts = {
    active: groups.filter((g) => statusOf(g) === "active").length,
    upcoming: groups.filter((g) => statusOf(g) === "upcoming").length,
    past: groups.filter((g) => statusOf(g) === "past").length,
    all: groups.length,
  };

  // Land on a tab that actually has crews so the page never reads "no
  // trackers" while past or upcoming crews exist.
  const [tabPicked, setTabPicked] = useState(false);
  useEffect(() => {
    if (tabPicked || loading || !counts.all) return;
    setTabPicked(true);
    if (counts.active) return;
    setTab(counts.upcoming ? "upcoming" : counts.past ? "past" : "all");
  }, [tabPicked, loading, counts.all, counts.active, counts.upcoming, counts.past]);

  if (groupsQuery.isError) {
    return (
      <CommunityErrorState
        title="We couldn't load your trackers"
        message="Tracker groups didn't come through. Try again in a moment."
        onRetry={() => void refresh()}
      />
    );
  }

  return (
    <div className="space-y-4">
      {variant === "embedded" ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Crews follow tee times, ratings, and results for a group of players.
            </span>
          </div>
          <Button size="sm" onClick={() => setWizardOpen(true)}>
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> New temporary crew
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold">Tournament Tracker</h2>
              <p className="text-xs text-muted-foreground">
                Follow your crew across tournaments, leagues, trips, and seasons.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="About trackers">
                  <Info className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="max-w-xs text-xs">
                Trackers pull live data from PDGA. Add each friend by PDGA number, add the events
                you're all playing, and refresh anytime for updated tee times, pools, and results.
              </PopoverContent>
            </Popover>
            <Button onClick={() => setWizardOpen(true)}>
              <Wand2 className="mr-2 h-4 w-4" /> New temporary crew
            </Button>
          </div>
        </div>
      )}

      <AllTimeCrewCard crew={allTimeCrew} loading={groupsQuery.isLoading || ensuring} />

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="space-y-4 py-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Wand2 className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-semibold">Add a temporary crew for a trip or weekend</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Your all-time crew above never ends. Temporary crews cover one stretch — a road
                trip, an out-of-town tournament, a league season — with their own start and end
                dates.
              </p>
            </div>
            <Button size="lg" onClick={() => setWizardOpen(true)}>
              <Wand2 className="mr-2 h-4 w-4" /> Start guided setup
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Takes 4 quick steps · You can skip anything and add it later
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b pb-2">
            {(["active", "upcoming", "past", "all"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`relative rounded-t-md px-3 py-1.5 text-sm capitalize transition ${tab === key ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
              >
                {key} <span className="ml-1 text-xs text-muted-foreground">{counts[key]}</span>
              </button>
            ))}
            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:flex-initial">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 w-full pl-7 sm:w-64"
                  placeholder="Search tracker, player, event, course…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="h-9 rounded-md border bg-background px-2 text-xs"
                aria-label="Sort trackers"
              >
                <option value="next">Next activity</option>
                <option value="updated">Recently updated</option>
                <option value="start">Start date</option>
                <option value="name">Name</option>
                <option value="size">Crew size</option>
              </select>
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-6 text-center">
              <p className="text-sm font-semibold">No trackers match this filter</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Widen the filter or start a tracker for your next event weekend.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTab("all");
                    setQuery("");
                  }}
                >
                  Show all trackers
                </Button>
                <Button size="sm" onClick={() => setWizardOpen(true)}>
                  <Wand2 className="mr-1.5 h-3.5 w-3.5" /> New temporary crew
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {sorted.map((g) => {
                const status = statusOf(g);
                const na = g.next_activity;
                const naDate = na?.event_date
                  ? new Date(na.event_date + "T00:00:00").toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : null;
                const lastSync = g.last_synced_at ? relativeTime(g.last_synced_at) : null;
                return (
                  <Card
                    key={g.id}
                    className={`group transition hover:border-primary/50 hover:shadow-md ${status === "active" ? "border-primary/60" : ""}`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CardTitle className="truncate text-base">{g.name}</CardTitle>
                            {status === "active" && (
                              <Badge className="h-4 px-1 text-[9px]">Active now</Badge>
                            )}
                            {status === "upcoming" && (
                              <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                                Upcoming
                              </Badge>
                            )}
                            {status === "past" && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                Completed
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {g.trip_start &&
                              new Date(g.trip_start + "T00:00:00").toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            {g.trip_end &&
                              ` – ${new Date(g.trip_end + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                            {g.trip_start && " · "}
                            {g.member_count} players · {g.event_count} events
                            {g.course_count ? ` · ${g.course_count} courses` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 transition md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditing(g)}
                            aria-label="Edit tracker"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={g.is_all_time}
                            onClick={() => remove(g.id)}
                            aria-label="Delete tracker"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {na ? (
                        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
                          <div className="font-medium text-foreground">
                            Next: {na.player_name ?? "—"}
                          </div>
                          <div className="text-muted-foreground">
                            {na.event_location ?? na.event_name ?? "Course TBD"}
                            {naDate && ` · ${naDate}`}
                            {na.tee_time && ` · ${formatTeeTime(na.tee_time)}`}
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No tee times on the books yet — PDGA sync will fill them in.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {g.missing_tee_times > 0 && (
                          <Badge variant="outline" className="gap-1 text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> {g.missing_tee_times} missing tee
                            times
                          </Badge>
                        )}
                        {g.recent_changes > 0 && (
                          <Badge variant="outline" className="gap-1">
                            <RefreshCw className="h-3 w-3" /> {g.recent_changes} recent changes
                          </Badge>
                        )}
                        {lastSync && (
                          <Badge variant="outline" className="gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" /> Synced {lastSync}
                          </Badge>
                        )}
                      </div>
                      <Link
                        to="/tracker/$groupId"
                        params={{ groupId: g.id }}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary"
                      >
                        Open tracker <ChevronRight className="h-4 w-4" />
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <TrackerWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={() => {
          void refresh();
        }}
      />
      <EditTrackerDialog
        group={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        onSave={async (patch) => {
          try {
            await update({ data: patch });
            toast.success("Tracker updated");
            setEditing(null);
            void refresh();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

/**
 * The permanent crew. It has no dates, can't be deleted, and every player you
 * follow lands here so their events keep showing up season after season.
 */
function AllTimeCrewCard({
  crew,
  loading,
}: {
  crew: (GroupRow & { is_all_time?: boolean }) | null;
  loading: boolean;
}) {
  if (loading && !crew) return <Skeleton className="h-32 w-full rounded-xl" />;
  if (!crew) return null;
  const na = crew.next_activity;
  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <CardTitle className="truncate text-base">{crew.name}</CardTitle>
              <Badge className="h-4 px-1 text-[9px]">Always on</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              No end date · {crew.member_count} players · {crew.event_count} events
              {crew.course_count ? ` · ${crew.course_count} courses` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/tracker/players">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add players
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/tracker/$groupId" params={{ groupId: crew.id }}>
                Open all-time crew <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {na ? (
          <p className="text-xs text-muted-foreground">
            Next up: <span className="font-medium text-foreground">{na.player_name ?? "—"}</span>{" "}
            {na.event_name ?? na.event_location ?? "event"}
            {na.event_date &&
              ` · ${new Date(na.event_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`}
            {na.tee_time && ` · ${formatTeeTime(na.tee_time)}`}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Follow your friends here once and we'll keep listing every event they enter — no need to
            re-add them each season.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function EditTrackerDialog({
  group,
  onOpenChange,
  onSave,
}: {
  group: GroupRow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: {
    id: string;
    name: string;
    description: string | null;
    trip_start: string | null;
    trip_end: string | null;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (group) {
      setName(group.name ?? "");
      setDescription(group.description ?? "");
      setStart(group.trip_start ?? "");
      setEnd(group.trip_end ?? "");
    }
  }, [group]);

  const open = !!group;

  async function submit() {
    if (!group) return;
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (start && end && start > end) {
      toast.error("End date must be after start");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: group.id,
        name: name.trim(),
        description: description.trim() || null,
        trip_start: start || null,
        trip_end: end || null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tracker</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tracker-name">Name</Label>
            <Input
              id="tracker-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ledgestone Week"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tracker-desc">Description</Label>
            <Textarea
              id="tracker-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this crew tracking?"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tracker-start">Start date</Label>
              <Input
                id="tracker-start"
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tracker-end">End date</Label>
              <Input
                id="tracker-end"
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Friend = { pdga: string; name: string; division: string };
type EventDraft = {
  url: string;
  ref: string;
  aboutUrl: string;
  playersUrl: string;
  label?: string;
};

function TrackerWizard({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const navigate = useNavigate();
  const create = useServerFn(createTrackerGroup);
  const addMember = useServerFn(addTrackerMember);
  const importEvt = useServerFn(importTrackerEventFromUrl);
  const refresh = useServerFn(refreshTrackerGroup);

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");

  const [yourPdga, setYourPdga] = useState("");
  const [yourName, setYourName] = useState("");
  const [yourDiv, setYourDiv] = useState("");

  const [friends, setFriends] = useState<Friend[]>([{ pdga: "", name: "", division: "" }]);

  const [events, setEvents] = useState<EventDraft[]>([
    { url: "", ref: "", aboutUrl: "", playersUrl: "" },
  ]);

  const totalSteps = 5;

  function reset() {
    setStep(0);
    setBusy(false);
    setName("");
    setDesc("");
    setTripStart("");
    setTripEnd("");
    setYourPdga("");
    setYourName("");
    setYourDiv("");
    setFriends([{ pdga: "", name: "", division: "" }]);
    setEvents([{ url: "", ref: "", aboutUrl: "", playersUrl: "" }]);
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  function extractRef(url: string): string {
    const m = url.match(/pdga\.com\/(?:tour\/)?event\/(\d+)/i);
    return m ? m[1] : "";
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Tracker needs a name");
      setStep(0);
      return;
    }
    setBusy(true);
    try {
      const group = await create({
        data: {
          name: name.trim(),
          description: desc || null,
          trip_start: tripStart || null,
          trip_end: tripEnd || null,
        },
      });
      const groupId = (group as { id: string }).id;

      const memberInserts: Array<{ pdga: string; name?: string; div?: string; you?: boolean }> = [];
      if (yourPdga.replace(/\D/g, "")) {
        memberInserts.push({
          pdga: yourPdga,
          name: yourName || undefined,
          div: yourDiv || undefined,
          you: true,
        });
      }
      for (const f of friends) {
        const p = f.pdga.replace(/\D/g, "");
        if (p)
          memberInserts.push({ pdga: p, name: f.name || undefined, div: f.division || undefined });
      }

      let memberOk = 0,
        memberFail = 0;
      for (const m of memberInserts) {
        try {
          await addMember({
            data: {
              group_id: groupId,
              pdga_number: m.pdga,
              display_name: m.name ?? null,
              default_division: m.div ?? null,
              is_you: m.you ?? false,
            },
          });
          memberOk++;
        } catch {
          memberFail++;
        }
      }

      let eventOk = 0,
        eventFail = 0,
        playersFromEvents = 0;
      for (const e of events) {
        if (!e.url.trim()) continue;
        try {
          const result = await importEvt({
            data: {
              group_id: groupId,
              url: e.url.trim(),
              about_url: e.aboutUrl.trim() || null,
              players_url: e.playersUrl.trim() || null,
            },
          });
          eventOk++;
          const added = (result as { playersAdded?: number } | null)?.playersAdded ?? 0;
          playersFromEvents += added;
        } catch {
          eventFail++;
        }
      }

      if ((memberOk > 0 || playersFromEvents > 0) && eventOk > 0) {
        try {
          await refresh({ data: { id: groupId } });
        } catch {
          /* silent */
        }
      }

      const parts: string[] = [];
      const totalMembers = memberOk + playersFromEvents;
      if (totalMembers) parts.push(`${totalMembers} player${totalMembers === 1 ? "" : "s"}`);
      if (eventOk) parts.push(`${eventOk} event${eventOk === 1 ? "" : "s"}`);
      toast.success("Tracker ready", {
        description: parts.length
          ? `Added ${parts.join(" and ")}${playersFromEvents ? ` (${playersFromEvents} auto-imported from players page)` : ""}.`
          : "You can add players and events next.",
      });
      if (memberFail || eventFail) {
        toast.warning("Some entries were skipped", {
          description: `${memberFail} player(s), ${eventFail} event(s) couldn't be added.`,
        });
      }

      onCreated();
      close();
      navigate({ to: "/tracker/$groupId", params: { groupId } });
    } catch (e) {
      toast.error("Couldn't create tracker", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const canAdvance = step === 0 ? name.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" /> Guided tracker setup
          </DialogTitle>
        </DialogHeader>

        <Stepper step={step} total={totalSteps} />

        <div className="min-h-[280px] pt-2">
          {step === 0 && (
            <StepShell
              title="Name your tracker"
              hint="Give this series of events a memorable name. A road trip, tournament weekend, or your whole season all work."
            >
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Tracker name</Label>
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Illinois Week — July"
                  />
                </div>
                <div className="space-y-1">
                  <Label>
                    Description <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Textarea
                    rows={2}
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Ledgestone road trip crew"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>
                      Start date <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      type="date"
                      value={tripStart}
                      onChange={(e) => setTripStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>
                      End date <span className="text-muted-foreground">(optional)</span>
                    </Label>
                    <Input
                      type="date"
                      value={tripEnd}
                      onChange={(e) => setTripEnd(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </StepShell>
          )}

          {step === 1 && (
            <StepShell
              title="Add yourself"
              hint="Enter your PDGA number so the tracker links your ratings, tee times, and results. Skip this if you don't have a PDGA number yet."
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <Label>Your PDGA number</Label>
                  <Input
                    inputMode="numeric"
                    value={yourPdga}
                    onChange={(e) => setYourPdga(e.target.value.replace(/\D/g, ""))}
                    placeholder="e.g. 12345"
                  />
                </div>
                <div className="col-span-2 space-y-1 sm:col-span-1">
                  <Label>
                    Division <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    value={yourDiv}
                    onChange={(e) => setYourDiv(e.target.value.toUpperCase())}
                    placeholder="MPO, FPO, MA1…"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>
                    Display name <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    value={yourName}
                    onChange={(e) => setYourName(e.target.value)}
                    placeholder="Auto-filled from PDGA if blank"
                  />
                </div>
              </div>
            </StepShell>
          )}

          {step === 2 && (
            <StepShell
              title="Add your crew"
              hint="Add each friend by their PDGA number. We'll auto-fill their name, rating, and event history."
            >
              <div className="space-y-2">
                {friends.map((f, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_90px_auto] items-end gap-2">
                    <div className="space-y-1">
                      {i === 0 && <Label className="text-xs">PDGA #</Label>}
                      <Input
                        inputMode="numeric"
                        value={f.pdga}
                        onChange={(e) =>
                          setFriends((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, pdga: e.target.value.replace(/\D/g, "") } : x,
                            ),
                          )
                        }
                        placeholder="e.g. 12345"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <Label className="text-xs">Name (optional)</Label>}
                      <Input
                        value={f.name}
                        onChange={(e) =>
                          setFriends((prev) =>
                            prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Auto-filled"
                      />
                    </div>
                    <div className="space-y-1">
                      {i === 0 && <Label className="text-xs">Div</Label>}
                      <Input
                        value={f.division}
                        onChange={(e) =>
                          setFriends((prev) =>
                            prev.map((x, j) =>
                              j === i ? { ...x, division: e.target.value.toUpperCase() } : x,
                            ),
                          )
                        }
                        placeholder="MPO"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setFriends((prev) =>
                          prev.length === 1
                            ? [{ pdga: "", name: "", division: "" }]
                            : prev.filter((_, j) => j !== i),
                        )
                      }
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFriends((prev) => [...prev, { pdga: "", name: "", division: "" }])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add another friend
                </Button>
              </div>
            </StepShell>
          )}

          {step === 3 && (
            <StepShell
              title="Add the events you're playing"
              hint="Paste a PDGA event URL for tee times and results. Optionally add the event's Disc Golf Scene About and Players pages to pull richer details and auto-import every registered player."
            >
              <div className="space-y-4">
                {events.map((e, i) => (
                  <div key={i} className="space-y-2 rounded-md border bg-muted/20 p-3">
                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" /> PDGA event URL
                        </Label>
                        <Input
                          value={e.url}
                          onChange={(ev) => {
                            const url = ev.target.value;
                            setEvents((prev) =>
                              prev.map((x, j) =>
                                j === i ? { ...x, url, ref: extractRef(url) } : x,
                              ),
                            );
                          }}
                          placeholder="https://www.pdga.com/tour/event/86677"
                        />
                        {e.url && !e.ref && (
                          <p className="text-[11px] text-destructive">
                            Not a PDGA event URL — expected something like pdga.com/tour/event/12345
                          </p>
                        )}
                        {e.ref && (
                          <p className="text-[11px] text-muted-foreground">
                            Detected PDGA event #{e.ref}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setEvents((prev) =>
                            prev.length === 1
                              ? [{ url: "", ref: "", aboutUrl: "", playersUrl: "" }]
                              : prev.filter((_, j) => j !== i),
                          )
                        }
                        aria-label="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" /> Disc Golf Scene — About page{" "}
                          <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          value={e.aboutUrl}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            setEvents((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, aboutUrl: v } : x)),
                            );
                          }}
                          placeholder="https://www.discgolfscene.com/tournaments/your_event"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1">
                          <LinkIcon className="h-3 w-3" /> Disc Golf Scene — Players page{" "}
                          <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          value={e.playersUrl}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            setEvents((prev) =>
                              prev.map((x, j) => (j === i ? { ...x, playersUrl: v } : x)),
                            );
                          }}
                          placeholder="https://www.discgolfscene.com/tournaments/your_event/players"
                        />
                      </div>
                    </div>
                    {e.playersUrl && (
                      <p className="text-[11px] text-muted-foreground">
                        Every registered PDGA number on this page will be added to your crew
                        (existing members skipped).
                      </p>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEvents((prev) => [
                      ...prev,
                      { url: "", ref: "", aboutUrl: "", playersUrl: "" },
                    ])
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add another event
                </Button>
              </div>
            </StepShell>
          )}

          {step === 4 && (
            <StepShell
              title="Review & create"
              hint="Everything look right? You can edit or add more from the tracker page anytime."
            >
              <div className="space-y-3 text-sm">
                <ReviewRow label="Name" value={name || "—"} />
                {(tripStart || tripEnd) && (
                  <ReviewRow label="Dates" value={`${tripStart || "TBD"} → ${tripEnd || "TBD"}`} />
                )}
                {desc && <ReviewRow label="Description" value={desc} />}
                <ReviewRow
                  label="You"
                  value={yourPdga ? `#${yourPdga}${yourDiv ? ` · ${yourDiv}` : ""}` : "Skipped"}
                />
                <ReviewRow
                  label="Crew"
                  value={
                    friends.filter((f) => f.pdga).length
                      ? friends
                          .filter((f) => f.pdga)
                          .map((f) => `#${f.pdga}${f.division ? ` (${f.division})` : ""}`)
                          .join(", ")
                      : "None yet"
                  }
                />
                <ReviewRow
                  label="Events"
                  value={
                    events.filter((e) => e.ref).length
                      ? events
                          .filter((e) => e.ref)
                          .map((e) => `#${e.ref}`)
                          .join(", ")
                      : "None yet"
                  }
                />
              </div>
            </StepShell>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? close() : setStep((s) => s - 1))}
            disabled={busy}
          >
            {step === 0 ? (
              "Cancel"
            ) : (
              <>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </>
            )}
          </Button>
          {step < totalSteps - 1 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance || busy}>
              {step === 0 ? "Continue" : "Next"} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Create tracker
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  const labels = ["Basics", "You", "Crew", "Events", "Review"];
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <div key={i} className="flex flex-1 items-center gap-1.5">
            <div
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary/15 text-primary ring-2 ring-primary/40"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={`hidden text-xs sm:inline ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {labels[i]}
            </span>
            {i < total - 1 && (
              <div className={`h-px flex-1 ${done ? "bg-primary/60" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 rounded-md bg-muted/40 px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
