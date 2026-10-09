/**
 * Shared bag entity.
 *
 * Every surface that needs "the discs this player currently carries" — Smart
 * Caddy, the shot tracker, the driving range, the putting green — reads through
 * here so the definition of an active disc (not retired by condition *or* by
 * retire date) and the selected columns stay identical everywhere.
 */
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BagMold = {
  id: string;
  name: string;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  stability: string | null;
  category: string | null;
  manufacturer: { name: string } | null;
};

export type BagDisc = {
  id: string;
  nickname: string | null;
  color: string | null;
  is_favorite: boolean;
  slot_order: number;
  mold: BagMold | null;
};

const BAG_SELECT =
  "id,nickname,color,is_favorite,slot_order, mold:disc_molds(id,name,speed,glide,turn,fade,stability,category, manufacturer:disc_manufacturers(name))";

/** Loads the player's active bag, ordered favorites first then bag slot. */
export async function fetchBagDiscs(userId: string): Promise<BagDisc[]> {
  const { data, error } = await supabase
    .from("user_discs")
    .select(BAG_SELECT)
    .eq("user_id", userId)
    .neq("condition", "retired")
    .is("retired_at", null)
    .order("is_favorite", { ascending: false })
    .order("slot_order", { ascending: true });
  if (error) throw error;
  return (data as unknown as BagDisc[]) ?? [];
}

export function bagDiscsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["bag-discs", userId] as const,
    queryFn: () => fetchBagDiscs(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}

/** "Innova Destroyer (Beat-in)" — the one label format used across the app. */
export function bagDiscLabel(disc: BagDisc): string {
  const brand = disc.mold?.manufacturer?.name ?? "";
  const name = disc.mold?.name ?? disc.nickname ?? "Disc";
  const nick = disc.nickname && disc.nickname !== name ? `(${disc.nickname})` : "";
  return [brand, name, nick].filter(Boolean).join(" ");
}

/**
 * The full disc row as the bag manager needs it (every editable column,
 * including retired discs). Read surfaces that only need "what's in the bag"
 * should use fetchBagDiscs above.
 */
export type BagDiscRow = {
  id: string;
  user_id: string;
  mold_id: string;
  plastic_id: string | null;
  plastic_name: string | null;
  weight_g: number | null;
  color: string;
  nickname: string | null;
  purpose: string | null;
  distance_ft: number | null;
  condition: "new" | "beat_in" | "worn" | "retired";
  retired_at: string | null;
  is_favorite: boolean;
  slot_order: number;
  /** How this disc is actually thrown, from the player's own tagging. */
  throw_styles: string[] | null;
  shot_shapes: string[] | null;

};

/** Single source of truth: a disc counts as carried unless it is retired. */
export function isActiveBagDisc(disc: {
  condition: string;
  retired_at?: string | null;
}): boolean {
  return disc.condition !== "retired" && !disc.retired_at;
}

export async function fetchBagDiscRows(userId: string): Promise<BagDiscRow[]> {
  const { data, error } = await supabase
    .from("user_discs")
    .select("*")
    .eq("user_id", userId)
    .order("slot_order", { ascending: true });
  if (error) throw error;
  return (data as unknown as BagDiscRow[]) ?? [];
}

export function bagDiscRowsQueryOptions(userId: string | null | undefined) {
  return queryOptions({
    queryKey: ["bag-disc-rows", userId] as const,
    queryFn: () => fetchBagDiscRows(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
}
