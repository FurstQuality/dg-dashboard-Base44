import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { emptyFairways, syncPairings, validPoint, validateFairwayDraft, prune, type FairwayDraft, type FairwayNetwork, type FairwayPin } from "./pairing-fairways";
import { seedLegacyFairways } from "./pairing-fairway-seed";
import { teeColor } from "./tee-colors";
import type { LatLng } from "./geometry";

// Additive migration contract, kept separate until remote types can be regenerated.
type NetworkRow = { course_hole_id: string; course_id: string; network: Json; revision: number; source_snapshot: Json; updated_at: string };
type FairwayDatabase = Omit<Database, "public"> & { public: Omit<Database["public"], "Tables" | "Functions"> & {
  Tables: Database["public"]["Tables"] & { course_fairway_networks: { Row: NetworkRow; Insert: NetworkRow; Update: Partial<NetworkRow>; Relationships: [] } };
  Functions: Database["public"]["Functions"] & { save_course_fairways: { Args: { _hole: string; _revision: number; _baseline: Json; _draft: Json; _legacy_links: Json }; Returns: number } };
} };
export const fairwayDb = supabase as unknown as SupabaseClient<FairwayDatabase>;
type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type FairwaySource = {
  tees: Row<"course_tees">[]; baskets: Row<"course_baskets">[]; slots: Row<"layout_slots">[];
  holes: Row<"holes">[]; extra_tees: Row<"hole_tees">[]; extra_baskets: Row<"hole_baskets">[];
};
export type LoadedFairways = {
  holeId: string; title: string; draft: FairwayDraft; baseline: FairwaySource; revision: number; available: boolean;
  links: { tees: Record<string, string>; baskets: Record<string, string> }; notice: string;
};
const missingSchema = (code: string) => ["PGRST205", "42P01"].includes(code);
const bends = (value: unknown): LatLng[] => Array.isArray(value) ? value.filter(validPoint) : [];
const position = (row: { latitude: number | null; longitude: number | null }): LatLng | null => validPoint([row.latitude, row.longitude]) ? [row.latitude!, row.longitude!] : null;

export async function loadPairingFairways(courseId: string, legacyHoleId: string, layoutId?: string): Promise<LoadedFairways> {
  const hole = await supabase.from("holes").select("physical_hole_key,number").eq("id", legacyHoleId).single();
  if (hole.error) throw new Error(hole.error.message);
  const holeId = hole.data.physical_hole_key;
  if (!holeId) throw new Error("Save this hole to its course layout before editing pair fairways.");
  const results = await Promise.all([
    supabase.from("course_holes").select("id,label").eq("id", holeId).eq("course_id", courseId).single(),
    supabase.from("course_tees").select("*").eq("course_hole_id", holeId).order("id"),
    supabase.from("course_baskets").select("*").eq("course_hole_id", holeId).order("id"),
    supabase.from("layout_slots").select("*").eq("course_hole_id", holeId).order("id"),
    supabase.from("holes").select("*").eq("physical_hole_key", holeId).order("id"),
    fairwayDb.from("course_fairway_networks").select("*").eq("course_hole_id", holeId).maybeSingle(),
    supabase.from("course_tee_sets").select("name,color").eq("course_id", courseId),
  ] as const);
  for (const result of results.slice(0, 5)) if (result.error) throw new Error(result.error.message);
  const [physical, tees, baskets, slots, holes, stored, teeSets] = results;
  if (teeSets.error) throw new Error(teeSets.error.message);
  if (stored.error && !missingSchema(stored.error.code)) throw new Error(stored.error.message);
  const ids = holes.data!.map(h => h.id);
  const [extraTees, extraBaskets] = await Promise.all([
    supabase.from("hole_tees").select("*").in("hole_id", ids).order("id"),
    supabase.from("hole_baskets").select("*").in("hole_id", ids).order("id"),
  ]);
  if (extraTees.error || extraBaskets.error) throw new Error(extraTees.error?.message ?? extraBaskets.error!.message);
  const baseline: FairwaySource = { tees: tees.data!, baskets: baskets.data!, slots: slots.data!, holes: holes.data!, extra_tees: extraTees.data!, extra_baskets: extraBaskets.data! };
  const pins: { tees: FairwayPin[]; baskets: FairwayPin[] } = {
    tees: baseline.tees.map(t => ({ id: t.id, name: t.name, point: position(t), color: teeColor(t.name, t.color, teeSets.data ?? []) })),
    baskets: baseline.baskets.map(b => ({ id: b.id, name: b.name, point: position(b) })),
  };
  const links: LoadedFairways["links"] = { tees: {}, baskets: {} };
  for (const [group, extras] of [["tees", baseline.extra_tees.filter(t => !t.is_drop_zone)], ["baskets", baseline.extra_baskets]] as const) {
    for (const row of extras) {
      const point = position(row);
      // Exact identity first, then an exact existing physical spot with the same name.
      const existing = pins[group].find(p => p.id === row.id) ?? pins[group].find(p => p.name === row.name && JSON.stringify(p.point) === JSON.stringify(point));
      const id = existing?.id ?? row.id;
      links[group][row.id] = id;
      if (!existing) pins[group].push({ id, name: row.name, point, ...(group === "tees" ? { color: teeColor(row.name, "color" in row ? row.color : undefined, teeSets.data ?? []) } : {}) });
    }
  }
  let draft: FairwayDraft = { ...pins, network: emptyFairways() };
  const notices: string[] = [];
  if (stored.data) {
    const parsed = stored.data.network as unknown as FairwayNetwork;
    // Validate persisted structure before attempting to reconcile newly added pins.
    if (!parsed || parsed.version !== 1 || !parsed.points || !parsed.routes) throw new Error("Saved fairway data is not recognized. It has not been overwritten.");
    draft.network = syncPairings(parsed, pins.tees, pins.baskets);
  } else {
    draft.network = syncPairings(emptyFairways(), pins.tees, pins.baskets);
    const imported = new Set<string>();
    const orderedSlots = [...baseline.slots].sort((a, b) => Number(b.layout_id === layoutId) - Number(a.layout_id === layoutId));
    for (const slot of orderedSlots) {
      if (!slot.tee_id || !slot.basket_id) continue;
      const legacy = baseline.holes.find(h => h.id === slot.legacy_hole_id);
      notices.push(...seedLegacyFairways(draft, {
        teeId: slot.tee_id, basketId: slot.basket_id, bends: bends(legacy?.flight_path ?? slot.flight_path),
        tees: baseline.extra_tees.filter(t => t.hole_id === slot.legacy_hole_id && !t.is_drop_zone && position(t)).map(t => ({
          id: links.tees[t.id], point: position(t)!, mode: t.route_mode === "own" || t.route_mode === "joins" ? t.route_mode : "same", bends: bends(t.flight_path),
        })),
        baskets: baseline.extra_baskets.filter(b => b.hole_id === slot.legacy_hole_id && position(b)).map(b => ({ id: links.baskets[b.id], point: position(b)!, split: validPoint(b.split_point) ? b.split_point : null })),
      }, slot.id, imported));
    }
    draft.network = prune(draft.network);
    notices.unshift("Existing route curves are retained. New combinations start straight; shape them before saving. Saving updates current layouts; published versions and past events stay unchanged.");
  }
  const errors = validateFairwayDraft(draft);
  if (errors.length) throw new Error(`${errors.join(" ")} Original course data is unchanged.`);
  if (stored.error) notices.unshift("Fairway saving needs the shared-fairway database migration. You can edit and recover a draft on this device.");
  return { holeId, title: physical.data!.label || `Hole ${hole.data.number}`, draft, baseline, revision: stored.data?.revision ?? 0, available: !stored.error, links, notice: [...new Set(notices)].join(" ") };
}

export async function savePairingFairways(loaded: LoadedFairways, draft: FairwayDraft): Promise<number> {
  if (!loaded.available) throw new Error("The shared-fairway database migration is not installed. Your edits remain in the device draft.");
  const errors = validateFairwayDraft(draft);
  if (errors.length) throw new Error(errors.join(" "));
  const result = await fairwayDb.rpc("save_course_fairways", { _hole: loaded.holeId, _revision: loaded.revision,
    _baseline: loaded.baseline as unknown as Json, _draft: draft as unknown as Json, _legacy_links: loaded.links as unknown as Json });
  if (result.error) throw new Error(`Fairways were not saved: ${result.error.message}. Your draft is still here.`);
  return result.data;
}
