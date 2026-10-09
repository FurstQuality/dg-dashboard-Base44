/**
 * Reads for the Disc Golf Professor skill-group knowledge base.
 * Reference data — any signed-in player can read it.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { skillGroupCodeFor, type DiscClass, type ShotShape, type ThrowStyle } from "@/lib/dgp-parsers";

export type BenchmarkAnswer = {
  label: string;
  submissions: number;
  share: number | null;
  brand: string | null;
  mold: string | null;
  mold_id: string | null;
  weight_min_g: number | null;
  weight_max_g: number | null;
  distance_min_ft: number | null;
  distance_max_ft: number | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
};

export type BenchmarkSlot = {
  disc_class: DiscClass;
  throw_style: ThrowStyle;
  shot_shape: ShotShape;
  speed_min: number | null;
  speed_max: number | null;
  submissions: number;
  source_url: string;
  top_discs: BenchmarkAnswer[];
  top_weight: BenchmarkAnswer | null;
  top_distance: BenchmarkAnswer | null;
  top_flight: BenchmarkAnswer | null;
};

export type BenchmarkResult = {
  group_code: string;
  udisc_band: string;
  pdga_band: string;
  total_submissions: number;
  slots: BenchmarkSlot[];
  attribution: { name: string; url: string };
};

const Input = z.object({
  pdgaRating: z.number().int().min(0).max(1200).nullable().optional(),
  udiscRating: z.number().int().min(0).max(2000).nullable().optional(),
  groupCode: z
    .string()
    .trim()
    .regex(/^[a-g]-[1-6]$/)
    .optional(),
  throwStyle: z.enum(["backhand", "forehand"]).optional(),
  discsPerSlot: z.number().int().min(1).max(10).default(3),
});

const ATTRIBUTION = {
  name: "Disc Golf Professor",
  url: "https://discgolfprofessor.com/skill-groups/",
};

/** What players in the same rating band throw, shot shape by shot shape. */
export const getDgpBenchmarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<BenchmarkResult | null> => {
    void context; // auth checked by middleware; catalogs are read server-side only
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const supabase = supabaseAdmin as any;
    const groupCode =
      data.groupCode ??
      skillGroupCodeFor({ pdgaRating: data.pdgaRating, udiscRating: data.udiscRating });

    const { data: group, error } = await supabase
      .from("dgp_skill_groups")
      .select("id, group_code, udisc_band, pdga_band")
      .eq("group_code", groupCode)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!group) return null;

    let profileQuery = supabase
      .from("dgp_shot_profiles")
      .select(
        "id, disc_class, throw_style, shot_shape, speed_min, speed_max, submissions, source_url",
      )
      .eq("skill_group_id", group.id)
      .order("submissions", { ascending: false });
    if (data.throwStyle) profileQuery = profileQuery.eq("throw_style", data.throwStyle);
    const { data: profiles } = await profileQuery;
    const rows = (profiles ?? []) as any[];
    if (rows.length === 0) {
      return {
        group_code: group.group_code,
        udisc_band: group.udisc_band,
        pdga_band: group.pdga_band,
        total_submissions: 0,
        slots: [],
        attribution: ATTRIBUTION,
      };
    }

    const { data: answers } = await supabase
      .from("dgp_shot_answers")
      .select(
        "profile_id, answer_kind, label, submissions, share, brand, mold, mold_id, weight_min_g, weight_max_g, distance_min_ft, distance_max_ft, speed, glide, turn, fade, rank",
      )
      .in(
        "profile_id",
        rows.map((r) => r.id as string),
      )
      .order("rank", { ascending: true });

    const byProfile = new Map<string, any[]>();
    for (const a of (answers ?? []) as any[]) {
      const list = byProfile.get(a.profile_id) ?? [];
      list.push(a);
      byProfile.set(a.profile_id, list);
    }

    const toAnswer = (a: any): BenchmarkAnswer => ({
      label: a.label,
      submissions: a.submissions,
      share: a.share == null ? null : Number(a.share),
      brand: a.brand,
      mold: a.mold,
      mold_id: a.mold_id,
      weight_min_g: a.weight_min_g,
      weight_max_g: a.weight_max_g,
      distance_min_ft: a.distance_min_ft,
      distance_max_ft: a.distance_max_ft,
      speed: a.speed == null ? null : Number(a.speed),
      glide: a.glide == null ? null : Number(a.glide),
      turn: a.turn == null ? null : Number(a.turn),
      fade: a.fade == null ? null : Number(a.fade),
    });

    const slots: BenchmarkSlot[] = rows.map((profile) => {
      const list = byProfile.get(profile.id as string) ?? [];
      const of = (kind: string) => list.filter((a) => a.answer_kind === kind);
      return {
        disc_class: profile.disc_class,
        throw_style: profile.throw_style,
        shot_shape: profile.shot_shape,
        speed_min: profile.speed_min == null ? null : Number(profile.speed_min),
        speed_max: profile.speed_max == null ? null : Number(profile.speed_max),
        submissions: profile.submissions ?? 0,
        source_url: profile.source_url,
        top_discs: of("disc").slice(0, data.discsPerSlot).map(toAnswer),
        top_weight: of("weight")[0] ? toAnswer(of("weight")[0]) : null,
        top_distance: of("distance")[0] ? toAnswer(of("distance")[0]) : null,
        top_flight: of("flight")[0] ? toAnswer(of("flight")[0]) : null,
      };
    });

    const order: Record<string, number> = {
      distance_driver: 0,
      fairway_driver: 1,
      midrange: 2,
      putter: 3,
    };
    const shapeOrder: Record<string, number> = { hyzer: 0, straight: 1, anhyzer: 2 };
    slots.sort(
      (a, b) =>
        order[a.disc_class] - order[b.disc_class] ||
        a.throw_style.localeCompare(b.throw_style) ||
        shapeOrder[a.shot_shape] - shapeOrder[b.shot_shape],
    );

    return {
      group_code: group.group_code,
      udisc_band: group.udisc_band,
      pdga_band: group.pdga_band,
      total_submissions: slots.reduce((sum, s) => sum + s.submissions, 0),
      slots,
      attribution: ATTRIBUTION,
    };
  });
