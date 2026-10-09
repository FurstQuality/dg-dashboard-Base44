import { diffLiveRow } from "@/lib/tracker/live-changes";
import { isPlaceholderLayout } from "@/lib/tracker/placeholder-layout";
/**
 * Live tournament scoring for tracker events.
 *
 * PDGA publishes a public JSON API that mirrors live-scoring cards while an
 * event is in progress. Given a tracker event that has a `pdga_event_ref`
 * (or a pasted live-scoring URL), we fetch the current round for every
 * division that at least one tracked member is registered in, then upsert
 * per-player rows into `tracker_live_scores`. The tracker UI reads those
 * rows to show place / running total / to-par / thru while play happens.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { canonicalTeeTime } from "@/lib/tee-time";
import { isLedgestone2026 } from "@/lib/ledgestone-2026-schedule";
import { seedLedgestonePoolRounds } from "@/lib/ledgestone-seed";

/* ------------------------------- Types ---------------------------------- */

export type TrackerLiveScore = {
  id: string;
  event_id: string;
  pdga_number: string;
  member_id: string | null;
  division: string | null;
  round_number: number | null;
  place: number | null;
  running_place: number | null;
  round_score: number | null;
  round_to_par: number | null;
  total: number | null;
  to_par: number | null;
  thru: number | null;
  hole_scores: number[] | null;
  hole_pars: number[] | null;
  hole_lengths: number[] | null;
  hole_length_units: string | null;
  completed: boolean;
  round_started: boolean;
  tee_time: string | null;
  card_number: string | null;
  player_name: string | null;
  updated_at: string;
  last_synced_at: string;
};

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
  ParThruRound: number | null;
  Completed: number | null;
  RoundStarted: number | null;
  RunningPlace: number | null;
  TeeTime: string | null;
  CardNum: number | null;
  Pool: string | null;
  Scores: string | null;
  Pars: string | null;
};

/* ------------------------------- Helpers -------------------------------- */

const LIVE_UA = "Mozilla/5.0 (compatible; DGDashboard/1.0)";

export { extractPdgaTournId } from "@/lib/pdga-live-ref";
import { extractPdgaTournId } from "@/lib/pdga-live-ref";

/**
 * Every PDGA response a sync reads, keyed by URL. "record" fetches and stores;
 * "replay" serves a snapshot another follower already fetched, so one PDGA
 * check serves every follower of the event.
 */
export type SyncState = "syncing" | "updated" | "unchanged" | "could_not_sync";
type FetchCache = { mode: "record" | "replay"; map: Record<string, unknown> };

class PdgaRateLimited extends Error {
  constructor(public retryAfterSeconds: number) {
    super("PDGA is busy right now");
  }
}

async function fetchJson<T>(url: string, cache?: FetchCache): Promise<T> {
  if (cache?.mode === "replay") {
    if (url in cache.map) return cache.map[url] as T;
    throw new Error("Not in the shared snapshot");
  }
  const res = await fetch(url, {
    headers: { "User-Agent": LIVE_UA, Accept: "application/json" },
  });
  if (res.status === 429 || res.status === 503) {
    const ra = Number(res.headers.get("retry-after"));
    throw new PdgaRateLimited(Number.isFinite(ra) && ra > 0 ? ra : 300);
  }
  if (!res.ok) throw new Error(`PDGA live fetch failed (${res.status})`);
  const json = (await res.json()) as T;
  if (cache) cache.map[url] = json;
  return json;
}

function fingerprintOf(v: unknown): string {
  const str = JSON.stringify(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${str.length}`;
}

function parseHoleScores(scores: string | null | undefined): number[] | null {
  if (!scores) return null;
  const parts = scores.split(",");
  const arr = parts.map((s) => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  return arr;
}

function computeThru(holeScores: number[] | null): number {
  if (!holeScores) return 0;
  let n = 0;
  for (const s of holeScores) if (s > 0) n += 1;
  return n;
}

/* --------------------------- Live event summary ------------------------- */

type EventSummary = {
  divisions: { Division: string; DivisionID: number; LatestRound: number | null }[];
};

async function fetchEventSummary(tournId: string, cache?: FetchCache): Promise<EventSummary> {
  const url = `https://www.pdga.com/apps/tournament/live-api/live_results_fetch_event?TournID=${tournId}`;
  const json = await fetchJson<{ data: { Divisions: EventSummary["divisions"] } }>(url, cache);
  return { divisions: json?.data?.Divisions ?? [] };
}

/** Course/layout a pool plays for one round, as published by PDGA live. */
export type LiveLayout = {
  pool: string | null;
  course_name: string | null;
  layout_name: string | null;
  /** Par per hole, ordered by hole. */
  hole_pars: number[] | null;
  /** Tee-to-basket distance per hole, ordered by hole. */
  hole_lengths: number[] | null;
  /** "Feet" or "Meters", as published by PDGA. */
  length_units: string | null;
};

type RoundResults = { scores: PdgaLivePlayer[]; layouts: LiveLayout[] };

async function fetchRoundResults(
  tournId: string,
  division: string,
  round: number,
  cache?: FetchCache,
): Promise<RoundResults> {
  const url = `https://www.pdga.com/apps/tournament/live-api/live_results_fetch_round?TournID=${tournId}&Division=${encodeURIComponent(division)}&Round=${round}`;
  // PDGA's live-round payload is either { data: { scores: [...] } } (legacy,
  // single-pool events) or { data: [ { pool, layouts, scores: [...] }, ... ] }
  // (modern, multi-pool events like Ledgestone). Handle both shapes.
  type RawHole = {
    HoleOrdinal?: number | null;
    Ordinal?: number | null;
    Par?: number | null;
    Length?: number | null;
  };
  type RawLayout = {
    CourseName?: string | null;
    Name?: string | null;
    Units?: string | null;
    Holes?: string | number | null;
    Detail?: RawHole[] | null;
  };
  type PoolBucket = { pool?: string | null; scores?: PdgaLivePlayer[]; layouts?: RawLayout[] };
  type LivePayload = { data?: PoolBucket | PoolBucket[] | null };
  const json = await fetchJson<LivePayload>(url, cache);
  const raw = json?.data;
  const scores: PdgaLivePlayer[] = [];
  const layouts: LiveLayout[] = [];
  const takeLayouts = (bucket: PoolBucket) => {
    const first = bucket?.layouts?.[0];
    if (!first) return;
    // `Detail` carries one entry per hole with par and length, but PDGA pads
    // the list out to 36 slots — trim to the layout's real hole count.
    const holeCount = Number(first.Holes ?? 0);
    let detail = (first.Detail ?? [])
      .slice()
      .sort((a, b) => (a.HoleOrdinal ?? a.Ordinal ?? 0) - (b.HoleOrdinal ?? b.Ordinal ?? 0));
    if (Number.isFinite(holeCount) && holeCount > 0 && detail.length > holeCount)
      detail = detail.slice(0, holeCount);
    const pars = detail.map((h) => (typeof h.Par === "number" ? h.Par : 0));
    const lengths = detail.map((h) => (typeof h.Length === "number" ? h.Length : 0));

    // PDGA's "Default Layout; 18 holes; Par 54" placeholder carries invented
    // pars — store nothing rather than manufacture a layout.
    const placeholder =
      isPlaceholderLayout(first.CourseName) || isPlaceholderLayout(first.Name);
    layouts.push({
      pool: bucket?.pool ?? null,
      course_name: placeholder ? null : first.CourseName?.trim() || null,
      layout_name: placeholder ? null : first.Name?.trim() || null,
      hole_pars: !placeholder && pars.some((n) => n > 0) ? pars : null,
      hole_lengths: !placeholder && lengths.some((n) => n > 0) ? lengths : null,
      length_units: first.Units?.trim() || null,
    });
  };

  if (Array.isArray(raw)) {
    for (const bucket of raw) {
      const poolLabel = bucket?.pool ?? null;
      takeLayouts(bucket);
      for (const s of bucket?.scores ?? []) {
        const withPool = s as PdgaLivePlayer & { Pool?: string | null };
        if (poolLabel && withPool.Pool == null) withPool.Pool = poolLabel;
        scores.push(withPool);
      }
    }
  } else if (raw) {
    takeLayouts(raw);
    if (Array.isArray(raw.scores)) scores.push(...raw.scores);
  }
  return { scores, layouts };
}

/* ---------------------------- Server functions -------------------------- */

/**
 * Persist a live scoring URL on a tracker event without kicking off a sync.
 * Useful when the URL doesn't cleanly map to a PDGA tour/event page (e.g. a
 * pasted live-api URL, or an event that has no `pdga_event_ref` yet).
 */
export const setTrackerEventLiveUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        liveUrl: z.string().max(500).nullable(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const url = (data.liveUrl ?? "").trim() || null;
    // Validate that the URL points at a PDGA event we can actually sync.
    if (url && !extractPdgaTournId(url)) {
      throw new Error(
        "Paste a PDGA event, live-scoring, or tournament URL — that link doesn't contain an event id.",
      );
    }
    const { error } = await supabase
      .from("tracker_group_events")
      .update({ live_scoring_url: url })
      .eq("id", data.eventId);
    if (error) throw error;
    return { ok: true, liveUrl: url };
  });

/**
 * Fetch the current PDGA live scoring for one tracker event and upsert
 * per-player rows for every tracked member. Only stores rows for pdga
 * numbers already in the group so the table stays tight.
 */
export const refreshTrackerEventLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ eventId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const eventId = data.eventId;

    // Load event + owner check happens implicitly via RLS on the select.
    const { data: ev, error: evErr } = await supabase
      .from("tracker_group_events")
      .select("id, group_id, pdga_event_ref, live_scoring_url, name, event_date")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr) throw evErr;
    if (!ev) throw new Error("Event not found.");

    const tournId =
      extractPdgaTournId(ev.live_scoring_url) ?? extractPdgaTournId(ev.pdga_event_ref);
    if (!tournId) {
      throw new Error(
        "This event isn't linked to a PDGA event yet. Paste a PDGA event or live scoring URL first.",
      );
    }

    // Members registered for this event (unique pdga_numbers via tee_times).
    const { data: members } = await supabase
      .from("tracker_group_members")
      .select("id, pdga_number, default_division")
      .eq("group_id", ev.group_id);
    const memberByPdga = new Map<string, { id: string; default_division: string | null }>();
    for (const m of members ?? []) {
      memberByPdga.set(String(m.pdga_number), {
        id: m.id,
        default_division: m.default_division ?? null,
      });
    }
    // The whole field is imported (not just crew members), so the event page can
    // rank a player against everyone and rate their chances by division.


    // Caller's own PDGA number — used to flag which live rows belong to the
    // signed-in user (statboard mirroring is handled by syncMyPdgaFromProfile).
    const { data: callerProfile } = await supabase
      .from("profiles")
      .select("pdga_number")
      .eq("id", userId)
      .maybeSingle();
    const callerPdga = callerProfile?.pdga_number ? String(callerProfile.pdga_number) : null;
    void callerPdga;

    // One shared check per PDGA event: reuse a fresh snapshot another follower
    // fetched, honour backoff, and never run two fetches of one event at once.
    const { data: claimRaw, error: claimErr } = await supabase.rpc("tracker_pdga_sync_claim", {
      _tourn_id: tournId,
    });
    if (claimErr) throw new Error("Couldn't start the sync. Try again.");
    const claim = claimRaw as {
      decision: "fetch" | "cached" | "busy" | "backoff";
      payload?: Record<string, unknown> | null;
      fingerprint?: string | null;
      last_success_at?: string | null;
      next_check_at?: string | null;
    };
    const { data: evFp } = await supabase
      .from("tracker_group_events")
      .select("live_fingerprint")
      .eq("id", eventId)
      .maybeSingle();
    const appliedFp = evFp?.live_fingerprint ?? null;
    const lastSuccessAt = claim.last_success_at ?? null;
    if (claim.decision !== "fetch") {
      if (!claim.payload || (claim.fingerprint && claim.fingerprint === appliedFp)) {
        return {
          ok: true,
          state: (claim.decision === "busy"
            ? "syncing"
            : claim.decision === "backoff"
              ? "could_not_sync"
              : "unchanged") as SyncState,
          tournId,
          players: 0,
          divisions: 0,
          latestRound: 0,
          lastSuccessAt,
          nextCheckAt: claim.next_check_at ?? null,
        };
      }
    }
    const cache: FetchCache =
      claim.decision === "fetch"
        ? { mode: "record", map: {} }
        : { mode: "replay", map: claim.payload ?? {} };
    const finish = async (args: {
      ok: boolean;
      fingerprint?: string;
      interval?: number;
      error?: string;
      retryAfter?: number;
    }) => {
      if (cache.mode !== "record") return;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("tracker_pdga_sync_finish", {
        _tourn_id: tournId,
        _ok: args.ok,
        _payload: (args.ok ? cache.map : null) as never,
        _fingerprint: args.fingerprint ?? null,
        _interval_seconds: args.interval ?? 600,
        _error: args.error ?? null,
        _retry_after_seconds: args.retryAfter ?? 0,
      } as never);
    };

    let summary: EventSummary;
    try {
      summary = await fetchEventSummary(tournId, cache);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await finish({
        ok: false,
        error: msg,
        retryAfter: err instanceof PdgaRateLimited ? err.retryAfterSeconds : 0,
      });
      await supabase
        .from("tracker_group_events")
        .update({
          live_status: `error: ${msg.slice(0, 200)}`,
          live_last_synced_at: new Date().toISOString(),
        })
        .eq("id", eventId);
      throw err;
    }

    // Every division in the event, so the full field is available for comparison.
    const effective = summary.divisions;

    let latestRound = 0;
    type LiveScoreInsert = {
      result_source: "PDGA_OFFICIAL";
      event_id: string;
      pdga_number: string;
      member_id: string | null;
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

      completed: boolean;
      round_started: boolean;
      tee_time: string | null;
      card_number: string | null;
      player_name: string | null;
      updated_at: string;
      last_synced_at: string;
    };
    const upserts: LiveScoreInsert[] = [];
    type TeeMirror = {
      member_id: string;
      round_number: number;
      division: string | null;
      tee_time: string | null;
      card_number: string | null;
      pool: string | null;
    };
    const teeMirrors: TeeMirror[] = [];
    // Course/layout per (round, division) inferred from the pools our tracked
    // members actually play. PDGA publishes this in the live-round payload even
    // when the public event page has no schedule block.
    type CourseHit = { course_name: string | null; layout_name: string | null; votes: number };
    // Key is `round:DIVISION:POOL` — PDGA splits a division across pools that
    // can play different courses in the same round.
    const courseByRoundDiv = new Map<string, Map<string, CourseHit>>();
    const noteCourse = (
      round: number,
      division: string,
      pool: string | null,
      layout: LiveLayout | undefined,
    ) => {
      if (!layout?.course_name && !layout?.layout_name) return;
      const k = `${round}:${division.toUpperCase()}:${(pool ?? "").toUpperCase()}`;
      const bucket = courseByRoundDiv.get(k) ?? new Map<string, CourseHit>();
      const ck = `${layout.course_name ?? ""}|${layout.layout_name ?? ""}`;
      const hit = bucket.get(ck) ?? {
        course_name: layout.course_name,
        layout_name: layout.layout_name,
        votes: 0,
      };
      hit.votes += 1;
      bucket.set(ck, hit);
      courseByRoundDiv.set(k, bucket);
    };
    const nowIso = new Date().toISOString();

    for (const div of effective) {
      const lastRound = div.LatestRound ?? 1;
      latestRound = Math.max(latestRound, lastRound);
      // Loop every round 1..lastRound so prior completed rounds also import.
      for (let round = 1; round <= lastRound; round += 1) {
        let results: RoundResults;
        try {
          results = await fetchRoundResults(tournId, div.Division, round, cache);
        } catch (err) {
          if (err instanceof PdgaRateLimited) {
            await finish({ ok: false, error: err.message, retryAfter: err.retryAfterSeconds });
            throw new Error("PDGA is busy right now. We'll try again shortly.");
          }
          continue;
        }
        const layoutByPool = new Map<string, LiveLayout>();
        for (const l of results.layouts) layoutByPool.set((l.pool ?? "").toUpperCase(), l);
        const soleLayout = results.layouts.length === 1 ? results.layouts[0] : undefined;
        for (const p of results.scores) {
          if (p.PDGANum == null) continue;
          const key = String(p.PDGANum);
          const member = memberByPdga.get(key) ?? null;

          const holes = parseHoleScores(p.Scores);
          const toParNum = typeof p.ToPar === "string" ? parseInt(p.ToPar, 10) : p.ToPar;
          const roundScore = p.RoundScore ?? null;
          const roundToPar = p.RoundtoPar ?? null;
          const division = p.Division ?? div.Division;
          const teeTime = p.TeeTime ?? null;
          const cardNumber = p.CardNum != null ? String(p.CardNum) : null;
          const poolLayout = layoutByPool.get((p.Pool ?? "").toUpperCase()) ?? soleLayout;
          // Par comes from the pool layout when PDGA publishes it; the player's
          // own `Pars` string is the fallback. Either source can be padded out
          // to 36 slots, so trim to the layout's hole count so par, distance and
          // score all line up hole for hole.
          const playerPars = parseHoleScores(p.Pars);
          const layoutPars = poolLayout?.hole_pars ?? null;
          const rawPars = layoutPars?.some((n) => n > 0)
            ? layoutPars
            : playerPars?.some((n) => n > 0)
              ? playerPars
              : null;
          const holeCount = poolLayout?.hole_lengths?.length ?? holes?.length ?? 0;
          const pars =
            rawPars && holeCount > 0 && rawPars.length > holeCount
              ? rawPars.slice(0, holeCount)
              : rawPars;

          upserts.push({
            event_id: eventId,
            pdga_number: key,
            member_id: member?.id ?? null,
            division,
            round_number: round,
            place: p.RunningPlace ?? null,
            running_place: p.RunningPlace ?? null,
            round_score: roundScore,
            round_to_par: roundToPar,
            total: p.GrandTotal ?? p.SubTotal ?? null,
            to_par: Number.isFinite(toParNum as number) ? (toParNum as number) : null,
            thru: computeThru(holes),
            hole_scores: holes,
            hole_pars: pars,
            hole_lengths: poolLayout?.hole_lengths ?? null,
            hole_length_units: poolLayout?.length_units ?? null,

            completed: !!p.Completed,
            round_started: !!p.RoundStarted,
            tee_time: teeTime,
            card_number: cardNumber,
            player_name: p.Name ?? ([p.FirstName, p.LastName].filter(Boolean).join(" ") || null),
            updated_at: nowIso,
            last_synced_at: nowIso,
            result_source: "PDGA_OFFICIAL",
          });
          // Tee sheets only track crew members.
          if (member) {
            teeMirrors.push({
              member_id: member.id,
              round_number: round,
              division,
              tee_time: teeTime,
              card_number: cardNumber,
              pool: p.Pool ?? null,
            });
          }
          noteCourse(
            round,
            division,
            p.Pool ?? null,
            layoutByPool.get((p.Pool ?? "").toUpperCase()) ?? soleLayout,
          );
        }
      }
    }

    // Lifecycle-aware refresh: live rounds every minute, otherwise gently.
    const anyLive = upserts.some((u) => u.round_started && !u.completed);
    const interval = anyLive ? 60 : upserts.length === 0 ? 3600 : 900;
    const fingerprint = cache.mode === "record" ? fingerprintOf(cache.map) : (claim.fingerprint ?? "");
    await finish({ ok: true, fingerprint, interval });
    if (fingerprint && fingerprint === appliedFp) {
      await supabase
        .from("tracker_group_events")
        .update({ live_last_synced_at: nowIso })
        .eq("id", eventId);
      return {
        ok: true,
        state: "unchanged" as SyncState,
        tournId,
        players: 0,
        divisions: effective.length,
        latestRound,
        lastSuccessAt: nowIso,
        nextCheckAt: null,
      };
    }

    // Event updates: diff crew members' rows against what was stored, before
    // overwriting, so only real changes (tee time, round start/finish, score,
    // position, division) are logged — repeated syncs log nothing new.
    const crewUpserts = upserts.filter((u) => u.member_id);
    const changeRows: Array<Record<string, unknown>> = [];
    if (crewUpserts.length > 0) {
      const { data: prevRows } = await supabase
        .from("tracker_live_scores")
        .select("pdga_number, round_number, division, tee_time, round_started, completed, running_place, round_score")
        .eq("event_id", eventId)
        .in("pdga_number", Array.from(new Set(crewUpserts.map((u) => u.pdga_number))));
      const prevBy = new Map(
        (prevRows ?? []).map((r) => [`${r.pdga_number}:${r.round_number}`, r] as const),
      );
      for (const u of crewUpserts) {
        const prev = prevBy.get(`${u.pdga_number}:${u.round_number}`) ?? null;
        for (const c of diffLiveRow(prev as never, u)) {
          changeRows.push({
            group_id: ev.group_id,
            event_id: eventId,
            member_id: u.member_id,
            ...c,
            source: "pdga_live",
          });
        }
      }
    }

    if (upserts.length > 0) {
      const { error: upErr } = await supabase
        .from("tracker_live_scores")
        .upsert(upserts, { onConflict: "event_id,pdga_number,round_number" });
      if (upErr) throw upErr;
      if (changeRows.length > 0) {
        await supabase.from("tracker_change_log").insert(changeRows as never);
      }

      // Mirror tee time / card / division / pool into tracker_tee_times so
      // the tracker overview (which reads that table) surfaces real divisions,
      // tee times and card numbers for tracked members. Rows the owner has
      // hand-edited (manual_override=true) are left alone.
      const { data: existingTees } = await supabase
        .from("tracker_tee_times")
        .select("id, member_id, round_number, manual_override")
        .eq("event_id", eventId);
      const teeByKey = new Map<string, { id: string; manual_override: boolean }>();
      for (const t of existingTees ?? []) {
        teeByKey.set(`${t.member_id}:${t.round_number ?? 0}`, {
          id: t.id as string,
          manual_override: !!t.manual_override,
        });
      }
      // Dedupe teeMirrors by (member, round) — the last write wins.
      const mirrorByKey = new Map<string, TeeMirror>();
      for (const m of teeMirrors) mirrorByKey.set(`${m.member_id}:${m.round_number}`, m);
      for (const m of mirrorByKey.values()) {
        const key = `${m.member_id}:${m.round_number}`;
        const existing = teeByKey.get(key);
        if (existing?.manual_override) continue;
        const teeValue = canonicalTeeTime(m.tee_time);
        const patch = {
          event_id: eventId,
          member_id: m.member_id,
          round_number: m.round_number,
          division: m.division,
          // Never blank out a known tee time with an empty live-scoring value.
          ...(teeValue ? { tee_time: teeValue } : {}),
          card_number: m.card_number,
          pool: m.pool,
          status: "scheduled" as const,
          source: "pdga_live" as const,
          last_synced_at: nowIso,
        };
        if (existing) {
          await supabase.from("tracker_tee_times").update(patch).eq("id", existing.id);
        } else {
          await supabase.from("tracker_tee_times").insert(patch);
        }
      }
    }

    // Mirror the course each round is played on into tracker_event_rounds so
    // the calendar, tee sheet and player pages show a course even for events
    // whose PDGA page publishes no schedule block.
    if (courseByRoundDiv.size > 0) {
      type RoundRow = {
        event_id: string;
        round_number: number;
        division: string | null;
        pool: string | null;
        course_name: string | null;
        course_layout: string | null;
      };
      const rows: RoundRow[] = [];
      const perRound = new Map<number, Map<string, CourseHit>>();
      const perRoundDiv = new Map<string, Map<string, CourseHit>>();
      for (const [k, bucket] of courseByRoundDiv.entries()) {
        const [roundStr, division, poolRaw] = k.split(":");
        const round = Number(roundStr);
        const pool = poolRaw ? poolRaw : null;
        const best = [...bucket.values()].sort((a, z) => z.votes - a.votes)[0];
        if (!best) continue;
        rows.push({
          event_id: eventId,
          round_number: round,
          division,
          pool,
          course_name: best.course_name,
          course_layout: best.layout_name,
        });
        const dk = `${round}:${division}`;
        const divAgg = perRoundDiv.get(dk) ?? new Map<string, CourseHit>();
        for (const [ck, hit] of bucket.entries()) {
          const cur = divAgg.get(ck) ?? { ...hit, votes: 0 };
          cur.votes += hit.votes;
          divAgg.set(ck, cur);
        }
        perRoundDiv.set(dk, divAgg);
        const agg = perRound.get(round) ?? new Map<string, CourseHit>();
        for (const [ck, hit] of bucket.entries()) {
          const cur = agg.get(ck) ?? { ...hit, votes: 0 };
          cur.votes += hit.votes;
          agg.set(ck, cur);
        }
        perRound.set(round, agg);
      }
      // Division-wide fallback (pool unknown) and a round-wide aggregate.
      for (const [dk, agg] of perRoundDiv.entries()) {
        const [roundStr, division] = dk.split(":");
        const best = [...agg.values()].sort((a, z) => z.votes - a.votes)[0];
        if (!best) continue;
        rows.push({
          event_id: eventId,
          round_number: Number(roundStr),
          division,
          pool: null,
          course_name: best.course_name,
          course_layout: best.layout_name,
        });
      }
      for (const [round, agg] of perRound.entries()) {
        const best = [...agg.values()].sort((a, z) => z.votes - a.votes)[0];
        if (!best) continue;
        rows.push({
          event_id: eventId,
          round_number: round,
          division: null,
          pool: null,
          course_name: best.course_name,
          course_layout: best.layout_name,
        });
      }
      if (rows.length > 0) {
        await supabase
          .from("tracker_event_rounds")
          .upsert(rows, { onConflict: "event_id,round_number,division,pool" });
      }
    }

    // Ledgestone Open: pool decides the course each day. Backfill the published
    // pool rotation for rounds live scoring has not posted yet — live data above
    // already wrote every (round, pool) it knows, and is never overwritten.
    if (isLedgestone2026(ev.name, ev.pdga_event_ref)) {
      await seedLedgestonePoolRounds(supabase, eventId);
    }

    await supabase
      .from("tracker_group_events")
      .update({
        live_last_synced_at: nowIso,
        live_current_round: latestRound || null,
        live_status: upserts.length === 0 ? "no_matches" : "ok",
        live_fingerprint: fingerprint || null,
        live_scoring_url:
          ev.live_scoring_url ??
          `https://www.pdga.com/apps/tournament/live/event?TournID=${tournId}`,
      })
      .eq("id", eventId);

    return {
      ok: true,
      state: "updated" as SyncState,
      tournId,
      players: upserts.length,
      divisions: effective.length,
      latestRound,
      lastSuccessAt: nowIso,
      nextCheckAt: null,
    };
  });

/** Return every stored live score row for one tracker event. */
export const listTrackerEventLive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ eventId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("tracker_live_scores")
      .select("*")
      .eq("event_id", data.eventId)
      .order("round_number", { ascending: false })
      .order("running_place", { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (rows ?? []) as TrackerLiveScore[];
  });
