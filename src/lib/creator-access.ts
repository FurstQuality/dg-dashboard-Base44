/**
 * Creator Studio access.
 *
 * Publishing tools are open to approved creators (and admins) only. This hook
 * is navigation UX; the database enforces the same rule through
 * `public.is_approved_creator()` on content inserts and through the reviewer
 * checks in the creator server functions.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export type CreatorApplicationStatus = "pending" | "approved" | "rejected" | "revoked";

export type CreatorAccess = {
  loading: boolean;
  signedIn: boolean;
  /** Approved creator or admin. */
  isCreator: boolean;
  /** `null` when the player has never applied. */
  status: CreatorApplicationStatus | null;
  isAdmin: boolean;
};

export const creatorAccessKey = (userId: string | undefined) => [
  "creator-access",
  userId ?? "anon",
];

export function useCreatorAccess(): CreatorAccess {
  const { user, loading } = useSession();
  const query = useQuery({
    queryKey: creatorAccessKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [profile, roles] = await Promise.all([
        supabase.from("creator_profiles").select("status").eq("user_id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      if (profile.error) throw profile.error;
      const roleList = (roles.data ?? []).map((r) => r.role as string);
      return {
        status: (profile.data?.status as CreatorApplicationStatus | undefined) ?? null,
        isAdmin: roleList.includes("admin") || roleList.includes("super_admin"),
      };
    },
  });

  const status = query.data?.status ?? null;
  const isAdmin = query.data?.isAdmin ?? false;

  return {
    loading: loading || (!!user?.id && query.isPending),
    signedIn: !!user?.id,
    isCreator: isAdmin || status === "approved",
    status,
    isAdmin,
  };
}
