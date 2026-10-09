/**
 * Shareable storage for the account-free Event Director Kit.
 *
 * These endpoints are deliberately open: the tool is meant to be used by a club
 * volunteer with no DG Dashboard account. Access control is the link itself —
 * a plan is reachable only with its share code, and writes additionally require
 * the private edit code that the creator keeps. Nothing here reads or writes
 * any other table, and no personal account data is exposed.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_PLAN_BYTES = 200_000;

const shareInput = z.object({ shareToken: z.string().min(8).max(64) });

const saveInput = z.object({
  shareToken: z.string().min(8).max(64),
  editToken: z.string().min(8).max(64),
  title: z.string().min(1).max(120),
  /** The plan document, JSON-encoded. */
  plan: z.string().min(2).max(200_000),
});

const createInput = z.object({
  title: z.string().min(1).max(120),
  plan: z.string().min(2).max(200_000),
});

export type OpenPlanRecord = {
  shareToken: string;
  title: string;
  /** The plan document, JSON-encoded. */
  plan: string;
  updatedAt: string;
};

function token(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 22);
}

function decodePlan(raw: string): Record<string, unknown> {
  if (raw.length > MAX_PLAN_BYTES) {
    throw new Error("This plan is too large to share. Trim the player list or notes and try again.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That plan couldn't be read.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("That plan couldn't be read.");
  }
  return parsed as Record<string, unknown>;
}

/** Creates a shareable copy of a plan and returns both codes. */
export const createOpenPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => createInput.parse(data))
  .handler(async ({ data }) => {
    const plan = decodePlan(data.plan);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const shareToken = token();
    const editToken = token();
    const { error } = await supabaseAdmin.from("open_event_plans").insert({
      share_token: shareToken,
      edit_token: editToken,
      title: data.title,
      plan: plan as never,
    });
    if (error) throw new Error("Couldn't create the share link. Please try again.");
    return { shareToken, editToken };
  });

/** Reads a plan by its share code. Anyone with the link can view it. */
export const loadOpenPlan = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => shareInput.parse(data))
  .handler(async ({ data }): Promise<OpenPlanRecord | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("open_event_plans")
      .select("share_token, title, plan, updated_at")
      .eq("share_token", data.shareToken)
      .maybeSingle();
    if (error) throw new Error("Couldn't open that plan link.");
    if (!row) return null;
    return {
      shareToken: row.share_token,
      title: row.title,
      plan: JSON.stringify(row.plan ?? {}),
      updatedAt: row.updated_at,
    };
  });

/** Saves a plan. Requires the private edit code held by whoever created it. */
export const saveOpenPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => saveInput.parse(data))
  .handler(async ({ data }) => {
    const plan = decodePlan(data.plan);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("open_event_plans")
      .update({ title: data.title, plan: plan as never })
      .eq("share_token", data.shareToken)
      .eq("edit_token", data.editToken)
      .select("updated_at")
      .maybeSingle();
    if (error) throw new Error("Couldn't save this plan. Please try again.");
    if (!row) throw new Error("This link is view-only. Ask whoever created it for the editing link.");
    return { updatedAt: row.updated_at };
  });
