/**
 * Backfill per-hole par and distance onto stored PDGA live-score rows.
 *
 * Rounds imported before the layout parser landed have `hole_scores` but no
 * `hole_pars` / `hole_lengths`, so the hole-by-hole scorecard and the verified
 * statboard insights can't colour birdies or bucket holes by distance. This
 * refetches the layout block from the PDGA live-round endpoint for the affected
 * (event, division, round) combinations and patches the rows in place.
 *
 * Server-only: it makes outbound HTTP calls and writes with the caller's client.
 */

type Row = {
  id: string;
  event_id: string;
  pdga_number: string;
  division: string | null;
  round_number: number | null;
  hole_scores: number[] | null;
  hole_pars: number[] | null;
  hole_lengths: number[] | null;
  hole_length_units: string | null;
};

type RawHole = {
  HoleOrdinal?: number | null;
  Ordinal?: number | null;
  Par?: number | null;
  Length?: number | null;
};
type RawLayout = {
  Name?: string | null;
  Units?: string | null;
  Holes?: string | number | null;
  Detail?: RawHole[] | null;
};
type PoolBucket = {
  pool?: string | null;
  scores?: Array<{ PDGANum?: number | string | null }> | null;
  layouts?: RawLayout[] | null;
};

export type HoleMeta = { pars: number[] | null; lengths: number[] | null; units: string | null };

function metaFromLayout(layout: RawLayout | undefined): HoleMeta | null {
  if (!layout) return null;
  const holeCount = Number(layout.Holes ?? 0);
  let detail = (layout.Detail ?? [])
    .slice()
    .sort((a, b) => (a.HoleOrdinal ?? a.Ordinal ?? 0) - (b.HoleOrdinal ?? b.Ordinal ?? 0));
  if (Number.isFinite(holeCount) && holeCount > 0 && detail.length > holeCount)
    detail = detail.slice(0, holeCount);
  const pars = detail.map((h) => (typeof h.Par === "number" ? h.Par : 0));
  const lengths = detail.map((h) => (typeof h.Length === "number" ? h.Length : 0));
  if (!pars.some((n) => n > 0) && !lengths.some((n) => n > 0)) return null;
  return {
    pars: pars.some((n) => n > 0) ? pars : null,
    lengths: lengths.some((n) => n > 0) ? lengths : null,
    units: layout.Units?.trim() || null,
  };
}

/** Fetch one round and return hole meta keyed by PDGA number. */
async function fetchRoundHoleMeta(
  tournId: string,
  division: string,
  round: number,
): Promise<Map<string, HoleMeta>> {
  const out = new Map<string, HoleMeta>();
  const url = `https://www.pdga.com/apps/tournament/live-api/live_results_fetch_round?TournID=${tournId}&Division=${encodeURIComponent(division)}&Round=${round}`;
  let json: { data?: PoolBucket | PoolBucket[] | null } | null = null;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return out;
    json = (await res.json()) as { data?: PoolBucket | PoolBucket[] | null };
  } catch {
    return out;
  }
  const buckets = Array.isArray(json?.data) ? json!.data! : json?.data ? [json.data] : [];
  for (const bucket of buckets) {
    const meta = metaFromLayout(bucket?.layouts?.[0] ?? undefined);
    if (!meta) continue;
    for (const s of bucket?.scores ?? []) {
      if (s?.PDGANum == null) continue;
      out.set(String(s.PDGANum), meta);
    }
  }
  return out;
}

/** Trim a par/length list so it lines up hole-for-hole with the score list. */
function clamp(list: number[] | null, holes: number): number[] | null {
  if (!list) return null;
  if (holes > 0 && list.length > holes) return list.slice(0, holes);
  return list;
}

/**
 * Patch rows that have scores but no par data. Mutates and returns the same
 * array so callers can hand the enriched rows straight back to the client.
 * Network work is capped so a stale group can't stall a page load.
 */
export async function backfillTrackerHoleMeta(
  supabase: { from: (t: string) => any },
  rows: Row[],
  tournIdByEvent: Map<string, string>,
  maxRequests = 12,
): Promise<Row[]> {
  const pending = rows.filter(
    (r) =>
      Array.isArray(r.hole_scores) &&
      r.hole_scores.some((n) => n > 0) &&
      !(r.hole_pars?.some((n) => n > 0) ?? false) &&
      r.division &&
      r.round_number != null &&
      tournIdByEvent.has(r.event_id),
  );
  if (pending.length === 0) return rows;

  // One request per (event, division, round).
  const groups = new Map<string, Row[]>();
  for (const r of pending) {
    const key = `${r.event_id}|${r.division}|${r.round_number}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const keys = Array.from(groups.keys()).slice(0, maxRequests);
  const updates: Array<{
    id: string;
    hole_pars: number[] | null;
    hole_lengths: number[] | null;
    hole_length_units: string | null;
  }> = [];

  await Promise.all(
    keys.map(async (key) => {
      const [eventId, division, roundStr] = key.split("|");
      const tournId = tournIdByEvent.get(eventId)!;
      const metaByPlayer = await fetchRoundHoleMeta(tournId, division, Number(roundStr));
      if (metaByPlayer.size === 0) return;
      for (const row of groups.get(key) ?? []) {
        const meta = metaByPlayer.get(row.pdga_number);
        if (!meta) continue;
        const holes = row.hole_scores?.length ?? 0;
        const pars = clamp(meta.pars, holes);
        const lengths = clamp(meta.lengths, holes);
        if (!pars && !lengths) continue;
        row.hole_pars = pars;
        row.hole_lengths = lengths;
        row.hole_length_units = meta.units;
        updates.push({
          id: row.id,
          hole_pars: pars,
          hole_lengths: lengths,
          hole_length_units: meta.units,
        });
      }
    }),
  );

  await Promise.all(
    updates.map((u) =>
      supabase
        .from("tracker_live_scores")
        .update({
          hole_pars: u.hole_pars,
          hole_lengths: u.hole_lengths,
          hole_length_units: u.hole_length_units,
        })
        .eq("id", u.id),
    ),
  );

  return rows;
}

/** Pull a PDGA TournID out of a live-scoring URL or a stored event ref. */
export function pdgaTournIdFrom(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (!c) continue;
    const m = /TournID=(\d+)/i.exec(c) ?? /(^|\/)(\d{4,7})(\/|$)/.exec(c.trim());
    if (m) return m[1] && /^\d+$/.test(m[1]) ? m[1] : m[2];
    if (/^\d{4,7}$/.test(c.trim())) return c.trim();
  }
  return null;
}
