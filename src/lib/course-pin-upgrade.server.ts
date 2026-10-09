/**
 * Upgrades town-centre course pins to the course's own spot, read from its
 * UDisc listing page. A pin only moves when the listing gives coordinates
 * within 60 km of the town — anything else stays labelled approximate. A
 * course with no pin at all takes the listing spot.
 */
const MAX_KM = 60;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(bLat - aLat) / 2) ** 2 +
    Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function extractListingCoords(html: string): { lat: number; lng: number } | null {
  const m = html.match(/google\.com\/maps\/place\/(-?\d{1,3}\.\d{4,}),(-?\d{1,3}\.\d{4,})/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export async function upgradeApproximatePins(limit = 60) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("courses")
    .select("id, latitude, longitude, course_sources!inner(source, canonical_url)")
    // Town-centre pins, and courses with no pin at all (they're off the map until placed).
    .or("location_quality.eq.city_approximate,latitude.is.null")
    .eq("is_ghost", false)
    .eq("course_sources.source", "udisc")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) return { checked: 0, upgraded: 0, error: "query failed" };

  let upgraded = 0;
  let checked = 0;
  const queue = [...(rows ?? [])];
  const worker = async () => {
    for (let row = queue.shift(); row; row = queue.shift()) {
      const url = (row as any).course_sources?.[0]?.canonical_url as string | undefined;
      if (!url?.startsWith("https://udisc.com/courses/")) continue;
      checked++;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DG Dashboard course sync)" } });
        if (!res.ok) throw new Error(String(res.status));
        const c = extractListingCoords(await res.text());
        const noPin = row.latitude == null || row.longitude == null;
        const near =
          c && !noPin ? km(row.latitude!, row.longitude!, c.lat, c.lng) <= MAX_KM : false;
        if (c && (near || noPin)) {
          let q = supabaseAdmin
            .from("courses")
            .update({ latitude: c.lat, longitude: c.lng, location_quality: "source_coordinate" })
            .eq("id", row.id);
          q = noPin ? q.is("latitude", null) : q.eq("location_quality", "city_approximate");
          await q;
          upgraded++;
        } else {
          // Touch the row so the next pass moves on to other courses.
          await supabaseAdmin.from("courses").update({ updated_at: new Date().toISOString() }).eq("id", row.id);
        }
      } catch {
        await supabaseAdmin.from("courses").update({ updated_at: new Date().toISOString() }).eq("id", row.id);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { checked, upgraded };
}

/**
 * Repair step for one course: a missing or town-centre pin takes the spot its
 * UDisc listing gives. A town-centre pin only moves within 60 km; a course
 * with no pin at all takes the listing spot as a source coordinate.
 */
export async function upgradeCoursePin(courseId: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: c } = await supabaseAdmin
    .from("courses").select("id, latitude, longitude, location_quality").eq("id", courseId).maybeSingle();
  if (!c) return "Course not found";
  const exact = ["verified_gps", "source_coordinate", "address_geocoded", "park_geocoded"];
  if (c.latitude != null && exact.includes(c.location_quality ?? "")) return "Pin already exact";
  const { data: src } = await supabaseAdmin
    .from("course_sources").select("canonical_url").eq("course_id", courseId).eq("source", "udisc").maybeSingle();
  const url = src?.canonical_url;
  if (!url?.startsWith("https://udisc.com/courses/")) return "No UDisc listing to read a spot from";
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DG Dashboard course sync)" } });
    if (!res.ok) return "UDisc listing couldn't be read";
    const spot = extractListingCoords(await res.text());
    if (!spot) return "UDisc listing has no map spot";
    if (c.latitude != null && c.longitude != null && km(c.latitude, c.longitude, spot.lat, spot.lng) > MAX_KM) {
      return "Listing spot is too far from the town — left for review";
    }
    await supabaseAdmin.from("courses")
      .update({ latitude: spot.lat, longitude: spot.lng, location_quality: "source_coordinate" }).eq("id", courseId);
    return "Pin moved to the listing spot";
  } catch {
    return "UDisc listing couldn't be read";
  }
}
