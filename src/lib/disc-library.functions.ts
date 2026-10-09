import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Refreshes the shared disc library from the PDGA approved-disc list and the
 * open disc catalog. Admin only — it rewrites data every player sees.
 */
export const syncDiscLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ molds: number; brands: number }> => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Error("Only admins can refresh the disc library.");

    const { syncDiscLibraryToDatabase } = await import("@/lib/disc-library.server");
    return syncDiscLibraryToDatabase();
  });
