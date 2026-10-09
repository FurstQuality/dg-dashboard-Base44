import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CancellableKind = "tournament" | "league" | "series" | "community";

const TABLE = {
  tournament: "tournaments",
  league: "leagues",
  series: "event_series",
  community: "community_events",
} as const;

const RESTORE_STATUS: Record<CancellableKind, string> = {
  tournament: "published",
  league: "active",
  series: "active",
  community: "scheduled",
};

const input = z.object({
  kind: z.enum(["tournament", "league", "series", "community"]),
  id: z.string().uuid(),
  action: z.enum(["cancel", "restore", "delete"]),
});

/**
 * Cancel, restore or permanently delete an event. Tournaments/leagues are
 * host-only; series and community events rely on their RLS (owner, club
 * managers, host) and fail if no row was changed.
 */
export const changeEventLifecycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => input.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const table = TABLE[data.kind];

    if (data.kind === "tournament" || data.kind === "league") {
      const { data: row, error } = await supabase
        .from(table)
        .select("id, owner_id")
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error("We couldn't load this event.");
      if (!row) throw new Error("Event not found.");
      if ((row as unknown as { owner_id: string }).owner_id !== userId)
        throw new Error("Only the event host can do this.");
    }

    if (data.action === "delete") {
      const { data: gone, error } = await (supabase.from(table) as any)
        .delete()
        .eq("id", data.id)
        .select("id");
      if (error)
        throw new Error("This event has results or links that can't be removed. Cancel it instead.");
      if (!gone?.length) throw new Error("You don't have permission to delete this event.");
      return { ok: true };
    }

    const status = data.action === "cancel" ? "cancelled" : RESTORE_STATUS[data.kind];
    const { data: changed, error } = await (supabase.from(table) as any)
      .update({ status })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error("We couldn't update this event.");
    if (!changed?.length) throw new Error("You don't have permission to change this event.");
    return { ok: true };
  });
