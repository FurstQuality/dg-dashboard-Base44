import type { SuggestionRow } from "@/lib/friend-suggestions";

/**
 * The `friend_suggestions` SQL function is SECURITY DEFINER and only executable
 * by service_role, so callers must verify the player's identity first and then
 * invoke it with the admin client.
 *
 * Location-based ranking only produces candidates when profiles share a city,
 * home course, state or club. Early on — or for players who haven't filled in
 * where they play — that leaves the list empty, so we top it up with the newest
 * players who aren't already connected to the caller.
 */
export async function fetchFriendSuggestions(
  userId: string,
  limit: number,
): Promise<SuggestionRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("friend_suggestions", {
    _user_id: userId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);
  const ranked = (data ?? []) as SuggestionRow[];
  if (ranked.length >= limit) return ranked;

  const excluded = new Set<string>([userId, ...ranked.map((r) => r.user_id)]);
  const [{ data: friendships }, { data: blocks }] = await Promise.all([
    supabaseAdmin
      .from("friendships")
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(1000),
    supabaseAdmin.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
  ]);
  (friendships ?? []).forEach((f) => {
    excluded.add(f.requester_id as string);
    excluded.add(f.addressee_id as string);
  });
  (blocks ?? []).forEach((b) => excluded.add(b.blocked_id as string));

  const { data: fresh } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, home_state")
    .not("display_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit + excluded.size + 24);

  const { data: mine } = await supabaseAdmin
    .from("profiles")
    .select("home_state")
    .eq("id", userId)
    .maybeSingle();
  const myState = (mine?.["home_state"] as string | null) ?? null;

  const extras: SuggestionRow[] = [];
  for (const p of (fresh ?? []) as Array<{ id: string; home_state: string | null }>) {
    if (excluded.has(p.id) || extras.length >= limit - ranked.length) continue;
    const sameState = !!myState && p.home_state === myState;
    extras.push({
      user_id: p.id,
      mutual_count: 0,
      shared_clubs: 0,
      same_city: false,
      same_home_course: false,
      same_state: sameState,
      score: sameState ? 5 : 1,
    });
  }
  return [...ranked, ...extras];
}
