/**
 * Admin access, resolved once for the whole Admin section.
 *
 * `useIsSuperAdmin` returns a bare boolean that starts as `false`, which makes
 * every admin page flash "access denied" while the role lookup is still in
 * flight. This hook keeps the three states apart — checking, allowed, denied —
 * so the Admin layout can show a short checking state instead of the wrong
 * screen. Access is still enforced on the server (`has_role` inside server
 * functions and RLS policies); this is navigation UX only.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export const adminKeys = {
  access: (userId: string | undefined) => ["admin", "access", userId] as const,
  counts: () => ["admin", "queue-counts"] as const,
};

export type AdminAccess = {
  /** Session or role lookup still resolving — render a checking state. */
  checking: boolean;
  /** Verified super admin. */
  isAdmin: boolean;
  userId: string | undefined;
};

export function useAdminAccess(): AdminAccess {
  const { user, loading } = useSession();

  const q = useQuery({
    enabled: !!user?.id,
    queryKey: adminKeys.access(user?.id),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });

  return {
    checking: loading || (!!user?.id && q.isPending),
    isAdmin: q.data === true,
    userId: user?.id,
  };
}

/** Pending-work counts shown beside the Admin section links. */
export function useAdminQueueCounts(enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: adminKeys.counts(),
    staleTime: 60_000,
    queryFn: async () => {
      const [courses, edits, ratings, reverts, reports, mock] = await Promise.all([
        supabase
          .from("courses")
          .select("id", { count: "exact", head: true })
          .eq("moderation_status", "pending"),
        supabase
          .from("course_edit_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("course_rating_profiles")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("revert_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("post_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase.from("mock_seed_registry").select("id", { count: "exact", head: true }),
      ]);
      return {
        moderation: (courses.count ?? 0) + (edits.count ?? 0),
        courseRatings: ratings.count ?? 0,
        reverts: reverts.count ?? 0,
        reports: reports.count ?? 0,
        sandboxRows: mock.count ?? 0,
      };
    },
  });
}
