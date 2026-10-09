import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  KioskCheckInResult,
  KioskGuestResult,
  KioskGuestRow,
  KioskMatch,
  KioskStation,
} from "@/lib/kiosk.server";

const targetSchema = z.object({
  kind: z.enum(["tournament", "league_event"]),
  id: z.string().uuid(),
});

const paymentMethodSchema = z.enum(["cash", "card", "online", "owed"]);

export const getKioskStation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<KioskStation> => {
    const { loadKioskStation } = await import("@/lib/kiosk.server");
    return loadKioskStation(context.supabase as any, context.userId, data);
  });

export const kioskLookupPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ target: targetSchema, term: z.string().trim().min(2).max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<KioskMatch> => {
    const { loadKioskStation, lookupKioskPlayer } = await import("@/lib/kiosk.server");
    const station = await loadKioskStation(context.supabase as any, context.userId, data.target);
    return lookupKioskPlayer(context.supabase as any, station, data.term);
  });

export const kioskCheckInPlayer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target: targetSchema,
        playerId: z.string().uuid(),
        divisionId: z.string().uuid().nullable().default(null),
        paymentMethod: paymentMethodSchema,
        saveDefaultDivision: z.boolean().default(true),
        allowWalkUps: z.boolean().default(true),
        allowPaymentCapture: z.boolean().default(true),
        override: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<KioskCheckInResult> => {
    const { loadKioskStation, kioskCheckIn } = await import("@/lib/kiosk.server");
    const station = await loadKioskStation(context.supabase as any, context.userId, data.target);
    return kioskCheckIn(context.supabase as any, context.userId, station, {
      playerId: data.playerId,
      divisionId: data.divisionId,
      paymentMethod: data.paymentMethod,
      saveDefaultDivision: data.saveDefaultDivision,
      allowWalkUps: data.allowWalkUps,
      allowPaymentCapture: data.allowPaymentCapture,
      override: data.override,
    });
  });

export const kioskCheckInGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        target: targetSchema,
        fullName: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160).nullable().default(null),
        phone: z.string().trim().max(30).nullable().default(null),
        pdgaNumber: z.string().trim().max(12).nullable().default(null),
        divisionId: z.string().uuid().nullable().default(null),
        paymentMethod: paymentMethodSchema,
        signupOptIn: z.boolean().default(false),
        allowPaymentCapture: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<KioskGuestResult> => {
    const { loadKioskStation, kioskGuestCheckIn } = await import("@/lib/kiosk.server");
    const station = await loadKioskStation(context.supabase as any, context.userId, data.target);
    return kioskGuestCheckIn(context.supabase as any, context.userId, station, {
      fullName: data.fullName,
      email: data.email,
      phone: data.phone,
      pdgaNumber: data.pdgaNumber,
      divisionId: data.divisionId,
      paymentMethod: data.paymentMethod,
      signupOptIn: data.signupOptIn && !!data.email,
      allowPaymentCapture: data.allowPaymentCapture,
    });
  });

export const getKioskGuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => targetSchema.parse(input))
  .handler(async ({ data, context }): Promise<KioskGuestRow[]> => {
    const { loadKioskStation, listKioskGuests } = await import("@/lib/kiosk.server");
    const station = await loadKioskStation(context.supabase as any, context.userId, data);
    return listKioskGuests(context.supabase as any, station);
  });

export type { KioskStation, KioskMatch, KioskCheckInResult, KioskGuestRow };
