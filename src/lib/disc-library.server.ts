/**
 * Disc library ingest.
 * Server-only: merges the PDGA approved-disc list (official physical specs) with
 * the open DiscIt catalog (flight numbers, category, product imagery) into the
 * shared disc_molds / disc_manufacturers library.
 */

const PDGA_CSV = "https://www.pdga.com/technical-standards/equipment-certification/discs/export";
const DISCIT_API = "https://discit-api.fly.dev/disc";

const BRAND_STOP = new Set([
  "discs",
  "disc",
  "golf",
  "inc",
  "llc",
  "co",
  "company",
  "usa",
  "sports",
  "the",
  "and",
  "ltd",
  "gmbh",
  "corp",
  "international",
  "industries",
]);

export type DiscStability =
  | "very_understable"
  | "understable"
  | "stable"
  | "overstable"
  | "very_overstable";

export type DiscCategory =
  | "distance_driver"
  | "fairway_driver"
  | "midrange"
  | "putter"
  | "approach"
  | "specialty";

export type MoldRecord = {
  brand: string;
  name: string;
  category: DiscCategory;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  stability: DiscStability | null;
  slug: string;
  image_url: string | null;
  link_url: string | null;
  pdga_approved: boolean;
  pdga_approved_on: string | null;
  pdga_class: string | null;
  max_weight_g: number | null;
  diameter_cm: number | null;
  height_cm: number | null;
  rim_depth_cm: number | null;
  inside_rim_diameter_cm: number | null;
  rim_width_cm: number | null;
  rim_depth_ratio: number | null;
  flexibility_kg: number | null;
  last_production_year: number | null;
  source: string;
};

export function normalizeBrand(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !BRAND_STOP.has(t))
    .join(" ");
}

export function normalizeName(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Minimal RFC4180 parser — the PDGA export quotes every field. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function num(value: string | undefined | null): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function stabilityFor(turn: number | null, fade: number | null): DiscStability | null {
  if (turn === null || fade === null) return null;
  const net = turn + fade;
  if (net <= -2) return "very_understable";
  if (net <= -0.5) return "understable";
  if (net < 1.5) return "stable";
  if (net < 3) return "overstable";
  return "very_overstable";
}

const CATEGORY_MAP: Record<string, DiscCategory> = {
  "distance driver": "distance_driver",
  "control driver": "fairway_driver",
  "fairway driver": "fairway_driver",
  "hybrid driver": "fairway_driver",
  midrange: "midrange",
  "mid-range": "midrange",
  putter: "putter",
  "putt & approach": "putter",
  approach: "approach",
};

/** Rim width is the most reliable signal for discs with no published flight numbers. */
export function categoryFromRim(rimWidthCm: number | null): DiscCategory {
  if (rimWidthCm === null) return "specialty";
  if (rimWidthCm >= 1.9) return "distance_driver";
  if (rimWidthCm >= 1.5) return "fairway_driver";
  if (rimWidthCm >= 1.2) return "midrange";
  return "putter";
}

function parseApprovedDate(value: string): string | null {
  const parsed = Date.parse((value || "").trim());
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Fetches both catalogs and merges them into one record per brand + mold. */
export async function fetchDiscLibrary(): Promise<MoldRecord[]> {
  const [csvRes, discitRes] = await Promise.all([
    fetch(PDGA_CSV, { headers: { accept: "text/csv" } }),
    fetch(DISCIT_API, { headers: { accept: "application/json" } }),
  ]);
  if (!csvRes.ok) throw new Error(`PDGA disc list unavailable (${csvRes.status})`);
  if (!discitRes.ok) throw new Error(`Disc catalog unavailable (${discitRes.status})`);

  const merged = new Map<string, MoldRecord>();

  type DiscItRow = {
    name: string;
    brand: string;
    category: string;
    speed: string;
    glide: string;
    turn: string;
    fade: string;
    pic?: string;
    link?: string;
    name_slug?: string;
  };
  const discit = (await discitRes.json()) as DiscItRow[];
  for (const d of discit) {
    const key = `${normalizeBrand(d.brand)}|${normalizeName(d.name)}`;
    if (key === "|") continue;
    const speed = num(d.speed);
    const glide = num(d.glide);
    const turn = num(d.turn);
    const fade = num(d.fade);
    merged.set(key, {
      brand: d.brand.trim(),
      name: d.name.trim(),
      category: CATEGORY_MAP[(d.category || "").trim().toLowerCase()] ?? "specialty",
      speed,
      glide,
      turn,
      fade,
      stability: stabilityFor(turn, fade),
      slug: d.name_slug || slugify(d.name),
      image_url: d.pic ?? null,
      link_url: d.link ?? null,
      pdga_approved: false,
      pdga_approved_on: null,
      pdga_class: null,
      max_weight_g: null,
      diameter_cm: null,
      height_cm: null,
      rim_depth_cm: null,
      inside_rim_diameter_cm: null,
      rim_width_cm: null,
      rim_depth_ratio: null,
      flexibility_kg: null,
      last_production_year: null,
      source: "discit",
    });
  }

  const rows = parseCsv(await csvRes.text());
  const header = rows.shift() ?? [];
  const col = (label: string) => header.indexOf(label);
  const iBrand = col("Manufacturer / Distributor");
  const iModel = col("Disc Model");
  for (const r of rows) {
    const brand = (r[iBrand] ?? "").trim();
    const name = (r[iModel] ?? "").trim();
    const key = `${normalizeBrand(brand)}|${normalizeName(name)}`;
    if (!brand || !name) continue;
    const rimWidth = num(r[col("Rim Thickness (cm)")]);
    const base = merged.get(key);
    const record: MoldRecord = base ?? {
      brand,
      name,
      category: categoryFromRim(rimWidth),
      speed: null,
      glide: null,
      turn: null,
      fade: null,
      stability: null,
      slug: slugify(name),
      image_url: null,
      link_url: null,
      pdga_approved: true,
      pdga_approved_on: null,
      pdga_class: null,
      max_weight_g: null,
      diameter_cm: null,
      height_cm: null,
      rim_depth_cm: null,
      inside_rim_diameter_cm: null,
      rim_width_cm: null,
      rim_depth_ratio: null,
      flexibility_kg: null,
      last_production_year: null,
      source: "pdga",
    };
    const lastYear = num(r[col("Last Year Production")]);
    merged.set(key, {
      ...record,
      category: record.category === "specialty" ? categoryFromRim(rimWidth) : record.category,
      pdga_approved: true,
      pdga_approved_on: parseApprovedDate(r[col("Approved Date")] ?? ""),
      pdga_class: (r[col("Class")] ?? "").trim() || null,
      max_weight_g: num(r[col("Max Weight (gr)")]),
      diameter_cm: num(r[col("Diameter (cm)")]),
      height_cm: num(r[col("Height (cm)")]),
      rim_depth_cm: num(r[col("Rim Depth (cm)")]),
      inside_rim_diameter_cm: num(r[col("Inside Rim Diameter (cm)")]),
      rim_width_cm: rimWidth,
      rim_depth_ratio: num(r[col("Rim Depth / Diameter Ratio (%)")]),
      flexibility_kg: num(r[col("Flexibility (kg)")]),
      last_production_year: lastYear ? Math.trunc(lastYear) : null,
      source: base ? "pdga+discit" : "pdga",
    });
  }

  return [...merged.values()];
}

/** Upserts the merged catalog, creating any brand rows it needs first. */
export async function syncDiscLibraryToDatabase(): Promise<{
  molds: number;
  brands: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const records = await fetchDiscLibrary();

  const { data: existingBrands } = await supabaseAdmin
    .from("disc_manufacturers")
    .select("id,name")
    .limit(5000);
  const brandByKey = new Map<string, string>();
  for (const b of (existingBrands as { id: string; name: string }[] | null) ?? []) {
    brandByKey.set(normalizeBrand(b.name), b.id);
  }

  const missing = new Map<string, string>();
  for (const rec of records) {
    const key = normalizeBrand(rec.brand);
    if (key && !brandByKey.has(key)) missing.set(key, rec.brand);
  }
  if (missing.size) {
    const rows = [...missing.values()].map((name) => ({ name, slug: slugify(name) }));
    await supabaseAdmin.from("disc_manufacturers").upsert(rows, { onConflict: "slug" });
    const { data: refreshed } = await supabaseAdmin
      .from("disc_manufacturers")
      .select("id,name")
      .limit(5000);
    brandByKey.clear();
    for (const b of (refreshed as { id: string; name: string }[] | null) ?? []) {
      brandByKey.set(normalizeBrand(b.name), b.id);
    }
  }

  const seen = new Set<string>();
  const payload = records.flatMap((rec) => {
    const manufacturer_id = brandByKey.get(normalizeBrand(rec.brand));
    if (!manufacturer_id) return [];
    const key = `${manufacturer_id}|${normalizeName(rec.name)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const { brand: _brand, ...rest } = rec;
    return [{ ...rest, manufacturer_id }];
  });

  for (let i = 0; i < payload.length; i += 300) {
    const { error } = await supabaseAdmin
      .from("disc_molds")
      .upsert(payload.slice(i, i + 300), { onConflict: "manufacturer_id,name" });
    if (error) {
      console.error("Disc library upsert failed", error);
      throw new Error("Could not save the disc library.");
    }
  }

  return { molds: payload.length, brands: missing.size };
}
