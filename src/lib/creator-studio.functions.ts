import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ADMIN_LIMITS } from "@/lib/admin-queries";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const DraftKind = z.enum([
  "photo",
  "video",
  "reel",
  "news",
  "recap",
  "course_spotlight",
  "ace",
  "tip",
  "story",
]);
const CreatorStatus = z.enum(["pending", "approved", "rejected", "revoked"]);

// ============================================================================
// Creator profile / application
// ============================================================================

export const getMyCreatorProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("creator_profiles")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { profile: data ?? null };
  });

const ApplySchema = z.object({
  headline: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  pitch: z.string().trim().max(2000).optional(),
  niche_tags: z.array(z.string().trim().max(40)).max(20).optional(),
  content_pillars: z.array(z.string().trim().max(60)).max(10).optional(),
  external_links: z
    .array(z.object({ label: z.string().max(60), url: z.string().url() }))
    .max(15)
    .optional(),
  monthly_reach: z.number().int().nonnegative().max(100_000_000).optional(),
});

export const applyForCreator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ApplySchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      tier: "applicant" as const,
      status: "pending" as const,
      applied_at: new Date().toISOString(),
      headline: data.headline ?? null,
      bio: data.bio ?? null,
      pitch: data.pitch ?? null,
      niche_tags: data.niche_tags ?? [],
      content_pillars: data.content_pillars ?? [],
      external_links: data.external_links ?? [],
      monthly_reach: data.monthly_reach ?? null,
    };
    const { error } = await supabase
      .from("creator_profiles")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const UpdateProfileSchema = ApplySchema.partial();

export const updateCreatorProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => UpdateProfileSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    for (const k of Object.keys(data) as (keyof typeof data)[]) {
      const v = (data as any)[k];
      if (v !== undefined) patch[k as string] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase
      .from("creator_profiles")
      .update(patch as any)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });


/**
 * Creator review is open to both admin tiers. `super_admin` is the tier the
 * platform owner holds, so checking only `admin` hid every application.
 */
async function assertCreatorReviewer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const [admin, superAdmin] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) throw new Error("Admin only");
}

// ============================================================================
// Admin: review applications
// ============================================================================

export const listCreatorApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ status: CreatorStatus.optional() }).parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCreatorReviewer(supabase, userId);

    let q = supabase
      .from("creator_profiles")
      .select("*")
      .order("applied_at", { ascending: false })
      .limit(ADMIN_LIMITS.creatorApplications);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r) => r.user_id);
    const profiles: Record<string, any> = {};
    if (ids.length) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", ids);
      for (const row of p ?? []) profiles[row.id] = row;
    }
    return { rows: rows ?? [], profiles };
  });

const ReviewSchema = z.object({
  user_id: z.string().uuid(),
  status: CreatorStatus,
  tier: z.enum(["creator", "ambassador", "partner", "applicant"]).optional(),
  notes: z.string().max(1000).optional(),
});

export const reviewCreatorApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ReviewSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCreatorReviewer(supabase, userId);

    const patch: Record<string, unknown> = {
      status: data.status,
      reviewer_notes: data.notes ?? null,
      approved_by: userId,
    };
    if (data.status === "approved") {
      patch.tier = data.tier ?? "creator";
      patch.approved_at = new Date().toISOString();
      patch.is_verified = true;
    } else if (data.status === "revoked") {
      patch.tier = "none";
      patch.is_verified = false;
    }
    const { error } = await supabase
      .from("creator_profiles")
      .update(patch as any)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    // notify creator
    await supabase.rpc("notify_user", {
      _user_id: data.user_id,
      _type: "event",
      _data: {
        title:
          data.status === "approved"
            ? "You've been approved as a DGD creator!"
            : data.status === "rejected"
              ? "Your creator application needs another look"
              : "Creator status updated",
        body: data.notes ?? null,
        link: "/studio",
      },
    });
    return { ok: true };
  });

// ============================================================================
// Drafts
// ============================================================================

const DraftSchema = z.object({
  id: z.string().uuid().optional(),
  kind: DraftKind.default("photo"),
  title: z.string().trim().max(200).optional(),
  body: z.string().trim().max(4000).optional(),
  media: z.array(z.any()).max(20).optional(),
  tags: z.array(z.string().trim().max(40)).max(20).optional(),
  mentions: z.array(z.string().trim().max(60)).max(20).optional(),
  course_id: z.string().uuid().optional().nullable(),
  event_id: z.string().uuid().optional().nullable(),
  round_id: z.string().uuid().optional().nullable(),
  club_id: z.string().uuid().optional().nullable(),
  series_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  cross_post_targets: z.array(z.string()).max(10).optional(),
});

/**
 * Creator Studio publishing tools are approved-creator only. Mirrors the
 * `public.is_approved_creator()` check the database applies to content inserts,
 * so a direct RPC call gets the same answer as the UI.
 */
async function assertApprovedCreator(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_approved_creator", { _user: userId });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Creator Studio access is required. Apply as a creator first.");
  }
}

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => DraftSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertApprovedCreator(supabase, userId);
    const row = {
      user_id: userId,
      kind: data.kind,
      status: "draft" as const,
      title: data.title ?? null,
      body: data.body ?? null,
      media: (data.media ?? []) as any,
      tags: data.tags ?? [],
      mentions: data.mentions ?? [],
      course_id: data.course_id ?? null,
      event_id: data.event_id ?? null,
      round_id: data.round_id ?? null,
      club_id: data.club_id ?? null,
      series_id: data.series_id ?? null,
      scheduled_at: data.scheduled_at ?? null,
      cross_post_targets: (data.cross_post_targets ?? []) as any,
    };
    if (data.id) {
      const { error, data: updated } = await supabase
        .from("content_drafts")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { id: updated?.id ?? data.id };
    }
    const { data: inserted, error } = await supabase
      .from("content_drafts")
      .insert(row)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { id: inserted!.id };
  });

const ScheduleSchema = z.object({
  id: z.string().uuid(),
  scheduled_at: z.string(),
});

export const scheduleDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ScheduleSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertApprovedCreator(context.supabase, context.userId);
    const dt = new Date(data.scheduled_at);
    if (Number.isNaN(dt.getTime())) throw new Error("Invalid schedule time");
    if (dt.getTime() < Date.now() - 60_000) throw new Error("Schedule must be in the future");
    const { error } = await context.supabase
      .from("content_drafts")
      .update({ status: "scheduled", scheduled_at: dt.toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function draftKindToPostType(
  kind: string,
): "photo" | "text" | "video" | "ace" | "checkin" | "roundcard" | "tournament" {
  switch (kind) {
    case "photo":
      return "photo";
    case "video":
    case "reel":
      return "video";
    case "ace":
      return "ace";
    case "recap":
      return "roundcard";
    default:
      return "text";
  }
}

export const publishDraftNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertApprovedCreator(supabase, userId);
    const { data: draft, error: dErr } = await supabase
      .from("content_drafts")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!draft) throw new Error("Draft not found");
    if (draft.status === "published") return { ok: true, post_id: draft.published_post_id };

    const body = draft.body ?? draft.title ?? "";
    const { data: post, error: pErr } = await supabase
      .from("posts")
      .insert({
        author_id: userId,
        type: draftKindToPostType(draft.kind) as any,
        body: body || null,
        media: draft.media as any,
        club_id: draft.club_id,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    const { error: uErr } = await supabase
      .from("content_drafts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_post_id: post.id,
        publish_error: null,
      })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    return { ok: true, post_id: post.id };
  });

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        status: z
          .enum(["draft", "scheduled", "published", "archived", "failed", "all"])
          .default("all"),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("content_drafts")
      .select("*")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

export const archiveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_drafts")
      .update({ status: "archived" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_drafts")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Series
// ============================================================================

const SeriesSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  cover_url: z.string().url().optional().nullable(),
  cadence: z.string().max(60).optional(),
  color: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
});

export const saveSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SeriesSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertApprovedCreator(supabase, userId);
    const row = {
      user_id: userId,
      name: data.name,
      description: data.description ?? null,
      cover_url: data.cover_url ?? null,
      cadence: data.cadence ?? null,
      color: data.color ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await supabase
        .from("content_series")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("content_series")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const listSeries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_series")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const deleteSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_series")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Ideas
// ============================================================================

const IdeaSchema = z.object({
  id: z.string().uuid().optional(),
  prompt: z.string().trim().min(1).max(280),
  notes: z.string().max(1000).optional(),
  source: z.string().max(120).optional(),
  suggested_kind: DraftKind.optional(),
});

export const saveIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => IdeaSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await assertApprovedCreator(context.supabase, context.userId);
    const row = {
      user_id: context.userId,
      prompt: data.prompt,
      notes: data.notes ?? null,
      source: data.source ?? null,
      suggested_kind: data.suggested_kind ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("content_ideas")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await context.supabase
      .from("content_ideas")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const listIdeas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_ideas")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const markIdeaUsed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), used: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_ideas")
      .update({ is_used: data.used, used_at: data.used ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIdea = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("content_ideas")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Ambassadorships
// ============================================================================

const AmbassadorSchema = z.object({
  entity_kind: z.enum(["course", "club"]),
  entity_id: z.string().uuid(),
  entity_name: z.string().max(200).optional(),
  role_title: z.string().max(120).optional(),
  notes: z.string().max(1000).optional(),
});

export const requestAmbassadorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AmbassadorSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const row = {
      user_id: context.userId,
      entity_kind: data.entity_kind,
      entity_id: data.entity_id,
      entity_name: data.entity_name ?? null,
      role_title: data.role_title ?? null,
      notes: data.notes ?? null,
      is_active: false, // requires admin approval
    };
    const { error } = await context.supabase
      .from("content_ambassadors")
      .upsert(row, { onConflict: "user_id,entity_kind,entity_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyAmbassadorships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_ambassadors")
      // 'notes' is internal reviewer context — never returned to members.
      .select(
        "id, user_id, entity_kind, entity_id, entity_name, role_title, is_active, approved_by, since, ended_at, created_at, updated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

export const approveAmbassadorship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ id: z.string().uuid(), approve: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    await assertCreatorReviewer(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("content_ambassadors")
      .update({
        is_active: data.approve,
        approved_by: context.userId,
        ended_at: data.approve ? null : new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================================
// Analytics
// ============================================================================

const AnalyticsRangeSchema = z
  .object({
    days: z.number().int().min(1).max(365).default(30),
  })
  .default({ days: 30 });

export const getCreatorAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AnalyticsRangeSchema.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();

    const { data: posts } = await supabase
      .from("posts")
      .select("id, type, body, like_count, comment_count, created_at")
      .eq("author_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const postRows = posts ?? [];
    const postIds = postRows.map((p) => p.id);

    const impressionsByPost = new Map<string, number>();
    let totalImpressions = 0;
    if (postIds.length) {
      const { data: imps } = await supabase
        .from("post_impressions")
        .select("post_id, impressions")
        .in("post_id", postIds);
      for (const r of imps ?? []) {
        impressionsByPost.set(
          r.post_id,
          (impressionsByPost.get(r.post_id) ?? 0) + (r.impressions ?? 0),
        );
        totalImpressions += r.impressions ?? 0;
      }
    }

    // Time series by day
    const dailyMap = new Map<
      string,
      { posts: number; likes: number; comments: number; impressions: number }
    >();
    const dayKey = (iso: string) => iso.slice(0, 10);
    for (let i = 0; i < data.days; i++) {
      const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
      dailyMap.set(d, { posts: 0, likes: 0, comments: 0, impressions: 0 });
    }
    for (const p of postRows) {
      const k = dayKey(p.created_at);
      const bucket = dailyMap.get(k);
      if (!bucket) continue;
      bucket.posts += 1;
      bucket.likes += p.like_count ?? 0;
      bucket.comments += p.comment_count ?? 0;
    }
    if (postIds.length) {
      const { data: dimp } = await supabase
        .from("post_impressions")
        .select("day, impressions")
        .in("post_id", postIds);
      for (const r of dimp ?? []) {
        const key = r.day as unknown as string;
        const b = dailyMap.get(key);
        if (b) b.impressions += r.impressions ?? 0;
      }
    }

    const daily = Array.from(dailyMap.entries())
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day));

    const totals = {
      posts: postRows.length,
      likes: postRows.reduce((s, p) => s + (p.like_count ?? 0), 0),
      comments: postRows.reduce((s, p) => s + (p.comment_count ?? 0), 0),
      impressions: totalImpressions,
    };

    const topPosts = [...postRows]
      .map((p) => ({
        ...p,
        impressions: impressionsByPost.get(p.id) ?? 0,
        engagement: (p.like_count ?? 0) + (p.comment_count ?? 0),
      }))
      .sort((a, b) => b.engagement + b.impressions * 0.1 - (a.engagement + a.impressions * 0.1))
      .slice(0, 10);

    const { count: followers } = await supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", userId);

    // best hour heuristic — group posts by hour of day
    const hourly = Array.from({ length: 24 }, () => ({ posts: 0, engagement: 0 }));
    for (const p of postRows) {
      const h = new Date(p.created_at).getHours();
      hourly[h].posts += 1;
      hourly[h].engagement += (p.like_count ?? 0) + (p.comment_count ?? 0);
    }
    const bestHour = hourly.reduce(
      (best, cur, i) =>
        cur.engagement > best.engagement ? { hour: i, engagement: cur.engagement } : best,
      { hour: -1, engagement: 0 },
    );

    return {
      totals,
      followers: followers ?? 0,
      daily,
      hourly,
      bestHour,
      topPosts,
    };
  });

export const recordPostImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ post_id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    // Only the post author can INCR; treat impressions as author-owned counters.
    // Use plain upsert-like path: fetch → update or insert.
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("post_impressions")
      .select("post_id, impressions")
      .eq("post_id", data.post_id)
      .eq("day", today)
      .maybeSingle();
    if (existing) {
      await supabase
        .from("post_impressions")
        .update({ impressions: (existing.impressions ?? 0) + 1 })
        .eq("post_id", data.post_id)
        .eq("day", today);
    } else {
      await supabase
        .from("post_impressions")
        .insert({ post_id: data.post_id, day: today, impressions: 1 });
    }
    return { ok: true };
  });
