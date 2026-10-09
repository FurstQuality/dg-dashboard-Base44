import { applyGoverningRuleset, GOVERNING_RULESETS } from "@/lib/rules-pin";
import { stripEventSourceBrands } from "@/lib/event-name";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { slugify } from "@/lib/pdga-data";

const nullableString = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));
const nullableInt = z.coerce
  .number()
  .int()
  .optional()
  .nullable()
  .transform((v) => (v == null ? null : v));
const nullableNum = z.coerce
  .number()
  .optional()
  .nullable()
  .transform((v) => (v == null ? null : v));

const tournamentPatch = z.object({
  club_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .optional()
    .transform((v) => (v ? stripEventSourceBrands(v) : v)),
  description: nullableString,
  format: z.enum(["stroke_play", "match_play", "best_shot", "doubles", "singles"]).optional(),
  status: z
    .enum([
      "draft",
      "published",
      "registration_open",
      "registration_closed",
      "in_progress",
      "completed",
      "cancelled",
    ])
    .optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  registration_opens: nullableString,
  registration_closes: nullableString,
  check_in_opens: nullableString,
  players_meeting_at: nullableString,
  location: nullableString,
  latitude: nullableNum,
  longitude: nullableNum,
  pdga_sanctioned: z.boolean().optional(),
  governing_ruleset: z.enum(GOVERNING_RULESETS).optional(),
  pdga_tier: nullableString,
  pdga_event_number: nullableString,
  entry_fee_cents: z.coerce.number().int().min(0).optional(),
  players_pack_cents: z.coerce.number().int().min(0).optional(),
  max_players: nullableInt,
  players_per_card: nullableInt,
  cover_url: nullableString,
  course_id: nullableString,
  layout_id: nullableString,
  time_zone: nullableString,
  tee_time_type: nullableString,
  player_pack_notes: nullableString,
  payout_type: nullableString,
  payout_ratio: nullableNum,
  setup: z.record(z.string(), z.unknown()).optional(),
  waitlist_enabled: z.boolean().optional(),
  refund_policy: nullableString,
  td_name: nullableString,
  td_email: nullableString,
  td_phone: nullableString,
  rules_url: nullableString,
  website_url: nullableString,
  registration_url: nullableString,
  ace_pot_enabled: z.boolean().optional(),
  ctp_enabled: z.boolean().optional(),
  event_type: z.enum(["tournament", "league"]).optional(),
});

export const updateTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: tournamentPatch }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("tournaments")
      .select("id, owner_id, slug, name, rules_version_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Tournament not found");
    if (existing.owner_id !== userId)
      throw new Error("Only the tournament owner can edit this event.");

    const patch: Record<string, unknown> = { ...data.patch };
    await applyGoverningRuleset(supabase, patch, existing.rules_version_id ?? null);
    if (patch.club_id) {
      const { data: canHost } = await supabase.rpc("can_manage_club", { _club_id: patch.club_id as string, _user: userId });
      if (!canHost) throw new Error("You can only pick a club you help run as the host.");
    }
    if (patch.name && patch.name !== existing.name) {
      patch.slug = `${slugify(String(patch.name))}-${existing.id.slice(0, 6)}`;
    }

    const { error } = await supabase
      .from("tournaments")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, slug: (patch.slug as string) ?? existing.slug };
  });

export const convertTournamentToLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t) throw new Error("Tournament not found");
    if (t.owner_id !== userId) throw new Error("Only the owner can convert this event.");

    const dow =
      t.start_date === t.end_date ? new Date(`${t.start_date}T12:00:00Z`).getUTCDay() : null;
    const newSlug = `${slugify(t.name)}-${crypto.randomUUID().slice(0, 6)}`;

    const { data: created, error: iErr } = await supabase
      .from("leagues")
      .insert({
        owner_id: userId,
        club_id: t.club_id,
        name: t.name,
        slug: newSlug,
        description: t.description,
        season: null,
        status: "draft",
        points_system: "standard",
        cover_url: t.cover_url,
        course_id: t.course_id,
        layout_id: t.layout_id,
        external_scoring: t.external_scoring,
        format: t.format === "doubles" ? "doubles" : "singles",
        day_of_week: dow,
        start_date: t.start_date,
        end_date: t.end_date,
        holes_played: 18,
        entry_fee_cents: t.entry_fee_cents ?? 0,
        td_name: t.td_name,
        td_email: t.td_email,
        td_phone: t.td_phone,
        rules_url: t.rules_url,
        event_type: "league",
      })
      .select("slug, id")
      .single();
    if (iErr) throw new Error(iErr.message);

    // Copy divisions best-effort
    const { data: divs } = await supabase
      .from("tournament_divisions")
      .select("code, name, entry_fee_cents")
      .eq("tournament_id", t.id);
    if (divs && divs.length) {
      await supabase.from("league_divisions").insert(
        divs.map((d) => ({
          league_id: created.id,
          code: d.code,
          name: d.name,
          entry_fee_cents: d.entry_fee_cents ?? 0,
        })),
      );
    }

    await supabase
      .from("tournaments")
      .update({ status: "cancelled", event_type: "league" })
      .eq("id", t.id);
    return { ok: true, slug: created.slug };
  });
