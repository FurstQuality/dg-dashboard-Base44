import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Public DGD Rules & Standards reader. Reads only non-draft versions (RLS enforces it). */

export type RuleStatus = "draft" | "proposed" | "under_review" | "approved" | "published" | "superseded" | "retired";

export interface RuleDocumentCard {
  code: string;
  title: string;
  summary: string;
  current: { id: string; version_label: string; status: RuleStatus; effective_at: string | null } | null;
}

export interface RuleEntry {
  number: string;
  parent_number: string | null;
  kind: "section" | "rule" | "definition" | "note";
  title: string;
  body: string;
  is_protected: boolean;
}

export interface RuleDocumentDetail extends RuleDocumentCard {
  versions: { id: string; version_label: string; status: RuleStatus; published_at: string | null; effective_at: string | null; changelog: string | null }[];
  entries: RuleEntry[];
}

async function publicClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Prefer the published version in force; otherwise the newest public draft.
const RANK: Record<RuleStatus, number> = { published: 0, approved: 1, under_review: 2, proposed: 3, superseded: 4, retired: 5, draft: 6 };

function pickCurrent<T extends { status: RuleStatus; created_at: string }>(vs: T[]): T | null {
  return [...vs].sort((a, b) => RANK[a.status] - RANK[b.status] || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export const listRuleDocuments = createServerFn({ method: "GET" }).handler(async (): Promise<RuleDocumentCard[]> => {
  const sb = await publicClient();
  const { data, error } = await sb
    .from("rule_documents")
    .select("code,title,summary,sort,rule_document_versions(id,version_label,status,effective_at,created_at)")
    .order("sort");
  if (error) throw new Error("Couldn't load the rulebook right now.");
  return (data ?? []).map((d) => {
    const cur = pickCurrent((d.rule_document_versions ?? []) as { id: string; version_label: string; status: RuleStatus; effective_at: string | null; created_at: string }[]);
    return { code: d.code, title: d.title, summary: d.summary, current: cur ? { id: cur.id, version_label: cur.version_label, status: cur.status, effective_at: cur.effective_at } : null };
  });
});

export const getRuleDocument = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ code: z.string().min(1).max(60), version: z.string().max(40).optional() }).parse(d))
  .handler(async ({ data }): Promise<RuleDocumentDetail | null> => {
    const sb = await publicClient();
    const { data: doc } = await sb
      .from("rule_documents")
      .select("id,code,title,summary,rule_document_versions(id,version_label,status,published_at,effective_at,changelog,created_at)")
      .eq("code", data.code)
      .maybeSingle();
    if (!doc) return null;
    const versions = (doc.rule_document_versions ?? []) as (RuleDocumentDetail["versions"][number] & { created_at: string })[];
    const chosen = (data.version && versions.find((v) => v.version_label === data.version)) || pickCurrent(versions);
    let entries: RuleEntry[] = [];
    if (chosen) {
      const { data: rows } = await sb
        .from("rule_entries")
        .select("number,parent_number,kind,title,body,is_protected")
        .eq("version_id", chosen.id)
        .order("sort");
      entries = (rows ?? []) as RuleEntry[];
    }
    return {
      code: doc.code,
      title: doc.title,
      summary: doc.summary,
      current: chosen ? { id: chosen.id, version_label: chosen.version_label, status: chosen.status, effective_at: chosen.effective_at } : null,
      versions: versions.map(({ id, version_label, status, published_at, effective_at, changelog }) => ({ id, version_label, status, published_at, effective_at, changelog })),
      entries,
    };
  });

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  draft: "Draft",
  proposed: "Draft for review — not in effect",
  under_review: "Under review — not in effect",
  approved: "Approved — not yet in effect",
  published: "In effect",
  superseded: "Replaced by a newer version",
  retired: "Retired",
};
