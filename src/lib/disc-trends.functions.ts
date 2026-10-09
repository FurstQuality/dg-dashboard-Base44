import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DiscTrendRow = {
  id: string;
  week_of: string;
  rank: number;
  name: string;
  brand: string | null;
  plastic: string | null;
  image_url: string | null;
  product_url: string;
  rating: number | null;
  review_count: number | null;
  speed: number | null;
  glide: number | null;
  turn: number | null;
  fade: number | null;
  description: string | null;
  mold_id: string | null;
  fetched_at: string;
};

const COLUMNS =
  "id,week_of,rank,name,brand,plastic,image_url,product_url,rating,review_count,speed,glide,turn,fade,description,mold_id,fetched_at";

/** Latest weekly best-seller rankings, most recent week first. */
export const listDiscTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{ weekOf: string | null; rows: DiscTrendRow[]; fetchedAt: string | null }> => {
      const { data: latest } = await context.supabase
        .from("disc_market_trends")
        .select("week_of")
        .order("week_of", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latest?.week_of) return { weekOf: null, rows: [], fetchedAt: null };

      const { data } = await context.supabase
        .from("disc_market_trends")
        .select(COLUMNS)
        .eq("week_of", latest.week_of)
        .order("rank", { ascending: true });

      const rows = (data as unknown as DiscTrendRow[]) ?? [];
      return { weekOf: latest.week_of, rows, fetchedAt: rows[0]?.fetched_at ?? null };
    },
  );

/**
 * Pulls this week's best-seller rankings, matches them to molds already in the
 * disc library, and stores them. Throttled so repeated clicks don't re-scrape.
 */
export const refreshDiscTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ force: z.boolean().optional() }).parse(raw ?? {}))
  .handler(
    async ({ data, context }): Promise<{ imported: number; weekOf: string; skipped: boolean }> => {
      const { fetchDiscTrends, weekStart } = await import("@/lib/disc-trends.server");
      const week = weekStart();

      const { data: existing } = await context.supabase
        .from("disc_market_trends")
        .select("fetched_at")
        .eq("week_of", week)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const fresh =
        existing?.fetched_at &&
        Date.now() - new Date(existing.fetched_at).getTime() < 6 * 60 * 60 * 1000;
      if (fresh && !data.force) {
        const { count } = await context.supabase
          .from("disc_market_trends")
          .select("id", { count: "exact", head: true })
          .eq("week_of", week);
        return { imported: count ?? 0, weekOf: week, skipped: true };
      }

      const records = await fetchDiscTrends();

      const { data: molds } = await context.supabase
        .from("disc_molds")
        .select("id,name,manufacturer_id,disc_manufacturers(name)")
        .limit(2000);

      type MoldRow = { id: string; name: string; disc_manufacturers: { name: string } | null };
      const moldList = (molds as unknown as MoldRow[]) ?? [];
      const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");

      const rows = records.map((record) => {
        const needle = normalize(record.name);
        const mold = moldList.find((m) => {
          const moldName = normalize(m.name);
          return moldName.length > 2 && needle.includes(moldName);
        });
        return {
          source: "infinite_discs",
          week_of: week,
          rank: record.rank,
          name: record.name,
          brand: mold?.disc_manufacturers?.name ?? null,
          plastic: record.plastic,
          image_url: record.image_url,
          product_url: record.product_url,
          rating: record.rating,
          review_count: record.review_count,
          speed: record.speed,
          glide: record.glide,
          turn: record.turn,
          fade: record.fade,
          description: record.description,
          mold_id: mold?.id ?? null,
          fetched_at: new Date().toISOString(),
        };
      });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("disc_market_trends")
        .upsert(rows, { onConflict: "source,week_of,rank" });
      if (error) {
        console.error("Disc trend upsert failed", error);
        throw new Error("Could not save the disc rankings.");
      }

      return { imported: rows.length, weekOf: week, skipped: false };
    },
  );
