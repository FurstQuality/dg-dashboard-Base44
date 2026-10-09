import { supabase } from "@/integrations/supabase/client";

export type DiscCategoryKey =
  | "distance_driver"
  | "fairway_driver"
  | "midrange"
  | "putter"
  | "approach"
  | "specialty";

export const DISC_CATEGORIES: DiscCategoryKey[] = [
  "distance_driver",
  "fairway_driver",
  "midrange",
  "putter",
  "approach",
  "specialty",
];

export const CATEGORY_LABEL: Record<DiscCategoryKey, string> = {
  distance_driver: "Distance driver",
  fairway_driver: "Fairway driver",
  midrange: "Midrange",
  putter: "Putter",
  approach: "Approach",
  specialty: "Specialty",
};

export const STABILITY_LABEL: Record<string, string> = {
  very_understable: "Very understable",
  understable: "Understable",
  stable: "Stable",
  overstable: "Overstable",
  very_overstable: "Very overstable",
};

/** Brands players ask for most often — surfaced as one-tap filters in the picker. */
export const FEATURED_BRANDS = [
  "Innova",
  "Discraft",
  "MVP",
  "Axiom Discs",
  "Streamline",
  "Latitude 64",
  "Dynamic Discs",
  "Westside Discs",
  "Gateway",
  "Thought Space Athletics",
];

export type MoldRow = {
  id: string;
  manufacturer_id: string;
  name: string;
  category: DiscCategoryKey;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  stability: string | null;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  pdga_approved: boolean;
  pdga_approved_on: string | null;
  max_weight_g: number | null;
  diameter_cm: number | null;
  height_cm: number | null;
  rim_depth_cm: number | null;
  rim_width_cm: number | null;
  brand: string;
};

export type PlasticRow = {
  id: string;
  manufacturer_id: string;
  name: string;
  tier: string | null;
  durability: number | null;
  grip: number | null;
};

export const PLASTIC_TIER_LABEL: Record<string, string> = {
  base: "Base",
  premium: "Premium",
  premium_glow: "Premium glow",
  tournament: "Tournament",
  special: "Special edition",
};

const MOLD_COLUMNS =
  "id,manufacturer_id,name,category,speed,glide,turn,fade,stability,description,image_url,link_url,pdga_approved,pdga_approved_on,max_weight_g,diameter_cm,height_cm,rim_depth_cm,rim_width_cm,disc_manufacturers(name)";


export type MoldSearch = {
  query?: string;
  manufacturerId?: string;
  category?: DiscCategoryKey | "";
  stability?: string;
  speedMin?: number;
  speedMax?: number;
  flightOnly?: boolean;
  approvedOnly?: boolean;
  limit?: number;
  offset?: number;
};

/** Server-side disc library search. Returns matching molds plus the total count. */
export async function searchMolds(params: MoldSearch): Promise<{ rows: MoldRow[]; total: number }> {
  const limit = params.limit ?? 40;
  const offset = params.offset ?? 0;

  let q = (supabase as any).from("disc_molds").select(MOLD_COLUMNS, { count: "exact" });

  const term = params.query?.trim();
  if (term) q = q.ilike("name", `%${term}%`);
  if (params.manufacturerId) q = q.eq("manufacturer_id", params.manufacturerId);
  if (params.category) q = q.eq("category", params.category);
  if (params.stability) q = q.eq("stability", params.stability);
  if (typeof params.speedMin === "number") q = q.gte("speed", params.speedMin);
  if (typeof params.speedMax === "number") q = q.lte("speed", params.speedMax);
  if (params.flightOnly) q = q.not("speed", "is", null);
  if (params.approvedOnly) q = q.eq("pdga_approved", true);

  const { data, count, error } = await q
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);

  type Raw = Omit<MoldRow, "brand"> & { disc_manufacturers: { name: string } | null };
  const rows = ((data as Raw[] | null) ?? []).map((r) => ({
    ...r,
    brand: r.disc_manufacturers?.name ?? "Unknown brand",
  }));
  return { rows, total: count ?? rows.length };
}

/** Loads molds already sitting in a player's bag, in one round trip. */
export async function fetchMoldsByIds(ids: string[]): Promise<MoldRow[]> {
  if (!ids.length) return [];
  const { data, error } = await (supabase as any)
    .from("disc_molds")
    .select(MOLD_COLUMNS)
    .in("id", ids);
  if (error) throw new Error(error.message);
  type Raw = Omit<MoldRow, "brand"> & { disc_manufacturers: { name: string } | null };
  return ((data as Raw[] | null) ?? []).map((r) => ({
    ...r,
    brand: r.disc_manufacturers?.name ?? "Unknown brand",
  }));
}

export function flightLine(m: Pick<MoldRow, "speed" | "glide" | "turn" | "fade">): string | null {
  if (m.speed === null || m.glide === null || m.turn === null || m.fade === null) return null;
  return `${m.speed} / ${m.glide} / ${m.turn} / ${m.fade}`;
}

/** Net stability number: negative turns right (RHBH), positive finishes left. */
export function netStability(m: Pick<MoldRow, "turn" | "fade">): number | null {
  if (m.turn === null || m.fade === null) return null;
  return m.turn + m.fade;
}

export function specLine(m: MoldRow): string {
  const parts: string[] = [];
  if (m.max_weight_g) parts.push(`max ${m.max_weight_g}g`);
  if (m.diameter_cm) parts.push(`${m.diameter_cm} cm rim-to-rim`);
  if (m.rim_width_cm) parts.push(`${m.rim_width_cm} cm rim`);
  if (m.height_cm) parts.push(`${m.height_cm} cm tall`);
  return parts.join(" · ");
}

/** All plastics a brand makes, best for a "which plastic is this?" picker. */
export async function fetchPlastics(manufacturerId: string): Promise<PlasticRow[]> {
  if (!manufacturerId) return [];
  const { data, error } = await (supabase as any)
    .from("disc_plastics")
    .select("id,manufacturer_id,name,tier,durability,grip")
    .eq("manufacturer_id", manufacturerId)
    .order("name");
  if (error) throw new Error(error.message);
  return (data as PlasticRow[] | null) ?? [];
}

export function plasticLine(p: PlasticRow): string {
  const parts: string[] = [];
  if (p.tier) parts.push(PLASTIC_TIER_LABEL[p.tier] ?? p.tier);
  if (p.durability !== null) parts.push(`durability ${p.durability}/10`);
  if (p.grip !== null) parts.push(`grip ${p.grip}/10`);
  return parts.join(" · ");
}

/** Plain-language read on how a mold flies, derived from its published numbers. */
export function flightNarrative(m: MoldRow): string | null {
  if (m.speed === null || m.glide === null || m.turn === null || m.fade === null) return null;
  const net = m.turn + m.fade;
  const shape =
    net <= -2
      ? "turns over hard and finishes right (RHBH) — built for turnovers and rollers"
      : net < 0
        ? "holds a gentle turn before a soft finish — a workable straight-to-right flight"
        : net < 1.5
          ? "flies straight with a small, predictable finish"
          : net < 3
            ? "resists turn and finishes left dependably — good in wind and on forehands"
            : "fights hard left the whole way — a headwind and spike hyzer disc";
  const power =
    m.speed <= 4
      ? "Putting and short approach speed"
      : m.speed <= 6
        ? "Midrange speed, controllable at any arm speed"
        : m.speed <= 9
          ? "Fairway speed, needs a clean throw to see its full flight"
          : "Distance speed, needs real arm speed to fly as advertised";
  const glide =
    m.glide >= 6 ? " Lots of glide, so it carries." : m.glide <= 3 ? " Low glide — it drops fast." : "";
  return `${power}. It ${shape}.${glide}`;
}
