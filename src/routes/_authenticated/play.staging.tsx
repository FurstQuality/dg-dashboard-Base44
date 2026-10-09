import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Ban, Bell, Flag, LogOut, MessageCircle, MoreHorizontal, Send, Search, Users, VolumeX, Volume2, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyProfile, useSession } from "@/lib/current-user";
import { joinDgimEventChat } from "@/lib/dgim";
import { useStagingRoom } from "@/hooks/use-staging-room";
import { useClubhouseCheckins, type CheckinStatus } from "@/hooks/use-clubhouse-checkins";
import { PlayCrewPanel } from "@/components/play/play-crew-panel";
import { EventRoomPanel } from "@/components/staging/event-room-panel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_SAY, roomChannel, type RoomRef } from "@/lib/staging/world";

const PLAY_STATUS = "Looking for a round";
const STATUS_LABEL: Record<CheckinStatus, string> = { looking: "Looking for a round", playing: "Playing a round", hanging: "Hanging out" };

export const Route = createFileRoute("/_authenticated/play/staging")({
  validateSearch: z.object({
    course: z.string().uuid().optional().catch(undefined),
    event: z.string().uuid().optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Clubhouse — DG Dashboard | Ace" },
      { name: "description", content: "Join the queue of players ready to play, chat, and get alerted when someone wants a round." },
      { property: "og:title", content: "Clubhouse — DG Dashboard | Ace" },
      { property: "og:description", content: "A live queue where players looking to play meet up and chat." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StagingPage,
});

function useCourseName(courseId?: string) {
  return useQuery({
    queryKey: ["staging-course", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, name, city, state").eq("id", courseId!).maybeSingle();
      return data;
    },
  });
}

function useCourseEvents(courseId?: string) {
  return useQuery({
    queryKey: ["staging-course-events", courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [t, l] = await Promise.all([
        supabase.from("tournaments").select("id, name, start_date").eq("course_id", courseId!).gte("start_date", today).order("start_date").limit(5),
        supabase.from("leagues").select("id, name").eq("course_id", courseId!).limit(5),
      ]);
      return [
        ...(t.data ?? []).map((r) => ({ kind: "tournament" as const, id: r.id, name: r.name, when: r.start_date as string | null })),
        ...(l.data ?? []).map((r) => ({ kind: "league" as const, id: r.id, name: r.name, when: null })),
      ];
    },
  });
}

function useEventRoom(eventId?: string) {
  return useQuery({
    queryKey: ["staging-event", eventId],
    enabled: !!eventId,
    queryFn: async () => {
      const [t, r, a] = await Promise.all([
        supabase.from("tournaments").select("id, name, start_date, course_id").eq("id", eventId!).maybeSingle(),
        supabase.rpc("clubhouse_event_roster", { _tournament_id: eventId! }),
        supabase.rpc("can_enter_event_clubhouse", { _tournament_id: eventId! }),
      ]);
      return { event: t.data, roster: r.data ?? [], allowed: a.data === true };
    },
  });
}

function useHiddenIds(userId?: string) {
  const { data } = useQuery({
    queryKey: ["my-blocks", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.from("blocks").select("blocked_id").eq("blocker_id", userId!);
      return (data ?? []).map((r) => r.blocked_id);
    },
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

function CoursePicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["staging-course-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from("courses")
        .select("id, name, city, state")
        .ilike("name", `%${q.trim()}%`)
        .eq("moderation_status", "approved")
        .is("merged_into_course_id", null)
        .limit(6);
      return data ?? [];
    },
  });
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a course lobby" className="pl-8" aria-label="Find a course lobby" />
      </div>
      {data?.length ? (
        <ul className="space-y-1">
          {data.map((c) => (
            <li key={c.id}>
              <button onClick={() => onPick(c.id)} className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                <span className="font-medium">{c.name}</span>
                <span className="ml-1 text-muted-foreground">{[c.city, c.state].filter(Boolean).join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StagingPage() {
  const { course, event } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const { profile } = useMyProfile(user) as { profile: { display_name?: string; avatar_url?: string | null } | null };
  const blocked = useHiddenIds(user?.id);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      setMuted(new Set(JSON.parse(sessionStorage.getItem("dgd:clubhouse-muted") ?? "[]") as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggleMute = (id: string) => {
    setMuted((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id); else n.add(id);
      sessionStorage.setItem("dgd:clubhouse-muted", JSON.stringify([...n]));
      return n;
    });
  };
  const hidden = useMemo(() => new Set([...blocked, ...muted]), [blocked, muted]);
  const room: RoomRef = event
    ? { kind: "event", eventId: event }
    : course
      ? { kind: "course", courseId: course }
      : { kind: "clubhouse" };
  const eventQ = useEventRoom(event);
  const [whoTab, setWhoTab] = useState<"here" | "checked">("here");
  const [whoQ, setWhoQ] = useState("");
  const courseQ = useCourseName(course);
  const eventsQ = useCourseEvents(course);
  const me = useMemo(
    () => (user ? { userId: user.id, name: profile?.display_name || "Player", avatarUrl: profile?.avatar_url ?? null } : null),
    [user, profile?.display_name, profile?.avatar_url],
  );
  // Event rooms are for the field and staff: only join once the roster check
  // (registered player or event director) confirms you belong.
  const eventAllowed = !event || (!!me && eventQ.data?.allowed === true);
  const eventLocked = !!event && !eventQ.isLoading && !eventAllowed;
  const live = useStagingRoom(room, eventAllowed ? me : null, hidden);
  const [text, setText] = useState("");

  const roomLabel = event
    ? (eventQ.data?.event?.name ?? "Event clubhouse")
    : course
      ? (courseQ.data?.name ?? "Course lobby")
      : "Clubhouse";

  // Notifications: chat from others and play requests pop up here, and as a device alert when the tab is in the background.
  const [alerts, setAlerts] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    setAlerts(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);
  const enableAlerts = async () => {
    if (typeof Notification === "undefined") return;
    setAlerts(await Notification.requestPermission());
  };
  const notify = (title: string, body: string) => {
    if (typeof document !== "undefined" && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try { new Notification(title, { body, tag: "clubhouse" }); } catch { /* not allowed on this device */ }
    }
  };
  const nameOf = (id: string) => live.players.find((p) => p.userId === id)?.name ?? "Player";
  const seenMsgs = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    if (!me) return;
    for (const m of live.messages) {
      if (seenMsgs.has(m.id)) continue;
      seenMsgs.add(m.id);
      if (m.userId === me.userId || Date.now() - m.at > 15000) continue;
      const who = live.players.find((p) => p.userId === m.userId)?.name ?? "Player";
      toast(`${who}: ${m.text}`);
      notify(`${who} in ${roomLabel}`, m.text);
    }
  }, [live.messages]); // eslint-disable-line react-hooks/exhaustive-deps
  const seenPlay = useMemo(() => new Set<string>(), []);
  useEffect(() => {
    if (!me) return;
    live.events.forEach((e) => {
      if (e.type !== "play_request" || e.userId === me.userId) return;
      if (e.toId && e.toId !== me.userId) return;
      const k = `${e.userId}-${e.at}`;
      if (seenPlay.has(k) || Date.now() - e.at > 30000) return;
      seenPlay.add(k);
      const msg = e.toId ? `${e.name} wants to play a round with you` : `${e.name} is looking for a round`;
      toast(msg, { action: { label: "Message", onClick: () => setText(`@${e.name.split(" ")[0]} `) } });
      notify("Round request", msg);
    });
  }, [live.events]); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useClubhouseCheckins(roomChannel(room).slice(0, 120), eventAllowed ? me : null, hidden);
  const pickStatus = async (status: CheckinStatus) => {
    if (!me) return;
    const ok = await board.setStatus(status);
    if (!ok) { toast.error("Your status didn't save. Try again."); return; }
    if (status === "looking") {
      live.setActivity(PLAY_STATUS);
      live.sendGame({ type: "play_request", userId: me.userId, name: me.name, toId: null, at: Date.now() });
      toast.success("You're checked in — everyone here knows you want a round.");
    } else live.setActivity(status === "playing" ? "Playing a round" : "Hanging out");
  };
  const leaveClubhouse = async () => {
    const ok = await board.leave();
    if (!ok) { toast.error("We couldn't check you out. Try again."); return; }
    live.setActivity("Hanging out");
    toast.success("You've left the Clubhouse.");
  };
  const askToPlay = (toId: string, name: string) => {
    if (!me) return;
    live.sendGame({ type: "play_request", userId: me.userId, name: me.name, toId, at: Date.now() });
    toast.success(`Asked ${name} to play a round`);
  };
  const block = async (id: string, name: string) => {
    if (!user) return;
    const { error } = await supabase.from("blocks").insert({ blocker_id: user.id, blocked_id: id });
    if (error) toast.error("We couldn't block that player.");
    else {
      toast.success(`${name} is blocked. You won't see each other here.`);
      setMuted((m) => new Set([...m, id]));
    }
  };
  const report = async (id: string, name: string, reason: "harassment" | "spam" | "inappropriate" | "other") => {
    const { error } = await supabase.from("clubhouse_reports").insert({ reported_user_id: id, room_key: roomChannel(room).slice(0, 80), reason });
    if (error) toast.error("That report didn't go through.");
    else toast.success(`Thanks — we'll review ${name}. Mute them in the meantime if you like.`);
  };
  const send = () => {
    if (!text.trim()) return;
    live.say(text);
    setText("");
  };
  const openEventChat = async (kind: "tournament" | "league", id: string) => {
    try {
      const conv = await joinDgimEventChat(kind, id);
      void navigate({ to: "/dgim", search: { conv } });
    } catch {
      toast.error("You can join this event's chat once you're registered.");
    }
  };
  const whoActions: WhoActions = {
    muted,
    clearMuted: () => { setMuted(new Set()); sessionStorage.removeItem("dgd:clubhouse-muted"); },
    toggleMute,
    block,
    report,
  };
  const others = live.players.filter((p) => p.userId !== me?.userId);

  return (
    <div className="mx-auto w-full max-w-[1320px] space-y-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold">{roomLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {event && eventQ.data?.event?.start_date ? (
              <span className="mr-1 font-medium text-foreground">{eventCountdown(eventQ.data.event.start_date)} ·</span>
            ) : null}
            {event ? "Meet your field before the event. Being here doesn't check you in — check in with the event staff or QR code." : course ? "See who is checked in at this course — playing, or looking for people to play with. Your status stays until you leave." : "See who is checked in — playing, or looking for people to play with. Your status stays until you leave."}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {live.connected ? <Wifi className="h-4 w-4 text-success" /> : <WifiOff className="h-4 w-4" />}
          <Users className="h-4 w-4" />
          <span className="tabular-nums">{board.checkins.length} checked in</span>
        </div>
        {course || event ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/play/staging" search={{}}>Back to the Clubhouse</Link>
          </Button>
        ) : null}
      </header>

      {eventLocked ? (
        <section className="rounded-xl border border-border bg-card p-6 text-center">
          <h2 className="font-semibold">This clubhouse is for the event's players</h2>
          <p className="mt-1 text-sm text-muted-foreground">Register for the event to meet the field here.</p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/play/staging" search={{}}>Back to the Clubhouse</Link>
          </Button>
        </section>
      ) : (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 font-semibold">Checked in · {board.checkins.length}</h2>
              {alerts !== "granted" && alerts !== "unsupported" ? (
                <Button size="sm" variant="ghost" onClick={enableAlerts}>
                  <Bell className="mr-1 h-4 w-4" /> Alert me
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-2">
              <span className="text-sm text-muted-foreground">{board.mine ? "Your status:" : "Check in as:"}</span>
              {(Object.keys(STATUS_LABEL) as CheckinStatus[]).map((s) => (
                <Button key={s} size="sm" variant={board.mine?.status === s ? "default" : "outline"} onClick={() => void pickStatus(s)} disabled={!me}>
                  {s === "looking" ? <Flag className="mr-1 h-4 w-4" /> : null}
                  {STATUS_LABEL[s]}
                </Button>
              ))}
              {board.mine ? (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={() => void leaveClubhouse()}>
                  <LogOut className="mr-1 h-4 w-4" /> Leave clubhouse
                </Button>
              ) : null}
            </div>
            {!board.loaded ? (
              <p className="text-sm text-muted-foreground">Loading who's checked in…</p>
            ) : board.checkins.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody's checked in yet. Pick a status above to be first.</p>
            ) : (
              <ol className="divide-y divide-border">
                {board.checkins.map((p, i) => {
                  const isMe = p.user_id === me?.userId;
                  return (
                    <li key={p.user_id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="w-6 text-right tabular-nums text-muted-foreground">{i + 1}</span>
                      {p.avatar_url ? (
                        <img src={p.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-semibold">{p.display_name.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.display_name}{isMe ? " (you)" : ""}
                        <span className="ml-2 text-xs font-normal text-muted-foreground">since {new Date(p.checked_in_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </span>
                      <span className={"rounded-full px-2 py-0.5 text-xs " + (p.status === "looking" ? "bg-primary/15 text-primary" : p.status === "playing" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>
                        {STATUS_LABEL[p.status]}
                      </span>
                      {!isMe ? (
                        <>
                          {p.status !== "playing" ? <Button size="sm" variant="secondary" onClick={() => askToPlay(p.user_id, p.display_name)}>Ask to play</Button> : null}
                          <PlayerMenu id={p.user_id} name={p.display_name} a={whoActions} />
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="space-y-2 rounded-xl border border-border bg-card p-4">
            <h2 className="font-semibold">Chat</h2>
            <div className="max-h-80 min-h-24 space-y-1.5 overflow-y-auto">
              {live.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet. Say hi to the queue.</p>
              ) : (
                live.messages.map((m) => (
                  <p key={m.id} className="text-sm">
                    <span className="font-semibold">{nameOf(m.userId)}</span>{" "}
                    <span className="text-xs text-muted-foreground">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    <br />
                    {m.text}
                  </p>
                ))
              )}
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <Input value={text} maxLength={MAX_SAY} onChange={(e) => setText(e.target.value)} placeholder="Message the queue" aria-label="Message the queue" />
              <Button type="submit" disabled={!text.trim()} aria-label="Send"><Send className="h-4 w-4" /></Button>
            </form>
            <p className="text-xs text-muted-foreground">Messages aren't saved after you leave. Players you've blocked never appear here.</p>
          </section>
          {!event ? <PlayCrewPanel friendsActive={null} /> : null}
        </div>

        <aside className="space-y-4">
          {event && me && eventQ.data?.event ? (
            <div>
              <EventRoomPanel tournamentId={event} userId={me.userId} startDate={eventQ.data.event.start_date} roster={eventQ.data.roster} />
            </div>
          ) : null}

          {event ? (
          <div>
          <WhoPanel
            actions={whoActions}
            others={others}
            roster={event ? (eventQ.data?.roster ?? []) : null}
            hereIds={new Set(live.players.map((p) => p.userId))}
            tab={event ? whoTab : "here"}
            setTab={setWhoTab}
            q={whoQ}
            setQ={setWhoQ}
          />
          </div>
          ) : null}
          <div className="space-y-4">

          {course ? (
            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <h2 className="text-sm font-semibold">Event chats at this course</h2>
              {eventsQ.data?.length ? (
                <ul className="space-y-1">
                  {eventsQ.data.map((ev) => (
                    <li key={ev.kind + ev.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{ev.name}</span>
                      {ev.kind === "tournament" ? (
                        <Button size="sm" variant="secondary" asChild>
                          <Link to="/play/staging" search={{ event: ev.id }}>Clubhouse</Link>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => openEventChat(ev.kind, ev.id)}>
                        <MessageCircle className="mr-1 h-3.5 w-3.5" />
                        Chat
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming events here yet. Saved chats live with each event.</p>
              )}
            </section>
          ) : null}

          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <h2 className="text-sm font-semibold">Course lobbies</h2>
            <CoursePicker onPick={(id) => void navigate({ to: "/play/staging", search: { course: id } })} />
          </section>
          </div>
        </aside>
      </div>
      )}
    </div>
  );
}

type RosterRow = { user_id: string; display_name: string; checked_in: boolean };

type WhoActions = {
  muted: Set<string>;
  clearMuted: () => void;
  toggleMute: (id: string) => void;
  block: (id: string, name: string) => void;
  report: (id: string, name: string, r: "harassment" | "spam" | "inappropriate" | "other") => void;
};

function PlayerMenu({ id, name, a }: { id: string; name: string; a: WhoActions }) {
  const isMuted = a.muted.has(id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Options for ${name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => a.toggleMute(id)}>
          {isMuted ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
          {isMuted ? "Unmute" : "Mute in this visit"}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Flag className="mr-2 h-4 w-4" /> Report</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => a.report(id, name, "harassment")}>Harassment</DropdownMenuItem>
            <DropdownMenuItem onClick={() => a.report(id, name, "spam")}>Spam</DropdownMenuItem>
            <DropdownMenuItem onClick={() => a.report(id, name, "inappropriate")}>Inappropriate</DropdownMenuItem>
            <DropdownMenuItem onClick={() => a.report(id, name, "other")}>Something else</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem className="text-destructive" onClick={() => a.block(id, name)}>
          <Ban className="mr-2 h-4 w-4" /> Block
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WhoPanel({
  actions,
  others,
  roster,
  hereIds,
  tab,
  setTab,
  q,
  setQ,
}: {
  actions: WhoActions;
  others: { userId: string; name: string; activity: string }[];
  roster: RosterRow[] | null;
  hereIds: Set<string>;
  tab: "here" | "checked";
  setTab: (t: "here" | "checked") => void;
  q: string;
  setQ: (v: string) => void;
}) {
  const needle = q.trim().toLowerCase();
  const checkedCount = roster?.filter((r) => r.checked_in).length ?? 0;
  const rows = (roster ?? []).filter((r) => !needle || r.display_name.toLowerCase().includes(needle));
  const here = others.filter((p) => !needle || p.name.toLowerCase().includes(needle));
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3">
      {roster ? (
        <div role="tablist" aria-label="Who's here" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5">
          {([
            ["here", `Here now · ${others.length + 1}`],
            ["checked", `Checked in · ${checkedCount}/${roster.length}`],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={"rounded-md px-2 py-1 text-sm font-medium " + (tab === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <h2 className="text-sm font-semibold">Who's here</h2>
      )}
      {(roster?.length ?? 0) > 8 || others.length > 8 ? (
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a player" aria-label="Find a player" />
      ) : null}
      {actions.muted.size > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {actions.muted.size} muted for this visit
          <button className="font-medium text-primary hover:underline" onClick={actions.clearMuted}>Unmute all</button>
        </p>
      ) : null}
      {tab === "checked" && roster ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {roster.length === 0 ? "The field list shows up once you're registered for this event." : "No one by that name."}
          </p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.user_id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{r.display_name}</span>
                {hereIds.has(r.user_id) ? <span className="text-xs text-primary">Here</span> : null}
                <span className={"text-xs " + (r.checked_in ? "text-success" : "text-muted-foreground")}>
                  {r.checked_in ? "Checked in" : "Not checked in"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : here.length === 0 ? (
        <p className="text-sm text-muted-foreground">Just you for now. Friends who tap "I'm looking to play" can join you here.</p>
      ) : (
        <ul className="space-y-1">
          {here.map((p) => (
            <li key={p.userId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">{p.activity}</span>
              <PlayerMenu id={p.userId} name={p.name} a={actions} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function eventCountdown(startDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(startDate.length === 10 ? `${startDate}T00:00:00` : startDate);
  start.setHours(0, 0, 0, 0);
  const days = Math.round((start.getTime() - today.getTime()) / 86_400_000);
  if (days > 1) return `Starts in ${days} days`;
  if (days === 1) return "Starts tomorrow";
  if (days === 0) return "Event day";
  return "Event underway or finished";
}
