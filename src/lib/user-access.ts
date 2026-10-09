import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import type { UserAccess } from "@/components/dashboard/types";

/**
 * Lightweight, TanStack-Query-cached view of "what can this user see".
 * Used to gate role-based dashboards (TD, Club Manager) and role-only widgets
 * without rebuilding queries in every widget.
 */
export function useUserAccess(): UserAccess {
  const { user } = useSession();
  const uid = user?.id;

  const { data } = useQuery({
    queryKey: ["user-access", uid],
    enabled: !!uid,
    staleTime: 60_000,
    queryFn: async () => {
      if (!uid) return { hosted: 0, club: 0, admin: false };
      const [hosted, clubs, roles] = await Promise.all([
        supabase
          .from("tournaments")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", uid),
        supabase
          .from("club_members")
          .select("club_id", { count: "exact", head: true })
          .eq("user_id", uid)
          .in("role", ["owner", "admin"]),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      const roleList = (roles.data ?? []).map((r: { role: string }) => r.role);
      return {
        hosted: hosted.count ?? 0,
        club: clubs.count ?? 0,
        admin: roleList.includes("super_admin") || roleList.includes("admin"),
      };
    },
  });

  return {
    isAuthenticated: !!uid,
    isOrganizer: (data?.hosted ?? 0) > 0,
    isClubManager: (data?.club ?? 0) > 0,
    isSuperAdmin: !!data?.admin,
  };
}
