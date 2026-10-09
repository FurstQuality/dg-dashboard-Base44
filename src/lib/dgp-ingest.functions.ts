/**
 * Admin-only ingest controls for the Disc Golf Professor knowledge base.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BatchResult } from "@/lib/dgp-ingest.server";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const [admin, superAdmin] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "super_admin" }),
  ]);
  if (!admin.data && !superAdmin.data) {
    throw new Error("Only admins can run the disc intelligence ingest.");
  }
}

const BatchInput = z.object({
  offset: z.number().int().min(0).max(100000).default(0),
  limit: z.number().int().min(1).max(32).default(16),
});

/** Fetch and store one slice of the dataset (kept small to stay polite). */
export const ingestDgpBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => BatchInput.parse(raw ?? {}))
  .handler(async ({ data, context }): Promise<BatchResult> => {
    await assertAdmin(context);
    const { ingestDgpPages } = await import("@/lib/dgp-ingest.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await ingestDgpPages(supabaseAdmin, data.offset, data.limit);
  });

export type DgpIngestStatus = {
  total_pages: number;
  /** Highest page reached so far, derived from stored run history. */
  pages_read: number;
  /** Where the next batch should start (0-based). */
  next_offset: number;
  skill_groups: number;
  profiles: number;
  answers: number;
  disc_answers: number;
  matched_molds: number;
  /** Discs in our library that came from the survey. */
  survey_molds: number;
  total_submissions: number;
  last_run_at: string | null;
  recent_runs: {
    id: string;
    started_at: string;
    pages_fetched: number;
    profiles_written: number;
    answers_written: number;
    failures: number;
    notes: string | null;
  }[];
};

/** Coverage snapshot for the admin console. */
export const getDgpIngestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DgpIngestStatus> => {
    await assertAdmin(context);
    const { dgpTotalPages } = await import("@/lib/dgp-ingest.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const admin = supabaseAdmin as any;
    const count = async (table: string, apply?: (q: any) => any) => {
      let q = admin.from(table).select("*", { count: "exact", head: true });
      if (apply) q = apply(q);
      const { count: c } = await q;
      return c ?? 0;
    };

    const [groups, profiles, answers, discAnswers, matched, surveyMolds] = await Promise.all([
      count("dgp_skill_groups"),
      count("dgp_shot_profiles"),
      count("dgp_shot_answers"),
      count("dgp_shot_answers", (q) => q.eq("answer_kind", "disc")),
      count("dgp_shot_answers", (q) => q.eq("answer_kind", "disc").not("mold_id", "is", null)),
      count("disc_molds", (q) => q.eq("source", "dgp_survey")),
    ]);

    const { data: subs } = await supabaseAdmin.from("dgp_shot_profiles").select("submissions");
    const total_submissions = ((subs ?? []) as { submissions: number }[]).reduce(
      (sum, r) => sum + (r.submissions ?? 0),
      0,
    );

    const { data: runs } = await supabaseAdmin
      .from("dgp_ingest_runs")
      .select("id, started_at, pages_fetched, profiles_written, answers_written, failures, notes")
      .order("started_at", { ascending: false })
      .limit(10);

    // Resume point lives in run history, not the browser, so progress survives
    // a new device, cleared storage, or a wrapped-around batch.
    const { data: allRuns } = await supabaseAdmin
      .from("dgp_ingest_runs")
      .select("pages_fetched, notes")
      .order("started_at", { ascending: false })
      .limit(2000);

    const total_pages = dgpTotalPages();
    let pages_read = 0;
    for (const run of (allRuns ?? []) as { pages_fetched: number | null; notes: string | null }[]) {
      const start = Number(run.notes?.match(/offset\s+(\d+)/)?.[1]);
      if (!Number.isFinite(start)) continue;
      const reached = start + (run.pages_fetched ?? 0);
      if (reached > pages_read) pages_read = reached;
    }
    pages_read = Math.min(pages_read, total_pages);

    return {
      total_pages,
      pages_read,
      next_offset: pages_read >= total_pages ? 0 : pages_read,
      skill_groups: groups,
      profiles,
      answers,
      disc_answers: discAnswers,
      matched_molds: matched,
      survey_molds: surveyMolds,
      total_submissions,
      last_run_at: (runs?.[0]?.started_at as string) ?? null,
      recent_runs: (runs ?? []) as DgpIngestStatus["recent_runs"],
    };
  });

/**
 * Survey disc names that are still not in our library, each with the reason we
 * could not add it. Everything nameable is added automatically, so this list is
 * an exceptions report rather than a to-do list.
 */
export const getDgpUnmatchedMolds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<
      { brand: string | null; mold: string | null; submissions: number; reason: string }[]
    > => {
      await assertAdmin(context);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { cleanMoldName } = await import("@/lib/disc-mold-normalize");
      const { data } = await supabaseAdmin
        .from("dgp_shot_answers")
        .select("brand, mold, submissions")
        .eq("answer_kind", "disc")
        .is("mold_id", null)
        .limit(2000);
      const rolled = new Map<
        string,
        { brand: string | null; mold: string | null; submissions: number; reason: string }
      >();
      for (const row of (data ?? []) as {
        brand: string | null;
        mold: string | null;
        submissions: number;
      }[]) {
        const key = `${row.brand ?? ""}|${row.mold ?? ""}`;
        const prev = rolled.get(key);
        if (prev) {
          prev.submissions += row.submissions ?? 0;
          continue;
        }
        rolled.set(key, {
          brand: row.brand,
          mold: row.mold,
          submissions: row.submissions ?? 0,
          reason: cleanMoldName(row.mold).skipReason ?? "Not added yet — run “Add & match discs”",
        });
      }
      return [...rolled.values()].sort((a, b) => b.submissions - a.submissions).slice(0, 100);
    },
  );

/** Re-match survey disc names against our disc library. */
export const relinkDgpDiscs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      scanned: number;
      linked: number;
      created: number;
      skipped: number;
      still_unmatched: number;
    }> => {
      await assertAdmin(context);
      const { relinkDgpMolds } = await import("@/lib/dgp-ingest.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      return await relinkDgpMolds(supabaseAdmin);
    },
  );
