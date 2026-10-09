import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { DGD_V1_MODEL_ID as MODEL } from "@/lib/dgd-v1/engine";

async function assertPlatformAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_platform_admin", { _uid: context.userId });
  if (error || !data) throw new Error("Admins only");
}

/** Runs the shadow calculation. The client can only ask; the server computes. */
export const runDgdV1Shadow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ force: z.boolean().optional() }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runDgdV1 } = await import("@/lib/dgd-v1/run.server");
    return runDgdV1(supabaseAdmin, context.userId, !!data.force);
  });

/** Overview: model, latest runs, player states. Read under admin RLS. */
export const getDgdV1Overview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const [model, runs, states] = await Promise.all([
      sb.from("rating_model_versions").select("id,model_name,version,status,config").eq("id", MODEL).single(),
      sb
        .from("dgd_calc_runs")
        .select("id,status,players_seen,players_skipped,events_written,layouts_fitted,failures,validation,started_at,finished_at,iteration_count,convergence_status,final_delta,stop_reason")
        .eq("model_version", MODEL)
        .order("started_at", { ascending: false })
        .limit(5),
      sb.from("dgd_player_state").select("*").eq("model_version", MODEL),
    ]);
    const ids = (states.data ?? []).map((s: any) => s.user_id);
    const { data: profiles } = ids.length
      ? await sb.from("profiles").select("id,username,display_name").in("id", ids)
      : { data: [] };
    const names = new Map((profiles ?? []).map((p: any) => [p.id, p.display_name || p.username || p.id]));
    return {
      model: model.data,
      runs: runs.data ?? [],
      players: (states.data ?? []).map((s: any) => ({ ...s, name: names.get(s.user_id) ?? s.user_id })),
    };
  });

/** One player: state, active events, ineligible/duplicate rounds. */
export const getDgdV1Player = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ userId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const [events, elig, superseded, exp, layoutExp] = await Promise.all([
      sb
        .from("dgd_rating_events")
        .select("*")
        .eq("user_id", data.userId)
        .eq("model_version", MODEL)
        .eq("status", "active")
        .order("seq", { ascending: false })
        .limit(200),
      sb
        .from("dgd_round_eligibility")
        .select("canonical_round_id,eligible,reasons,layout_key")
        .eq("user_id", data.userId)
        .eq("model_version", MODEL)
        .eq("eligible", false)
        .limit(500),
      sb
        .from("dgd_rating_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.userId)
        .eq("model_version", MODEL)
        .neq("status", "active"),
      sb.from("dgd_player_experience").select("*").eq("user_id", data.userId).eq("model_version", MODEL).maybeSingle(),
      sb
        .from("dgd_player_layout_experience")
        .select("*")
        .eq("user_id", data.userId)
        .eq("model_version", MODEL)
        .order("eligible_round_count", { ascending: false })
        .limit(50),
    ]);
    const reasons: Record<string, number> = {};
    for (const e of elig.data ?? []) for (const r of e.reasons as string[]) reasons[r] = (reasons[r] ?? 0) + 1;
    return {
      events: events.data ?? [],
      ineligible: elig.data ?? [],
      ineligibleReasons: reasons,
      supersededCount: superseded.count ?? 0,
      experience: exp.data ?? null,
      layoutExperience: layoutExp.data ?? [],
    };
  });

// ---------- Phase 3.7 calibration cohort (admin-only, shadow) ----------

/** Adds or refreshes calibration players by PDGA number. No accounts are created. */
export const addDgdCalibrationPlayers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ numbers: z.array(z.string().trim().min(1).max(12)).min(1).max(25) }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchCalibrationSubject } = await import("@/lib/dgd-v1/calibration.server");
    const out = [];
    for (const n of data.numbers) out.push(await fetchCalibrationSubject(supabaseAdmin, n, context.userId));
    return out;
  });

export const runDgdCalibration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCalibration } = await import("@/lib/dgd-v1/calibration.server");
    return runCalibration(supabaseAdmin, context.userId);
  });

/** Latest calibration report plus admin notes. Read under admin RLS. */
export const getDgdCalibration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const [rep, subjects, notes] = await Promise.all([
      sb.from("dgd_calibration_reports").select("id,status,report,players,started_at,finished_at").eq("status", "succeeded").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("dgd_calibration_subjects").select("id,pdga_number,display_name,official_rating,status,rounds_parsed,last_fetched_at,last_error,linked_user_id").order("official_rating", { ascending: false }),
      sb.from("dgd_calibration_notes").select("subject_id,note,tags,updated_at"),
    ]);
    return { report: rep.data ?? null, subjects: subjects.data ?? [], notes: notes.data ?? [] };
  });

/** Private admin observation. Stored separately and never read by any calculation. */
export const saveDgdCalibrationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ subjectId: z.string().uuid(), note: z.string().max(4000), tags: z.array(z.string().trim().min(1).max(40)).max(12) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { error } = await (context.supabase as any)
      .from("dgd_calibration_notes")
      .upsert({ subject_id: data.subjectId, note: data.note, tags: data.tags, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Couldn't save that note");
    return { ok: true };
  });

// ---------- Phase 3.8 V1.1 candidate (admin-only, shadow) ----------

export const runDgdCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runCandidate } = await import("@/lib/dgd-v1/candidate.server");
    return runCandidate(supabaseAdmin, context.userId);
  });

/** Latest candidate report. Read under admin RLS. */
export const getDgdCandidate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { data } = await (context.supabase as any)
      .from("dgd_candidate_reports")
      .select("id,status,report,started_at,finished_at")
      .eq("status", "succeeded")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { report: data ?? null };
  });

// ---------- Phase 4 V1.1 preview (safe read layer) ----------

/** Admin: rebuild the stored V1.1 preview from the frozen strict configuration. */
export const publishDgdPreviewData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Phase 5A: rebuild goes through the canonical shadow pipeline, never the calibration-only path.
    const { enqueueBackfill, processDgdV11Jobs } = await import("@/lib/dgd-v1/shadow.server");
    const q = await enqueueBackfill(supabaseAdmin);
    const r = await processDgdV11Jobs(supabaseAdmin, 25);
    return { players: q.players, rounds: r.rounds_in_model ?? 0, layouts: 0, completed: r.completed };
  });

/** Admin: list / add / remove preview testers (by username). */
export const listDgdPreviewTesters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const { data } = await sb.from("dgd_preview_testers").select("user_id,created_at,note").order("created_at");
    const ids = (data ?? []).map((t: any) => t.user_id);
    const { data: profs } = ids.length ? await sb.from("profiles").select("id,username,display_name").in("id", ids) : { data: [] };
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return { testers: (data ?? []).map((t: any) => ({ ...t, profile: byId.get(t.user_id) ?? null })) };
  });

export const setDgdPreviewTester = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ username: z.string().trim().min(1).max(60), add: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const { data: prof } = await sb.from("profiles").select("id").ilike("username", data.username).maybeSingle();
    if (!prof) throw new Error("We couldn't find that player");
    const q = data.add
      ? sb.from("dgd_preview_testers").upsert({ user_id: prof.id, added_by: context.userId })
      : sb.from("dgd_preview_testers").delete().eq("user_id", prof.id);
    const { error } = await q;
    if (error) throw new Error("Couldn't update testers");
    return { ok: true };
  });

/** Player: own V1.1 preview summary. Authorization happens in the database function. */
export const getMyDgdPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ model: z.enum(["v13", "v12", "v11"]).default("v12") }).parse(raw ?? {}))
  .handler(async ({ data: input, context }) => {
    // V1.3 is the public DGD Rating for every signed-in player; V1.2/V1.1 stay tester/admin-gated in the database.
    const { data, error } = input.model === "v13"
      ? await (context.supabase as any).rpc("get_my_dgd_rating")
      : await (context.supabase as any).rpc("get_my_dgd_preview_summary_v2", { _model: input.model });
    if (error) return { allowed: false, available: false, error: true } as const;
    return data as Record<string, any>;
  });

/** Tester/admin: stored candidate display-scale values for the caller. Gated in the database; never computed here. */
export const getMyDgdScaleCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any).rpc("get_my_dgd_scale_candidates");
    if (error) return { rows: [] as any[] };
    return { rows: (data ?? []) as any[] };
  });

/** Player: own V1.1 round history, paginated. */
export const getMyDgdPreviewRounds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(25), offset: z.number().int().min(0).default(0), status: z.enum(["rated", "provisional", "not_rated", "excluded", "pending_review"]).nullable().default(null) }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await (context.supabase as any).rpc("get_my_dgd_preview_rounds", { _limit: data.limit, _offset: data.offset, _status: data.status });
    if (error) throw new Error("Couldn't load your DGD rounds");
    return { rounds: (rows ?? []) as any[], total: Number(rows?.[0]?.total_count ?? 0) };
  });

// ---------- Phase 5A: shadow pipeline ----------

/** Player: combined, filtered V1.1 history over canonical physical rounds. */
export const getMyDgdPreviewHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      source: z.enum(["pdga", "udisc", "app"]).nullable().default(null),
      rated: z.boolean().nullable().default(null),
      category: z.enum(["sanctioned_tournament", "unsanctioned_tournament", "league", "casual", "practice"]).nullable().default(null),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
      course: z.string().trim().max(80).nullable().default(null),
      model: z.enum(["v13", "v12", "v11"]).default("v12"),
    }).parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const common = { _limit: data.limit, _offset: data.offset, _source: data.source, _rated: data.rated,
      _category: data.category, _from: data.from, _to: data.to, _course: data.course || null };
    const { data: rows, error } = data.model === "v13"
      ? await (context.supabase as any).rpc("get_my_dgd_rating_rounds", common)
      : await (context.supabase as any).rpc("get_my_dgd_preview_rounds_v4", {
      _model: data.model, _limit: data.limit, _offset: data.offset, _source: data.source, _rated: data.rated,
      _category: data.category, _from: data.from, _to: data.to, _course: data.course || null,
    });
    if (error) throw new Error("Couldn't load your DGD rounds");
    return { rounds: (rows ?? []) as any[], total: Number(rows?.[0]?.total_count ?? 0) };
  });

/** Admin: queue every player with canonical rounds for a V1.1 shadow backfill. */
export const startDgdV11Backfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enqueueBackfill } = await import("@/lib/dgd-v1/shadow.server");
    return enqueueBackfill(supabaseAdmin);
  });

/** Admin: process the next batch of queued jobs now (the scheduler also does this). */
export const processDgdV11Batch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processDgdV11Jobs } = await import("@/lib/dgd-v1/shadow.server");
    return processDgdV11Jobs(supabaseAdmin, 25);
  });

/** Admin: shadow population, coverage, quality, bias and representativeness report. */
export const getDgdV11PopulationReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { shadowPopulationReport } = await import("@/lib/dgd-v1/shadow.server");
    const r = await shadowPopulationReport(supabaseAdmin);
    const { data: jobs } = await (context.supabase as any).from("dgd_v11_jobs").select("status").limit(5000);
    const queue = (jobs ?? []).reduce((a: Record<string, number>, j: any) => ((a[j.status] = (a[j.status] ?? 0) + 1), a), {});
    return { ...r, queue };
  });

/** Admin: Phase 5A.1 UDisc integrity / unified-source contribution report (read-only). */
export const getDgdSourceIntegrityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sourceIntegrityReport } = await import("@/lib/dgd-v1/shadow.server");
    const r = await sourceIntegrityReport(supabaseAdmin);
    return JSON.parse(JSON.stringify(r)) as Record<string, any>;
  });

/** Admin: Phase 5A.4 — recover PDGA layout context for app players' PDGA rounds (writes pdga_round_context only). */
export const runPdgaContextEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ refresh: z.boolean().optional() }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { enrichPdgaContext } = await import("@/lib/dgd-v1/v12.server");
    const r = await enrichPdgaContext(supabaseAdmin, { refresh: !!data.refresh, by: context.userId });
    return JSON.parse(JSON.stringify(r)) as Record<string, any>;
  });

/** Admin: Phase 5A.4 — read-only V1.2 candidate research report. */
export const getDgdV12Report = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { v12Report } = await import("@/lib/dgd-v1/v12.server");
    const r = await v12Report(supabaseAdmin);
    return JSON.parse(JSON.stringify(r)) as Record<string, any>;
  });

/** Admin: open SOURCE_CONFLICT rounds plus how one player's evidence reaches another (read-only). */
export const getDgdV12Diagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ from_user: z.string().uuid().nullable().default(null), to_user: z.string().uuid().nullable().default(null) }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context);
    const sb = context.supabase as any;
    const { data: conflicts } = await sb.from("dgd_source_conflicts").select("canonical_round_id,user_id,kind,state,detail,review_status,detected_at").order("detected_at", { ascending: false }).limit(200);
    let paths: any[] = [];
    if (data.from_user && data.to_user) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { loadV12World } = await import("@/lib/dgd-v1/v12.server");
      const { connectedEvidence } = await import("@/lib/dgd-v1/v12-shadow");
      const { eventRoundLayoutKey } = await import("@/lib/dgd-v1/pdga-context");
      const w = await loadV12World(supabaseAdmin);
      paths = connectedEvidence(w.all, data.from_user, data.to_user, eventRoundLayoutKey);
    }
    return JSON.parse(JSON.stringify({ conflicts: conflicts ?? [], paths })) as Record<string, any>;
  });
