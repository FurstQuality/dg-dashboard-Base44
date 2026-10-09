import { Link } from "@tanstack/react-router";
import { PeopleYouMayKnow } from "@/components/social/people-you-may-know";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BellOff,
  Check,
  CheckCheck,
  Info,
  Loader2,
  LogOut,
  Megaphone,
  MessageCircle,
  Pencil,
  Pin,
  PinOff,
  Search,
  Send,
  Settings,
  Shield,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { channelNonce } from "@/lib/realtime";
import { useSession, initials } from "@/lib/current-user";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessengerSettingsDialog } from "@/components/dgim/messenger-settings";
import {
  MESSAGE_TEXT_CLASS,
  THREAD_SPACING_CLASS,
  WALLPAPER_CLASS,
  useMessengerPrefs,
} from "@/lib/messenger-prefs";
import {
  conversationLabel,
  eventKindLabel,
  joinDgimEventChat,
  loadDgimEvents,
  loadDgimFriends,
  loadDgimInbox,
  openDgimDirect,
  createDgimGroup,
  addConversationMembers,
  leaveConversation,
  loadConversationMembers,
  renameConversation,
  unsendMessage,
  type DgimMember,
  type DgimConversation,
  type DgimEventRef,
  type DgimMessage,
  type DgimProfile,
} from "@/lib/dgim";
import { useConvFlags } from "@/lib/dgim-conv-flags";

export type MessengerLayout = "app" | "popup";

export type MessengerPanelProps = {
  /** "app" fills the viewport (standalone Messenger app); "popup" fits a docked window. */
  layout?: MessengerLayout;
  /** Conversation to open on mount. */
  initialConv?: string | null;
  /** Close control in the panel header (popup window or app exit). */
  onClose?: () => void;
  /** Optional extra control rendered next to the close button. */
  headerActions?: ReactNode;
};

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayLabel(iso: string) {
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return "Today";
  if (sameDay(iso, yest.toISOString())) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function MessengerPanel({
  layout = "app",
  initialConv = null,
  onClose,
  headerActions,
}: MessengerPanelProps) {
  const popup = layout === "popup";
  const { user } = useSession();
  const convFromUrl = initialConv ?? undefined;
  const [lane, setLane] = useState<"social" | "event">("social");
  const [convs, setConvs] = useState<DgimConversation[]>([]);
  const [friends, setFriends] = useState<DgimProfile[]>([]);
  const [events, setEvents] = useState<DgimEventRef[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<DgimMessage[]>([]);
  const [senders, setSenders] = useState<Record<string, DgimProfile>>({});
  const [body, setBody] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [asAnnouncement, setAsAnnouncement] = useState(false);
  const [typingByUser, setTypingByUser] = useState<Record<string, number>>({});
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPicks, setGroupPicks] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [members, setMembers] = useState<DgimMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [addPicks, setAddPicks] = useState<string[]>([]);
  const { prefs } = useMessengerPrefs();
  const { togglePinned, toggleMuted, isPinned, isMuted } = useConvFlags();
  const mutedRef = useRef(isMuted);
  mutedRef.current = isMuted;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentRef = useRef(0);

  // The standalone Messenger app installs under its own app icon.
  useEffect(() => {
    if (popup) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) return;
    const previous = link.href;
    link.href = "/dgim.webmanifest";
    return () => {
      link.href = previous;
    };
  }, [popup]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [inbox, fr, evs] = await Promise.all([
      loadDgimInbox(user.id),
      loadDgimFriends(user.id),
      loadDgimEvents(user.id),
    ]);
    setConvs(inbox);
    setFriends(fr);
    setEvents(evs);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Personalization: open on the lane the player prefers.
  useEffect(() => {
    if (!selected) setLane(prefs.defaultLane);
  }, [prefs.defaultLane, selected]);

  useEffect(() => {
    if (convFromUrl && convs.some((c) => c.id === convFromUrl)) setSelected(convFromUrl);
  }, [convFromUrl, convs]);

  const convIdKey = convs.map((c) => c.id).join(",");

  // Inbox realtime: bump the list whenever any of my rooms gets a message.
  useEffect(() => {
    if (!user || convs.length === 0) return;
    const channel = supabase.channel(`dgim-inbox:${user.id}:${channelNonce()}`);
    convs.forEach((c) => {
      channel.on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${c.id}`,
        },
        () => {
          refresh();
        },
      );
    });
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, convIdKey, refresh, convs.length]);

  // Open thread: history, realtime inserts, typing presence, read receipts.
  useEffect(() => {
    if (!selected || !user) {
      setMessages([]);
      setSenders({});
      return;
    }
    let alive = true;
    setTypingByUser({});
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, conversation_id, sender_id, body, created_at, is_announcement")
        .eq("conversation_id", selected)
        .order("created_at", { ascending: true })
        .limit(500);
      if (!alive) return;
      const msgs = (data ?? []) as DgimMessage[];
      setMessages(msgs);
      const ids = [...new Set(msgs.map((m) => m.sender_id))];
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", ids);
        if (alive) {
          setSenders(Object.fromEntries((profs ?? []).map((p) => [p.id, p as DgimProfile])));
        }
      }
      await supabase
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", selected)
        .eq("user_id", user.id);
      if (alive) refresh();
    })();

    const channel = supabase.channel(`dgim-thread:${selected}:${channelNonce()}`, {
      config: { broadcast: { self: false } },
    });
    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selected}`,
        },
        (payload) => {
          if (!alive) return;
          const m = payload.new as DgimMessage;
          setMessages((prev) => {
            const idx = prev.findIndex(
              (p) => p.pending && p.sender_id === m.sender_id && p.body === m.body,
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = m;
              return next;
            }
            if (prev.some((p) => p.id === m.id)) return prev;
            return [...prev, m];
          });
          if (m.sender_id !== user.id) {
            notifyIncoming(m.body ?? "", selected);
            supabase
              .from("conversation_members")
              .update({ last_read_at: new Date().toISOString() })
              .eq("conversation_id", selected)
              .eq("user_id", user.id)
              .then(() => refresh());
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_members",
          filter: `conversation_id=eq.${selected}`,
        },
        () => {
          refresh();
        },
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        const uid = (payload.payload as { user_id?: string }).user_id;
        if (!uid || uid === user.id) return;
        setTypingByUser((prev) => ({ ...prev, [uid]: Date.now() }));
      })
      .subscribe();
    threadChannelRef.current = channel;
    return () => {
      alive = false;
      supabase.removeChannel(channel);
      threadChannelRef.current = null;
    };
  }, [selected, user, refresh]);

  useEffect(() => {
    if (Object.keys(typingByUser).length === 0) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTypingByUser((prev) => {
        const next: Record<string, number> = {};
        let changed = false;
        for (const [k, v] of Object.entries(prev)) {
          if (now - v < 3500) next[k] = v;
          else changed = true;
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typingByUser]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, Object.keys(typingByUser).length]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [body]);

  const activeConv = convs.find((c) => c.id === selected) ?? null;
  const activeEvent = activeConv?.event_kind
    ? (events.find((e) => e.kind === activeConv.event_kind && e.id === activeConv.event_id) ?? null)
    : null;
  const canAnnounce = Boolean(activeEvent?.isOrganizer);

  useEffect(() => {
    if (!canAnnounce) setAsAnnouncement(false);
  }, [canAnnounce, selected]);

  useEffect(() => {
    if (activeConv?.event_kind) setLane("event");
  }, [activeConv?.event_kind]);

  const socialConvs = useMemo(
    () =>
      convs.filter(
        (c) => !c.event_kind && matchesOmnisearch({ ...c, label: conversationLabel(c) }, q),
      ),
    [convs, q],
  );
  const eventConvs = useMemo(
    () =>
      convs.filter(
        (c) => c.event_kind && matchesOmnisearch({ ...c, label: conversationLabel(c) }, q),
      ),
    [convs, q],
  );
  const joinableEvents = useMemo(() => {
    const joined = new Set(
      convs.filter((c) => c.event_kind).map((c) => `${c.event_kind}:${c.event_id}`),
    );
    return events.filter((e) => !joined.has(`${e.kind}:${e.id}`) && matchesOmnisearch(e, q));
  }, [events, convs, q]);
  // Anyone can be messaged (blocks and their privacy settings are checked on
  // send), so search reaches every player, not just friends.
  const [players, setPlayers] = useState<DgimProfile[]>([]);
  useEffect(() => {
    const term = q.trim().replace(/[%,()]/g, " ").trim();
    if (lane !== "social" || term.length < 2 || !user) {
      setPlayers([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
        .neq("id", user.id)
        .limit(8);
      setPlayers((data ?? []) as DgimProfile[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, lane, user]);
  const filteredFriends = useMemo(() => {
    const dmIds = new Set(convs.filter((c) => !c.event_kind && c.other).map((c) => c.other!.id));
    const mine = friends.filter((f) => !dmIds.has(f.id) && matchesOmnisearch(f, q));
    const seen = new Set(mine.map((f) => f.id));
    return [...mine, ...players.filter((p) => !seen.has(p.id) && !dmIds.has(p.id))];
  }, [friends, players, convs, q]);

  const totalUnread = convs.reduce((n, c) => n + c.unread, 0);
  const eventUnread = convs.filter((c) => c.event_kind).reduce((n, c) => n + c.unread, 0);
  const socialUnread = totalUnread - eventUnread;

  const lastMineIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === user?.id && !messages[i].pending) return i;
    }
    return -1;
  }, [messages, user?.id]);
  const otherRead = activeConv?.other_last_read_at ? new Date(activeConv.other_last_read_at) : null;

  function notifyIncoming(text: string, conversationId?: string) {
    if (conversationId && mutedRef.current(conversationId)) return;
    const alertPrefs = prefsRef.current;
    if (alertPrefs.soundOnNewMessage) {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 880;
          gain.gain.value = 0.06;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
          setTimeout(() => ctx.close().catch(() => {}), 400);
        }
      } catch {
        // Audio can be blocked before a user gesture; ignore.
      }
    }
    if (
      alertPrefs.desktopNotifications &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      try {
        new Notification("New DGIM message", { body: text.slice(0, 120) });
      } catch {
        // Notification constructor is unavailable on some mobile browsers.
      }
    }
  }

  function broadcastTyping() {
    const ch = threadChannelRef.current;
    if (!ch || !user) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    ch.send({ type: "broadcast", event: "typing", payload: { user_id: user.id } });
  }

  async function sendMessage() {
    if (!user || !selected || !body.trim()) return;
    const text = body.trim();
    const announce = canAnnounce && asAnnouncement;
    setBody("");
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        conversation_id: selected,
        sender_id: user.id,
        body: text,
        created_at: new Date().toISOString(),
        is_announcement: announce,
        pending: true,
      },
    ]);
    const { error } = await supabase.from("messages").insert({
      conversation_id: selected,
      sender_id: user.id,
      body: text,
      is_announcement: announce,
    });
    if (error) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setBody(text);
      toast.error(error.message.includes("player") ? error.message : "That message didn't send. Try again.");
    }
  }

  async function startDm(friend: DgimProfile) {
    if (!user) return;
    setBusy(true);
    try {
      const id = await openDgimDirect(user.id, friend.id);
      await refresh();
      setLane("social");
      setSelected(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't open that chat.");
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!user) return;
    setBusy(true);
    try {
      const id = await createDgimGroup(user.id, groupPicks, groupTitle);
      await refresh();
      setGroupOpen(false);
      setGroupTitle("");
      setGroupPicks([]);
      setLane("social");
      setSelected(id);
      toast.success("Group chat created.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't create that group chat.");
    } finally {
      setBusy(false);
    }
  }

  async function joinEvent(ev: DgimEventRef) {
    setBusy(true);
    try {
      const id = await joinDgimEventChat(ev.kind, ev.id);
      await refresh();
      setLane("event");
      setSelected(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't open that event room.");
    } finally {
      setBusy(false);
    }
  }

  const listConvs = useMemo(() => {
    const base = lane === "social" ? socialConvs : eventConvs;
    return [...base].sort((a, b) => {
      const pa = isPinned(a.id) ? 1 : 0;
      const pb = isPinned(b.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [lane, socialConvs, eventConvs, isPinned]);

  const isGroupRoom = Boolean(activeConv && (activeConv.is_group || activeConv.event_kind));
  const canRename = Boolean(activeConv && activeConv.is_group && !activeConv.event_kind);
  const canAddMembers = Boolean(
    activeConv &&
    activeConv.is_group &&
    !activeConv.event_kind &&
    activeConv.created_by === user?.id,
  );
  const memberIdSet = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const addableFriends = useMemo(
    () => friends.filter((f) => !memberIdSet.has(f.id)),
    [friends, memberIdSet],
  );

  const openDetails = useCallback(async () => {
    if (!activeConv) return;
    setDetailsOpen(true);
    setRenameValue(activeConv.title ?? "");
    setAddPicks([]);
    setMembersLoading(true);
    try {
      setMembers(await loadConversationMembers(activeConv.id));
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, [activeConv]);

  async function saveRename() {
    if (!activeConv) return;
    setBusy(true);
    try {
      await renameConversation(activeConv.id, renameValue);
      await refresh();
      toast.success("Chat renamed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't rename that chat.");
    } finally {
      setBusy(false);
    }
  }

  async function addMembers() {
    if (!activeConv) return;
    setBusy(true);
    try {
      await addConversationMembers(activeConv.id, addPicks);
      setAddPicks([]);
      setMembers(await loadConversationMembers(activeConv.id));
      await refresh();
      toast.success("Added to the chat.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't add those players.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveRoom() {
    if (!activeConv || !user) return;
    setBusy(true);
    try {
      await leaveConversation(activeConv.id, user.id);
      setDetailsOpen(false);
      setSelected(null);
      await refresh();
      toast.success("You left the chat.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "We couldn't leave that chat.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!user) return;
    const snapshot = messages;
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    try {
      await unsendMessage(messageId, user.id);
      refresh();
    } catch {
      setMessages(snapshot);
      toast.error("We couldn't unsend that message.");
    }
  }

  return (
    <div
      className={
        "flex min-h-0 flex-col overflow-hidden bg-background text-foreground " +
        (popup ? "h-full" : "h-[100dvh]")
      }
    >
      {/* App bar */}
      {/* data-dgim-drag-handle lets the docked window use this bar to move itself. */}
      <header
        data-dgim-drag-handle
        className={
          "flex items-center gap-3 border-b border-border bg-card px-3 py-2 sm:px-4 " +
          (popup ? "cursor-move select-none" : "")
        }
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">DGIM</div>
            <div className="truncate text-[11px] leading-tight text-muted-foreground">
              Disc Golf Instant Messenger
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {totalUnread > 0 && !popup && <Badge variant="secondary">{totalUnread} unread</Badge>}
          {headerActions}
          {!popup && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSettingsOpen(true)}
              aria-label="Messenger settings"
              title="Messenger settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
          {onClose ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
              aria-label="Close messenger"
            >
              <X className="h-4 w-4" />
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="gap-1.5">
              <Link to="/community">
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Exit</span>
              </Link>
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* List rail */}
        <aside
          className={
            "flex w-full min-w-0 flex-col border-r border-border bg-card " +
            (popup ? "" : "sm:w-[340px] sm:shrink-0 ") +
            (selected ? (popup ? "hidden" : "hidden sm:flex") : "flex")
          }
        >
          <div className="space-y-2 border-b border-border p-3">
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <button
                type="button"
                onClick={() => setLane("social")}
                className={
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition " +
                  (lane === "social"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground")
                }
              >
                <Users className="h-3.5 w-3.5" /> Social
                {socialUnread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {socialUnread}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setLane("event")}
                className={
                  "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition " +
                  (lane === "event"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground")
                }
              >
                <Trophy className="h-3.5 w-3.5" /> Rooms
                {eventUnread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {eventUnread}
                  </span>
                )}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    lane === "social" ? "Search chats and players" : "Search club and event rooms"
                  }
                  className="h-9 pl-8 text-sm"
                />
              </div>
              {lane === "social" && friends.length >= 2 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0"
                  onClick={() => setGroupOpen(true)}
                >
                  <UsersRound className="mr-1.5 h-3.5 w-3.5" /> New group
                </Button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your chats…
              </div>
            ) : (
              <>
                {listConvs.map((c) => (
                  <div
                    key={c.id}
                    className={
                      "group flex w-full items-center gap-2 border-b border-border/60 px-3 py-2.5 transition hover:bg-muted/60 " +
                      (selected === c.id ? "bg-muted" : "")
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        {c.other?.avatar_url && <AvatarImage src={c.other.avatar_url} alt="" />}
                        <AvatarFallback>
                          {c.event_kind === "club" ? (
                            <Shield className="h-4 w-4" />
                          ) : c.event_kind ? (
                            <Trophy className="h-4 w-4" />
                          ) : c.is_group ? (
                            <UsersRound className="h-4 w-4" />
                          ) : (
                            initials(conversationLabel(c))
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {isPinned(c.id) && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                          <span className="truncate text-sm font-medium">
                            {conversationLabel(c)}
                          </span>
                          {isMuted(c.id) && (
                            <BellOff className="h-3 w-3 shrink-0 text-muted-foreground" />
                          )}
                          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                            {shortTime(c.last_message_at)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {c.preview_announcement && (
                            <Megaphone className="h-3 w-3 shrink-0 text-primary" />
                          )}
                          <span className="truncate text-xs text-muted-foreground">
                            {c.preview ?? "No messages yet — say hello."}
                          </span>
                          {c.unread > 0 && (
                            <span
                              className={
                                "ml-auto shrink-0 rounded-full px-1.5 text-[10px] " +
                                (isMuted(c.id)
                                  ? "bg-muted-foreground/30 text-foreground"
                                  : "bg-primary text-primary-foreground")
                              }
                            >
                              {c.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                    <div className="flex shrink-0 flex-col gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => togglePinned(c.id)}
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        aria-label={isPinned(c.id) ? "Unpin this chat" : "Pin this chat to the top"}
                        title={isPinned(c.id) ? "Unpin chat" : "Pin chat"}
                      >
                        {isPinned(c.id) ? (
                          <PinOff className="h-3.5 w-3.5" />
                        ) : (
                          <Pin className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleMuted(c.id)}
                        className="rounded-md p-1 text-muted-foreground transition hover:bg-background hover:text-foreground"
                        aria-label={isMuted(c.id) ? "Unmute this chat" : "Mute this chat"}
                        title={isMuted(c.id) ? "Unmute chat" : "Mute chat"}
                      >
                        <BellOff
                          className={"h-3.5 w-3.5 " + (isMuted(c.id) ? "text-primary" : "")}
                        />
                      </button>
                    </div>
                  </div>
                ))}

                {lane === "social" && filteredFriends.length > 0 && (
                  <div className="p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {q.trim().length >= 2 ? "People" : "Friends"}
                    </div>
                    <div className="space-y-1">
                      {filteredFriends.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          disabled={busy}
                          onClick={() => startDm(f)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/60 disabled:opacity-60"
                        >
                          <Avatar className="h-8 w-8">
                            {f.avatar_url && <AvatarImage src={f.avatar_url} alt="" />}
                            <AvatarFallback>
                              {initials(f.display_name || f.username)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm">{f.display_name || f.username}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              @{f.username}
                            </div>
                          </div>
                          <Send className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {lane === "event" && joinableEvents.length > 0 && (
                  <div className="p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Your events
                    </div>
                    <div className="space-y-1">
                      {joinableEvents.map((e) => (
                        <button
                          key={`${e.kind}:${e.id}`}
                          type="button"
                          disabled={busy}
                          onClick={() => joinEvent(e)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-muted/60 disabled:opacity-60"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            {e.kind === "club" ? (
                              <Shield className="h-4 w-4" />
                            ) : (
                              <Trophy className="h-4 w-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm">{e.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {eventKindLabel(e.kind)}
                              {e.isOrganizer
                                ? e.kind === "club"
                                  ? " · You run this club"
                                  : " · You direct this"
                                : ""}
                            </div>
                          </div>
                          <span className="ml-auto shrink-0 text-[11px] font-medium text-primary">
                            Open chat
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {listConvs.length === 0 &&
                  ((lane === "social" && filteredFriends.length === 0) ||
                    (lane === "event" && joinableEvents.length === 0)) && (
                    <div className="space-y-3 p-4">
                      <p className="text-center text-sm text-muted-foreground">
                        {lane === "social"
                          ? "No chats yet. Add a few friends and they'll show up here."
                          : "No rooms yet. Join a club or sign up for a tournament or league to unlock its chat."}
                      </p>
                      {lane === "social" ? (
                        <PeopleYouMayKnow limit={4} layout="list" title="People you may know" />
                      ) : null}
                    </div>
                  )}
              </>
            )}
          </div>
        </aside>

        {/* Thread */}
        <section
          className={
            "min-w-0 flex-1 flex-col " + (selected ? "flex" : popup ? "hidden" : "hidden sm:flex")
          }
        >
          {!activeConv ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <MessageCircle className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm font-medium">Pick a chat to start talking</div>
              <p className="max-w-sm text-xs text-muted-foreground">
                Social keeps you connected with friends and group chats. Rooms switches to your club
                chats and the tournaments and leagues you're playing, where directors post updates.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border bg-card px-3 py-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className={"h-8 w-8 " + (popup ? "" : "sm:hidden")}
                  onClick={() => setSelected(null)}
                  aria-label="Back to chats"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-9 w-9">
                  {activeConv.other?.avatar_url && (
                    <AvatarImage src={activeConv.other.avatar_url} alt="" />
                  )}
                  <AvatarFallback>
                    {activeConv.event_kind === "club" ? (
                      <Shield className="h-4 w-4" />
                    ) : activeConv.event_kind ? (
                      <Trophy className="h-4 w-4" />
                    ) : activeConv.is_group ? (
                      <UsersRound className="h-4 w-4" />
                    ) : (
                      initials(conversationLabel(activeConv))
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {conversationLabel(activeConv)}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {Object.keys(typingByUser).length > 0
                      ? "Typing…"
                      : activeConv.event_kind
                        ? `${eventKindLabel(activeConv.event_kind)} room · ${activeConv.member_count} in the chat`
                        : activeConv.other
                          ? `@${activeConv.other.username}`
                          : `Group chat · ${activeConv.member_count} in the chat`}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => togglePinned(activeConv.id)}
                    aria-label={isPinned(activeConv.id) ? "Unpin this chat" : "Pin this chat"}
                    title={isPinned(activeConv.id) ? "Unpin chat" : "Pin chat"}
                  >
                    {isPinned(activeConv.id) ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleMuted(activeConv.id)}
                    aria-label={isMuted(activeConv.id) ? "Unmute this chat" : "Mute this chat"}
                    title={isMuted(activeConv.id) ? "Unmute chat" : "Mute chat"}
                  >
                    <BellOff
                      className={"h-4 w-4 " + (isMuted(activeConv.id) ? "text-primary" : "")}
                    />
                  </Button>
                  {isGroupRoom && (
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={openDetails}>
                      <Info className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Chat details</span>
                    </Button>
                  )}
                  {activeConv.other && (
                    <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                      <Link
                        to="/players/$username"
                        params={{ username: activeConv.other.username }}
                      >
                        View profile
                      </Link>
                    </Button>
                  )}
                </div>
              </div>

              <div
                ref={scrollRef}
                className={
                  "min-h-0 flex-1 overflow-y-auto " +
                  THREAD_SPACING_CLASS[prefs.density] +
                  " " +
                  WALLPAPER_CLASS[prefs.wallpaper]
                }
              >
                {messages.length === 0 && (
                  <div className="py-10 text-center text-xs text-muted-foreground">
                    No messages yet. Kick it off.
                  </div>
                )}
                {messages.map((m, i) => {
                  const mine = m.sender_id === user?.id;
                  const prev = messages[i - 1];
                  const showDay = !prev || !sameDay(prev.created_at, m.created_at);
                  const sender = senders[m.sender_id];
                  const readByOther =
                    mine && i === lastMineIdx && otherRead && new Date(m.created_at) <= otherRead;
                  return (
                    <div key={m.id}>
                      {showDay && (
                        <div className="my-3 text-center text-[11px] uppercase tracking-wide text-muted-foreground">
                          {dayLabel(m.created_at)}
                        </div>
                      )}
                      {m.is_announcement ? (
                        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
                          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
                            <Megaphone className="h-3.5 w-3.5" /> Event update
                            {sender ? ` · ${sender.display_name || sender.username}` : ""}
                          </div>
                          <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                          {prefs.showTimestamps && (
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {shortTime(m.created_at)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className={
                            "group/msg flex items-end gap-2 " +
                            (mine ? "justify-end" : "justify-start")
                          }
                        >
                          {mine && !m.pending && (
                            <button
                              type="button"
                              onClick={() => removeMessage(m.id)}
                              className="mb-1 rounded-md p-1 text-muted-foreground opacity-0 transition hover:text-destructive focus:opacity-100 group-hover/msg:opacity-100"
                              aria-label="Unsend this message"
                              title="Unsend"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {!mine && (
                            <Avatar className="h-7 w-7 shrink-0">
                              {sender?.avatar_url && <AvatarImage src={sender.avatar_url} alt="" />}
                              <AvatarFallback className="text-[10px]">
                                {initials(sender?.display_name || sender?.username || "?")}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div
                            className={
                              "max-w-[78%] rounded-2xl px-3 py-2 " +
                              MESSAGE_TEXT_CLASS[prefs.fontScale] +
                              " " +
                              (mine
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground")
                            }
                          >
                            {!mine && activeConv.is_group && (
                              <div className="mb-0.5 text-[11px] font-medium opacity-70">
                                {sender?.display_name || sender?.username || "Player"}
                              </div>
                            )}
                            <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            {(prefs.showTimestamps || mine) && (
                              <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] opacity-70">
                                {prefs.showTimestamps ? shortTime(m.created_at) : null}
                                {mine &&
                                  (m.pending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : prefs.showReadReceipts ? (
                                    readByOther ? (
                                      <CheckCheck className="h-3 w-3" />
                                    ) : (
                                      <Check className="h-3 w-3" />
                                    )
                                  ) : null)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-border bg-card p-2 sm:p-3">
                {canAnnounce && (
                  <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={asAnnouncement} onCheckedChange={setAsAnnouncement} />
                    <span className="flex items-center gap-1.5">
                      <Megaphone className="h-3.5 w-3.5" /> Send as official event update
                    </span>
                  </label>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      broadcastTyping();
                    }}
                    onKeyDown={(e) => {
                      if (prefs.sendOnEnter && e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder={
                      asAnnouncement ? "Post an update to everyone in the event" : "Message"
                    }
                    className="min-h-[40px] resize-none text-sm"
                  />
                  <Button onClick={sendMessage} disabled={!body.trim()} className="h-10 gap-1.5">
                    <Send className="h-4 w-4" />
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <MessengerSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{activeConv ? conversationLabel(activeConv) : "Chat details"}</DialogTitle>
            <DialogDescription>
              {activeConv?.event_kind === "club"
                ? "Everyone in your club can post here. Club chats stay named after the club."
                : activeConv?.event_kind
                  ? "Players signed up for this event share this room, and the director can post official updates."
                  : "See who's in the room, add friends, or step out."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {canRename && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Chat name
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    placeholder="Group name"
                    className="h-9 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0 gap-1.5"
                    disabled={busy || !renameValue.trim()}
                    onClick={saveRename}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Save
                  </Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                In this chat {members.length > 0 ? `· ${members.length}` : ""}
              </div>
              {membersLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading the roster…
                </div>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-md px-2 py-1.5">
                      <Avatar className="h-8 w-8">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} alt="" />}
                        <AvatarFallback>{initials(m.display_name || m.username)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="truncate text-sm">
                          {m.display_name || m.username}
                          {m.id === user?.id ? " (you)" : ""}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          @{m.username}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {canAddMembers && addableFriends.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Add friends
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                  {addableFriends.map((f) => {
                    const checked = addPicks.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setAddPicks((prev) =>
                            prev.includes(f.id)
                              ? prev.filter((id) => id !== f.id)
                              : [...prev, f.id],
                          )
                        }
                        className={
                          "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-muted/60 " +
                          (checked ? "bg-muted" : "")
                        }
                      >
                        <Avatar className="h-8 w-8">
                          {f.avatar_url && <AvatarImage src={f.avatar_url} alt="" />}
                          <AvatarFallback>{initials(f.display_name || f.username)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{f.display_name || f.username}</span>
                        {checked && <Check className="ml-auto h-4 w-4 text-primary" />}
                      </button>
                    );
                  })}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={busy || addPicks.length === 0}
                  onClick={addMembers}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add {addPicks.length || ""} to the chat
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {activeConv && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => togglePinned(activeConv.id)}
                  >
                    {isPinned(activeConv.id) ? (
                      <PinOff className="h-3.5 w-3.5" />
                    ) : (
                      <Pin className="h-3.5 w-3.5" />
                    )}
                    {isPinned(activeConv.id) ? "Unpin chat" : "Pin to top"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => toggleMuted(activeConv.id)}
                  >
                    <BellOff className="h-3.5 w-3.5" />
                    {isMuted(activeConv.id) ? "Unmute alerts" : "Mute alerts"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive"
              disabled={busy}
              onClick={leaveRoom}
            >
              <LogOut className="h-3.5 w-3.5" /> Leave chat
            </Button>
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupOpen} onOpenChange={setGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New group chat</DialogTitle>
            <DialogDescription>
              Pick the friends you want in the room and give it a name your crew will recognize.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={groupTitle}
              onChange={(e) => setGroupTitle(e.target.value)}
              placeholder="Group name (e.g. Saturday doubles crew)"
              className="h-9 text-sm"
            />
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
              {friends.map((f) => {
                const checked = groupPicks.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() =>
                      setGroupPicks((prev) =>
                        prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id],
                      )
                    }
                    aria-pressed={checked}
                    className={
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition hover:bg-muted/60 " +
                      (checked ? "bg-muted" : "")
                    }
                  >
                    <Avatar className="h-8 w-8">
                      {f.avatar_url && <AvatarImage src={f.avatar_url} alt="" />}
                      <AvatarFallback>{initials(f.display_name || f.username)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm">{f.display_name || f.username}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        @{f.username}
                      </div>
                    </div>
                    {checked && <Check className="ml-auto h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {groupPicks.length} selected · groups need at least two friends.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createGroup}
              disabled={busy || groupPicks.length < 2 || !groupTitle.trim()}
            >
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
