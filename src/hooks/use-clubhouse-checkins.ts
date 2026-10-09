import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type CheckinStatus = "looking" | "playing" | "hanging";
export type Checkin = {
  user_id: string;
  room_key: string;
  status: CheckinStatus;
  display_name: string;
  avatar_url: string | null;
  checked_in_at: string;
  updated_at: string;
};

/** Check-ins older than this drop off the list so forgotten statuses don't linger. */
const STALE_MS = 12 * 60 * 60 * 1000;

/**
 * Who's checked in to a Clubhouse room. Being listed depends only on the saved
 * status row — opening or closing the page never checks anyone in or out.
 */
export function useClubhouseCheckins(roomKey: string, me: { userId: string; name: string; avatarUrl: string | null } | null, hiddenIds: Set<string>) {
  const [rows, setRows] = useState<Checkin[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - STALE_MS).toISOString();
    const { data } = await supabase
      .from("clubhouse_checkins")
      .select("*")
      .eq("room_key", roomKey)
      .gte("updated_at", since)
      .order("checked_in_at", { ascending: true })
      .limit(200);
    setRows((data ?? []) as Checkin[]);
    setLoaded(true);
  }, [roomKey]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`checkins:${roomKey}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clubhouse_checkins", filter: `room_key=eq.${roomKey}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [roomKey, load]);

  const mine = me ? rows.find((r) => r.user_id === me.userId) ?? null : null;

  const setStatus = useCallback(async (status: CheckinStatus) => {
    if (!me) return false;
    const now = new Date().toISOString();
    const { error } = await supabase.from("clubhouse_checkins").upsert(
      { user_id: me.userId, room_key: roomKey, status, display_name: me.name.slice(0, 80), avatar_url: me.avatarUrl, updated_at: now, ...(mine ? {} : { checked_in_at: now }) },
      { onConflict: "user_id,room_key" },
    );
    await load();
    return !error;
  }, [me, roomKey, mine, load]);

  const leave = useCallback(async () => {
    if (!me) return false;
    const { error } = await supabase.from("clubhouse_checkins").delete().eq("user_id", me.userId).eq("room_key", roomKey);
    await load();
    return !error;
  }, [me, roomKey, load]);

  const visible = rows.filter((r) => !hiddenIds.has(r.user_id));
  return { checkins: visible, mine, loaded, setStatus, leave };
}
