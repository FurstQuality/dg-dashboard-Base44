import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  Loader2,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { AddToTrackerButton } from "@/components/social/add-to-tracker-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useSession, timeAgo } from "@/lib/current-user";
import { PlayRowsSkeleton } from "@/components/play/play-widget-states";
import { OpenRoundComposer } from "@/components/play/looking-to-play-panel";
import { openDgimDirect } from "@/lib/dgim";
import {
  deletePlayIntent,
  getMyPlayStatus,
  getPlayLobby,
  setPlayAvailability,
  setPlayIntentJoin,
  type OpenRound,
} from "@/lib/play-status.functions";
import { playStatusKey } from "@/components/play/play-status-menu";
import type { FriendActiveRoundRow } from "@/lib/round-history.functions";

const lobbyKey = (userId?: string) => ["play-lobby", userId ?? "anon"] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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

/**
 * Play overview crew panel: friends playing right now on the left (with a
 * one-click add to a tracker crew), every open round you can request to join
 * on the right. Two half-width columns on desktop, stacked on mobile.
 */
export function PlayCrewPanel({ friendsActive }: { friendsActive: FriendActiveRoundRow[] | null }) {
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

  const live = friendsActive ?? [];
  const [tab, setTab] = useState<"looking" | "friends" | "rounds">("looking");
  const tabs = [
    { key: "looking" as const, label: "Looking", n: friendsLooking.length },
    { key: "friends" as const, label: "Playing", n: live.length },
    { key: "rounds" as const, label: "Open rounds", n: rounds.length },
  ];

  const myStatusFn = useServerFn(getMyPlayStatus);
  const { data: myStatus } = useQuery({
    queryKey: playStatusKey(user?.id),
    queryFn: () => myStatusFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const iAmLooking = myStatus?.status === "looking";
  const setAvailFn = useServerFn(setPlayAvailability);
  const toggleLooking = useMutation({
    mutationFn: () =>
      setAvailFn({ data: { status: iAmLooking ? "not_looking" : "looking", auto: false } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playStatusKey(user?.id) });
      invalidate();
      toast.success(iAmLooking ? "You're off the looking list." : "Your friends can see you're looking to play.");
    },
    onError: () => toast.error("Couldn't update your status. Try again."),
  });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-sky-500" />
          <h2 className="truncate font-display text-lg font-semibold">Play together</h2>
          <div role="tablist" className="flex gap-1 whitespace-nowrap rounded-lg bg-muted p-0.5">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={"rounded-md px-2.5 py-1 text-sm font-medium " + (tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {t.label}
                {t.n ? <span className="ml-1 tabular-nums text-primary">{t.n}</span> : null}
              </button>
            ))}
          </div>
        </div>
        <Link
          to="/friends"
          className="ml-auto shrink-0 text-sm text-muted-foreground hover:text-foreground"
        >
          All friends →
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-card p-3">
        {/* LOOKING TO PLAY */}
        <div className={tab === "looking" ? "space-y-2" : "hidden"}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold">Looking to play</h3>
            <Button
              size="sm"
              variant={iAmLooking ? "outline" : "default"}
              className="ml-auto"
              disabled={!user || toggleLooking.isPending}
              onClick={() => toggleLooking.mutate()}
            >
              {toggleLooking.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {iAmLooking ? "Stop looking" : "I'm looking to play"}
            </Button>
          </div>
          {isLoading ? (
            <PlayRowsSkeleton rows={2} height="h-16" />
          ) : friendsLooking.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends are looking right now. Let them know you're up for a round.{" "}
              <Link to="/play/staging" className="font-medium text-primary hover:underline">
                Enter the Clubhouse
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {friendsLooking.map((f) => (
                <FriendAvailableRow
                  key={f.user_id}
                  userId={f.user_id}
                  name={f.player_name}
                  avatarUrl={f.avatar_url}
                  status={f.status === "looking" ? "Looking to play" : "Maybe playing"}
                />
              ))}
            </div>
          )}
        </div>

        {/* FRIENDS PLAYING */}
        <div className={tab === "friends" ? "space-y-2" : "hidden"}>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 shrink-0 text-sky-500" />
            <h3 className="font-display text-base font-semibold">Friends playing</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {live.length ? `${live.length} on the course` : ""}
            </span>
          </div>

          {friendsActive === null ? (
            <PlayRowsSkeleton rows={2} height="h-16" />
          ) : live.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody in your crew is on the course right now.{" "}
              <Link to="/friends" className="font-medium text-primary hover:underline">
                Invite a friend
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {live.map((r) => (
                <FriendPlayingRow key={r.id} r={r} viewerId={user?.id} />
              ))}
            </div>
          )}
        </div>

        {/* OPEN ROUNDS */}
        <div className={tab === "rounds" ? "space-y-2" : "hidden"}>
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-sky-500" />
            <h3 className="font-display text-base font-semibold">Open rounds</h3>
            <span className="ml-auto text-xs text-muted-foreground">
              {rounds.length ? `${rounds.length} posted` : "none posted"}
            </span>
          </div>

          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setEditing(null);
              setComposerOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Post an open round
          </Button>

          {isLoading ? (
            <PlayRowsSkeleton rows={2} height="h-16" />
          ) : rounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open rounds nearby yet.</p>
          ) : (
            <div className="space-y-2">
              {rounds.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={r.avatar_url ?? undefined} alt={r.player_name} />
                      <AvatarFallback className="text-[10px]">
                        {initials(r.player_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{r.player_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {r.visibility === "public" ? "Open to all" : "Friends only"}
                        </Badge>
                      </div>
                      <div className="mt-0.5 truncate font-display text-sm font-semibold">
                        {r.course_names.join(" · ") || "Any course"}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                          {formatWindow(r.window_start, r.window_end)}
                        </span>
                        {r.city || r.state ? (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0" />
                            {[r.city, r.state].filter(Boolean).join(", ")}
                          </span>
                        ) : null}
                        {r.holes ? <span>{r.holes} holes</span> : null}
                      </div>
                      {r.note ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">{r.note}</p>
                      ) : null}
                      <div className="mt-1.5 text-xs text-muted-foreground">
                        {r.joins.length
                          ? `In: ${r.joins.map((j) => `${j.player_name}${j.state === "maybe" ? " (maybe)" : ""}`).join(", ")}`
                          : "No one has joined yet."}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
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
                              {r.my_join === "in" ? "Request sent" : "Request to join"}
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
        </div>
      </div>


      <OpenRoundComposer
        open={composerOpen}
        onOpenChange={setComposerOpen}
        editing={editing}
        onSaved={invalidate}
      />
    </section>
  );
}

/** A friend scoring a round right now. */
function FriendPlayingRow({
  r,
  viewerId,
}: {
  r: FriendActiveRoundRow;
  viewerId: string | null | undefined;
}) {
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);

  async function handleMessage() {
    if (!viewerId) return;
    setOpening(true);
    try {
      const conversationId = await openDgimDirect(viewerId, r.created_by);
      await navigate({ to: "/dgim", search: { conv: conversationId } });
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "We couldn't open that chat. Give it another shot.",
      );
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 via-sky-500/5 to-transparent p-3">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-sky-500/60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-500" />
        </span>
        <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-sky-500">
          {r.player_name} · live
        </span>
      </div>
      <div className="mt-1 truncate font-display text-sm font-semibold">
        {r.course_name ?? "Course"}
      </div>
      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {[r.city, r.state].filter(Boolean).join(", ") || "Unknown"}
        </span>
        <span>·</span>
        <span>Started {timeAgo(r.started_at)}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AddToTrackerButton userId={r.created_by} />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void handleMessage()}
          disabled={!viewerId || opening}
        >
          {opening ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="mr-1 h-3.5 w-3.5" />
          )}
          Message
        </Button>
        {r.player_username ? (
          <Button asChild size="sm" variant="ghost">
            <Link to="/players/$username" params={{ username: r.player_username }}>
              Profile
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** A friend who marked themselves free but hasn't posted a round. */
function FriendAvailableRow({
  userId,
  name,
  avatarUrl,
  status,
}: {
  userId: string;
  name: string;
  avatarUrl: string | null;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} alt={name} />
        <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="text-xs text-muted-foreground">{status}</div>
      </div>
      <AddToTrackerButton userId={userId} />
    </div>
  );
}
