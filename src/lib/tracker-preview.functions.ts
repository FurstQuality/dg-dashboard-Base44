/**
 * Tracker event preview server functions. Thin wrappers only — the data
 * gathering lives in `@/lib/tracker/event-preview.server`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { EventPreview } from "@/lib/tracker/event-preview.server";

const PreviewInput = z.object({
  eventRef: z.string().min(1).max(40),
  division: z.string().max(20).nullish(),
});

export const getEventPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => PreviewInput.parse(raw))
  .handler(async ({ data, context }): Promise<EventPreview> => {
    const { loadEventPreview } = await import("@/lib/tracker/event-preview.server");
    return await loadEventPreview(context.supabase, context.userId, {
      eventRef: data.eventRef,
      division: data.division ?? null,
    });
  });
