/**
 * Event-scoped live scoring ingestion.
 *
 * PDGA publishes a public JSON API mirroring live-scoring cards while an event
 * is in progress. This module fetches it once per event and stores the whole
 * field in `live_event_scores`, keyed by event ref rather than by any one
 * crew tracker, so a single refresh serves every viewer in the app: friends
 * panels, crew pages, event previews and leaderboards.
 *
 * Server-only: it writes with the service-role client and is called from
 * server functions and the scheduled sync route.
 */
import { extractPdgaTournId } from "@/lib/pdga-live-ref";

const LIVE_UA = "Mozilla/5.0 (compatible; DGDashboard/1.0)";

type PdgaLivePlayer = {
  PDGANum: number | null;
  Name: string | null;
  FirstName: string | null;
  LastName: string | null;
  Division: string | null;
  Round: number | null;
  RoundScore: number | null;
  RoundtoPar: number | null;
  SubTotal: number | null;
  GrandTotal: number | null;
  ToPar: number | string | null;
  Completed: number | null;
  RoundStarted: number | null;
  RunningPlace: number | null;
  TeeTime: string | null;
  CardNum: number | null;
  Pool: string | null;
  Scores: string | null;
  Pars: string | null;
};

type Layout = {
  pool: string | null;
  hole_pars: number[] | null;
  hole_lengths: number[] | null;
  length_units: string | null;
};

export type LiveSyncOutcome = {
  ok: boolean;
  eventRef: string;
  tournId: string | null;
  players: number;
  divisions: number;
  latestRound: number;
  status: "ok" | "no_field" | "error";
  error?: string;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": LIVE_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`PDGA live fetch failed (${res.status})`);
  return (await res.json()) as T;
}

function parseHoleScores(scores: string | null | undefined): number[] | null {
  if (!scores) return null;
  return scores.split(",").map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
}

function countThru(holes: number[] | null): number {
  if (!holes) return 0;
  let n = 0;
  for (const s of holes) if (s > 0) n += 1;
  return n;
}

async function fetchDivisions(tournId: string) {
  const url = `https://www.pdga.com/apps/tournament/live-api/live_results_fetch_event?TournID=${tournId}`;
  const json = await fetchJson<{
    data: { Divisions: { Division: string; LatestRound: number | null }[] };
  }>(url);
  return json?.data?.Divisions ?? [];
}

async function fetchRound(tournId: string, division: string, round: number) {
  const url = `https://www.pdga.com/apps/tournament/live-api/live_results_fetch_round?TournID=${tournId}&Division=${encodeURIComponent(division)}&Round=${round}`;
  type RawHole = { HoleOrdinal?: number | null; Ordinal?: number | null; Par?: number | null; Length?: number | null };
  type RawLayout = { Units?: string | null; Holes?: string | number | null; Detail?: RawHole[] | null };
  type Bucket = { pool?: string | null; scores?: PdgaLivePlayer[]; layouts?: RawLayout[] };
  const json = await fetchJson<{ data?: Bucket | Bucket[] | null }>(url);
  const raw = json?.data;
  const scores: PdgaLivePlayer[] = [];
  const layouts: Layout[] = [];

  const takeLayout = (bucket: Bucket) => {
    const first = bucket?.layouts?.[0];
    if (!first) return;
    const holeCount = Number(first.Holes ?? 0);
    let detail = (first.Detail ?? [])
      .slice()
      .sort((a, b) => (a.HoleOrdinal ?? a.Ordinal ?? 0) - (b.HoleOrdinal ?? b.Ordinal ?? 0));
    if (Number.isFinite(holeCount) && holeCount > 0 && detail.length > holeCount)
      detail = detail.slice(0, holeCount);
    const pars = detail.map((h) => (typeof h.Par === "number" ? h.Par : 0));
    const lengths = detail.map((h) => (typeof h.Length === "number" ? h.Length : 0));
    layouts.push({
      pool: bucket?.pool ?? null,
      hole_pars: pars.some((n) => n > 0) ? pars : null,
      hole_lengths: lengths.some((n) => n > 0) ? lengths : null,
      length_units: first.Units?.trim() || null,
    });
  };

  if (Array.isArray(raw)) {
    for (const bucket of raw) {
      takeLayout(bucket);
      for (const s of bucket?.scores ?? []) {
        if (bucket?.pool && s.Pool == null) s.Pool = bucket.pool;
        scores.push(s);
      }
    }
  } else if (raw) {
    takeLayout(raw);
    if (Array.isArray(raw.scores)) scores.push(...raw.scores);
  }
  return { scores, layouts };
}

/**
 * Pull the current live scoring for one event and store the whole field.
 *
 * `eventRef` is the PDGA event ref used everywhere else in the app; `liveUrl`
 * is an optional pasted live-scoring URL used when the ref carries no id.
 */
export async function syncEventLiveScores(
  eventRef: string,
  liveUrl?: string | null,
): Promise<LiveSyncOutcome> {
  const tournId = extractPdgaTournId(liveUrl) ?? extractPdgaTournId(eventRef);
  const base: LiveSyncOutcome = {
    ok: false,
    eventRef,
    tournId,
    players: 0,
    divisions: 0,
    latestRound: 0,
    status: "error",
  };
  if (!tournId) return { ...base, error: "This event isn't linked to a PDGA event id yet." };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  let divisions: { Division: string; LatestRound: number | null }[];
  try {
    divisions = await fetchDivisions(tournId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("live_sync_registry")
      .update({ last_synced_at: nowIso, last_status: "error", last_error: message.slice(0, 300) })
      .eq("event_ref", eventRef);
    return { ...base, error: message };
  }

  type Row = {
    event_ref: string;
    tourn_id: string;
    pdga_number: string;
    player_name: string | null;
    division: string | null;
    round_number: number;
    place: number | null;
    running_place: number | null;
    round_score: number | null;
    round_to_par: number | null;
    total: number | null;
    to_par: number | null;
    thru: number;
    hole_scores: number[] | null;
    hole_pars: number[] | null;
    hole_lengths: number[] | null;
    hole_length_units: string | null;
    pool: string | null;
    card_number: string | null;
    tee_time: string | null;
    completed: boolean;
    round_started: boolean;
    updated_at: string;
    last_synced_at: string;
  };

  const rows = new Map<string, Row>();
  let latestRound = 0;

  for (const div of divisions) {
    const lastRound = div.LatestRound ?? 1;
    latestRound = Math.max(latestRound, lastRound);
    for (let round = 1; round <= lastRound; round += 1) {
      let payload: Awaited<ReturnType<typeof fetchRound>>;
      try {
        payload = await fetchRound(tournId, div.Division, round);
      } catch {
        continue;
      }
      const layoutByPool = new Map<string, Layout>();
      for (const l of payload.layouts) layoutByPool.set((l.pool ?? "").toUpperCase(), l);
      const soleLayout = payload.layouts.length === 1 ? payload.layouts[0] : undefined;

      for (const p of payload.scores) {
        if (p.PDGANum == null) continue;
        const pdgaNumber = String(p.PDGANum);
        const holes = parseHoleScores(p.Scores);
        const layout = layoutByPool.get((p.Pool ?? "").toUpperCase()) ?? soleLayout;
        const playerPars = parseHoleScores(p.Pars);
        const layoutPars = layout?.hole_pars ?? null;
        const rawPars = layoutPars?.some((n) => n > 0)
          ? layoutPars
          : playerPars?.some((n) => n > 0)
            ? playerPars
            : null;
        const holeCount = layout?.hole_lengths?.length ?? holes?.length ?? 0;
        const pars =
          rawPars && holeCount > 0 && rawPars.length > holeCount
            ? rawPars.slice(0, holeCount)
            : rawPars;
        const toParNum = typeof p.ToPar === "string" ? parseInt(p.ToPar, 10) : p.ToPar;

        rows.set(`${pdgaNumber}:${round}`, {
          event_ref: eventRef,
          tourn_id: tournId,
          pdga_number: pdgaNumber,
          player_name: p.Name ?? ([p.FirstName, p.LastName].filter(Boolean).join(" ") || null),
          division: p.Division ?? div.Division,
          round_number: round,
          place: p.RunningPlace ?? null,
          running_place: p.RunningPlace ?? null,
          round_score: p.RoundScore ?? null,
          round_to_par: p.RoundtoPar ?? null,
          total: p.GrandTotal ?? p.SubTotal ?? null,
          to_par: Number.isFinite(toParNum as number) ? (toParNum as number) : null,
          thru: countThru(holes),
          hole_scores: holes,
          hole_pars: pars,
          hole_lengths: layout?.hole_lengths ?? null,
          hole_length_units: layout?.length_units ?? null,
          pool: p.Pool ?? null,
          card_number: p.CardNum != null ? String(p.CardNum) : null,
          tee_time: p.TeeTime ?? null,
          completed: !!p.Completed,
          round_started: !!p.RoundStarted,
          updated_at: nowIso,
          last_synced_at: nowIso,
        });
      }
    }
  }

  const inserts = [...rows.values()];
  if (inserts.length > 0) {
    // Chunked so a very large field stays inside one request's limits.
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabaseAdmin
        .from("live_event_scores")
        .upsert(inserts.slice(i, i + 500), { onConflict: "event_ref,pdga_number,round_number" });
      if (error) {
        await supabaseAdmin
          .from("live_sync_registry")
          .update({
            last_synced_at: nowIso,
            last_status: "error",
            last_error: error.message.slice(0, 300),
          })
          .eq("event_ref", eventRef);
        return { ...base, error: error.message, divisions: divisions.length, latestRound };
      }
    }
  }

  await supabaseAdmin
    .from("live_sync_registry")
    .update({
      tourn_id: tournId,
      last_synced_at: nowIso,
      last_status: inserts.length === 0 ? "no_field" : "ok",
      last_error: null,
    })
    .eq("event_ref", eventRef);

  return {
    ok: true,
    eventRef,
    tournId,
    players: inserts.length,
    divisions: divisions.length,
    latestRound,
    status: inserts.length === 0 ? "no_field" : "ok",
  };
}
