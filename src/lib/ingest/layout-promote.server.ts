/**
 * Turn the layouts we read from UDisc into layouts players can actually score.
 *
 * The catalogue import mirrors every published layout into
 * `course_layout_profiles` — real names, hole counts, par and length. That table
 * is reference data only: nothing in the app can start a round from it. This is
 * the promotion step: each mirrored layout becomes a real `course_layouts` row
 * with hole rows, and the generic placeholder layout is retired once a real one
 * exists.
 *
 * Nothing here invents a coordinate or a per-hole par. Hole rows start at par 3
 * with no pins; the layout carries the published par total and length, and tee
 * and basket coordinates stay empty until they are mapped.
 *
 * Server-only. Writes use the service-role client because courses are shared
 * app data.
 */

const PLACEHOLDER_NAMES = new Set(["main layout", "main", "default", "default layout"]);

/** Tables that can point at a layout; a referenced placeholder is never deleted. */
const LAYOUT_REFERENCES = [
  "rounds",
  "round_ratings",
  "tournaments",
  "tournament_rounds",
  "leagues",
  "league_events",
  "event_join_codes",
  "course_features",
  "contributions",
  "hole_intel",
] as const;

export type LayoutPromotion = {
  layoutsCreated: number;
  layoutsUpdated: number;
  holesCreated: number;
  holesRemoved: number;
  placeholdersRetired: number;
};

const EMPTY: LayoutPromotion = {
  layoutsCreated: 0,
  layoutsUpdated: 0,
  holesCreated: 0,
  holesRemoved: 0,
  placeholdersRetired: 0,
};

const nameKey = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/\blayout\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const usableHoles = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 36;

type Db = {
  from: (table: string) => any;
};

type ProfileRow = {
  layout_name: string | null;
  holes: number | null;
  par: number | null;
  length_ft: number | null;
};

type LayoutRow = {
  id: string;
  name: string;
  hole_count: number | null;
  par_total: number | null;
  distance_total: number | null;
  is_default: boolean | null;
};

async function isReferenced(db: Db, layoutId: string): Promise<boolean> {
  for (const table of LAYOUT_REFERENCES) {
    const { count } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("layout_id", layoutId);
    if ((count ?? 0) > 0) return true;
  }
  return false;
}

/** Bring a layout's hole rows in line with its hole count, keeping mapped work. */
async function syncHoleRows(
  db: Db,
  layoutId: string,
  holeCount: number,
  result: LayoutPromotion,
): Promise<void> {
  const { data: rows } = await db
    .from("holes")
    .select("id, number, tee_lat, basket_lat")
    .eq("layout_id", layoutId);
  const existing = (rows ?? []) as Array<{
    id: string;
    number: number;
    tee_lat: number | null;
    basket_lat: number | null;
  }>;
  const have = new Set(existing.map((r) => r.number));

  const missing: number[] = [];
  for (let n = 1; n <= holeCount; n += 1) if (!have.has(n)) missing.push(n);
  if (missing.length) {
    const { error } = await db
      .from("holes")
      .insert(missing.map((number) => ({ layout_id: layoutId, number, par: 3 })));
    if (!error) result.holesCreated += missing.length;
  }

  // Rows past the layout's hole count are only removed while they hold no
  // mapped coordinates — a pin is evidence the hole is real.
  const stale = existing.filter(
    (r) => r.number > holeCount && r.tee_lat == null && r.basket_lat == null,
  );
  if (stale.length) {
    const { error } = await db
      .from("holes")
      .delete()
      .in(
        "id",
        stale.map((r) => r.id),
      );
    if (!error) result.holesRemoved += stale.length;
  }
}

/**
 * Promote every mirrored layout on one course. Returns what changed so callers
 * can report real numbers instead of a vague success.
 */
export async function promoteCourseLayouts(db: Db, courseId: string): Promise<LayoutPromotion> {
  const result: LayoutPromotion = { ...EMPTY };

  const { data: profileRows } = await db
    .from("course_layout_profiles")
    .select("layout_name, holes, par, length_ft")
    .eq("course_id", courseId)
    .eq("source", "udisc");

  const seen = new Set<string>();
  const profiles = ((profileRows ?? []) as ProfileRow[])
    .filter((p) => !!(p.layout_name ?? "").trim() && usableHoles(p.holes))
    .filter((p) => {
      const key = `${nameKey(p.layout_name)}|${p.holes}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!profiles.length) return result;

  const { data: layoutRows } = await db
    .from("course_layouts")
    .select("id, name, hole_count, par_total, distance_total, is_default")
    .eq("course_id", courseId);
  const layouts = (layoutRows ?? []) as LayoutRow[];
  const byName = new Map(layouts.map((l) => [nameKey(l.name), l]));

  for (const profile of profiles) {
    const holeCount = profile.holes as number;
    const par = usableHoles(profile.par) || (profile.par ?? 0) > 36 ? profile.par : null;
    const existing = byName.get(nameKey(profile.layout_name));

    if (existing) {
      const patch: Record<string, unknown> = {};
      if ((existing.hole_count ?? 0) !== holeCount) patch["hole_count"] = holeCount;
      if (par != null && existing.par_total !== par) patch["par_total"] = par;
      if (profile.length_ft != null && existing.distance_total !== profile.length_ft) {
        patch["distance_total"] = profile.length_ft;
      }
      if (Object.keys(patch).length) {
        const { error } = await db.from("course_layouts").update(patch).eq("id", existing.id);
        if (!error) result.layoutsUpdated += 1;
      }
      await syncHoleRows(db, existing.id, holeCount, result);
      continue;
    }

    const { data: created, error } = await db
      .from("course_layouts")
      .insert({
        course_id: courseId,
        name: (profile.layout_name as string).slice(0, 120),
        hole_count: holeCount,
        par_total: par ?? holeCount * 3,
        distance_total: profile.length_ft,
        is_default: false,
      })
      .select("id, name, hole_count, par_total, distance_total, is_default")
      .maybeSingle();
    if (error || !created) continue;
    result.layoutsCreated += 1;
    const row = created as LayoutRow;
    layouts.push(row);
    byName.set(nameKey(row.name), row);
    await syncHoleRows(db, row.id, holeCount, result);
  }

  // Retire the generic placeholder now that named layouts exist — but only when
  // nothing has been mapped on it and nothing points at it.
  const promoted = new Set(profiles.map((p) => nameKey(p.layout_name)));
  for (const layout of [...layouts]) {
    const key = nameKey(layout.name);
    if (!PLACEHOLDER_NAMES.has(key) || promoted.has(key)) continue;
    if (layouts.length <= 1) continue;
    const { count: pinned } = await db
      .from("holes")
      .select("id", { count: "exact", head: true })
      .eq("layout_id", layout.id)
      .not("tee_lat", "is", null);
    const { count: basketed } = await db
      .from("holes")
      .select("id", { count: "exact", head: true })
      .eq("layout_id", layout.id)
      .not("basket_lat", "is", null);
    if ((pinned ?? 0) > 0 || (basketed ?? 0) > 0) continue;
    if (await isReferenced(db, layout.id)) continue;
    await db.from("holes").delete().eq("layout_id", layout.id);
    const { error } = await db.from("course_layouts").delete().eq("id", layout.id);
    if (error) continue;
    result.placeholdersRetired += 1;
    const at = layouts.findIndex((l) => l.id === layout.id);
    if (at >= 0) layouts.splice(at, 1);
  }

  if (!layouts.length) return result;

  // Exactly one default: prefer the layout UDisc lists first, then the biggest.
  const preferredKey = nameKey(profiles[0]?.layout_name);
  const preferred =
    layouts.find((l) => nameKey(l.name) === preferredKey) ??
    [...layouts].sort((a, b) => (b.hole_count ?? 0) - (a.hole_count ?? 0))[0];
  if (preferred) {
    if (!preferred.is_default) {
      await db.from("course_layouts").update({ is_default: true }).eq("id", preferred.id);
    }
    const others = layouts.filter((l) => l.id !== preferred.id && l.is_default);
    for (const l of others) {
      await db.from("course_layouts").update({ is_default: false }).eq("id", l.id);
    }
    if (usableHoles(preferred.hole_count)) {
      await db
        .from("courses")
        .update({ hole_count: preferred.hole_count, hole_count_verified: true })
        .eq("id", courseId);
    }
  }

  return result;
}

/**
 * Guarantee a course can be scored. When a listing publishes no layouts there
 * is nothing to promote, so the course would sit in the library unplayable.
 * This gives it one layout built from its own hole count — no invented
 * coordinates, just the hole rows a card needs.
 */
export async function ensurePlayableLayout(db: Db, courseId: string): Promise<boolean> {
  const { count } = await db
    .from("course_layouts")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId);
  if ((count ?? 0) > 0) return false;

  const { data: course } = await db
    .from("courses")
    .select("hole_count")
    .eq("id", courseId)
    .maybeSingle();
  const holeCount = (course as { hole_count: number | null } | null)?.hole_count ?? null;
  if (!usableHoles(holeCount)) return false;

  const { data: layout } = await db
    .from("course_layouts")
    .insert({
      course_id: courseId,
      name: "Main layout",
      hole_count: holeCount,
      par_total: holeCount * 3,
      is_default: true,
    })
    .select("id")
    .maybeSingle();
  if (!layout) return false;

  await db.from("holes").insert(
    Array.from({ length: holeCount }, (_, i) => ({
      layout_id: (layout as { id: string }).id,
      number: i + 1,
      par: 3,
    })),
  );
  return true;
}

/** Courses whose mirrored layouts have not been promoted into playable layouts. */
export async function coursesAwaitingPromotion(db: Db, limit: number): Promise<string[]> {
  const { data: profiles } = await db
    .from("course_layout_profiles")
    .select("course_id, layout_name")
    .eq("source", "udisc")
    .limit(5000);
  const wanted = new Map<string, Set<string>>();
  for (const row of (profiles ?? []) as Array<{ course_id: string; layout_name: string | null }>) {
    const set = wanted.get(row.course_id) ?? new Set<string>();
    set.add(nameKey(row.layout_name));
    wanted.set(row.course_id, set);
  }
  const ids = [...wanted.keys()];
  if (!ids.length) return [];

  const have = new Map<string, Set<string>>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: rows } = await db
      .from("course_layouts")
      .select("course_id, name")
      .in("course_id", ids.slice(i, i + 200));
    for (const row of (rows ?? []) as Array<{ course_id: string; name: string }>) {
      const set = have.get(row.course_id) ?? new Set<string>();
      set.add(nameKey(row.name));
      have.set(row.course_id, set);
    }
  }

  const pending: string[] = [];
  for (const [courseId, names] of wanted) {
    const existing = have.get(courseId) ?? new Set<string>();
    const missing = [...names].some((n) => !!n && !existing.has(n));
    if (missing) pending.push(courseId);
    if (pending.length >= limit) break;
  }
  return pending;
}
