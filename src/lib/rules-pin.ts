import type { SupabaseClient } from "@supabase/supabase-js";

export const GOVERNING_RULESETS = ["dgd", "pdga", "custom"] as const;
export type GoverningRuleset = (typeof GOVERNING_RULESETS)[number];

/**
 * Applies a governing-ruleset change to an event patch: keeps pdga_sanctioned in step and,
 * for DGD events, pins the Rules of Play version in force. An existing pin never changes.
 */
export async function applyGoverningRuleset(
  supabase: SupabaseClient<any>,
  patch: Record<string, unknown>,
  existingPin: string | null,
): Promise<void> {
  const ruleset = patch.governing_ruleset as GoverningRuleset | undefined;
  if (!ruleset) return;
  patch.pdga_sanctioned = ruleset === "pdga";
  if (ruleset !== "dgd" || existingPin) return;
  const { data: v } = await supabase
    .from("rule_document_versions")
    .select("id, rule_documents!inner(code)")
    .eq("rule_documents.code", "rules_of_play")
    .eq("status", "published")
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (v) patch.rules_version_id = (v as { id: string }).id;
}
