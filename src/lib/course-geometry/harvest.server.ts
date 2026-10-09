/**
 * National course geometry harvester.
 *
 * Reads OpenStreetMap one 1-degree cell at a time, stores every tee pad and
 * basket it finds as a source observation, matches each mapped site to a
 * canonical course, and fills ONLY empty tee/basket spots on layouts that
 * already exist. Existing coordinates are never overwritten. Pins whose hole
 * numbers had to be guessed from walking order wait for a person to accept.
 */
import type { Pin } from "@/lib/course-holes.server";

const LEASE_MS = 15 * 60_000;
const REFRESH_DAYS = 30;
const MATCH_M = 900;

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export type CellResult = { cell: string; sites: number; observations: number; matched: number; filled: number; review: number; assets?: number; drafts?: number; error?: string };

/** Fill empty tee/basket spots on every existing layout of a course. Returns holes changed. */
export async function fillLayoutGaps(
  db: Admin,
  courseId: string,
  holes: Array<{ number: number; tee: { lat: number; lng: number } | null; basket: { lat: number; lng: number } | null }>,
): Promise<number> {
  const { distanceFeet } = await import("@/lib/course-holes.server");
  const usable = holes.filter((h) => h.tee || h.basket);
  if (!usable.length) return 0;
  const { data: layouts } = await db.from("course_layouts").select("id, hole_count").eq("course_id", courseId);
  let changed = 0;
  for (const layout of layouts ?? []) {
    const max = layout.hole_count ?? 0;
    const forLayout = max > 0 ? usable.filter((h) => h.number <= max) : usable;
    if (!forLayout.length) continue;
    const { data: rows } = await db.from("holes").select("id, number, tee_lat, tee_lng, basket_lat, basket_lng").eq("layout_id", layout.id);
    const byNum = new Map((rows ?? []).map((r) => [r.number, r]));
    for (const h of forLayout) {
      const ex = byNum.get(h.number);
      const hasTee = ex?.tee_lat != null && ex?.tee_lng != null;
      const hasBasket = ex?.basket_lat != null && ex?.basket_lng != null;
      const patch: { tee_lat?: number; tee_lng?: number; basket_lat?: number; basket_lng?: number; distance_ft?: number } = {};
      if (h.tee && !hasTee) { patch.tee_lat = h.tee.lat; patch.tee_lng = h.tee.lng; }
      if (h.basket && !hasBasket) { patch.basket_lat = h.basket.lat; patch.basket_lng = h.basket.lng; }
      if (!Object.keys(patch).length) continue;
      const tee = hasTee ? { lat: ex!.tee_lat as number, lng: ex!.tee_lng as number } : h.tee;
      const basket = hasBasket ? { lat: ex!.basket_lat as number, lng: ex!.basket_lng as number } : h.basket;
      if (tee && basket) {
        const ft = distanceFeet(tee, basket);
        // Distance sanity: a hole under 60 ft or over 1,500 ft is almost certainly a bad pairing.
        if (ft < 60 || ft > 1500) continue;
        patch.distance_ft = ft;
      }
      const { error } = ex
        ? await db.from("holes").update(patch).eq("id", ex.id)
        : await db.from("holes").insert({ layout_id: layout.id, number: h.number, par: 3, ...patch });
      if (!error) changed += 1;
    }
  }
  return changed;
}

async function claimCells(db: Admin, limit: number) {
  const now = new Date();
  const stale = new Date(now.getTime() - LEASE_MS).toISOString();
  const { data } = await db
    .from("geometry_harvest_cells")
    .select("id, south, west, north, east, attempts, status, updated_at")
    .or(`and(status.in.(pending,done,error),next_run_at.lte.${now.toISOString()}),and(status.eq.running,updated_at.lt.${stale})`)
    .order("next_run_at", { ascending: true })
    .limit(limit * 3);
  const claimed: NonNullable<typeof data> = [];
  for (const c of data ?? []) {
    if (claimed.length >= limit) break;
    // Compare-and-set so two timers never read the same cell.
    const { data: won } = await db
      .from("geometry_harvest_cells")
      .update({ status: "running", updated_at: now.toISOString() })
      .eq("id", c.id)
      .eq("updated_at", c.updated_at)
      .select("id");
    if (won?.length) claimed.push(c);
  }
  return claimed;
}

/**
 * Build physical course assets (holes → tee pads + basket positions) from
 * observations that carry a source hole number. Independent of layouts: every
 * tee pad and every basket position becomes its own row, keyed to the source
 * observation so re-reads never duplicate. Pins already within 5 m of an
 * existing asset on that hole (e.g. steward-mapped) are not added again.
 * Unnumbered pins stay as unassigned observations. Returns assets created.
 */
export async function materializePhysicalAssets(db: Admin, courseId: string, layoutId?: string): Promise<number> {
  const lib = await import("@/lib/course-holes.server");
  const { data: obs } = await db
    .from("course_geometry_observations")
    .select("id, feature_type, hole_ref, hole_ref_inferred, latitude, longitude")
    .eq("course_id", courseId).not("hole_ref", "is", null).in("match_state", ["matched", "accepted", "needs_review"]);
  const explicit = (obs ?? []).filter((o) => !o.hole_ref_inferred);
  if (!explicit.length) return 0;

  const [{ data: holes }, { data: tees }, { data: baskets }] = await Promise.all([
    db.from("course_holes").select("id, hole_number, label").eq("course_id", courseId),
    db.from("course_tees").select("course_hole_id, latitude, longitude, source_observation_id").eq("course_id", courseId),
    db.from("course_baskets").select("course_hole_id, latitude, longitude, source_observation_id").eq("course_id", courseId),
  ]);
  // Match existing physical holes by number ("1", "Hole 1"). When a number is
  // shared by several holes (separate hole sets per layout) it's ambiguous: the
  // pin stays unassigned rather than guessing or adding another "Hole N".
  const holeId = new Map<number, string>();
  const ambiguous = new Set<number>();
  for (const h of holes ?? []) {
    const n = h.hole_number ?? (Number(/^\s*(?:hole\s*)?(\d{1,2})\s*$/i.exec(h.label)?.[1]) || null);
    if (!n) continue;
    if (holeId.has(n)) ambiguous.add(n); else holeId.set(n, h.id);
  }
  let hasExisting = (holes ?? []).length > 0;
  // A reviewer picked which layout's holes the map numbers refer to.
  if (layoutId) {
    const { data: slots } = await db.from("layout_slots").select("position, course_hole_id").eq("layout_id", layoutId);
    holeId.clear(); ambiguous.clear(); hasExisting = true;
    for (const sl of slots ?? []) holeId.set(sl.position, sl.course_hole_id);
    if (!holeId.size) return 0;
  }
  const seen = new Set([...(tees ?? []), ...(baskets ?? [])].map((r) => r.source_observation_id).filter(Boolean));
  const near = (list: typeof tees, hid: string, p: { lat: number; lng: number }) =>
    (list ?? []).some((r) => r.course_hole_id === hid && r.latitude != null && r.longitude != null && lib.distanceMeters(p, { lat: r.latitude, lng: r.longitude }) <= 5);

  let created = 0;
  const counters = new Map<string, number>();
  for (const o of explicit.sort((a, b) => a.hole_ref! - b.hole_ref!)) {
    if (seen.has(o.id)) continue;
    const n = o.hole_ref!;
    if (ambiguous.has(n)) continue;
    let hid = holeId.get(n);
    if (!hid && layoutId) continue;
    if (!hid && hasExisting && !(holes ?? []).every((h) => h.hole_number != null)) continue; // hand-built course: never add holes beside it
    if (!hid) {
      const { data: h } = await db.from("course_holes").insert({ course_id: courseId, label: `Hole ${n}`, hole_number: n, source: "openstreetmap" }).select("id").single();
      if (!h) continue;
      hid = h.id; holeId.set(n, hid);
    }
    const p = { lat: o.latitude, lng: o.longitude };
    const isTee = o.feature_type === "tee";
    if (near(isTee ? tees : baskets, hid, p)) continue;
    const k = `${hid}:${isTee}`;
    const idx = (counters.get(k) ?? (isTee ? tees : baskets)!.filter((r) => r.course_hole_id === hid).length);
    counters.set(k, idx + 1);
    const row = { course_id: courseId, course_hole_id: hid, latitude: o.latitude, longitude: o.longitude, source: "openstreetmap", source_observation_id: o.id };
    const { error } = isTee
      ? await db.from("course_tees").insert({ ...row, name: idx === 0 ? "Main" : `Tee ${idx + 1}` })
      : await db.from("course_baskets").insert({ ...row, name: String.fromCharCode(65 + Math.min(idx, 25)) });
    if (!error) created += 1;
  }
  return created;
}

/**
 * When a course has no layouts at all, draft one from its physical assets:
 * holes 1..N must be contiguous and each needs a basket position. Uses the
 * Main tee and basket A, never invents par, and stays a draft (hidden from
 * scoring) until someone checks and publishes it. Returns 1 when drafted.
 */
export async function draftLayoutFromAssets(db: Admin, courseId: string): Promise<number> {
  const { count } = await db.from("course_layouts").select("id", { count: "exact", head: true }).eq("course_id", courseId);
  if ((count ?? 0) > 0) return 0;
  const [{ data: holes }, { data: tees }, { data: baskets }] = await Promise.all([
    db.from("course_holes").select("id, hole_number").eq("course_id", courseId).not("hole_number", "is", null),
    db.from("course_tees").select("id, course_hole_id, name").eq("course_id", courseId),
    db.from("course_baskets").select("id, course_hole_id, name").eq("course_id", courseId),
  ]);
  const sorted = (holes ?? []).sort((a, b) => a.hole_number! - b.hole_number!);
  if (sorted.length < 3 || sorted.some((h, i) => h.hole_number !== i + 1)) return 0;
  const pick = <T extends { course_hole_id: string; name: string }>(list: T[] | null, hid: string, pref: string) => {
    const mine = (list ?? []).filter((r) => r.course_hole_id === hid);
    return mine.find((r) => r.name === pref) ?? mine[0] ?? null;
  };
  if (sorted.some((h) => !pick(baskets, h.id, "A"))) return 0;
  const { data: layout } = await db.from("course_layouts").insert({
    course_id: courseId, name: "Main (from map)", hole_count: sorted.length, status: "draft", created_by: null,
    design_summary: { source: "openstreetmap", note: "Drafted from mapped tee pads and baskets; par not set" },
  } as never).select("id").single();
  if (!layout) return 0;
  const { error } = await db.from("layout_slots").insert(sorted.map((h) => ({
    layout_id: (layout as { id: string }).id, position: h.hole_number!, display_label: String(h.hole_number),
    course_hole_id: h.id, tee_id: pick(tees, h.id, "Main")?.id ?? null, basket_id: pick(baskets, h.id, "A")!.id, par: null,
  })));
  if (error) { await db.from("course_layouts").delete().eq("id", (layout as { id: string }).id); return 0; }
  return 1;
}

export async function harvestGeometryCells(limit = 1): Promise<CellResult[]> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const cells = await claimCells(db, limit);
  const out: CellResult[] = [];
  for (const cell of cells) out.push(await harvestCell(db, cell));
  return out;
}

export async function harvestCell(
  db: Admin,
  cell: { id: string; south: number; west: number; north: number; east: number; attempts: number },
): Promise<CellResult> {
  const res: CellResult = { cell: cell.id, sites: 0, observations: 0, matched: 0, filled: 0, review: 0 };
  const lib = await import("@/lib/course-holes.server");
  try {
    const sites = await lib.fetchMappedSites({ south: cell.south, west: cell.west, north: cell.north, east: cell.east });
    res.sites = sites.length;
    const pad = 0.02;
    const { data: courses } = sites.length
      ? await db
          .from("courses")
          .select("id, name, latitude, longitude, hole_count")
          .gte("latitude", cell.south - pad).lte("latitude", cell.north + pad)
          .gte("longitude", cell.west - pad).lte("longitude", cell.east + pad)
          .eq("moderation_status", "approved").eq("is_ghost", false).is("merged_into_course_id", null)
      : { data: [] };

    const byCourse = new Map<string, { holeCount: number | null; pins: Pin[] }>();
    const now = new Date().toISOString();
    const obsRows: Array<Record<string, unknown>> = [];

    for (const site of sites) {
      // Course matching first: proximity, confirmed by name when the site has one.
      let best: { id: string; holeCount: number | null } | null = null;
      let bestScore = Infinity;
      let runnerUp = Infinity;
      for (const c of courses ?? []) {
        if (c.latitude == null || c.longitude == null) continue;
        const d = lib.distanceMeters({ lat: site.lat, lng: site.lng }, { lat: c.latitude, lng: c.longitude });
        if (d > MATCH_M) continue;
        const nameOk = site.name ? lib.nameLooksLikeSame(site.name, c.name) : true;
        const score = nameOk ? d : d + 600;
        if (score < bestScore) { runnerUp = bestScore; bestScore = score; best = { id: c.id, holeCount: c.hole_count ?? null }; }
        else if (score < runnerUp) runnerUp = score;
      }
      // Two courses nearly equally close (course complexes) — don't guess.
      const ambiguous = best && runnerUp - bestScore < 150;
      const courseId = best && !ambiguous ? best.id : null;
      if (courseId) {
        const b = byCourse.get(courseId) ?? { holeCount: best!.holeCount, pins: [] };
        b.pins.push(...site.pins);
        byCourse.set(courseId, b);
      }
      for (const p of site.pins) {
        obsRows.push({
          course_id: courseId,
          source: "openstreetmap",
          source_external_id: p.osmKey ?? `${site.osmKey}:${p.kind}:${p.lat.toFixed(6)},${p.lng.toFixed(6)}`,
          source_site_id: site.osmKey,
          feature_type: p.kind === "tee" ? "tee" : "basket_position",
          hole_ref: p.hole && p.hole >= 1 && p.hole <= 99 ? p.hole : null,
          latitude: p.lat,
          longitude: p.lng,
          metadata: { site_name: site.name, ambiguous_course: !!ambiguous, attribution: "© OpenStreetMap contributors" },
          confidence: courseId ? (p.hole ? "high" : "medium") : "low",
          match_state: courseId ? "matched" : "unmatched",
          last_seen: now,
        });
      }
    }

    // Idempotent store: new observations are inserted; ones already reviewed keep their state.
    const keys = obsRows.map((r) => r.source_external_id as string);
    const existing = new Map<string, { id: string; match_state: string; latitude: number; longitude: number }>();
    for (let i = 0; i < keys.length; i += 300) {
      const { data } = await db
        .from("course_geometry_observations")
        .select("id, source_external_id, match_state, latitude, longitude")
        .eq("source", "openstreetmap")
        .in("source_external_id", keys.slice(i, i + 300));
      for (const r of data ?? []) existing.set(r.source_external_id, r);
    }
    const fresh = obsRows.filter((r) => !existing.has(r.source_external_id as string));
    for (let i = 0; i < fresh.length; i += 300) {
      const { error } = await db.from("course_geometry_observations").insert(fresh.slice(i, i + 300) as never);
      if (!error) res.observations += Math.min(300, fresh.length - i);
    }
    for (const r of obsRows) {
      const ex = existing.get(r.source_external_id as string);
      if (!ex) continue;
      const moved = Math.abs(ex.latitude - (r.latitude as number)) > 1e-6 || Math.abs(ex.longitude - (r.longitude as number)) > 1e-6;
      await db
        .from("course_geometry_observations")
        .update(moved ? { last_seen: now, latitude: r.latitude as number, longitude: r.longitude as number, match_state: ex.match_state === "accepted" ? "conflict" : ex.match_state } : { last_seen: now })
        .eq("id", ex.id);
    }

    // Auto-fill only when every hole number came from the map itself.
    for (const [courseId, b] of byCourse) {
      res.matched += 1;
      const paired = lib.pairPinsIntoHoles(b.pins, b.holeCount);
      const confident = paired.inferred === 0 && paired.unnumbered === 0;
      const ids = b.pins.map((p) => p.osmKey).filter((k): k is string => !!k);
      if (confident) {
        const n = await fillLayoutGaps(db, courseId, paired.holes);
        res.filled += n;
        if (ids.length) await db.from("course_geometry_observations").update({ match_state: "accepted" }).eq("source", "openstreetmap").in("source_external_id", ids).eq("match_state", "matched");
      } else {
        res.review += 1;
        if (ids.length) await db.from("course_geometry_observations").update({ match_state: "needs_review", hole_ref_inferred: true }).eq("source", "openstreetmap").in("source_external_id", ids).eq("match_state", "matched").is("hole_ref", null);
      }
      // Physical assets come from explicitly numbered pins, with or without a layout.
      res.assets = (res.assets ?? 0) + (await materializePhysicalAssets(db, courseId));
      res.drafts = (res.drafts ?? 0) + (await draftLayoutFromAssets(db, courseId));
    }

    await db.from("geometry_harvest_cells").update({
      status: "done", attempts: 0, last_error: null, last_run_at: now, updated_at: now,
      sites_found: res.sites, observations: obsRows.length, courses_matched: res.matched, holes_filled: res.filled,
      next_run_at: new Date(Date.now() + REFRESH_DAYS * 864e5).toISOString(),
    }).eq("id", cell.id);
  } catch (e) {
    const attempts = cell.attempts + 1;
    res.error = "Map source didn't answer";
    console.error("geometry harvest cell failed", cell.id, e instanceof Error ? e.message : e);
    await db.from("geometry_harvest_cells").update({
      status: "error", attempts, last_error: res.error, updated_at: new Date().toISOString(),
      next_run_at: new Date(Date.now() + Math.min(24, 2 ** attempts) * 3_600_000).toISOString(),
    }).eq("id", cell.id);
  }
  return res;
}

/** Accept a course's review-waiting pins (hole order guessed from walking order) into its layouts. */
export async function acceptCourseObservations(courseId: string): Promise<number> {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const lib = await import("@/lib/course-holes.server");
  const { data: obs } = await db
    .from("course_geometry_observations")
    .select("id, feature_type, hole_ref, latitude, longitude")
    .eq("course_id", courseId)
    .in("match_state", ["needs_review", "matched"]);
  if (!obs?.length) return 0;
  const { data: c } = await db.from("courses").select("hole_count").eq("id", courseId).maybeSingle();
  const pins: Pin[] = obs.map((o) => ({ kind: o.feature_type === "tee" ? "tee" : "basket", lat: o.latitude, lng: o.longitude, hole: o.hole_ref }));
  const paired = lib.pairPinsIntoHoles(pins, c?.hole_count ?? null);
  const n = await fillLayoutGaps(db, courseId, paired.holes);
  await db.from("course_geometry_observations").update({ match_state: "accepted" }).in("id", obs.map((o) => o.id));
  return n;
}


/** Review-only observations from a user-aligned screenshot. The builder still
 * owns applying accepted positions through its normal undo/save pipeline. */
export async function recordReviewedOverlay(input: {courseId:string;image:string;name:string;anchors:import('../course-builder/overlay-geometry').OverlayAnchors;candidates:import('../course-builder/overlay-geometry').OverlayCandidate[]},userId:string){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const {recordSnapshot,recordObservation}=await import('../data-intel/snapshots.server');
 const {overlayPoint}=await import('../course-builder/overlay-geometry');
 const snapshotId=await recordSnapshot({source:'course_overlay',entityType:'course',externalId:input.courseId,payload:{...input,reviewedBy:userId},parserVersion:'overlay-v1'});
 if(!snapshotId)throw new Error('Could not retain the overlay source. Nothing was imported.');
 const rows=input.candidates.map(c=>{const p=overlayPoint(input.anchors,c.x,c.y);return {course_id:input.courseId,source:'course_overlay',source_external_id:`${snapshotId}:${c.id}`,source_site_id:input.courseId,feature_type:c.kind,hole_ref:c.hole,hole_ref_inferred:false,latitude:p[0],longitude:p[1],confidence:'medium',match_state:'needs_review',metadata:{snapshot_id:snapshotId,reviewed_by:userId,name:c.name,color:c.color}};});
 const {error}=await db.from('course_geometry_observations').upsert(rows,{onConflict:'source,source_external_id',ignoreDuplicates:true});if(error)throw new Error('Could not record overlay observations. Nothing was imported.');
 await recordObservation({entityType:'course',entityId:input.courseId,field:'reviewed_overlay',source:'course_overlay',value:{snapshotId,items:rows.map(r=>({kind:r.feature_type,hole:r.hole_ref,lat:r.latitude,lng:r.longitude}))},snapshotId,parserVersion:'overlay-v1'});
 return {snapshotId};
}
