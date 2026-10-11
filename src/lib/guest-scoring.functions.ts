/**
 * Guest scoring server functions.
 *
 * Guest endpoints are intentionally unauthenticated: a player with a join code
 * scores in a plain browser. Every call is gated server-side on the code and a
 * hashed session token, and all writes go through the admin client — the
 * underlying tables grant nothing to anonymous visitors.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  generateCode,
  normalizeCode,
  type GuestHole,
  type GuestSession,
  type GuestCardState,
  type JoinCodeInfo,
} from "@/lib/guest-scoring";


async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type CodeRow = {
  id: string;
  code: string;
  target_kind: "tournament_round" | "league_event" | "round";
  tournament_id: string | null;
  tournament_round_id: string | null;
  league_id: string | null;
  league_event_id: string | null;
  round_id: string | null;
  course_id: string | null;
  layout_id: string | null;
  label: string | null;
  pin_hash: string | null;
  pin_salt: string | null;
  allow_guest_cards: boolean;
  allow_caddy: boolean;
  ai_allowance: number;
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_by: string;
};

async function loadCode(code: string): Promise<CodeRow> {
  const db = await admin();
  const { data, error } = await db
    .from("event_join_codes")
    .select("*")
    .eq("code", normalizeCode(code))
    .maybeSingle();
  if (error) throw new Error("We couldn't look up that code. Try again.");
  if (!data) throw new Error("That code doesn't match an event. Check the sign and retype it.");
  return data as unknown as CodeRow;
}

function codeStatus(row: CodeRow): JoinCodeInfo["status"] {
  if (!row.is_active) return "closed";
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return "expired";
  if (row.max_uses != null && row.use_count >= row.max_uses) return "full";
  return "open";
}

async function loadHoles(layoutId: string | null): Promise<GuestHole[]> {
  if (!layoutId) return [];
  const db = await admin();
  const { data } = await db
    .from("holes")
    .select(
      "number, par, distance_ft, nickname, notes, caddy_notes, tee_lat, tee_lng, basket_lat, basket_lng",
    )
    .eq("layout_id", layoutId)
    .order("number", { ascending: true });
  return (data ?? []) as unknown as GuestHole[];
}

async function describeTarget(row: CodeRow) {
  const db = await admin();
  let eventName = row.label ?? "Disc golf round";
  let roundLabel: string | null = null;
  let courseId = row.course_id;
  let layoutId = row.layout_id;
  const divisions: string[] = [];

  if (row.target_kind === "tournament_round" && row.tournament_round_id) {
    const { data: tr } = await db
      .from("tournament_rounds")
      .select("round_number, course_id, layout_id, tournament_id")
      .eq("id", row.tournament_round_id)
      .maybeSingle();
    roundLabel = tr ? `Round ${tr.round_number}` : null;
    courseId = courseId ?? (tr?.course_id ?? null);
    layoutId = layoutId ?? (tr?.layout_id ?? null);
    const tournamentId = row.tournament_id ?? tr?.tournament_id ?? null;
    if (tournamentId) {
      const [{ data: t }, { data: divs }] = await Promise.all([
        db.from("tournaments").select("name").eq("id", tournamentId).maybeSingle(),
        db.from("tournament_divisions").select("name").eq("tournament_id", tournamentId),
      ]);
      if (t?.name) eventName = t.name;
      for (const d of divs ?? []) if (d.name) divisions.push(d.name as string);
    }
  } else if (row.target_kind === "league_event" && row.league_event_id) {
    const { data: le } = await db
      .from("league_events")
      .select("name, week_number, course_id, layout_id, league_id")
      .eq("id", row.league_event_id)
      .maybeSingle();
    roundLabel = le?.week_number ? `Week ${le.week_number}` : (le?.name ?? null);
    courseId = courseId ?? (le?.course_id ?? null);
    layoutId = layoutId ?? (le?.layout_id ?? null);
    if (le?.league_id) {
      const [{ data: l }, { data: divs }] = await Promise.all([
        db.from("leagues").select("name").eq("id", le.league_id).maybeSingle(),
        db.from("league_divisions").select("name").eq("league_id", le.league_id),
      ]);
      if (l?.name) eventName = l.name;
      for (const d of divs ?? []) if (d.name) divisions.push(d.name as string);
    }
  } else if (row.target_kind === "round" && row.round_id) {
    const { data: r } = await db
      .from("rounds")
      .select("course_id, layout_id")
      .eq("id", row.round_id)
      .maybeSingle();
    courseId = courseId ?? (r?.course_id ?? null);
    layoutId = layoutId ?? (r?.layout_id ?? null);
    eventName = row.label ?? "Casual round";
  }

  let courseName: string | null = null;
  if (courseId) {
    const { data: c } = await db.from("courses").select("name").eq("id", courseId).maybeSingle();
    courseName = (c?.name as string) ?? null;
  }
  let layoutName: string | null = null;
  let parTotal: number | null = null;
  let holeCount = 18;
  if (layoutId) {
    const { data: ly } = await db
      .from("course_layouts")
      .select("name, par_total, hole_count, scratch_rating, stroke_value")
      .eq("id", layoutId)
      .maybeSingle();
    layoutName = (ly?.name as string) ?? null;
    parTotal = (ly?.par_total as number) ?? null;
    holeCount = (ly?.hole_count as number) ?? 18;
  }

  return {
    eventName,
    roundLabel,
    courseId,
    layoutId,
    courseName,
    layoutName,
    parTotal,
    holeCount,
    divisions,
  };
}

async function cardSummaries(codeId: string) {
  const db = await admin();
  const { data: rounds } = await db
    .from("rounds")
    .select("id, scorekeeper_count")
    .eq("guest_code_id", codeId)
    .order("started_at", { ascending: true });
  const ids = (rounds ?? []).map((r) => r.id as string);
  if (!ids.length) return [];
  const { data: players } = await db
    .from("round_players")
    .select("id, round_id, guest_name, position")
    .in("round_id", ids)
    .order("position", { ascending: true });
  return (rounds ?? []).map((r) => ({
    round_id: r.id as string,
    scorekeepers: (r.scorekeeper_count as number) ?? 1,
    players: (players ?? [])
      .filter((p) => p.round_id === r.id)
      .map((p) => ({ id: p.id as string, name: (p.guest_name as string) ?? "Player" })),
  }));
}

/* ---------------------------------------------------------------- guest API */

export const resolveJoinCode = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ code: z.string().min(4).max(12) }).parse(raw))
  .handler(async ({ data }): Promise<JoinCodeInfo> => {
    const row = await loadCode(data.code);
    const target = await describeTarget(row);
    return {
      code: row.code,
      target_kind: row.target_kind,
      event_name: target.eventName,
      round_label: target.roundLabel,
      course_name: target.courseName,
      layout_name: target.layoutName,
      hole_count: target.holeCount,
      par_total: target.parTotal,
      requires_pin: Boolean(row.pin_hash),
      allow_guest_cards: row.allow_guest_cards,
      allow_caddy: row.allow_caddy,
      divisions: Array.from(new Set(target.divisions)),
      cards: await cardSummaries(row.id),
      status: codeStatus(row),
    };
  });

const joinInput = z.object({
  code: z.string().min(4).max(12),
  pin: z.string().trim().max(8).optional(),
  display_name: z.string().trim().min(2, "Enter your name").max(60),
  division_name: z.string().trim().max(60).optional(),
  pdga_number: z.string().trim().max(12).optional(),
  scores_whole_card: z.boolean().default(true),
  card_round_id: z.string().uuid().optional(),
  card_players: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
});

export const joinWithCode = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => joinInput.parse(raw))
  .handler(async ({ data }): Promise<GuestSession> => {
    const db = await admin();
    const row = await loadCode(data.code);
    const status = codeStatus(row);
    if (status !== "open") {
      throw new Error(
        status === "expired"
          ? "This code has expired. Ask the director for a fresh one."
          : status === "full"
            ? "This code has reached its player limit."
            : "Scoring is closed for this event.",
      );
    }
    if (row.pin_hash) {
      const pin = data.pin ?? "";
      if (!pin || (await sha256(`${row.pin_salt ?? ""}:${pin}`)) !== row.pin_hash) {
        throw new Error("That PIN doesn't match. Check the players' meeting sheet.");
      }
    }

    const target = await describeTarget(row);
    if (!target.courseId) throw new Error("This event has no course set yet. Ask the director.");
    if (!target.layoutId)
      throw new Error("This event has no layout set yet — scoring opens once the director picks one.");

    // Find or create the card (a normal round row).
    // A client-supplied card must already belong to this join code; the code's own
    // round (target_kind === "round") is trusted because it comes from the code row.
    let roundId: string | null = null;
    if (data.card_round_id) {
      const { data: existing } = await db
        .from("rounds")
        .select("id")
        .eq("id", data.card_round_id)
        .eq("guest_code_id", row.id)
        .maybeSingle();
      if (!existing) throw new Error("That card is no longer available.");
      roundId = existing.id as string;
    } else if (row.target_kind === "round") {
      roundId = row.round_id;
    }
    if (!roundId) {

      if (!row.allow_guest_cards) throw new Error("Join an existing card — new cards are off.");
      const { data: created, error } = await db
        .from("rounds")
        .insert({
          course_id: target.courseId,
          layout_id: target.layoutId as string,
          created_by: row.created_by,
          status: "in_progress",
          started_at: new Date().toISOString(),
          tournament_id: row.tournament_id,
          tournament_round_id: row.tournament_round_id,
          league_event_id: row.league_event_id,
          guest_code_id: row.id,
          rating_mode: "dgd_rated",
          is_rated: false,
          round_context:
            row.target_kind === "tournament_round"
              ? "tournament"
              : row.target_kind === "league_event"
                ? "league"
                : "casual",
        })
        .select("id")
        .single();
      if (error || !created) throw new Error("We couldn't start that card. Try again.");
      roundId = created.id as string;
    }
    if (!roundId) throw new Error("We couldn't start that card. Try again.");

    // Card players: reuse a matching name, otherwise add rows.
    const { data: existingPlayers } = await db
      .from("round_players")
      .select("id, guest_name, position")
      .eq("round_id", roundId)
      .order("position", { ascending: true });
    const roster = (existingPlayers ?? []).map((p) => ({
      id: p.id as string,
      name: (p.guest_name as string) ?? "Player",
      position: (p.position as number) ?? 0,
    }));

    const norm = (s: string) => s.trim().toLowerCase();
    let mine = roster.find((p) => norm(p.name) === norm(data.display_name));
    let nextPosition = roster.reduce((max, p) => Math.max(max, p.position), 0) + 1;

    const toInsert: { round_id: string; guest_name: string; position: number }[] = [];
    if (!mine) {
      toInsert.push({ round_id: roundId, guest_name: data.display_name.trim(), position: nextPosition });
      nextPosition += 1;
    }
    for (const name of data.card_players) {
      if (!name.trim()) continue;
      if (roster.some((p) => norm(p.name) === norm(name))) continue;
      if (toInsert.some((p) => norm(p.guest_name) === norm(name))) continue;
      toInsert.push({ round_id: roundId, guest_name: name.trim(), position: nextPosition });
      nextPosition += 1;
    }
    if (toInsert.length) {
      const { data: inserted } = await db
        .from("round_players")
        .insert(toInsert)
        .select("id, guest_name, position");
      for (const p of inserted ?? []) {
        roster.push({
          id: p.id as string,
          name: (p.guest_name as string) ?? "Player",
          position: (p.position as number) ?? 0,
        });
      }
      mine = mine ?? roster.find((p) => norm(p.name) === norm(data.display_name));
    }

    const token = randomToken();
    const { data: scorer, error: scorerErr } = await db
      .from("guest_scorers")
      .insert({
        code_id: row.id,
        token_hash: await sha256(token),
        display_name: data.display_name.trim(),
        division_name: data.division_name || null,
        pdga_number: data.pdga_number || null,
        round_id: roundId,
        round_player_id: mine?.id ?? null,
        scores_whole_card: data.scores_whole_card,
        claim_token: randomToken(),
      })
      .select("id, ai_used")
      .single();
    if (scorerErr || !scorer) throw new Error("We couldn't set up your scorecard. Try again.");

    await db
      .from("event_join_codes")
      .update({ use_count: row.use_count + 1 })
      .eq("id", row.id);
    await recountScorekeepers(roundId);

    return {
      token,
      code: row.code,
      scorer_id: scorer.id as string,
      round_id: roundId,
      display_name: data.display_name.trim(),
      players: roster
        .sort((a, b) => a.position - b.position)
        .map((p) => ({ id: p.id, name: p.name, is_me: p.id === mine?.id })),
      holes: await loadHoles(target.layoutId),
      event_name: target.eventName,
      course_name: target.courseName,
      layout_name: target.layoutName,
      allow_caddy: row.allow_caddy,
      ai_remaining: Math.max(0, row.ai_allowance - ((scorer.ai_used as number) ?? 0)),
    };
  });

type ScorerRow = {
  id: string;
  code_id: string;
  round_id: string | null;
  round_player_id: string | null;
  display_name: string;
  division_name: string | null;
  scores_whole_card: boolean;
  ai_used: number;
  claim_token: string | null;
};

async function loadScorer(token: string): Promise<{ scorer: ScorerRow; code: CodeRow }> {
  const db = await admin();
  const { data } = await db
    .from("guest_scorers")
    .select("*")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!data) throw new Error("Your scoring session expired. Rejoin with the event code.");
  const scorer = data as unknown as ScorerRow;
  const { data: codeRow } = await db
    .from("event_join_codes")
    .select("*")
    .eq("id", scorer.code_id)
    .maybeSingle();
  if (!codeRow) throw new Error("This event is no longer accepting scores.");
  await db
    .from("guest_scorers")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", scorer.id);
  return { scorer, code: codeRow as unknown as CodeRow };
}

/**
 * Reconciles every scorekeeper's entries into the shared scorecard.
 * A hole is written when the scorekeepers agree; disagreements keep the first
 * scorekeeper's value and are reported so the card can settle them.
 */
async function reconcileRound(roundId: string) {
  const db = await admin();
  const [{ data: entries }, { data: scorers }] = await Promise.all([
    db
      .from("guest_score_entries")
      .select("scorer_id, round_player_id, hole_number, strokes, penalties, created_at")
      .eq("round_id", roundId)
      .order("created_at", { ascending: true }),
    db.from("guest_scorers").select("id, created_at").eq("round_id", roundId),
  ]);
  const rows = entries ?? [];
  const order = new Map<string, number>();
  (scorers ?? [])
    .slice()
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((s, i) => order.set(s.id as string, i));

  const byCell = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.strokes == null) continue;
    const key = `${r.round_player_id}|${r.hole_number}`;
    const list = byCell.get(key) ?? [];
    list.push(r);
    byCell.set(key, list);
  }

  const conflicts: { round_player_id: string; hole_number: number }[] = [];
  const upserts: {
    round_id: string;
    round_player_id: string;
    hole_number: number;
    strokes: number;
    penalties: number;
  }[] = [];
  let agreedCells = 0;

  for (const list of byCell.values()) {
    const sorted = list
      .slice()
      .sort((a, b) => (order.get(a.scorer_id as string) ?? 0) - (order.get(b.scorer_id as string) ?? 0));
    const primary = sorted[0]!;
    const values = new Set(sorted.map((r) => r.strokes));
    if (values.size > 1) {
      conflicts.push({
        round_player_id: primary.round_player_id as string,
        hole_number: primary.hole_number as number,
      });
    } else if (sorted.length > 1) {
      agreedCells += 1;
    }
    upserts.push({
      round_id: roundId,
      round_player_id: primary.round_player_id as string,
      hole_number: primary.hole_number as number,
      strokes: primary.strokes as number,
      penalties: (primary.penalties as number) ?? 0,
    });
  }

  if (upserts.length) {
    await db
      .from("round_scores")
      .upsert(upserts, { onConflict: "round_player_id,hole_number" });
  }

  const scorekeeperCount = new Set(rows.map((r) => r.scorer_id)).size || (scorers ?? []).length;
  const verified = scorekeeperCount >= 2 && agreedCells > 0 && conflicts.length === 0;
  await db
    .from("rounds")
    .update({ scorekeeper_count: Math.max(1, scorekeeperCount), scores_verified: verified })
    .eq("id", roundId);

  return { conflicts, scorekeeperCount: Math.max(1, scorekeeperCount), verified };
}

async function recountScorekeepers(roundId: string) {
  const db = await admin();
  const { count } = await db
    .from("guest_scorers")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId);
  await db
    .from("rounds")
    .update({ scorekeeper_count: Math.max(1, count ?? 1) })
    .eq("id", roundId);
}

export const getGuestCard = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(16) }).parse(raw))
  .handler(async ({ data }): Promise<GuestSession & GuestCardState> => {
    const db = await admin();
    const { scorer, code } = await loadScorer(data.token);
    if (!scorer.round_id) throw new Error("This session has no card yet.");
    const target = await describeTarget(code);
    const [{ data: players }, { data: entries }, { data: round }] = await Promise.all([
      db
        .from("round_players")
        .select("id, guest_name, position")
        .eq("round_id", scorer.round_id)
        .order("position", { ascending: true }),
      db
        .from("guest_score_entries")
        .select("round_player_id, hole_number, strokes, penalties")
        .eq("round_id", scorer.round_id)
        .eq("scorer_id", scorer.id),
      db
        .from("rounds")
        .select("scorekeeper_count, scores_verified")
        .eq("id", scorer.round_id)
        .maybeSingle(),
    ]);
    const { conflicts } = await reconcileRound(scorer.round_id);
    return {
      token: data.token,
      code: code.code,
      scorer_id: scorer.id,
      round_id: scorer.round_id,
      display_name: scorer.display_name,
      players: (players ?? []).map((p) => ({
        id: p.id as string,
        name: (p.guest_name as string) ?? "Player",
        is_me: p.id === scorer.round_player_id,
      })),
      holes: await loadHoles(target.layoutId),
      event_name: target.eventName,
      course_name: target.courseName,
      layout_name: target.layoutName,
      allow_caddy: code.allow_caddy,
      ai_remaining: Math.max(0, code.ai_allowance - (scorer.ai_used ?? 0)),
      entries: (entries ?? []).map((e) => ({
        round_player_id: e.round_player_id as string,
        hole_number: e.hole_number as number,
        strokes: (e.strokes as number) ?? null,
        penalties: (e.penalties as number) ?? 0,
      })),
      scorekeeper_count: (round?.scorekeeper_count as number) ?? 1,
      scores_verified: Boolean(round?.scores_verified),
      conflicts,
    };
  });

export const saveGuestScores = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        token: z.string().min(16),
        entries: z
          .array(
            z.object({
              round_player_id: z.string().uuid(),
              hole_number: z.number().int().min(1).max(36),
              strokes: z.number().int().min(1).max(30).nullable(),
              penalties: z.number().int().min(0).max(20).optional(),
            }),
          )
          .min(1)
          .max(200),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { scorer } = await loadScorer(data.token);
    const roundId = scorer.round_id;
    if (!roundId) throw new Error("This session has no card yet.");

    const { data: allowed } = await db
      .from("round_players")
      .select("id")
      .eq("round_id", roundId);
    const allowedIds = new Set((allowed ?? []).map((p) => p.id as string));
    const rows = data.entries.filter((e) => {
      if (!allowedIds.has(e.round_player_id)) return false;
      if (!scorer.scores_whole_card && e.round_player_id !== scorer.round_player_id) return false;
      return true;
    });
    if (!rows.length) throw new Error("Those scores aren't for players on your card.");

    const { error } = await db.from("guest_score_entries").upsert(
      rows.map((e) => ({
        scorer_id: scorer.id,
        round_id: roundId,
        round_player_id: e.round_player_id,
        hole_number: e.hole_number,
        strokes: e.strokes,
        penalties: e.penalties ?? 0,
      })),
      { onConflict: "scorer_id,round_player_id,hole_number" },
    );
    if (error) throw new Error("We couldn't save those holes. They're still on your phone — retry.");

    const result = await reconcileRound(roundId);
    return { saved: rows.length, ...result };
  });

export const finishGuestCard = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(16) }).parse(raw))
  .handler(async ({ data }) => {
    const db = await admin();
    const { scorer } = await loadScorer(data.token);
    if (!scorer.round_id) throw new Error("This session has no card yet.");
    const result = await reconcileRound(scorer.round_id);
    await db
      .from("rounds")
      .update({
        status: "completed",
        ended_at: new Date().toISOString(),
        is_rated: result.verified,
      })
      .eq("id", scorer.round_id);
    return { ...result, claim_token: scorer.claim_token };
  });

export const getGuestStatlink = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(16) }).parse(raw))
  .handler(async ({ data }) => {
    const db = await admin();
    const { scorer, code } = await loadScorer(data.token);
    if (!scorer.round_id) throw new Error("This session has no card yet.");
    const target = await describeTarget(code);
    const holes = await loadHoles(target.layoutId);
    const parByHole = new Map(holes.map((h) => [h.number, h.par]));

    const [{ data: players }, { data: scores }, { data: round }, { data: layout }] =
      await Promise.all([
        db
          .from("round_players")
          .select("id, guest_name, position")
          .eq("round_id", scorer.round_id)
          .order("position", { ascending: true }),
        db
          .from("round_scores")
          .select("round_player_id, hole_number, strokes")
          .eq("round_id", scorer.round_id),
        db
          .from("rounds")
          .select("scores_verified, scorekeeper_count, status, started_at")
          .eq("id", scorer.round_id)
          .maybeSingle(),
        target.layoutId
          ? db
              .from("course_layouts")
              .select("scratch_rating, stroke_value")
              .eq("id", target.layoutId)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);

    const rows = scores ?? [];
    const summarize = (playerId: string) => {
      const mine = rows.filter((r) => r.round_player_id === playerId && r.strokes != null);
      let total = 0;
      let par = 0;
      const split = { eagle: 0, birdie: 0, par: 0, bogey: 0, worse: 0 };
      const byHole: { hole: number; par: number; strokes: number }[] = [];
      for (const r of mine) {
        const p = parByHole.get(r.hole_number as number) ?? 3;
        const s = r.strokes as number;
        total += s;
        par += p;
        byHole.push({ hole: r.hole_number as number, par: p, strokes: s });
        const d = s - p;
        if (d <= -2) split.eagle += 1;
        else if (d === -1) split.birdie += 1;
        else if (d === 0) split.par += 1;
        else if (d === 1) split.bogey += 1;
        else split.worse += 1;
      }
      byHole.sort((a, b) => a.hole - b.hole);
      return { total, par, toPar: total - par, holesScored: mine.length, split, byHole };
    };

    const meId = scorer.round_player_id;
    const mine = meId ? summarize(meId) : null;
    const scratch = (layout?.scratch_rating as number) ?? null;
    const strokeValue = (layout?.stroke_value as number) ?? null;
    const estimatedRating =
      mine && mine.holesScored === holes.length && scratch != null && strokeValue != null
        ? Math.round(scratch - mine.toPar * strokeValue)
        : null;

    return {
      event_name: target.eventName,
      round_label: target.roundLabel,
      course_name: target.courseName,
      layout_name: target.layoutName,
      display_name: scorer.display_name,
      division_name: scorer.division_name,
      hole_count: holes.length,
      verified: Boolean(round?.scores_verified),
      scorekeeper_count: (round?.scorekeeper_count as number) ?? 1,
      status: (round?.status as string) ?? "in_progress",
      played_at: (round?.started_at as string) ?? null,
      me: mine,
      estimated_rating: estimatedRating,
      claim_token: scorer.claim_token,
      card: (players ?? []).map((p) => {
        const s = summarize(p.id as string);
        return {
          id: p.id as string,
          name: (p.guest_name as string) ?? "Player",
          total: s.total,
          toPar: s.toPar,
          holesScored: s.holesScored,
        };
      }),
    };
  });

const CADDY_SYSTEM = `You are Ace, a concise disc golf caddy inside DG Dashboard.
Give practical, specific advice about the hole, wind, and shot selection.
Two to four sentences. No sales pitch, no invented course facts.`;

export const askGuestCaddy = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) =>
    z
      .object({
        token: z.string().min(16),
        hole_number: z.number().int().min(1).max(36).optional(),
        question: z.string().trim().min(3).max(500),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    const { scorer, code } = await loadScorer(data.token);
    if (!code.allow_caddy) throw new Error("The director turned the caddy guide off for this event.");
    const remaining = code.ai_allowance - (scorer.ai_used ?? 0);
    if (remaining <= 0) {
      return {
        reply:
          "You've used the free caddy questions for this card. Create a free account to keep asking — subscribers get full AI credits.",
        remaining: 0,
        upgrade: true,
      };
    }
    const target = await describeTarget(code);
    const holes = await loadHoles(target.layoutId);
    const hole = data.hole_number ? holes.find((h) => h.number === data.hole_number) : undefined;
    const context = [
      `Course: ${target.courseName ?? "unknown"}${target.layoutName ? ` · ${target.layoutName}` : ""}`,
      hole
        ? `Hole ${hole.number}: par ${hole.par}${hole.distance_ft ? `, ${hole.distance_ft} ft` : ""}${hole.notes ? `. Notes: ${hole.notes}` : ""}${hole.caddy_notes ? `. Caddy notes: ${hole.caddy_notes}` : ""}`
        : "No specific hole selected.",
    ].join("\n");

    let reply = "";
    try {
      const { requestAceReply } = await import("./ace-provider.server");
      reply = await requestAceReply([
        { role: "system", content: CADDY_SYSTEM },
        { role: "system", content: context },
        { role: "user", content: data.question },
      ]);
    } catch {
      throw new Error("The caddy couldn't answer that just now. Try again in a moment.");
    }

    await db
      .from("guest_scorers")
      .update({ ai_used: (scorer.ai_used ?? 0) + 1 })
      .eq("id", scorer.id);
    return { reply, remaining: remaining - 1, upgrade: false };
  });

/* ------------------------------------------------------------- claim + admin */

export const claimGuestRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ claim_token: z.string().min(16) }).parse(raw))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const db = await admin();
    const { data: scorer } = await db
      .from("guest_scorers")
      .select("id, round_id, round_player_id, claimed_by")
      .eq("claim_token", data.claim_token)
      .maybeSingle();
    if (!scorer) throw new Error("That claim link is no longer valid.");
    if (scorer.claimed_by && scorer.claimed_by !== userId) {
      throw new Error("This round was already claimed by another account.");
    }
    if (scorer.round_player_id) {
      await db.from("round_players").update({ user_id: userId }).eq("id", scorer.round_player_id);
    }
    await db
      .from("guest_scorers")
      .update({ claimed_by: userId, claimed_at: new Date().toISOString() })
      .eq("id", scorer.id);
    return { round_id: scorer.round_id as string | null };
  });

const codeInput = z.object({
  target_kind: z.enum(["tournament_round", "league_event", "round"]),
  tournament_id: z.string().uuid().optional(),
  tournament_round_id: z.string().uuid().optional(),
  league_id: z.string().uuid().optional(),
  league_event_id: z.string().uuid().optional(),
  round_id: z.string().uuid().optional(),
  course_id: z.string().uuid().optional(),
  layout_id: z.string().uuid().optional(),
  label: z.string().trim().max(120).optional(),
  pin: z.string().trim().regex(/^\d{4}$/).nullish(),
  allow_guest_cards: z.boolean().default(true),
  allow_caddy: z.boolean().default(true),
  ai_allowance: z.number().int().min(0).max(50).default(5),
  max_uses: z.number().int().min(1).max(500).nullable().default(null),
  expires_at: z.string().datetime().nullable().default(null),
});

/**
 * Only the people who run an event may mint scoring codes for it: the tournament
 * director or staff, the league organizer, or the creator/a player of a round.
 * Every id the client sends is verified, and child ids must belong to their parent.
 */
async function assertCanCreateCodeFor(
  supabase: any,
  userId: string,
  data: z.infer<typeof codeInput>,
) {
  const db = await admin();

  let tournamentId = data.tournament_id ?? null;
  let leagueId = data.league_id ?? null;

  if (data.tournament_round_id) {
    const { data: tr } = await db
      .from("tournament_rounds")
      .select("id, tournament_id")
      .eq("id", data.tournament_round_id)
      .maybeSingle();
    if (!tr) throw new Error("That tournament round no longer exists.");
    if (tournamentId && tr.tournament_id !== tournamentId) {
      throw new Error("That round doesn't belong to this tournament.");
    }
    tournamentId = tr.tournament_id as string;
  }

  if (data.league_event_id) {
    const { data: le } = await db
      .from("league_events")
      .select("id, league_id")
      .eq("id", data.league_event_id)
      .maybeSingle();
    if (!le) throw new Error("That league night no longer exists.");
    if (leagueId && le.league_id !== leagueId) {
      throw new Error("That league night doesn't belong to this league.");
    }
    leagueId = le.league_id as string;
  }

  if (tournamentId) {
    const [director, staff] = await Promise.all([
      supabase.rpc("is_event_director", { _tournament: tournamentId, _user: userId }),
      supabase.rpc("is_tournament_staff", { _tournament: tournamentId, _user: userId }),
    ]);
    if (!director.data && !staff.data) {
      throw new Error("Only this event's director or staff can create scoring codes.");
    }
  }

  if (leagueId) {
    const { data: canManage } = await supabase.rpc("can_manage_league", {
      _league_id: leagueId,
      _user: userId,
    });
    if (!canManage) {
      throw new Error("Only this league's organizer can create scoring codes.");
    }
  }

  if (data.round_id) {
    const { data: round } = await db
      .from("rounds")
      .select("id, created_by")
      .eq("id", data.round_id)
      .maybeSingle();
    if (!round) throw new Error("That round no longer exists.");
    if (round.created_by !== userId) {
      const { data: player } = await db
        .from("round_players")
        .select("id")
        .eq("round_id", data.round_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!player) throw new Error("You're not on this card.");
    }
  }

  if (data.target_kind === "tournament_round" && !tournamentId) {
    throw new Error("Pick the tournament round this code is for.");
  }
  if (data.target_kind === "league_event" && !leagueId) {
    throw new Error("Pick the league night this code is for.");
  }
  if (data.target_kind === "round" && !data.round_id) {
    throw new Error("Pick the round this code is for.");
  }
}

export const createJoinCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => codeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context as { userId: string; supabase: any };
    await assertCanCreateCodeFor(supabase, userId, data);
    const db = await admin();
    const salt = randomToken().slice(0, 16);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = generateCode(6);
      const { data: created, error } = await db
        .from("event_join_codes")
        .insert({
          code,
          target_kind: data.target_kind,
          tournament_id: data.tournament_id ?? null,
          tournament_round_id: data.tournament_round_id ?? null,
          league_id: data.league_id ?? null,
          league_event_id: data.league_event_id ?? null,
          round_id: data.round_id ?? null,
          course_id: data.course_id ?? null,
          layout_id: data.layout_id ?? null,
          label: data.label ?? null,
          pin_hash: data.pin ? await sha256(`${salt}:${data.pin}`) : null,
          pin_salt: data.pin ? salt : null,
          allow_guest_cards: data.allow_guest_cards,
          allow_caddy: data.allow_caddy,
          ai_allowance: data.ai_allowance,
          max_uses: data.max_uses,
          expires_at: data.expires_at,
          created_by: userId,
        })
        .select("id, code")
        .single();
      if (!error && created) return { id: created.id as string, code: created.code as string };
    }
    throw new Error("We couldn't generate a code. Try again.");
  });

export type JoinCodeRow = {
  id: string;
  code: string;
  label: string | null;
  target_kind: string;
  requires_pin: boolean;
  allow_guest_cards: boolean;
  allow_caddy: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

export const listJoinCodes = createServerFn({ method: "POST" })

  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        tournament_id: z.string().uuid().optional(),
        league_id: z.string().uuid().optional(),
        round_id: z.string().uuid().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<JoinCodeRow[]> => {
    const { supabase } = context as { supabase: any };

    let q = supabase
      .from("event_join_codes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.tournament_id) q = q.eq("tournament_id", data.tournament_id);
    if (data.league_id) q = q.eq("league_id", data.league_id);
    if (data.round_id) q = q.eq("round_id", data.round_id);
    const { data: rows, error } = await q;
    if (error) throw new Error("We couldn't load your join codes.");
    return (rows ?? []).map((r: any) => ({
      id: r.id as string,
      code: r.code as string,
      label: r.label as string | null,
      target_kind: r.target_kind as string,
      requires_pin: Boolean(r.pin_hash),
      allow_guest_cards: r.allow_guest_cards as boolean,
      allow_caddy: r.allow_caddy as boolean,
      use_count: r.use_count as number,
      max_uses: r.max_uses as number | null,
      expires_at: r.expires_at as string | null,
      is_active: r.is_active as boolean,
      created_at: r.created_at as string,
    }));
  });

export const setJoinCodeActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { error } = await supabase
      .from("event_join_codes")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error("We couldn't update that code.");
    return { ok: true };
  });

export const listGuestCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ code_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context as { supabase: any };
    const { data: code } = await supabase
      .from("event_join_codes")
      .select("id")
      .eq("id", data.code_id)
      .maybeSingle();
    if (!code) throw new Error("Code not found.");
    const db = await admin();
    const { data: scorers } = await db
      .from("guest_scorers")
      .select("id, display_name, division_name, round_id, last_seen_at, claimed_by")
      .eq("code_id", data.code_id)
      .order("created_at", { ascending: true });
    const roundIds = Array.from(
      new Set((scorers ?? []).map((s) => s.round_id).filter(Boolean) as string[]),
    );
    if (!roundIds.length) return [];
    const [{ data: rounds }, { data: players }, { data: scores }] = await Promise.all([
      db.from("rounds").select("id, status, scores_verified, scorekeeper_count").in("id", roundIds),
      db.from("round_players").select("id, round_id, guest_name, position").in("round_id", roundIds),
      db.from("round_scores").select("round_id, round_player_id, strokes").in("round_id", roundIds),
    ]);
    return (rounds ?? []).map((r: any) => ({
      round_id: r.id as string,
      status: r.status as string,
      verified: Boolean(r.scores_verified),
      scorekeeper_count: (r.scorekeeper_count as number) ?? 1,
      scorekeepers: (scorers ?? [])
        .filter((s) => s.round_id === r.id)
        .map((s) => ({
          name: s.display_name as string,
          division: s.division_name as string | null,
          last_seen_at: s.last_seen_at as string,
          claimed: Boolean(s.claimed_by),
        })),
      players: (players ?? [])
        .filter((p: any) => p.round_id === r.id)
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .map((p: any) => ({
          name: (p.guest_name as string) ?? "Player",
          total: (scores ?? [])
            .filter((s: any) => s.round_player_id === p.id && s.strokes != null)
            .reduce((sum: number, s: any) => sum + (s.strokes as number), 0),
        })),
    }));
  });

/**
 * Every round gets a browser join code automatically.
 *
 * Returns the round's existing active code, or mints one on the spot. Callers
 * must be the round's creator or a player on the card.
 */
export const ensureRoundJoinCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        round_id: z.string().uuid(),
        pin: z.string().trim().regex(/^\d{4}$/).nullish(),
        label: z.string().trim().max(120).nullish(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }): Promise<{ id: string; code: string; created: boolean }> => {
    const { userId } = context as { userId: string };
    const db = await admin();

    const { data: round } = await db
      .from("rounds")
      .select("id, created_by, course_id, layout_id")
      .eq("id", data.round_id)
      .maybeSingle();
    if (!round) throw new Error("That round no longer exists.");
    if (round.created_by !== userId) {
      const { data: player } = await db
        .from("round_players")
        .select("id")
        .eq("round_id", data.round_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!player) throw new Error("You're not on this card.");
    }

    const { data: existing } = await db
      .from("event_join_codes")
      .select("id, code")
      .eq("round_id", data.round_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { id: existing.id as string, code: existing.code as string, created: false };
    }

    const salt = randomToken().slice(0, 16);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const code = generateCode(6);
      const { data: created, error } = await db
        .from("event_join_codes")
        .insert({
          code,
          target_kind: "round",
          round_id: data.round_id,
          course_id: round.course_id ?? null,
          layout_id: round.layout_id ?? null,
          label: data.label ?? null,
          pin_hash: data.pin ? await sha256(`${salt}:${data.pin}`) : null,
          pin_salt: data.pin ? salt : null,
          allow_guest_cards: false,
          allow_caddy: true,
          ai_allowance: 5,
          max_uses: null,
          expires_at: null,
          created_by: round.created_by ?? userId,
        })
        .select("id, code")
        .single();
      if (!error && created) {
        return { id: created.id as string, code: created.code as string, created: true };
      }
    }
    throw new Error("We couldn't generate a code for this round. Try again.");
  });
