import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { matchesOmnisearch } from "@/lib/omnisearch";
import { useSession, initials } from "@/lib/current-user";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Sparkles,
  Search,
  Clock,
  X,
  Users2,
  Share2,
  Contact2,
  MapPin,
  MessageCircle,
  Route as RouteIcon,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { ContactSyncPanel } from "@/components/community/contact-sync-panel";
import { InviteSharePanel } from "@/components/community/invite-share-panel";
import { PdgaFriendFinder } from "@/components/community/pdga-friend-finder";
import { CrewInvitePanel } from "@/components/community/crew-invite-panel";
import { CrewList } from "@/components/community/crew-list";
import { pushToUser } from "@/lib/push.functions";
import { openDirectConversation } from "@/lib/messaging";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addPdgaFriend } from "@/lib/pdga-friends.functions";
import { ShareToFeedButton } from "@/components/feed/share-to-feed-button";
import { crewDraft } from "@/lib/share-to-feed";
import {
  getFriendsHub,
  searchPlayers,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendship,
  cancelPdgaInvite,
  type FriendProfileLite,
  type FriendshipRow,
} from "@/lib/friends.functions";
import { communityKeys, COMMUNITY_STALE } from "@/lib/community-queries";
import { suggestionReason } from "@/lib/friend-suggestions";

type ProfileLite = FriendProfileLite;
type Friendship = FriendshipRow;

type TabKey = "friends" | "requests" | "discover" | "crews" | "invite";

export function FriendsHub() {
  const { user } = useSession();
  const uid = user?.id ?? null;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function openDm(otherId: string) {
    if (!uid) return;
    const convId = await openDirectConversation(uid, otherId);
    if (convId) navigate({ to: "/dgim", search: { conv: convId } });
  }

  const fetchHub = useServerFn(getFriendsHub);
  const pageQuery = useQuery({
    queryKey: communityKeys.friendsHub(uid),
    enabled: !!uid,
    staleTime: COMMUNITY_STALE.short,
    queryFn: () => fetchHub(),
  });
  const loading = pageQuery.isPending && !!uid;
  const rows = pageQuery.data?.rows ?? [];
  const profiles = pageQuery.data?.profiles ?? {};
  const suggestions = pageQuery.data?.suggestions ?? [];
  const externalInvites = pageQuery.data?.externalInvites ?? [];
  const mutuals = pageQuery.data?.mutuals ?? {};

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: communityKeys.friendsHub(uid) });

  const addByPdgaFn = useServerFn(addPdgaFriend);
  const [pdgaQ, setPdgaQ] = useState("");
  const [pdgaBusy, setPdgaBusy] = useState(false);

  async function addByPdga() {
    const num = pdgaQ.replace(/\D/g, "");
    if (!num) return toast.error("Enter a PDGA number");
    setPdgaBusy(true);
    try {
      const res = await addByPdgaFn({ data: { pdgaNumber: num } });
      if (res.kind === "friend_request_sent") {
        toast.success("Friend request sent — they're already on DG Dashboard.");
      } else if (res.kind === "already_related") {
        toast.info("You're already connected with this player.");
      } else if (res.kind === "self") {
        toast.info("That's your own PDGA number.");
      } else {
        toast.success("Added as a placeholder friend until they join.");
      }
      setPdgaQ("");
      void invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "PDGA lookup failed");
    } finally {
      setPdgaBusy(false);
    }
  }

  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileLite[]>([]);
  const [friendQ, setFriendQ] = useState("");
  const [tab, setTab] = useState<TabKey>(() => {
    if (typeof window === "undefined") return "friends";
    const t = new URLSearchParams(window.location.search).get("tab");
    const valid: TabKey[] = ["friends", "requests", "discover", "crews", "invite"];
    return valid.includes(t as TabKey) ? (t as TabKey) : "friends";
  });

  // Set default tab to requests when there are incoming ones on first load.
  const incomingCount = useMemo(
    () => rows.filter((r) => r.status === "pending" && r.addressee_id === uid).length,
    [rows, uid],
  );
  useEffect(() => {
    if (loading) return;
    if (incomingCount > 0 && tab === "friends") setTab("requests");
    if (incomingCount === 0 && rows.some((r) => r.status === "pending" && r.requester_id === uid))
      setReqTab("sent");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const [reqTab, setReqTab] = useState<"received" | "sent" | "external">("received");

  const searchPlayersFn = useServerFn(searchPlayers);
  const sendRequestFn = useServerFn(sendFriendRequest);
  const respondFn = useServerFn(respondToFriendRequest);
  const removeFriendshipFn = useServerFn(removeFriendship);
  const cancelInviteFn = useServerFn(cancelPdgaInvite);

  useEffect(() => {
    if (!searchQ.trim() || !uid) {
      setSearchResults([]);
      return;
    }
    const q = searchQ.trim();
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await searchPlayersFn({ data: { q } });
        if (!cancelled) setSearchResults(results as ProfileLite[]);
      } catch {
        if (!cancelled) setSearchResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, uid]);

  const friends = useMemo(() => rows.filter((r) => r.status === "accepted"), [rows]);
  const incoming = useMemo(
    () => rows.filter((r) => r.status === "pending" && r.addressee_id === uid),
    [rows, uid],
  );
  const outgoing = useMemo(
    () => rows.filter((r) => r.status === "pending" && r.requester_id === uid),
    [rows, uid],
  );

  const filteredFriends = useMemo(() => {
    const q = friendQ.trim().toLowerCase();
    return friends.filter((f) => {
      const otherId = f.requester_id === uid ? f.addressee_id : f.requester_id;
      const p = profiles[otherId];
      if (!p) return false;
      return matchesOmnisearch(p, q, [f]);
    });
  }, [friends, friendQ, profiles, uid]);

  const filteredPlaceholders = useMemo(() => {
    const q = friendQ.trim().toLowerCase();
    if (!q) return externalInvites;
    return externalInvites.filter((inv) =>
      `${inv.display_name ?? ""} ${inv.pdga_number} ${inv.location ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [externalInvites, friendQ]);

  const relByUser = useMemo(() => {
    const m = new Map<string, Friendship>();
    rows.forEach((r) => {
      const other = r.requester_id === uid ? r.addressee_id : r.requester_id;
      m.set(other, r);
    });
    return m;
  }, [rows, uid]);

  async function sendRequest(target: string) {
    if (!uid) return;
    try {
      const res = await sendRequestFn({ data: { targetId: target } });
      if (res.kind === "already_related") toast.info("You're already connected with this player.");
      else toast.success("Friend request sent");
      void invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't send that request");
    }
  }

  async function respond(id: string, accept: boolean, actorId?: string) {
    try {
      const res = await respondFn({ data: { id, accept } });
      const notifyId = actorId ?? res.requesterId;
      if (accept && notifyId) {
        void pushToUser({
          data: {
            userId: notifyId,
            title: "Friend request accepted",
            body: "You're now connected on DG Dashboard.",
            url: "/friends",
            tag: "friend_accept",
          },
        }).catch(() => {});
      }
      toast.success(accept ? "Friend added" : "Request declined");
      void invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't update that request");
    }
  }

  async function removeRel(id: string, label = "Removed") {
    try {
      await removeFriendshipFn({ data: { id } });
      toast.success(label);
      void invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove that connection");
    }
  }

  async function cancelExternalInvite(id: string) {
    try {
      await cancelInviteFn({ data: { id } });
      toast.success("Invite cancelled");
      void invalidate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel that invite");
    }
  }

  async function shareExternalInvite(token: string, name: string | null, pdga: string) {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/pdga/${encodeURIComponent(token)}`;
    const text = `${name ?? `PDGA #${pdga}`} — join me on DG Dashboard. ${url}`;
    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & { share?: (d: ShareData) => Promise<void> })
        : null;
    if (nav?.share) {
      try {
        await nav.share({ title: "DG Dashboard invite", text, url });
      } catch {
        /* cancel */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  if (!uid) return null;

  const totalPending = incoming.length + outgoing.length + externalInvites.length;
  const headerActions = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setTab("discover")}>
        <Search className="mr-1.5 h-3.5 w-3.5" /> Find players
      </Button>
      <Button size="sm" variant="outline" onClick={() => setTab("invite")}>
        <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite friends
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link to="/tracker">
          <RouteIcon className="mr-1.5 h-3.5 w-3.5" /> Tournament Tracker
        </Link>
      </Button>
      <ShareToFeedButton
        draft={() => crewDraft({ friendCount: friends.length })}
        label="Share crew"
        size="sm"
        variant="outline"
      />
      <Button asChild size="sm" variant="outline">
        <Link to="/settings/imports">
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Import & sync
        </Link>
      </Button>
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {`${friends.length} friend${friends.length === 1 ? "" : "s"}${incoming.length ? ` · ${incoming.length} pending` : ""}${outgoing.length ? ` · ${outgoing.length} sent` : ""}`}
          </p>
          {headerActions}
        </div>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
          {/* Main column */}
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="w-full">
              <TabsList className="sticky top-14 z-10 flex h-auto w-full flex-wrap justify-start gap-1 backdrop-blur md:grid md:grid-cols-5">
                <TabsTrigger value="friends" className="shrink-0 whitespace-nowrap">
                  Friends {friends.length ? <CountBadge value={friends.length} /> : null}
                </TabsTrigger>
                <TabsTrigger value="requests" className="shrink-0 whitespace-nowrap">
                  Requests{" "}
                  {totalPending ? (
                    <CountBadge value={totalPending} accent={incoming.length > 0} />
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value="discover" className="shrink-0 whitespace-nowrap">
                  Discover
                </TabsTrigger>
                <TabsTrigger value="crews" className="shrink-0 whitespace-nowrap">
                  <Users2 className="mr-1 h-3.5 w-3.5" /> Crews
                </TabsTrigger>

                <TabsTrigger value="invite" className="shrink-0 whitespace-nowrap">
                  Invite
                </TabsTrigger>
              </TabsList>

              {/* FRIENDS */}
              <TabsContent value="friends" className="mt-4 space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={friendQ}
                    onChange={(e) => setFriendQ(e.target.value)}
                    placeholder="Search your friends"
                    className="pl-8"
                  />
                </div>

                <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
                  <div className="min-w-[160px] flex-1">
                    <label
                      htmlFor="friend-pdga"
                      className="mb-1 block text-xs font-semibold uppercase text-muted-foreground"
                    >
                      Add by PDGA number
                    </label>
                    <Input
                      id="friend-pdga"
                      inputMode="numeric"
                      value={pdgaQ}
                      onChange={(e) => setPdgaQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void addByPdga();
                      }}
                      placeholder="e.g. 249285"
                    />
                  </div>
                  <Button size="sm" disabled={pdgaBusy} onClick={() => void addByPdga()}>
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />{" "}
                    {pdgaBusy ? "Looking up…" : "Add player"}
                  </Button>
                  <p className="w-full text-xs text-muted-foreground">
                    Already on DG Dashboard → sends a friend request. Not yet here → they're saved
                    as a placeholder friend and become a real connection automatically once they
                    join and link that PDGA number.
                  </p>
                </div>

                {loading ? (
                  <EmptyBlock title="Loading friends…" />
                ) : friends.length === 0 && externalInvites.length === 0 ? (
                  <EmptyBlock
                    title="Your DG Dashboard crew starts here"
                    body="Connect with cardmates, local players, club members, and people you meet at events."
                    actions={
                      <>
                        <Button size="sm" onClick={() => setTab("discover")}>
                          <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Discover players
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTab("invite")}>
                          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Invite someone
                        </Button>
                      </>
                    }
                  />
                ) : filteredFriends.length === 0 && filteredPlaceholders.length === 0 ? (
                  <EmptyBlock title="No friends match your search." />
                ) : filteredFriends.length === 0 ? null : (
                  <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                    {filteredFriends.map((f) => {
                      const otherId = f.requester_id === uid ? f.addressee_id : f.requester_id;
                      const p = profiles[otherId];
                      return (
                        <FriendRow key={f.id} profile={p} sub={p?.home_course ?? undefined}>
                          <Button size="sm" variant="outline" onClick={() => openDm(otherId)}>
                            <MessageCircle className="mr-1 h-3.5 w-3.5" /> Message
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => removeRel(f.id, "Removed friend")}
                          >
                            <UserX className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        </FriendRow>
                      );
                    })}
                  </ul>
                )}

                {!loading && filteredPlaceholders.length > 0 ? (
                  <section className="pt-2">
                    <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Placeholder friends · {filteredPlaceholders.length}
                    </h2>
                    <ul className="divide-y divide-border rounded-xl border border-dashed border-border bg-card">
                      {filteredPlaceholders.map((inv) => (
                        <li key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                            #{inv.pdga_number.slice(-3)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {inv.display_name ?? `PDGA #${inv.pdga_number}`}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              PDGA #{inv.pdga_number}
                              {inv.pdga_rating ? ` · ${inv.pdga_rating} rated` : ""}
                              {inv.location ? ` · ${inv.location}` : ""} · Not on DG Dashboard yet
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              shareExternalInvite(
                                inv.invite_token,
                                inv.display_name,
                                inv.pdga_number,
                              )
                            }
                          >
                            <Share2 className="mr-1 h-3.5 w-3.5" /> Invite
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => cancelExternalInvite(inv.id)}
                          >
                            <UserX className="mr-1 h-3.5 w-3.5" /> Remove
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {friends.length === 0 && suggestions.length > 0 && !loading ? (
                  <section className="pt-2">
                    <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Players you may know
                    </h2>
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                      {suggestions.slice(0, 5).map((s) => (
                        <FriendRow
                          key={s.user_id}
                          profile={profiles[s.user_id]}
                          sub={suggestionReason(s) ?? "New player on DG Dashboard"}
                        >
                          <Button size="sm" onClick={() => sendRequest(s.user_id)}>
                            <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
                          </Button>
                        </FriendRow>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </TabsContent>

              {/* REQUESTS */}
              <TabsContent value="requests" className="mt-4 space-y-4">
                <Tabs
                  value={reqTab}
                  onValueChange={(v) => setReqTab(v as "received" | "sent" | "external")}
                  className="w-full"
                >
                  <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 md:grid md:grid-cols-3">
                    <TabsTrigger value="received" className="shrink-0 whitespace-nowrap">
                      Received{" "}
                      {incoming.length ? <CountBadge value={incoming.length} accent /> : null}
                    </TabsTrigger>
                    <TabsTrigger value="sent" className="shrink-0 whitespace-nowrap">
                      Sent {outgoing.length ? <CountBadge value={outgoing.length} /> : null}
                    </TabsTrigger>
                    <TabsTrigger value="external" className="shrink-0 whitespace-nowrap">
                      Not here yet{" "}
                      {externalInvites.length ? (
                        <CountBadge value={externalInvites.length} />
                      ) : null}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="received" className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Players waiting on your answer. Requests stay here until you accept or
                      decline.
                    </p>
                    {incoming.length === 0 ? (
                      <EmptyBlock
                        title="You're all caught up"
                        body="There are no requests waiting for you."
                      />
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                        {incoming.map((f) => (
                          <FriendRow
                            key={f.id}
                            profile={profiles[f.requester_id]}
                            sub="Sent you a request"
                          >
                            <Button size="sm" onClick={() => respond(f.id, true, f.requester_id)}>
                              <UserCheck className="mr-1 h-3.5 w-3.5" /> Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => respond(f.id, false)}
                            >
                              <X className="mr-1 h-3.5 w-3.5" /> Decline
                            </Button>
                          </FriendRow>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                  <TabsContent value="sent" className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Requests you sent. They stay pending until the other player accepts — cancel
                      any time.
                    </p>
                    {outgoing.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No outstanding invites — you're all caught up.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                        {outgoing.map((f) => (
                          <FriendRow
                            key={f.id}
                            profile={profiles[f.addressee_id]}
                            sub="Awaiting response"
                          >
                            <span className="mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" /> Pending
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeRel(f.id, "Request cancelled")}
                            >
                              Cancel
                            </Button>
                          </FriendRow>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                  <TabsContent value="external" className="mt-4 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Invites to players who aren't on DG Dashboard yet. They become real friends
                      once they join and link that PDGA number.
                    </p>
                    {externalInvites.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Invites to players who aren't on DG Dashboard yet will appear here.
                      </p>
                    ) : (
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                        {externalInvites.map((inv) => (
                          <li key={inv.id} className="flex items-center gap-3 p-3">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                              #{inv.pdga_number.slice(-3)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">
                                {inv.display_name ?? `PDGA #${inv.pdga_number}`}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                PDGA #{inv.pdga_number} · Not on DG Dashboard yet
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                shareExternalInvite(
                                  inv.invite_token,
                                  inv.display_name,
                                  inv.pdga_number,
                                )
                              }
                            >
                              <Share2 className="mr-1 h-3.5 w-3.5" /> Share link
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelExternalInvite(inv.id)}
                            >
                              Cancel
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              {/* DISCOVER */}
              <TabsContent value="discover" className="mt-4 space-y-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search by name, @username, city, or club"
                    className="pl-8"
                  />
                </div>

                {searchQ.trim().length > 0 ? (
                  searchResults.length === 0 ? (
                    <EmptyBlock
                      title="No matching players."
                      body="Try a different name, username, or location."
                    />
                  ) : (
                    <section>
                      <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        Results
                      </h2>
                      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                        {searchResults.map((p) => {
                          const rel = relByUser.get(p.id);
                          return (
                            <FriendRow key={p.id} profile={p} sub={p.home_course ?? undefined}>
                              {!rel ? (
                                <Button size="sm" onClick={() => sendRequest(p.id)}>
                                  <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
                                </Button>
                              ) : rel.status === "accepted" ? (
                                <span className="inline-flex items-center gap-1 text-xs text-primary">
                                  <UserCheck className="h-3.5 w-3.5" /> Friends
                                </span>
                              ) : rel.requester_id === uid ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => removeRel(rel.id, "Request cancelled")}
                                >
                                  Cancel
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => respond(rel.id, true, rel.requester_id)}
                                >
                                  Accept
                                </Button>
                              )}
                            </FriendRow>
                          );
                        })}
                      </ul>
                    </section>
                  )
                ) : (
                  <>
                    <section>
                      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" /> Players you may know
                      </h2>
                      {suggestions.length === 0 ? (
                        <EmptyBlock
                          title="No suggestions yet"
                          body="Play a round, join a tournament, or sync contacts to unlock recommendations."
                        />
                      ) : (
                        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                          {suggestions.map((s) => (
                            <FriendRow
                              key={s.user_id}
                              profile={profiles[s.user_id]}
                              sub={suggestionReason(s) ?? "New player on DG Dashboard"}
                            >
                              <Button size="sm" onClick={() => sendRequest(s.user_id)}>
                                <UserPlus className="mr-1 h-3.5 w-3.5" /> Add
                              </Button>
                            </FriendRow>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section>
                      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" /> Look up a specific player
                      </h2>
                      <PdgaFriendFinder />
                    </section>
                  </>
                )}
              </TabsContent>

              {/* CREWS */}
              <TabsContent value="crews" className="mt-4 space-y-3">
                <div className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Users2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Crews are saved groups you regularly play, travel, or compete with. Add friends
                    here or share invite links with players who aren't on DG Dashboard yet.
                  </span>
                </div>
                <CrewList />
                <CrewInvitePanel />
              </TabsContent>

              {/* INVITE */}
              <TabsContent value="invite" className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <h2 className="mb-1 text-sm font-semibold">Search or invite directly</h2>
                    <p className="mb-3 text-xs text-muted-foreground">
                      Find a player by PDGA number, name, or username.
                    </p>
                    <PdgaFriendFinder />
                  </div>
                  <InviteSharePanel
                    url={typeof window !== "undefined" ? window.location.origin : ""}
                    title="Add me on DG Dashboard"
                    message="I'm on DG Dashboard — join me for rounds, tournaments, and leagues."
                  />
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Contact2 className="h-4 w-4 text-primary" />
                    <h2 className="text-sm font-semibold">Find people you already know</h2>
                  </div>
                  <p className="mb-3 text-xs text-muted-foreground">
                    DG Dashboard can privately check your contacts for existing players. Your raw
                    contact details are not uploaded or stored.
                  </p>
                  <ContactSyncPanel />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Right sidebar — compact, non-repeating */}
          <aside className="hidden space-y-3 md:block">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Share2 className="h-4 w-4 text-primary" /> Grow your network
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Share your profile or sync contacts to find familiar players fast.
              </p>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => setTab("invite")}>
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share profile
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("invite")}>
                  <Contact2 className="mr-1.5 h-3.5 w-3.5" /> Sync contacts
                </Button>
                <Button size="sm" variant="outline" onClick={() => setTab("crews")}>
                  <Users2 className="mr-1.5 h-3.5 w-3.5" /> Manage crews
                </Button>
              </div>
            </div>

            {suggestions.length > 0 ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-primary" /> Suggested for you
                </h3>
                <ul className="-mx-1 space-y-1">
                  {suggestions.slice(0, 3).map((s) => {
                    const p = profiles[s.user_id];
                    if (!p) return null;
                    return (
                      <li
                        key={s.user_id}
                        className="flex items-center gap-2 rounded-lg px-1 py-1.5"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          {p.avatar_url ? <AvatarImage src={p.avatar_url} /> : null}
                          <AvatarFallback className="text-[10px]">
                            {initials(p.display_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <Link
                            to="/u/$username"
                            params={{ username: p.username }}
                            className="block truncate text-xs font-medium hover:underline"
                          >
                            {p.display_name}
                          </Link>
                          <div className="truncate text-[10px] text-muted-foreground">
                            {suggestionReason(s) ?? "New player"}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => sendRequest(s.user_id)}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-1 w-full"
                  onClick={() => setTab("discover")}
                >
                  See all
                </Button>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function CountBadge({ value, accent }: { value: number; accent?: boolean }) {
  return (
    <span
      className={
        "ml-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold " +
        (accent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")
      }
    >
      {value}
    </span>
  );
}

function EmptyBlock({
  title,
  body,
  actions,
}: {
  title: string;
  body?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <p className="text-sm font-medium">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{body}</p> : null}
      {actions ? <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

function FriendRow({
  profile,
  sub,
  children,
}: {
  profile: ProfileLite | undefined;
  sub?: string;
  children: React.ReactNode;
}) {
  if (!profile) {
    return (
      <li className="flex items-center gap-3 p-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />
        <div className="min-w-0 flex-1 text-sm text-muted-foreground">Looking up player…</div>
      </li>
    );
  }
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 p-3">
      <Link to="/u/$username" params={{ username: profile.username }} className="shrink-0">
        <Avatar className="h-11 w-11">
          {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
          <AvatarFallback>{initials(profile.display_name)}</AvatarFallback>
        </Avatar>
      </Link>
      <div className="min-w-0">
        <Link
          to="/u/$username"
          params={{ username: profile.username }}
          className="block truncate text-sm font-semibold hover:underline"
        >
          {profile.display_name}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          @{profile.username}
          {profile.pdga_rating ? ` · ${profile.pdga_rating} rated` : ""}
          {sub ? ` · ${sub}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}
