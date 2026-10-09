/**
 * Building Ace's knowledge library.
 *
 * Runs on a timer. Each pass turns fresh app and outside-source records —
 * courses, course scoring history, events, tour players, disc molds — into
 * plain-language knowledge entries Ace can search when someone asks a
 * question. Entries are keyed by source reference, so a pass updates what it
 * already wrote instead of piling up duplicates.
 */

export type KnowledgeEntry = {
  kind: string;
  title: string;
  body: string;
  region: string | null;
  state: string | null;
  tags: string[];
  source: string;
  source_ref: string;
  quality: number;
};

export type IngestResult = {
  ran: boolean;
  written: number;
  byKind: Record<string, number>;
  errors: string[];
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function ft(n: unknown): string | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? `${Math.round(v)} ft` : null;
}

function join(parts: (string | null | undefined)[], sep = ". "): string {
  return parts.filter((p) => !!p && String(p).trim().length > 0).join(sep);
}

/** One knowledge-building pass. Batch sizes keep a single run well inside the request window. */
export async function runAceKnowledgeIngest(opts: { batch?: number } = {}): Promise<IngestResult> {
  const db = await admin();
  const batch = Math.min(Math.max(opts.batch ?? 150, 20), 400);
  const errors: string[] = [];
  const entries: KnowledgeEntry[] = [];

  const run = await db
    .from("ace_knowledge_runs")
    .insert({ note: "knowledge pass started" })
    .select("id")
    .single();
  const runId = run.data?.id as string | undefined;

  // --- Courses the app already knows, enriched with real scoring history -----
  try {
    const { data: courses } = await db
      .from("courses")
      .select(
        "id, name, city, state, country, hole_count, pdga_rating, difficulty, designer, year_established, description",
      )
      .eq("moderation_status", "approved")
      .order("updated_at", { ascending: false })
      .limit(batch);

    const ids = (courses ?? []).map((c: any) => c.id);
    const intelByCourse = new Map<string, any>();
    if (ids.length) {
      const { data: intel } = await db
        .from("course_intel")
        .select(
          "course_id, rounds_count, avg_round_rating, avg_to_par, est_ssa, avg_score, best_round_rating",
        )
        .in("course_id", ids);
      for (const row of intel ?? []) intelByCourse.set(row.course_id as string, row);
    }

    for (const c of courses ?? []) {
      const i = intelByCourse.get(c.id) ?? {};
      const where = join(
        [c.city, c.state, c.country && c.country !== "US" ? c.country : null],
        ", ",
      );
      entries.push({
        kind: "course",
        title: `${c.name}${where ? ` — ${where}` : ""}`,
        body: join([
          where ? `${c.name} is a disc golf course in ${where}` : `${c.name} is a disc golf course`,
          c.hole_count ? `It plays ${c.hole_count} holes` : null,
          c.pdga_rating ? `Course rating ${c.pdga_rating}` : null,
          c.difficulty ? `Difficulty: ${c.difficulty}` : null,
          c.designer ? `Designed by ${c.designer}` : null,
          c.year_established ? `Established ${c.year_established}` : null,
          i.est_ssa ? `Scratch scoring average around ${Number(i.est_ssa).toFixed(1)}` : null,
          i.rounds_count ? `${i.rounds_count} rounds logged in DG Dashboard` : null,
          i.avg_to_par != null
            ? `Players here average ${Number(i.avg_to_par) >= 0 ? "+" : ""}${Number(i.avg_to_par).toFixed(1)} to par`
            : null,
          i.avg_round_rating
            ? `Average round rating ${Math.round(Number(i.avg_round_rating))}`
            : null,
          c.description ? String(c.description).replace(/\s+/g, " ").slice(0, 400) : null,
        ]),
        region: where || null,
        state: (c.state as string) ?? null,
        tags: ["course", c.state, c.city].filter(Boolean) as string[],
        source: "dg_dashboard",
        source_ref: `course:${c.id}`,
        quality: 80,
      });
    }
  } catch (err: any) {
    errors.push(`courses: ${err?.message ?? err}`);
  }

  // --- Outside course reviews (DGCR): terrain, length, conditions -----------
  try {
    const { data: rows } = await db
      .from("dgcr_courses")
      .select(
        "id, name, park_name, city, state, country, hole_count, rating, review_count, length_min_ft, length_max_ft, terrain, foliage, designer, year_established, tee_type, basket_type, conditions, sse, description, course_type",
      )
      .order("updated_at", { ascending: false })
      .limit(batch);
    for (const c of rows ?? []) {
      const where = join(
        [c.city, c.state, c.country && c.country !== "USA" ? c.country : null],
        ", ",
      );
      entries.push({
        kind: "course",
        title: `${c.name}${where ? ` — ${where}` : ""} (course review data)`,
        body: join([
          where ? `${c.name} in ${where}` : String(c.name),
          c.park_name ? `Located in ${c.park_name}` : null,
          c.hole_count ? `${c.hole_count} holes` : null,
          c.course_type ? `${c.course_type} course` : null,
          c.rating
            ? `Reviewer rating ${Number(c.rating).toFixed(1)}/5 from ${c.review_count ?? 0} reviews`
            : null,
          c.length_min_ft || c.length_max_ft
            ? `Hole lengths run ${ft(c.length_min_ft) ?? "?"} to ${ft(c.length_max_ft) ?? "?"}`
            : null,
          c.sse ? `Scratch scoring estimate ${c.sse}` : null,
          c.terrain ? `Terrain: ${c.terrain}` : null,
          c.foliage ? `Foliage: ${c.foliage}` : null,
          c.tee_type ? `Tees: ${c.tee_type}` : null,
          c.basket_type ? `Baskets: ${c.basket_type}` : null,
          c.conditions ? `Conditions: ${c.conditions}` : null,
          c.designer ? `Designed by ${c.designer}` : null,
          c.year_established ? `Established ${c.year_established}` : null,
          c.description ? String(c.description).replace(/\s+/g, " ").slice(0, 500) : null,
        ]),
        region: where || null,
        state: (c.state as string) ?? null,
        tags: ["course", "review", c.state].filter(Boolean) as string[],
        source: "disc_golf_course_review",
        source_ref: `dgcr:${c.id}`,
        quality: 70,
      });
    }
  } catch (err: any) {
    errors.push(`dgcr_courses: ${err?.message ?? err}`);
  }

  // --- Signature holes with real par and distance ---------------------------
  try {
    const { data: holes } = await db
      .from("holes")
      .select(
        "id, layout_id, number, par, distance_ft, elevation_ft, shot_shape, hazards, caddy_notes, nickname, course_layouts(name, courses(name, city, state))",
      )
      .not("caddy_notes", "is", null)
      .limit(batch);
    for (const h of holes ?? []) {
      const layout = (h as any).course_layouts ?? {};
      const course = layout.courses ?? {};
      if (!course.name) continue;
      const where = join([course.city, course.state], ", ");
      entries.push({
        kind: "hole",
        title: `${course.name} hole ${h.number}${h.nickname ? ` (“${h.nickname}”)` : ""}`,
        body: join([
          `Hole ${h.number} at ${course.name}${where ? ` in ${where}` : ""}${layout.name ? `, ${layout.name} layout` : ""}`,
          h.par ? `Par ${h.par}` : null,
          ft(h.distance_ft),
          h.elevation_ft ? `${h.elevation_ft} ft of elevation change` : null,
          h.shot_shape ? `Plays as a ${h.shot_shape}` : null,
          Array.isArray(h.hazards) && h.hazards.length ? `Hazards: ${h.hazards.join(", ")}` : null,
          h.caddy_notes ? String(h.caddy_notes).replace(/\s+/g, " ").slice(0, 400) : null,
        ]),
        region: where || null,
        state: (course.state as string) ?? null,
        tags: ["hole", "strategy", course.state].filter(Boolean) as string[],
        source: "dg_dashboard",
        source_ref: `hole:${h.id}`,
        quality: 75,
      });
    }
  } catch (err: any) {
    errors.push(`holes: ${err?.message ?? err}`);
  }

  // --- Events on the calendar ----------------------------------------------
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: events } = await db
      .from("event_directory")
      .select(
        "id, name, kind, tier, sanctioning, start_date, end_date, venue_name, city, state, source, registration_status, field_size, field_capacity, url",
      )
      .gte("start_date", today)
      .order("start_date", { ascending: true })
      .limit(batch);
    for (const e of events ?? []) {
      const where = join([e.venue_name, e.city, e.state], ", ");
      entries.push({
        kind: "event",
        title: `${e.name}${e.start_date ? ` — ${e.start_date}` : ""}`,
        body: join([
          `${e.name} is ${e.kind === "league" ? "a league" : "an event"}${where ? ` at ${where}` : ""}`,
          e.start_date
            ? `Runs ${e.start_date}${e.end_date && e.end_date !== e.start_date ? ` to ${e.end_date}` : ""}`
            : null,
          e.tier ? `PDGA tier ${e.tier}` : null,
          e.sanctioning ? `Sanctioning: ${e.sanctioning}` : null,
          e.registration_status ? `Registration ${e.registration_status}` : null,
          e.field_size
            ? `Field ${e.field_size}${e.field_capacity ? ` of ${e.field_capacity}` : ""}`
            : null,
          e.source ? `Listed via ${e.source}` : null,
        ]),
        region: where || null,
        state: (e.state as string) ?? null,
        tags: ["event", e.kind, e.state].filter(Boolean) as string[],
        source: (e.source as string) ?? "dg_dashboard",
        source_ref: `event:${e.id}`,
        quality: 65,
      });
    }
  } catch (err: any) {
    errors.push(`event_directory: ${err?.message ?? err}`);
  }

  // --- Tour players ---------------------------------------------------------
  try {
    const { data: players } = await db
      .from("pdga_kb_players")
      .select(
        "id, name, pdga_number, rating, class, city, state, country, member_since, career_wins, official_status",
      )
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(batch);
    for (const p of players ?? []) {
      const where = join([p.city, p.state, p.country], ", ");
      entries.push({
        kind: "player",
        title: `${p.name}${p.pdga_number ? ` — PDGA #${p.pdga_number}` : ""}`,
        body: join([
          `${p.name} is a PDGA member${where ? ` from ${where}` : ""}`,
          p.rating ? `Current rating ${p.rating}` : null,
          p.class ? `Class ${p.class}` : null,
          p.career_wins ? `${p.career_wins} career wins` : null,
          p.member_since ? `Member since ${p.member_since}` : null,
          p.official_status ? `Official status: ${p.official_status}` : null,
        ]),
        region: where || null,
        state: (p.state as string) ?? null,
        tags: ["player", "pdga", p.state].filter(Boolean) as string[],
        source: "pdga",
        source_ref: `player:${p.id}`,
        quality: 60,
      });
    }
  } catch (err: any) {
    errors.push(`pdga_kb_players: ${err?.message ?? err}`);
  }

  // --- Disc molds: flight numbers Ace should never guess --------------------
  try {
    const { data: molds } = await db
      .from("disc_molds")
      .select(
        "id, name, category, speed, glide, turn, fade, stability, pdga_approved, max_weight_g, rim_width_cm, description, disc_manufacturers:manufacturer_id(name)",
      )
      .order("updated_at", { ascending: false })
      .limit(batch);
    for (const m of molds ?? []) {
      const maker = (m as any).disc_manufacturers?.name as string | undefined;
      entries.push({
        kind: "disc",
        title: `${maker ? `${maker} ` : ""}${m.name}`,
        body: join([
          `${m.name}${maker ? ` by ${maker}` : ""} is a ${m.category ?? "disc"}`,
          m.speed != null
            ? `Flight numbers ${m.speed}/${m.glide ?? "?"}/${m.turn ?? "?"}/${m.fade ?? "?"}`
            : null,
          m.stability ? `Stability: ${String(m.stability).replace(/_/g, " ")}` : null,
          m.rim_width_cm ? `Rim width ${m.rim_width_cm} cm` : null,
          m.max_weight_g ? `Max weight ${m.max_weight_g} g` : null,
          m.pdga_approved ? "PDGA approved" : null,
          m.description ? String(m.description).replace(/\s+/g, " ").slice(0, 300) : null,
        ]),
        region: null,
        state: null,
        tags: ["disc", "gear", m.category].filter(Boolean) as string[],
        source: "dg_dashboard",
        source_ref: `mold:${m.id}`,
        quality: 70,
      });
    }
  } catch (err: any) {
    errors.push(`disc_molds: ${err?.message ?? err}`);
  }

  // --- Write everything in chunks ------------------------------------------
  const byKind: Record<string, number> = {};
  let written = 0;
  const stamped = entries
    .filter((e) => e.body.trim().length > 20)
    .map((e) => ({ ...e, updated_at: new Date().toISOString() }));

  for (let i = 0; i < stamped.length; i += 200) {
    const chunk = stamped.slice(i, i + 200);
    const { error } = await db.from("ace_knowledge").upsert(chunk, { onConflict: "source_ref" });
    if (error) {
      errors.push(`write: ${error.message}`);
      continue;
    }
    written += chunk.length;
    for (const e of chunk) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  }

  if (runId) {
    await db
      .from("ace_knowledge_runs")
      .update({
        finished_at: new Date().toISOString(),
        updated: written,
        note: errors.length ? errors.slice(0, 5).join(" | ") : "ok",
      })
      .eq("id", runId);
  }

  return { ran: true, written, byKind, errors };
}
