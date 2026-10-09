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

const leaguePatch = z.object({
  club_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(2)
    .max(140)
    .optional()
    .transform((v) => (v ? stripEventSourceBrands(v) : v)),
  description: nullableString,
  season: nullableString,
  status: z.enum(["draft", "active", "completed", "cancelled"]).optional(),
  points_system: z.string().optional(),
  cover_url: nullableString,
  course_id: nullableString,
  layout_id: nullableString,
  format: z.enum(["singles", "doubles", "random_draw_doubles", "handicap"]).optional(),
  handicap_method: nullableString,
  day_of_week: nullableInt,
  start_time: nullableString,
  start_date: nullableString,
  end_date: nullableString,
  holes_played: nullableInt,
  weeks_planned: nullableInt,
  best_n_weeks: nullableInt,
  entry_fee_cents: z.coerce.number().int().min(0).optional(),
  ace_pot_cents: z.coerce.number().int().min(0).optional(),
  ctp_cents: z.coerce.number().int().min(0).optional(),
  payout_notes: nullableString,
  setup: z.record(z.string(), z.unknown()).optional(),
  rules_url: nullableString,
  governing_ruleset: z.enum(GOVERNING_RULESETS).optional(),
  td_name: nullableString,
  td_email: nullableString,
  td_phone: nullableString,
  event_type: z.enum(["tournament", "league"]).optional(),
});

export const updateLeague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), patch: leaguePatch }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: exErr } = await supabase
      .from("leagues")
      .select("id, owner_id, slug, name, rules_version_id")
      .eq("id", data.id)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("League not found");
    if (existing.owner_id !== userId) throw new Error("Only the league owner can edit this event.");

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
      .from("leagues")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true, slug: (patch.slug as string) ?? existing.slug };
  });

export const convertLeagueToTournament = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: l, error } = await supabase
      .from("leagues")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) throw new Error("League not found");
    if (l.owner_id !== userId) throw new Error("Only the owner can convert this event.");

    const today = new Date().toISOString().slice(0, 10);
    const newSlug = `${slugify(l.name)}-${crypto.randomUUID().slice(0, 6)}`;

    const { data: created, error: iErr } = await supabase
      .from("tournaments")
      .insert({
        owner_id: userId,
        club_id: l.club_id,
        name: l.name,
        slug: newSlug,
        description: l.description,
        status: "draft",
        format: l.format === "doubles" ? "doubles" : "singles",
        start_date: l.start_date ?? today,
        end_date: l.end_date ?? l.start_date ?? today,
        cover_url: l.cover_url,
        course_id: l.course_id,
        layout_id: l.layout_id,
        external_scoring: l.external_scoring,
        entry_fee_cents: l.entry_fee_cents ?? 0,
        td_name: l.td_name,
        td_email: l.td_email,
        td_phone: l.td_phone,
        rules_url: l.rules_url,
        event_type: "tournament",
      })
      .select("slug, id")
      .single();
    if (iErr) throw new Error(iErr.message);

    const { data: divs } = await supabase
      .from("league_divisions")
      .select("code, name, entry_fee_cents")
      .eq("league_id", l.id);
    if (divs && divs.length) {
      await supabase.from("tournament_divisions").insert(
        divs.map((d) => ({
          tournament_id: created.id,
          code: d.code,
          name: d.name,
          entry_fee_cents: d.entry_fee_cents ?? 0,
        })),
      );
    }

    await supabase
      .from("leagues")
      .update({ status: "cancelled", event_type: "tournament" })
      .eq("id", l.id);
    return { ok: true, slug: created.slug };
  });
