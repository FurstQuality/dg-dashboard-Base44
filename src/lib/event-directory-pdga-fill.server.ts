/**
 * Fills blank directory listings from the PDGA event rows DG Dashboard already
 * stores.
 *
 * The PDGA "upcoming events" map feed carries a pin and a name and nothing
 * else, while the PDGA event pages we parse separately carry the town, state,
 * tier, and registration status. Both land in the database, so a listing can
 * read "Location unconfirmed" while the very same event is fully described one
 * table over. This pass copies what is already known across — no network calls,
 * no geocoding, and never a guess: a field is only written when the PDGA row
 * has a real value and the directory row has none.
 *
 * Server-only: writes with the service-role client.
 */

export type PdgaFillResult = {
  /** Listings that gained a readable town. */
  located: number;
  /** Listings that gained a sanctioning tier. */
  tiered: number;
  /** Listings that gained map coordinates. */
  placed: number;
  /** Listings that gained a start date. */
  dated: number;
};

type DirectoryRow = {
  id: string;
  source_event_id: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  tier: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
};

type PdgaRow = {
  pdga_event_id: string | number;
  city: string | null;
  state: string | null;
  country: string | null;
  tier: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * Copy stored PDGA event detail onto directory listings that are missing it.
 * `limit` caps how many incomplete listings one pass considers.
 */
export async function backfillDirectoryFromPdgaEvents(limit = 1000): Promise<PdgaFillResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result: PdgaFillResult = { located: 0, tiered: 0, placed: 0, dated: 0 };

  const { data } = await supabaseAdmin
    .from("event_directory")
    .select(
      "id, source_event_id, city, state, country, tier, latitude, longitude, start_date, end_date",
    )
    .eq("source", "pdga")
    .not("source_event_id", "is", null)
    .or("city.is.null,tier.is.null,latitude.is.null,start_date.is.null")
    .limit(limit);

  const rows = (data ?? []) as DirectoryRow[];
  if (!rows.length) return result;

  const ids = Array.from(
    new Set(rows.map((r) => String(r.source_event_id ?? "").trim()).filter((s) => s.length > 0)),
  );
  if (!ids.length) return result;

  const detail = new Map<string, PdgaRow>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data: chunk } = await supabaseAdmin
      .from("pdga_tour_events")
      .select(
        "pdga_event_id, city, state, country, tier, latitude, longitude, start_date, end_date",
      )
      .in("pdga_event_id", ids.slice(i, i + 300));
    for (const row of (chunk ?? []) as PdgaRow[]) {
      detail.set(String(row.pdga_event_id), row);
    }
  }
  if (!detail.size) return result;

  for (const row of rows) {
    const known = detail.get(String(row.source_event_id));
    if (!known) continue;

    const patch: Record<string, string | number | null> = {};

    if (!row.city && known.city) {
      patch.city = known.city;
      if (!row.state && known.state) patch.state = known.state;
      if (!row.country && known.country) patch.country = known.country;
    }
    if (!row.tier && known.tier) patch.tier = known.tier;
    if (row.latitude == null && known.latitude != null && known.longitude != null) {
      patch.latitude = known.latitude;
      patch.longitude = known.longitude;
    }
    if (!row.start_date && known.start_date) {
      patch.start_date = known.start_date;
      if (!row.end_date && known.end_date) patch.end_date = known.end_date;
    }

    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabaseAdmin
      .from("event_directory")
      .update(patch as never)
      .eq("id", row.id);
    if (error) continue;

    if (patch.city) result.located += 1;
    if (patch.tier) result.tiered += 1;
    if (patch.latitude != null) result.placed += 1;
    if (patch.start_date) result.dated += 1;
  }

  return result;
}
