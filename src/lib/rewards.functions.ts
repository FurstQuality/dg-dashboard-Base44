import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { MONTH_COST } from "@/lib/rewards";
import type { ContributionKind, ContributionStatus, RedemptionStatus } from "@/lib/rewards";

export type ContributionRow = {
  id: string;
  user_id: string;
  kind: ContributionKind;
  course_id: string | null;
  quantity: number;
  points: number;
  summary: string;
  details: string | null;
  evidence_url: string | null;
  status: ContributionStatus;
  approve_count: number;
  reject_count: number;
  review_note: string | null;
  created_at: string;
  course_name?: string | null;
  player_name?: string | null;
  player_username?: string | null;
};

export type RedemptionRow = {
  id: string;
  user_id: string;
  points_spent: number;
  months_requested: number;
  tier_key: string;
  status: RedemptionStatus;
  note: string | null;
  review_note: string | null;
  granted_until: string | null;
  created_at: string;
  player_name?: string | null;
};

const CONTRIBUTION_COLUMNS =
  "id, user_id, kind, course_id, quantity, points, summary, details, evidence_url, status, approve_count, reject_count, review_note, created_at";

/** Points, badges progress, submissions and reward requests for the caller. */
export const getRewardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [balanceRes, mineRes, redemptionsRes, leaderRes] = await Promise.all([
      supabase.rpc("contribution_balance", { _user_id: userId }),
      supabase
        .from("contributions")
        .select(CONTRIBUTION_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("reward_redemptions")
        .select(
          "id, user_id, points_spent, months_requested, tier_key, status, note, review_note, granted_until, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.rpc("contribution_leaderboard", { _limit: 25 }),
    ]);

    if (mineRes.error) throw new Error(mineRes.error.message);

    const mine = (mineRes.data ?? []) as ContributionRow[];
    const verifiedPoints = mine
      .filter((c) => c.status === "verified")
      .reduce((sum, c) => sum + c.points, 0);

    return {
      balance: Number(balanceRes.data ?? 0),
      verifiedPoints,
      pendingCount: mine.filter((c) => c.status === "pending").length,
      contributions: mine,
      redemptions: (redemptionsRes.data ?? []) as RedemptionRow[],
      leaderboard: (leaderRes.data ?? []) as {
        user_id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        points: number;
        verified_count: number;
        courses_built: number;
        holes_mapped: number;
      }[],
    };
  });

/** File work for peer review. */
export const submitContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        kind: z.string().min(1),
        course_id: z.string().uuid().nullable().optional(),
        quantity: z.number().int().min(1).max(36).default(1),
        summary: z.string().min(4).max(200),
        details: z.string().max(2000).nullable().optional(),
        evidence_url: z.string().url().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.kind === "condition_report_verified" || data.kind === "review_credit") {
      throw new Error("The app credits that one for you — no need to file it.");
    }
    const { error } = await supabase.from("contributions").insert({
      user_id: userId,
      kind: data.kind as ContributionKind,
      course_id: data.course_id ?? null,
      quantity: data.quantity,
      summary: data.summary.trim(),
      details: data.details?.trim() || null,
      evidence_url: data.evidence_url?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Work from other players waiting on two sign-offs. */
export const getReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: pending, error }, { data: myVotes }] = await Promise.all([
      supabase
        .from("contributions")
        .select(CONTRIBUTION_COLUMNS)
        .eq("status", "pending")
        .neq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(60),
      supabase.from("contribution_verifications").select("contribution_id").eq("verifier_id", userId),
    ]);
    if (error) throw new Error(error.message);

    const voted = new Set((myVotes ?? []).map((v) => v.contribution_id as string));
    const rows = ((pending ?? []) as ContributionRow[]).filter((r) => !voted.has(r.id));

    const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as string[];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const [courses, profiles] = await Promise.all([
      courseIds.length
        ? supabase.from("courses").select("id, name, city, state").in("id", courseIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      userIds.length
        ? supabase.from("profiles").select("id, display_name, username").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
    ]);
    const courseMap = new Map(
      ((courses.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]),
    );
    const profileMap = new Map(
      ((profiles.data ?? []) as { id: string; display_name?: string; username?: string }[]).map(
        (p) => [p.id, p],
      ),
    );

    return {
      queue: rows.map((r) => ({
        ...r,
        course_name: r.course_id ? (courseMap.get(r.course_id) ?? null) : null,
        player_name: profileMap.get(r.user_id)?.display_name ?? null,
        player_username: profileMap.get(r.user_id)?.username ?? null,
      })),
      reviewedCount: voted.size,
    };
  });

/** Approve or decline another player's contribution. */
export const verifyContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        contribution_id: z.string().uuid(),
        vote: z.enum(["approve", "reject"]),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("contribution_verifications").insert({
      contribution_id: data.contribution_id,
      verifier_id: userId,
      vote: data.vote,
      note: data.note?.trim() || null,
    });
    if (error) {
      if (error.code === "23505" || error.code === "23514" || error.message.includes("duplicate")) {
        throw new Error("You already reviewed this one.");
      }
      throw new Error(error.message);
    }
    return { ok: true as const };
  });

/** Ask to trade points for free months. An admin reviews it before it lands. */
export const requestRedemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        tier_key: z.enum(["pro", "elite"]),
        months: z.number().int().min(1).max(12),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const cost = MONTH_COST[data.tier_key] * data.months;
    const { data: balance, error: balanceError } = await supabase.rpc("contribution_balance", {
      _user_id: userId,
    });
    if (balanceError) throw new Error(balanceError.message);
    if (Number(balance ?? 0) < cost) {
      throw new Error("You don't have enough points for that yet.");
    }
    const { error } = await supabase.from("reward_redemptions").insert({
      user_id: userId,
      points_spent: cost,
      months_requested: data.months,
      tier_key: data.tier_key,
      note: data.note?.trim() || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

type AuthedClient = SupabaseClient<Database>;

async function assertAdmin(supabase: AuthedClient, userId: string) {
  const [{ data: admin }, { data: superAdmin }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (!admin && !superAdmin) throw new Error("Only admins can review rewards.");
}

/** Everything an admin needs: pending reward requests and flagged contributions. */
export const getRewardAdminQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [redemptions, contributions] = await Promise.all([
      supabase
        .from("reward_redemptions")
        .select(
          "id, user_id, points_spent, months_requested, tier_key, status, note, review_note, granted_until, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("contributions")
        .select(CONTRIBUTION_COLUMNS)
        .in("status", ["pending", "verified"])
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    const rows = (redemptions.data ?? []) as RedemptionRow[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, username").in("id", ids)
      : { data: [] as { id: string; display_name?: string }[] };
    const nameMap = new Map(
      ((profiles ?? []) as { id: string; display_name?: string }[]).map((p) => [
        p.id,
        p.display_name ?? null,
      ]),
    );

    return {
      redemptions: rows.map((r) => ({ ...r, player_name: nameMap.get(r.user_id) ?? null })),
      contributions: (contributions.data ?? []) as ContributionRow[],
    };
  });

/** Approve a reward request (granting free months) or turn it down. */
export const decideRedemption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["grant", "reject"]),
        review_note: z.string().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: row, error } = await supabase
      .from("reward_redemptions")
      .select("id, user_id, months_requested, tier_key, status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That reward request is gone.");
    if (row.status !== "pending") throw new Error("That request was already decided.");

    if (data.decision === "reject") {
      const { error: updateError } = await supabase
        .from("reward_redemptions")
        .update({
          status: "rejected",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          review_note: data.review_note?.trim() || null,
        })
        .eq("id", data.id);
      if (updateError) throw new Error(updateError.message);
      return { ok: true as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("entitlement_overrides")
      .select("id, expires_at")
      .eq("user_id", row.user_id)
      .eq("tier_key", row.tier_key)
      .maybeSingle();

    const base =
      existing?.expires_at && new Date(existing.expires_at) > new Date()
        ? new Date(existing.expires_at)
        : new Date();
    const until = new Date(base);
    until.setMonth(until.getMonth() + row.months_requested);

    if (existing) {
      const { error: overrideError } = await supabaseAdmin
        .from("entitlement_overrides")
        .update({ expires_at: until.toISOString(), granted_by: userId, reason: "Contributor rewards" })
        .eq("id", existing.id);
      if (overrideError) throw new Error(overrideError.message);
    } else {
      const { error: overrideError } = await supabaseAdmin.from("entitlement_overrides").insert({
        user_id: row.user_id,
        tier_key: row.tier_key,
        expires_at: until.toISOString(),
        granted_by: userId,
        reason: "Contributor rewards",
      });
      if (overrideError) throw new Error(overrideError.message);
    }

    const { error: updateError } = await supabase
      .from("reward_redemptions")
      .update({
        status: "granted",
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note?.trim() || null,
        granted_until: until.toISOString(),
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    return { ok: true as const, granted_until: until.toISOString() };
  });

/** Admin override on a contribution: force verified or rejected. */
export const decideContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["verified", "rejected"]),
        review_note: z.string().max(500).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("contributions")
      .update({
        status: data.status,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.review_note?.trim() || null,
        verified_at: data.status === "verified" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
