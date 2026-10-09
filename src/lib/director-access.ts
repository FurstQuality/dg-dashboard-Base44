/**
 * Event Director access, resolved once for every hosting surface.
 *
 * Directing is an approved role: a player applies, an admin reviews, and only
 * then do tournament/league creation and management surfaces open up. This
 * hook is navigation UX only — the database enforces the same rule through
 * `public.is_approved_director()` in the tournament/league insert policies and
 * through server-side checks in the director server functions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";

export type DirectorApplicationStatus = "pending" | "approved" | "rejected" | "revoked";

export type DirectorAccess = {
  /** Session or role lookup still resolving — render a checking state. */
  loading: boolean;
  signedIn: boolean;
  /** Approved director or admin. */
  isDirector: boolean;
  /** `null` when the player has never applied. */
  status: DirectorApplicationStatus | null;
  isAdmin: boolean;
};

export const directorAccessKey = (userId: string | undefined) => [
  "director-access",
  userId ?? "anon",
];

export function useDirectorAccess(): DirectorAccess {
  const { user, loading } = useSession();
  const query = useQuery({
    queryKey: directorAccessKey(user?.id),
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [application, roles] = await Promise.all([
        supabase
          .from("director_profiles")
          .select("status")
          .eq("user_id", user!.id)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
      ]);
      if (application.error) throw application.error;
      const roleList = (roles.data ?? []).map((r) => r.role as string);
      return {
        status: (application.data?.status as DirectorApplicationStatus | undefined) ?? null,
        isAdmin: roleList.includes("admin") || roleList.includes("super_admin"),
      };
    },
  });

  const status = query.data?.status ?? null;
  const isAdmin = query.data?.isAdmin ?? false;

  return {
    loading: loading || (!!user?.id && query.isPending),
    signedIn: !!user?.id,
    isDirector: isAdmin || status === "approved",
    status,
    isAdmin,
  };
}

export type DirectorApplicationInput = {
  org_name?: string;
  region?: string;
  experience?: string;
  pitch?: string;
  pdga_number?: number;
  contact_email?: string;
};

/** Submits (or updates) the player's Event Director application. */
export function useApplyForDirector() {
  const { user } = useSession();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DirectorApplicationInput) => {
      if (!user?.id) throw new Error("Sign in to apply for Event Director access.");
      const { applyForDirector } = await import("@/lib/director-application.functions");
      await applyForDirector({ data: input });
      return true;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: directorAccessKey(user?.id) });
      void qc.invalidateQueries({ queryKey: ["director-application"] });
    },
  });
}
