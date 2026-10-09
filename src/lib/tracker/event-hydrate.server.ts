/**
 * Tracked events hold their own full record.
 *
 * The tracker pages are read-only views: they render whatever the event row
 * carries. So whenever an event is saved into a tracker — or refreshed — we
 * fill that row from every source the app already knows about (the event
 * directory, PDGA tour/knowledge-base rows, and in-app tournaments and
 * leagues) instead of each page re-deriving the same details at read time.
 *
 * Rules:
 * - only empty fields are filled; a value already verified is never blanked
 * - failures are non-fatal — a tracked event still works with partial details
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Columns hydration is allowed to write. */
export type HydratablePatch = {
  name?: string;
  event_date?: string;
  end_date?: string;
  location?: string;
  venue_name?: string;
  city?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  tier?: string;
  sanctioning_tier?: string;
  event_classification?: string;
  event_status?: string;
  start_type?: string;
  time_zone?: string;
  url?: string;
  registration_url?: string;
  registration_status?: string;
  results_url?: string;
  live_scoring_url?: string;
  description?: string;
  cover_url?: string;
  field_size?: number;
  field_capacity?: number;
  rounds_planned?: number;
};

type AnyRow = Record<string, unknown>;

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Human location line from parts, e.g. "Portage, IN, US". */
function locationLine(row: AnyRow): string | null {
  const parts = [str(row["venue_name"]), str(row["city"]), str(row["state"]), str(row["country"])]
    .filter((p): p is string => !!p)
    .filter((p, i, arr) => arr.indexOf(p) === i);
  return parts.length ? parts.join(", ") : null;
}

/** PDGA numeric event ref, or null for in-app / non-PDGA events. */
export function pdgaNumericRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  return /^\d{1,9}$/.test(ref) ? ref : null;
}

/** In-app event refs look like "dgd-tournament-<uuid>" / "dgd-league-<uuid>". */
function appRef(ref: string | null | undefined): { kind: "tournament" | "league"; id: string } | null {
  if (!ref) return null;
  const m = ref.match(/^dgd-(tournament|league)-([0-9a-f-]{36})$/i);
  if (!m) return null;
  return { kind: m[1].toLowerCase() as "tournament" | "league", id: m[2] };
}

/** Merge a candidate into the patch, but only where the event row is still empty. */
function fill(patch: HydratablePatch, current: AnyRow, candidate: HydratablePatch): void {
  for (const [key, value] of Object.entries(candidate)) {
    if (value === null || value === undefined || value === "") continue;
    const k = key as keyof HydratablePatch;
    const existing = current[key];
    const alreadySet =
      existing !== null && existing !== undefined && !(typeof existing === "string" && !existing.trim());
    if (alreadySet || patch[k] !== undefined) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (patch as any)[k] = value;
  }
}

/**
 * Fill in everything known about a tracked event.
 * Returns the columns that were written (empty when nothing was missing).
 */
export async function hydrateTrackedEvent(
  supabase: SupabaseClient,
  eventId: string,
): Promise<HydratablePatch> {
  const { data: row } = await supabase
    .from("tracker_group_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  if (!row) return {};
  const current = row as AnyRow;
  const ref = str(current["pdga_event_ref"]);
  const patch: HydratablePatch = {};

  // 1) Event directory — the app's own cross-source index of public events.
  const dirCandidates: AnyRow[] = [];
  if (ref) {
    const { data } = await supabase
      .from("event_directory")
      .select(
        "name, kind, tier, sanctioning, start_date, end_date, venue_name, city, state, country, latitude, longitude, registration_status, field_size, field_capacity, cover_url, url",
      )
      .or(`pdga_event_ref.eq.${ref},source_event_id.eq.${ref}`)
      .limit(3);
    for (const d of data ?? []) dirCandidates.push(d as AnyRow);
  }
  for (const d of dirCandidates) {
    fill(patch, current, {
      name: str(d["name"]) ?? undefined,
      tier: str(d["tier"]) ?? undefined,
      sanctioning_tier: str(d["sanctioning"]) ?? str(d["tier"]) ?? undefined,
      event_classification: str(d["kind"]) ?? undefined,
      event_date: str(d["start_date"]) ?? undefined,
      end_date: str(d["end_date"]) ?? undefined,
      location: locationLine(d) ?? undefined,
      venue_name: str(d["venue_name"]) ?? undefined,
      city: str(d["city"]) ?? undefined,
      state: str(d["state"]) ?? undefined,
      country: str(d["country"]) ?? undefined,
      latitude: num(d["latitude"]) ?? undefined,
      longitude: num(d["longitude"]) ?? undefined,
      registration_status: str(d["registration_status"]) ?? undefined,
      field_size: num(d["field_size"]) ?? undefined,
      field_capacity: num(d["field_capacity"]) ?? undefined,
      cover_url: str(d["cover_url"]) ?? undefined,
      url: str(d["url"]) ?? undefined,
    });
  }

  const numeric = pdgaNumericRef(ref);
  if (numeric) {
    // 2) PDGA tour listing (registration link, status, city/state).
    const { data: tour } = await supabase
      .from("pdga_tour_events")
      .select(
        "name, tier, sanctioning, start_date, end_date, city, state, country, location, registration_url, registration_status, latitude, longitude, url",
      )
      .eq("pdga_event_id", numeric)
      .maybeSingle();
    if (tour) {
      const t = tour as AnyRow;
      fill(patch, current, {
        name: str(t["name"]) ?? undefined,
        tier: str(t["tier"]) ?? undefined,
        sanctioning_tier: str(t["sanctioning"]) ?? str(t["tier"]) ?? undefined,
        event_date: str(t["start_date"]) ?? undefined,
        end_date: str(t["end_date"]) ?? undefined,
        location: str(t["location"]) ?? locationLine(t) ?? undefined,
        city: str(t["city"]) ?? undefined,
        state: str(t["state"]) ?? undefined,
        country: str(t["country"]) ?? undefined,
        latitude: num(t["latitude"]) ?? undefined,
        longitude: num(t["longitude"]) ?? undefined,
        registration_url: str(t["registration_url"]) ?? undefined,
        registration_status: str(t["registration_status"]) ?? undefined,
        url: str(t["url"]) ?? undefined,
      });
    }

    // 3) PDGA knowledge base (host club, coordinates).
    const { data: kb } = await supabase
      .from("pdga_kb_events")
      .select("name, tier, start_date, end_date, city, state, country, latitude, longitude, pdga_url")
      .eq("pdga_event_id", numeric)
      .maybeSingle();
    if (kb) {
      const k = kb as AnyRow;
      fill(patch, current, {
        name: str(k["name"]) ?? undefined,
        tier: str(k["tier"]) ?? undefined,
        event_date: str(k["start_date"]) ?? undefined,
        end_date: str(k["end_date"]) ?? undefined,
        location: locationLine(k) ?? undefined,
        city: str(k["city"]) ?? undefined,
        state: str(k["state"]) ?? undefined,
        country: str(k["country"]) ?? undefined,
        latitude: num(k["latitude"]) ?? undefined,
        longitude: num(k["longitude"]) ?? undefined,
        url: str(k["pdga_url"]) ?? undefined,
      });
    }

    // 4) Official PDGA links are predictable from the event number.
    fill(patch, current, {
      url: `https://www.pdga.com/tour/event/${numeric}`,
      results_url: `https://www.pdga.com/tour/event/${numeric}#final-results`,
      registration_url: `https://www.pdga.com/tour/event/${numeric}#registration`,
    });
  }

  // 5) In-app tournaments and leagues carry their own full record already.
  const app = appRef(ref);
  if (app?.kind === "tournament") {
    const { data: t } = await supabase
      .from("tournaments")
      .select(
        "name, description, start_date, end_date, location, pdga_tier, registration_url, cover_url, time_zone, status, latitude, longitude",
      )
      .eq("id", app.id)
      .maybeSingle();
    if (t) {
      const r = t as AnyRow;
      fill(patch, current, {
        name: str(r["name"]) ?? undefined,
        description: str(r["description"]) ?? undefined,
        event_date: str(r["start_date"]) ?? undefined,
        end_date: str(r["end_date"]) ?? undefined,
        location: str(r["location"]) ?? undefined,
        tier: str(r["pdga_tier"]) ?? undefined,
        sanctioning_tier: str(r["pdga_tier"]) ?? undefined,
        event_classification: "tournament",
        event_status: str(r["status"]) ?? undefined,
        registration_url: str(r["registration_url"]) ?? undefined,
        cover_url: str(r["cover_url"]) ?? undefined,
        time_zone: str(r["time_zone"]) ?? undefined,
        latitude: num(r["latitude"]) ?? undefined,
        longitude: num(r["longitude"]) ?? undefined,
      });
    }
  } else if (app?.kind === "league") {
    const { data: l } = await supabase
      .from("leagues")
      .select("name, description, start_date, end_date, cover_url, status")
      .eq("id", app.id)
      .maybeSingle();
    if (l) {
      const r = l as AnyRow;
      fill(patch, current, {
        name: str(r["name"]) ?? undefined,
        description: str(r["description"]) ?? undefined,
        event_date: str(r["start_date"]) ?? undefined,
        end_date: str(r["end_date"]) ?? undefined,
        event_classification: "league",
        event_status: str(r["status"]) ?? undefined,
        cover_url: str(r["cover_url"]) ?? undefined,
      });
    }
  }

  // 6) How many rounds the event plans, from its own published schedule.
  const { data: roundRows } = await supabase
    .from("tracker_event_rounds")
    .select("round_number")
    .eq("event_id", eventId)
    .limit(500);
  const roundNumbers = new Set(
    (roundRows ?? []).map((r) => num((r as AnyRow)["round_number"])).filter((n): n is number => n != null),
  );
  if (roundNumbers.size > 0) fill(patch, current, { rounds_planned: roundNumbers.size });

  if (Object.keys(patch).length === 0) {
    await supabase
      .from("tracker_group_events")
      .update({ hydrated_at: new Date().toISOString() })
      .eq("id", eventId);
    return {};
  }
  await supabase
    .from("tracker_group_events")
    .update({ ...patch, hydrated_at: new Date().toISOString() })
    .eq("id", eventId);
  return patch;
}
