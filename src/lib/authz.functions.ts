import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ALL_EVENT_CAPABILITIES, type EventCapability } from "@/lib/authz/event-capabilities";

/** What the signed-in user may do on one event, answered by the database. */
export const getMyEventCapabilities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["tournament", "league"]), eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const rows = await Promise.all(
      ALL_EVENT_CAPABILITIES.map(async (cap) => {
        const { data: ok } = await context.supabase.rpc("event_has_capability", {
          _kind: data.kind, _event: data.eventId, _user: context.userId, _cap: cap,
        });
        return ok ? cap : null;
      }),
    );
    const { data: ownerId } = await context.supabase.rpc("event_owner_id", { _kind: data.kind, _event: data.eventId });
    return {
      capabilities: rows.filter((c): c is EventCapability => !!c),
      isOwner: ownerId === context.userId,
    };
  });
