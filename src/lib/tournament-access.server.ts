/**
 * Server-only helper: verifies that the caller is either the tournament
 * owner (TD) or has an active registration for the given tournament. This
 * gates roster/PII reads that would otherwise bypass RLS via the admin
 * client.
 *
 * Uses the RLS-scoped `supabase` client (never the admin client) so a
 * caller cannot bypass the check by knowing another user's id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TournamentAccess =
  | { allowed: true; role: "owner" | "registrant" }
  | { allowed: false; reason: "not_found" | "forbidden" };

export async function checkTournamentAccess(
  supabase: SupabaseClient,
  userId: string,
  tournamentId: string,
): Promise<TournamentAccess> {
  // Owner check — RLS on tournaments still allows the owner to read.
  const { data: t } = await supabase
    .from("tournaments")
    .select("id, owner_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!t) return { allowed: false, reason: "not_found" };
  if ((t as { owner_id: string | null }).owner_id === userId) {
    return { allowed: true, role: "owner" };
  }

  // Registrant check — tournament_registrations RLS lets the registrant
  // read their own row.
  const { data: reg } = await supabase
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (reg) return { allowed: true, role: "registrant" };

  return { allowed: false, reason: "forbidden" };
}
