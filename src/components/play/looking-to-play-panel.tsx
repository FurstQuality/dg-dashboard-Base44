import { WidgetNote, WidgetSourceNote } from "@/components/shell";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, Loader2, MapPin, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession } from "@/lib/current-user";
import { PlayRowsSkeleton } from "@/components/play/play-widget-states";
import {
  deletePlayIntent,
  getPlayLobby,
  savePlayIntent,
  setPlayIntentJoin,
  type OpenRound,
} from "@/lib/play-status.functions";

/** Convert an ISO timestamp to the value a datetime-local input expects. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow(): { start: string; end: string } {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  return { start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) };
}

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay
    ? `${day} · ${t(start)} – ${t(end)}`
    : `${day} ${t(start)} → ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${t(end)}`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const lobbyKey = (userId?: string) => ["play-lobby", userId ?? "anon"] as const;

/**
 * Friends who want to play, plus every open round you can join. Players set
 * an availability status and post the courses and time window they're free.
 */
export function LookingToPlayPanel() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const key = lobbyKey(user?.id);

  const lobbyFn = useServerFn(getPlayLobby);
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => lobbyFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const joinFn = useServerFn(setPlayIntentJoin);
  const join = useMutation({
    mutationFn: (vars: { intent_id: string; state: "in" | "maybe" | null }) =>
      joinFn({ data: vars }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteFn = useServerFn(deletePlayIntent);
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      toast.success("Open round removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<OpenRound | null>(null);

  const rounds = data?.openRounds ?? [];
  const friendsLooking = useMemo(
    () => (data?.friendsLooking ?? []).filter((f) => !rounds.some((r) => r.user_id === f.user_id)),
    [data?.friendsLooking, rounds],
  );

  return (
    <section className="space-y-3 border-t border-border pt-6">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <Users className="h-4 w-4 text-sky-500" />
        <h2 className="font-display text-lg font-semibold">Friends that want to play</h2>
        <span className="text-sm text-muted-foreground">
          {rounds.length
            ? `${rounds.length} open round${rounds.length === 1 ? "" : "s"}`
            : "open rounds"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link to="/friends" className="text-sm text-muted-foreground hover:text-foreground">
            All friends →
          </Link>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setComposerOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Post an open round
          </Button>
        </div>
      </div>
      <WidgetNote className="px-1">
        Open rounds your crew posted — a course, a time frame, and a format you can ask to join.
      </WidgetNote>
      <WidgetSourceNote
        className="px-1"
        sources={["Open rounds posted in DG Dashboard"]}
        note="Casual and league play — sanctioned events live on the Events page."
      />

      <p className="px-1 text-xs text-muted-foreground">
        Your play status lives in the header — set it there and friends will see it anywhere in the
        app.
      </p>

      {/* OPEN ROUNDS */}
      {isLoading ? (
        <PlayRowsSkeleton rows={2} height="h-16" />
      ) : rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-sm text-muted-foreground">
          No open rounds right now. Post the courses and time frame you want to play and your crew
          can jump in.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rounds.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={r.avatar_url ?? undefined} alt={r.player_name} />
                  <AvatarFallback>{initials(r.player_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.player_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {r.visibility === "public" ? "Open to all" : "Friends only"}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate font-display text-base font-semibold">
                    {r.course_names.join(" · ") || "Any course"}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatWindow(r.window_start, r.window_end)}
                    </span>
                    {r.city || r.state ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {[r.city, r.state].filter(Boolean).join(", ")}
                      </span>
                    ) : null}
                    {r.holes ? <span>{r.holes} holes</span> : null}
                  </div>
                  {r.note ? <p className="mt-2 text-sm text-muted-foreground">{r.note}</p> : null}
                  <div className="mt-2 text-xs text-muted-foreground">
                    {r.joins.length
                      ? `In: ${r.joins.map((j) => `${j.player_name}${j.state === "maybe" ? " (maybe)" : ""}`).join(", ")}`
                      : "No one has joined yet."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.is_mine ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(r);
                            setComposerOpen(true);
                          }}
                        >
                          <Pencil className="mr-1 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(r.id)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          Remove
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant={r.my_join === "in" ? "default" : "outline"}
                          disabled={join.isPending}
                          onClick={() =>
                            join.mutate({
                              intent_id: r.id,
                              state: r.my_join === "in" ? null : "in",
                            })
                          }
                        >
                          {r.my_join === "in" ? "You're in" : "I'm in"}
                        </Button>
                        <Button
                          size="sm"
                          variant={r.my_join === "maybe" ? "default" : "ghost"}
                          disabled={join.isPending}
                          onClick={() =>
                            join.mutate({
                              intent_id: r.id,
                              state: r.my_join === "maybe" ? null : "maybe",
                            })
                          }
                        >
                          Maybe
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* FRIENDS AVAILABLE WITHOUT A POST */}
      {friendsLooking.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-sm font-medium">Friends available</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {friendsLooking.map((f) => (
              <span
                key={f.user_id}
                className="flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs"
              >
                <Avatar className="h-5 w-5">
                  <AvatarImage src={f.avatar_url ?? undefined} alt={f.player_name} />
                  <AvatarFallback className="text-[9px]">{initials(f.player_name)}</AvatarFallback>
                </Avatar>
                {f.player_name}
                <span className="text-muted-foreground">
                  {f.status === "looking" ? "looking to play" : "maybe"}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <OpenRoundComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        editing={editing}
        onSaved={invalidate}
      />
    </section>
  );
}

export function OpenRoundComposer({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: OpenRound | null;
  onSaved: () => void;
}) {
  const win = defaultWindow();
  const [courses, setCourses] = useState(editing?.course_names.join(", ") ?? "");
  const [start, setStart] = useState(editing ? toLocalInput(editing.window_start) : win.start);
  const [end, setEnd] = useState(editing ? toLocalInput(editing.window_end) : win.end);
  const [city, setCity] = useState(editing?.city ?? "");
  const [stateName, setStateName] = useState(editing?.state ?? "");
  const [holes, setHoles] = useState(editing?.holes ? String(editing.holes) : "18");
  const [note, setNote] = useState(editing?.note ?? "");
  const [visibility, setVisibility] = useState<"friends" | "public">(
    editing?.visibility ?? "friends",
  );
  const [formKey, setFormKey] = useState(editing?.id ?? "new");

  // Reset the form when the dialog target changes.
  const targetKey = editing?.id ?? "new";
  if (open && targetKey !== formKey) {
    setFormKey(targetKey);
    setCourses(editing?.course_names.join(", ") ?? "");
    setStart(editing ? toLocalInput(editing.window_start) : win.start);
    setEnd(editing ? toLocalInput(editing.window_end) : win.end);
    setCity(editing?.city ?? "");
    setStateName(editing?.state ?? "");
    setHoles(editing?.holes ? String(editing.holes) : "18");
    setNote(editing?.note ?? "");
    setVisibility(editing?.visibility ?? "friends");
  }

  const saveFn = useServerFn(savePlayIntent);
  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: editing?.id,
          course_names: courses
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
            .slice(0, 5),
          course_id: editing?.course_id ?? null,
          city: city.trim() || null,
          state: stateName.trim() || null,
          window_start: new Date(start).toISOString(),
          window_end: new Date(end).toISOString(),
          holes: holes ? Number(holes) : null,
          note: note.trim() || null,
          visibility,
        },
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
      toast.success(
        editing ? "Open round updated." : "Open round posted — your crew can join now.",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = courses.trim().length > 0 && !!start && !!end;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit open round" : "Post an open round"}</DialogTitle>
          <DialogDescription>
            Say where and when you want to play. Friends can join and you'll all see who's in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="otp-courses">Courses (separate with commas)</Label>
            <Input
              id="otp-courses"
              value={courses}
              onChange={(e) => setCourses(e.target.value)}
              placeholder="Rollin' Ridge, Sunset Park"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="otp-start">From</Label>
              <Input
                id="otp-start"
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="otp-end">Until</Label>
              <Input
                id="otp-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="otp-city">City</Label>
              <Input id="otp-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="otp-state">State</Label>
              <Input
                id="otp-state"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="otp-holes">Holes</Label>
              <Select value={holes} onValueChange={setHoles}>
                <SelectTrigger id="otp-holes">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["9", "18", "24", "27"].map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="otp-visibility">Who can see this</Label>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as "friends" | "public")}
            >
              <SelectTrigger id="otp-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friends">Friends only</SelectItem>
                <SelectItem value="public">Any player on DG Dashboard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="otp-note">Note</Label>
            <Textarea
              id="otp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Casual pace, meeting at the first tee. Room for two more."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {editing ? "Save changes" : "Post open round"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
