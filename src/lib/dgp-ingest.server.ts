/**
 * Server-only ingest for the Disc Golf Professor skill-group survey dataset.
 * Fetches the public pages, parses the embedded tallies and writes them into
 * the read-only dgp_* knowledge base tables.
 *
 * We store aggregate tallies only — no page copy, images or affiliate links.
 */
import {
  dgpPageUrls,
  parseSkillGroupPage,
  type ParsedShotProfile,
  type ParsedSkillGroupPage,
} from "@/lib/dgp-parsers";
import {
  categoryFromSpeed,
  cleanBrandName,
  cleanMoldName,
  slugifyName,
  stabilityFromFlight,
} from "@/lib/disc-mold-normalize";

const USER_AGENT = "DG Dashboard knowledge-base ingest (+https://dgdashboard.app)";

export type BatchResult = {
  offset: number;
  limit: number;
  total_pages: number;
  pages_fetched: number;
  profiles_written: number;
  answers_written: number;
  failures: number;
  unmatched_molds: number;
  /** Discs added to our library during this run. */
  molds_created: number;
  /** Survey names we refused, with the reason. */
  molds_skipped: number;
  errors: string[];
  next_offset: number | null;
};

export function dgpTotalPages(): number {
  return dgpPageUrls().length;
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type MoldIndex = Map<string, string>;

/** Read every row of a table, past the Data API's 1000-row page size. */
async function readAll(admin: any, table: string, columns: string): Promise<any[]> {
  const page = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  return rows;
}

/** Build a lookup of normalized mold name (and brand+mold) -> mold id. */
export async function loadMoldIndex(admin: any): Promise<MoldIndex> {
  const index: MoldIndex = new Map();
  const brands = await readAll(admin, "disc_manufacturers", "id, name");
  const brandName = new Map<string, string>(
    (brands as { id: string; name: string }[]).map((b) => [b.id, normalizeName(b.name)]),
  );
  const molds = await readAll(admin, "disc_molds", "id, name, manufacturer_id");
  for (const mold of molds as { id: string; name: string; manufacturer_id: string | null }[]) {
    const name = normalizeName(mold.name);
    if (!name) continue;
    const brand = mold.manufacturer_id ? brandName.get(mold.manufacturer_id) : null;
    if (brand) index.set(`${brand}|${name}`, mold.id);
    if (!index.has(name)) index.set(name, mold.id);
  }
  return index;
}

/** Survey brand strings are the manufacturer's legal name; ours are shorter. */
function brandCandidates(brand: string | null): string[] {
  if (!brand) return [];
  const norm = normalizeName(brand);
  const stripped = norm
    .replace(/\b(discs?|disc golf|golf|champion|sports|association|company|inc|llc)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return [...new Set([norm, stripped].filter(Boolean))];
}

export function matchMold(
  index: MoldIndex,
  brand: string | null,
  mold: string | null,
): string | null {
  if (!mold) return null;
  const moldNorm = normalizeName(mold);
  if (!moldNorm) return null;
  for (const b of brandCandidates(brand)) {
    const hit = index.get(`${b}|${moldNorm}`);
    if (hit) return hit;
  }
  return index.get(moldNorm) ?? null;
}

/**
 * Survey discs are added to our library as they are read, so nothing has to be
 * typed in by hand. The registry keeps one pass' worth of lookups in memory and
 * remembers what it created or refused.
 */
export type MoldRegistry = {
  index: MoldIndex;
  brands: Map<string, string>;
  created: number;
  skipped: Map<string, string>;
};

export type SurveyFlight = {
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  weight_max_g: number | null;
};

export async function loadMoldRegistry(admin: any): Promise<MoldRegistry> {
  const brandRows = await readAll(admin, "disc_manufacturers", "id, name");
  const brands = new Map<string, string>();
  for (const row of brandRows as { id: string; name: string }[]) {
    const key = normalizeName(row.name);
    if (key) brands.set(key, row.id);
  }
  return { index: await loadMoldIndex(admin), brands, created: 0, skipped: new Map() };
}

const UNKNOWN_BRAND = "Unknown brand";

/** Find the manufacturer for a survey brand string, adding it when new. */
async function ensureManufacturer(
  admin: any,
  registry: MoldRegistry,
  brand: string | null,
): Promise<string | null> {
  const name = cleanBrandName(brand) ?? UNKNOWN_BRAND;
  for (const candidate of [normalizeName(name), ...brandCandidates(name)]) {
    const hit = registry.brands.get(candidate);
    if (hit) return hit;
  }

  const { data, error } = await admin
    .from("disc_manufacturers")
    .upsert({ name, slug: slugifyName(name) || "brand" }, { onConflict: "name" })
    .select("id")
    .single();
  if (error || !data?.id) return null;
  registry.brands.set(normalizeName(name), data.id as string);
  return data.id as string;
}

/**
 * Return the library mold for a survey disc, creating it when we do not have it
 * yet. Existing molds are never overwritten; a survey-sourced mold only has its
 * empty flight numbers filled in.
 */
export async function ensureMold(
  admin: any,
  registry: MoldRegistry,
  brand: string | null,
  mold: string | null,
  flight: SurveyFlight,
): Promise<string | null> {
  const existing = matchMold(registry.index, brand, mold);
  if (existing) return existing;

  const cleaned = cleanMoldName(mold);
  if (!cleaned.name) {
    const key = `${brand ?? ""}|${mold ?? ""}`;
    registry.skipped.set(key, cleaned.skipReason ?? "Name could not be used");
    return null;
  }

  const manufacturerId = await ensureManufacturer(admin, registry, brand);
  if (!manufacturerId) {
    registry.skipped.set(`${brand ?? ""}|${mold ?? ""}`, "Brand could not be added");
    return null;
  }

  const row = {
    manufacturer_id: manufacturerId,
    name: cleaned.name,
    slug:
      slugifyName(`${cleanBrandName(brand) ?? ""} ${cleaned.name}`) || slugifyName(cleaned.name),
    category: categoryFromSpeed(flight.speed),
    speed: flight.speed,
    glide: flight.glide,
    turn: flight.turn,
    fade: flight.fade,
    stability: stabilityFromFlight(flight.turn, flight.fade),
    max_weight_g: flight.weight_max_g,
    description: cleaned.note
      ? `Added from the skill-group survey (${cleaned.note}).`
      : "Added from the skill-group survey.",
    source: "dgp_survey",
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from("disc_molds")
    .upsert(row, { onConflict: "manufacturer_id,name", ignoreDuplicates: false })
    .select("id, source, speed, glide, turn, fade")
    .single();
  if (error || !data?.id) {
    registry.skipped.set(
      `${brand ?? ""}|${mold ?? ""}`,
      error?.message ?? "Could not be saved to the library",
    );
    return null;
  }

  const id = data.id as string;
  registry.created += 1;
  registry.index.set(normalizeName(cleaned.name), id);
  for (const b of brandCandidates(cleanBrandName(brand) ?? UNKNOWN_BRAND)) {
    registry.index.set(`${b}|${normalizeName(cleaned.name)}`, id);
  }
  return id;
}

async function upsertSkillGroup(admin: any, page: ParsedSkillGroupPage): Promise<string> {
  const row = {
    group_code: page.group_code,
    udisc_band: page.udisc.label,
    udisc_min: page.udisc.min,
    udisc_max: page.udisc.max,
    pdga_band: page.pdga.label,
    pdga_min: page.pdga.min,
    pdga_max: page.pdga.max,
    source_url: `https://discgolfprofessor.com/skill-groups/`,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from("dgp_skill_groups")
    .upsert(row, { onConflict: "group_code" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function upsertProfile(
  admin: any,
  skillGroupId: string,
  sourceUrl: string,
  profile: ParsedShotProfile,
  registry: MoldRegistry,
): Promise<{ answers: number; unmatched: number }> {
  const { data, error } = await admin
    .from("dgp_shot_profiles")
    .upsert(
      {
        skill_group_id: skillGroupId,
        disc_class: profile.disc_class,
        throw_style: profile.throw_style,
        shot_shape: profile.shot_shape,
        speed_min: profile.speed_min,
        speed_max: profile.speed_max,
        submissions: profile.submissions,
        source_url: sourceUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "skill_group_id,disc_class,throw_style,shot_shape" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const profileId = data.id as string;

  await admin.from("dgp_shot_answers").delete().eq("profile_id", profileId);

  const totalsByKind = new Map<string, number>();
  for (const a of profile.answers) {
    totalsByKind.set(a.answer_kind, (totalsByKind.get(a.answer_kind) ?? 0) + a.submissions);
  }

  let unmatched = 0;
  const rows: Record<string, unknown>[] = [];
  for (const a of profile.answers) {
    const total = totalsByKind.get(a.answer_kind) ?? 0;
    // Every disc named in the survey ends up in our library, so the answer can
    // always point at a real mold instead of a loose name.
    const mold_id =
      a.answer_kind === "disc"
        ? await ensureMold(admin, registry, a.brand, a.mold, {
            speed: a.speed,
            glide: a.glide,
            turn: a.turn,
            fade: a.fade,
            weight_max_g: a.weight_max_g,
          })
        : null;
    if (a.answer_kind === "disc" && !mold_id) unmatched += 1;
    rows.push({
      profile_id: profileId,
      answer_kind: a.answer_kind,
      label: a.label,
      submissions: a.submissions,
      share: total > 0 ? Math.round((a.submissions / total) * 10000) / 100 : null,
      rank: a.rank,
      brand: a.brand,
      mold: a.mold,
      mold_id,
      weight_min_g: a.weight_min_g,
      weight_max_g: a.weight_max_g,
      distance_min_ft: a.distance_min_ft,
      distance_max_ft: a.distance_max_ft,
      speed: a.speed,
      glide: a.glide,
      turn: a.turn,
      fade: a.fade,
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await admin.from("dgp_shot_answers").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }
  return { answers: rows.length, unmatched };
}

/** Fetch and store one slice of the dataset. */
export async function ingestDgpPages(
  admin: any,
  offset: number,
  limit: number,
): Promise<BatchResult> {
  const urls = dgpPageUrls();
  const slice = urls.slice(offset, offset + limit);
  const registry = await loadMoldRegistry(admin);
  const groupIds = new Map<string, string>();

  const result: BatchResult = {
    offset,
    limit,
    total_pages: urls.length,
    pages_fetched: 0,
    profiles_written: 0,
    answers_written: 0,
    failures: 0,
    unmatched_molds: 0,
    molds_created: 0,
    molds_skipped: 0,
    errors: [],
    next_offset: offset + slice.length < urls.length ? offset + slice.length : null,
  };

  for (const url of slice) {
    try {
      const html = await fetchPage(url);
      result.pages_fetched += 1;
      const page = parseSkillGroupPage({ url, html });
      if (!page) continue;
      let groupId = groupIds.get(page.group_code);
      if (!groupId) {
        groupId = await upsertSkillGroup(admin, page);
        groupIds.set(page.group_code, groupId);
      }
      for (const profile of page.profiles) {
        const written = await upsertProfile(admin, groupId, url, profile, registry);
        result.profiles_written += 1;
        result.answers_written += written.answers;
        result.unmatched_molds += written.unmatched;
      }
    } catch (error) {
      result.failures += 1;
      if (result.errors.length < 5) {
        result.errors.push(`${url}: ${(error as Error).message}`);
      }
    }
  }
  result.molds_created = registry.created;
  result.molds_skipped = registry.skipped.size;

  await admin.from("dgp_ingest_runs").insert({
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    pages_fetched: result.pages_fetched,
    profiles_written: result.profiles_written,
    answers_written: result.answers_written,
    failures: result.failures,
    notes: `offset ${offset}, limit ${limit}, ${result.molds_created} discs added${result.errors.length ? ` — ${result.errors[0]}` : ""}`,
  });

  return result;
}

/**
 * Add and link every stored survey disc against our library, without
 * re-fetching any pages. Anything we cannot name is reported instead of added.
 */
export async function relinkDgpMolds(admin: any): Promise<{
  scanned: number;
  linked: number;
  created: number;
  skipped: number;
  still_unmatched: number;
}> {
  const registry = await loadMoldRegistry(admin);
  const rows = await readAll(
    admin,
    "dgp_shot_answers",
    "id, brand, mold, mold_id, answer_kind, speed, glide, turn, fade, weight_max_g",
  );
  type AnswerRow = {
    id: string;
    brand: string | null;
    mold: string | null;
    mold_id: string | null;
    answer_kind: string;
    speed: number | null;
    glide: number | null;
    turn: number | null;
    fade: number | null;
    weight_max_g: number | null;
  };
  const discs = (rows as AnswerRow[]).filter((r) => r.answer_kind === "disc");

  let linked = 0;
  let stillUnmatched = 0;
  for (const row of discs) {
    const match = await ensureMold(admin, registry, row.brand, row.mold, {
      speed: row.speed,
      glide: row.glide,
      turn: row.turn,
      fade: row.fade,
      weight_max_g: row.weight_max_g,
    });
    if (!match) {
      if (!row.mold_id) stillUnmatched += 1;
      continue;
    }
    if (match === row.mold_id) continue;
    const { error } = await admin
      .from("dgp_shot_answers")
      .update({ mold_id: match })
      .eq("id", row.id);
    if (!error) linked += 1;
  }
  return {
    scanned: discs.length,
    linked,
    created: registry.created,
    skipped: registry.skipped.size,
    still_unmatched: stillUnmatched,
  };
}
