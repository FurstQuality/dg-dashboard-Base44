import { supabase } from "@/integrations/supabase/client";

/**
 * DGIM (Disc Golf Instant Messenger) data layer.
 * Shares the same conversation tables as DG Dashboard messaging, and adds
 * event rooms linked to a tournament, league, or community event.
 */

export type DgimProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type DgimEventKind = "tournament" | "league" | "community" | "club";

export type DgimConversation = {
  id: string;
  is_group: boolean;
  title: string | null;
  last_message_at: string;
  event_kind: DgimEventKind | null;
  event_id: string | null;
  preview: string | null;
  preview_sender: string | null;
  preview_announcement: boolean;
  unread: number;
  other: DgimProfile | null;
  other_last_read_at: string | null;
  created_by: string | null;
  member_count: number;
};

export type DgimMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  created_at: string;
  is_announcement: boolean;
  pending?: boolean;
};

export type DgimEventRef = {
  kind: DgimEventKind;
  id: string;
  name: string;
  startsAt: string | null;
  isOrganizer: boolean;
};

const PROFILE_COLS = "id, username, display_name, avatar_url";

export async function loadDgimFriends(userId: string): Promise<DgimProfile[]> {
  const { data: fs } = await supabase
    .from("friendships")
    .select("requester_id, addressee_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  const ids = Array.from(
    new Set((fs ?? []).map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id))),
  );
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .in("id", ids)
    .order("display_name");
  return (data ?? []) as DgimProfile[];
}

export async function loadDgimInbox(userId: string): Promise<DgimConversation[]> {
  const { data: members } = await supabase
    .from("conversation_members")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  const convIds = (members ?? []).map((m) => m.conversation_id);
  if (convIds.length === 0) return [];
  const lastReadByConv = new Map<string, string | null>();
  (members ?? []).forEach((m) => lastReadByConv.set(m.conversation_id, m.last_read_at ?? null));

  const { data: cs } = await supabase
    .from("conversations")
    .select("id, is_group, title, last_message_at, event_kind, event_id, created_by")
    .in("id", convIds)
    .order("last_message_at", { ascending: false });
  if (!cs) return [];

  const { data: allMembers } = await supabase
    .from("conversation_members")
    .select("conversation_id, user_id, last_read_at")
    .in("conversation_id", convIds);
  const memberCountByConv = new Map<string, number>();
  const otherByConv = new Map<string, string>();
  const otherReadByConv = new Map<string, string | null>();
  (allMembers ?? []).forEach((m) => {
    memberCountByConv.set(m.conversation_id, (memberCountByConv.get(m.conversation_id) ?? 0) + 1);
    if (m.user_id !== userId) {
      otherByConv.set(m.conversation_id, m.user_id);
      otherReadByConv.set(m.conversation_id, m.last_read_at ?? null);
    }
  });
  const otherIds = [...new Set(otherByConv.values())];
  const { data: profs } = otherIds.length
    ? await supabase.from("profiles").select(PROFILE_COLS).in("id", otherIds)
    : { data: [] as DgimProfile[] };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p as DgimProfile]));

  const { data: latest } = await supabase
    .from("messages")
    .select("conversation_id, body, created_at, sender_id, is_announcement")
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(500);
  const previewByConv = new Map<
    string,
    { body: string | null; created_at: string; sender_id: string; is_announcement: boolean }
  >();
  const unreadByConv = new Map<string, number>();
  (latest ?? []).forEach((m) => {
    if (!previewByConv.has(m.conversation_id)) previewByConv.set(m.conversation_id, m);
    const lr = lastReadByConv.get(m.conversation_id);
    if (m.sender_id !== userId && (!lr || new Date(m.created_at) > new Date(lr))) {
      unreadByConv.set(m.conversation_id, (unreadByConv.get(m.conversation_id) ?? 0) + 1);
    }
  });

  return cs.map((c) => {
    const prev = previewByConv.get(c.id);
    return {
      id: c.id,
      is_group: c.is_group,
      title: c.title,
      last_message_at: c.last_message_at,
      event_kind: (c.event_kind as DgimEventKind | null) ?? null,
      event_id: c.event_id ?? null,
      preview: prev?.body ?? null,
      preview_sender: prev?.sender_id ?? null,
      preview_announcement: prev?.is_announcement ?? false,
      unread: unreadByConv.get(c.id) ?? 0,
      other: c.is_group ? null : (profMap.get(otherByConv.get(c.id) ?? "") ?? null),
      other_last_read_at: otherReadByConv.get(c.id) ?? null,
      created_by: (c as { created_by?: string | null }).created_by ?? null,
      member_count: memberCountByConv.get(c.id) ?? 1,
    };
  });
}

/** Tournaments, leagues, and community events the player runs or is signed up for. */
export async function loadDgimEvents(userId: string): Promise<DgimEventRef[]> {
  const [ownedT, ownedL, regT, regL, rsvps, ownedC, clubMemberships, ownedClubs] = await Promise.all([
    supabase.from("tournaments").select("id, name, start_date").eq("owner_id", userId),
    supabase.from("leagues").select("id, name, start_date").eq("owner_id", userId),
    supabase.from("tournament_registrations").select("tournament_id").eq("user_id", userId),
    supabase.from("league_registrations").select("league_id").eq("user_id", userId),
    supabase.from("event_rsvps").select("event_id").eq("user_id", userId),
    supabase.from("community_events").select("id, title, starts_at").eq("host_id", userId),
    supabase.from("club_members").select("club_id, role").eq("user_id", userId),
    supabase.from("clubs").select("id, name").eq("owner_id", userId),
  ]);

  const out = new Map<string, DgimEventRef>();
  const put = (ref: DgimEventRef) => {
    const key = `${ref.kind}:${ref.id}`;
    const existing = out.get(key);
    if (existing) {
      if (ref.isOrganizer) existing.isOrganizer = true;
      return;
    }
    out.set(key, ref);
  };

  (ownedT.data ?? []).forEach((t) =>
    put({
      kind: "tournament",
      id: t.id,
      name: t.name,
      startsAt: t.start_date ?? null,
      isOrganizer: true,
    }),
  );
  (ownedL.data ?? []).forEach((l) =>
    put({
      kind: "league",
      id: l.id,
      name: l.name,
      startsAt: l.start_date ?? null,
      isOrganizer: true,
    }),
  );
  (ownedC.data ?? []).forEach((e) =>
    put({
      kind: "community",
      id: e.id,
      name: e.title,
      startsAt: e.starts_at ?? null,
      isOrganizer: true,
    }),
  );

  (ownedClubs.data ?? []).forEach((c) =>
    put({ kind: "club", id: c.id, name: c.name, startsAt: null, isOrganizer: true }),
  );

  const memberClubIds = [...new Set((clubMemberships.data ?? []).map((m) => m.club_id))];
  const clubRoleById = new Map(
    (clubMemberships.data ?? []).map((m) => [m.club_id, m.role as string | null]),
  );
  if (memberClubIds.length) {
    const { data: clubRows } = await supabase
      .from("clubs")
      .select("id, name")
      .in("id", memberClubIds);
    (clubRows ?? []).forEach((c) => {
      const role = clubRoleById.get(c.id);
      put({
        kind: "club",
        id: c.id,
        name: c.name,
        startsAt: null,
        isOrganizer: role === "owner" || role === "admin",
      });
    });
  }

  const tIds = [...new Set((regT.data ?? []).map((r) => r.tournament_id))];
  const lIds = [...new Set((regL.data ?? []).map((r) => r.league_id))];
  const cIds = [...new Set((rsvps.data ?? []).map((r) => r.event_id))];

  const [tRows, lRows, cRows] = await Promise.all([
    tIds.length
      ? supabase.from("tournaments").select("id, name, start_date").in("id", tIds)
      : Promise.resolve({ data: [] as { id: string; name: string; start_date: string | null }[] }),
    lIds.length
      ? supabase.from("leagues").select("id, name, start_date").in("id", lIds)
      : Promise.resolve({ data: [] as { id: string; name: string; start_date: string | null }[] }),
    cIds.length
      ? supabase.from("community_events").select("id, title, starts_at").in("id", cIds)
      : Promise.resolve({ data: [] as { id: string; title: string; starts_at: string | null }[] }),
  ]);

  (tRows.data ?? []).forEach((t) =>
    put({
      kind: "tournament",
      id: t.id,
      name: t.name,
      startsAt: t.start_date ?? null,
      isOrganizer: false,
    }),
  );
  (lRows.data ?? []).forEach((l) =>
    put({
      kind: "league",
      id: l.id,
      name: l.name,
      startsAt: l.start_date ?? null,
      isOrganizer: false,
    }),
  );
  (cRows.data ?? []).forEach((e) =>
    put({
      kind: "community",
      id: e.id,
      name: e.title,
      startsAt: e.starts_at ?? null,
      isOrganizer: false,
    }),
  );

  return [...out.values()].sort((a, b) => {
    const at = a.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bt = b.startsAt ? new Date(b.startsAt).getTime() : 0;
    return bt - at;
  });
}

/** Join (creating on first use) the shared chat room for an event. */
export async function joinDgimEventChat(kind: DgimEventKind, eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc("dgim_join_event_chat", {
    _kind: kind,
    _event: eventId,
  });
  if (error) throw error;
  if (!data) throw new Error("That event chat isn't available yet.");
  return data as string;
}

export async function openDgimDirect(userId: string, otherId: string): Promise<string> {
  if (userId === otherId) throw new Error("You can't message yourself.");
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);
  const myIds = (mine ?? []).map((m) => m.conversation_id);
  if (myIds.length) {
    const { data: theirs } = await supabase
      .from("conversation_members")
      .select("conversation_id")
      .eq("user_id", otherId)
      .in("conversation_id", myIds);
    const overlap = (theirs ?? []).map((m) => m.conversation_id);
    if (overlap.length) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .in("id", overlap)
        .eq("is_group", false)
        .is("event_kind", null)
        .limit(1)
        .maybeSingle();
      if (conv) return conv.id;
    }
  }
  const { data: blockReason } = await supabase.rpc("contact_block_reason", { _target: otherId, _kind: "message" });
  if (blockReason) throw new Error(blockReason);
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ is_group: false, created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  const { error: memberError } = await supabase.from("conversation_members").insert([
    { conversation_id: created.id, user_id: userId },
    { conversation_id: created.id, user_id: otherId },
  ]);
  if (memberError) throw new Error(memberError.message);
  return created.id;
}

/**
 * Create a group chat from a set of friends. The creator is always a member.
 * Membership rows are inserted for every participant so RLS lets them read it.
 */
export async function createDgimGroup(
  userId: string,
  memberIds: string[],
  title: string,
): Promise<string> {
  const others = [...new Set(memberIds.filter((id) => id && id !== userId))];
  if (others.length < 2) throw new Error("Pick at least two friends for a group chat.");
  const name = title.trim();
  if (!name) throw new Error("Give your group chat a name.");
  const { data: created, error } = await supabase
    .from("conversations")
    .insert({ is_group: true, created_by: userId, title: name })
    .select("id")
    .single();
  if (error) throw error;
  const { error: memberError } = await supabase
    .from("conversation_members")
    .insert([userId, ...others].map((id) => ({ conversation_id: created.id, user_id: id })));
  if (memberError) throw memberError;
  return created.id;
}


export type DgimMember = DgimProfile & { last_read_at: string | null };

/** Everyone in a room, with the profile details the messenger shows. */
export async function loadConversationMembers(conversationId: string): Promise<DgimMember[]> {
  const { data: members } = await supabase
    .from("conversation_members")
    .select("user_id, last_read_at")
    .eq("conversation_id", conversationId);
  const ids = (members ?? []).map((m) => m.user_id);
  if (ids.length === 0) return [];
  const { data: profs } = await supabase
    .from("profiles")
    .select(PROFILE_COLS)
    .in("id", ids)
    .order("display_name");
  const readById = new Map((members ?? []).map((m) => [m.user_id, m.last_read_at ?? null]));
  return (profs ?? []).map((p) => ({
    ...(p as DgimProfile),
    last_read_at: readById.get((p as DgimProfile).id) ?? null,
  }));
}

/** Rename a group chat. Event and club rooms keep the name of the event they belong to. */
export async function renameConversation(conversationId: string, title: string): Promise<void> {
  const name = title.trim();
  if (!name) throw new Error("Give the chat a name first.");
  const { error } = await supabase
    .from("conversations")
    .update({ title: name })
    .eq("id", conversationId);
  if (error) throw error;
}

/** Add friends to a group chat. Only the player who started the room can add people. */
export async function addConversationMembers(
  conversationId: string,
  memberIds: string[],
): Promise<void> {
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Pick at least one friend to add.");
  const { error } = await supabase
    .from("conversation_members")
    .insert(ids.map((id) => ({ conversation_id: conversationId, user_id: id })));
  if (error) throw error;
}

/** Leave a group, event, or club room. */
export async function leaveConversation(conversationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Unsend one of your own messages. */
export async function unsendMessage(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("sender_id", userId);
  if (error) throw error;
}

export function conversationLabel(c: DgimConversation): string {
  if (c.event_kind) return c.title ?? (c.event_kind === "club" ? "Club chat" : "Event chat");
  if (c.other) return c.other.display_name || c.other.username;
  return c.title ?? "Group chat";
}

export function eventKindLabel(kind: DgimEventKind): string {
  if (kind === "tournament") return "Tournament";
  if (kind === "league") return "League";
  if (kind === "club") return "Club";
  return "Event";
}
