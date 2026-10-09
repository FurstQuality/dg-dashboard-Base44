import { supabase } from "@/integrations/supabase/client";

export type ManageableClub = {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
};

/**
 * Clubs the player may publish as — owner or admin only.
 * The database re-checks this on insert, so this list is UI convenience, not the guard.
 */
export async function fetchManageableClubs(userId: string | null): Promise<ManageableClub[]> {
  if (!userId) return [];
  const [ownedRes, adminRes] = await Promise.all([
    supabase.from("clubs").select("id, name, slug, avatar_url").eq("owner_id", userId).limit(50),
    supabase
      .from("club_members")
      .select("clubs:club_id(id, name, slug, avatar_url)")
      .eq("user_id", userId)
      .in("role", ["owner", "admin"])
      .limit(50),
  ]);

  const byId = new Map<string, ManageableClub>();
  for (const c of ownedRes.data ?? []) byId.set(c.id, c as ManageableClub);
  for (const row of (adminRes.data ?? []) as Array<{ clubs: ManageableClub | null }>) {
    if (row.clubs) byId.set(row.clubs.id, row.clubs);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
