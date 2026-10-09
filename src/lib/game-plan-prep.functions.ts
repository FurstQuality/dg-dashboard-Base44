/**
 * Game Plan prep server functions.
 *
 * `getDivisionAdvice` scores every division in an event's field for the caller.
 * `getEventTrainingPlan` returns hole-level weak points on the event's courses,
 * measured skill leaks, a practice plan, and a readiness score.
 *
 * Both resolve the event server-side from the caller's own schedule, so no
 * client-supplied course or roster data is trusted.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectEvents,
  hydrateEventVenue,
  type GamePlanEvent,
} from "@/lib/game-plan.functions";
import {
  buildDivisionAdvice,
  buildTrainingPlan,
  type PrepEventInput,
} from "@/lib/game-plan-prep.server";

const Input = z.object({ eventId: z.string() });

async function resolveEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
): Promise<GamePlanEvent | null> {
  const events = await collectEvents(
    supabase as unknown as Parameters<typeof collectEvents>[0],
    userId,
  );
  const event = events.find((e) => e.id === eventId) ?? null;
  if (!event) return null;
  return await hydrateEventVenue(
    supabase as unknown as Parameters<typeof hydrateEventVenue>[0],
    event,
  );
}

function toPrepInput(event: GamePlanEvent): PrepEventInput {
  return {
    eventId: event.id,
    tournamentId: event.tournament_id,
    pdgaEventRef: event.pdga_event_ref,
    startsOn: event.starts_on,
    courses: event.courses.map((c) => ({
      round_number: c.round_number,
      course_id: c.course_id,
      course_name: c.course_name,
      layout_id: c.layout_id,
      layout_name: c.layout_name,
    })),
  };
}

export const getDivisionAdvice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const event = await resolveEvent(context.supabase, context.userId, data.eventId);
    if (!event) return null;
    return await buildDivisionAdvice(context.supabase, context.userId, toPrepInput(event));
  });

export const getEventTrainingPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => Input.parse(raw))
  .handler(async ({ data, context }) => {
    const event = await resolveEvent(context.supabase, context.userId, data.eventId);
    if (!event) return null;
    return await buildTrainingPlan(context.supabase, context.userId, toPrepInput(event));
  });
