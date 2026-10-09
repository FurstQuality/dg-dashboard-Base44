import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchOsmTerrain, terrainBbox } from "@/lib/tee-sign-terrain";
import type { SignFeature } from "@/lib/tee-sign-pro";

const MAX_AGE_DAYS = 60;
const covers = (a: number[], b: number[]) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];

/** Ground detail for a course's tee signs: cached per course, read from OpenStreetMap once when missing or stale. */
export const getSignTerrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      courseId: z.string().uuid(),
      points: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).min(1).max(800),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ features: SignFeature[]; status: "ok" | "unavailable" | "too_big" }> => {
    const bbox = terrainBbox(data.points);
    if (!bbox) return { features: [], status: "too_big" };
    const { data: hit } = await context.supabase
      .from("course_sign_terrain")
      .select("bbox, features, fetched_at")
      .eq("course_id", data.courseId)
      .maybeSingle();
    // Saved ground read before brush/woods were split out is re-read once.
    const fresh = hit && new Date(hit.fetched_at).getTime() >= Date.parse("2026-10-07T04:35:00Z") && Date.now() - new Date(hit.fetched_at).getTime() < MAX_AGE_DAYS * 864e5;
    if (hit && fresh && covers(hit.bbox, bbox)) return { features: hit.features as SignFeature[], status: "ok" };
    try {
      const features = await fetchOsmTerrain(bbox);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("course_sign_terrain").upsert({
        course_id: data.courseId, bbox, features: features as never, fetched_at: new Date().toISOString(),
      });
      return { features, status: "ok" };
    } catch (e) {
      console.error("sign terrain fetch failed", e instanceof Error ? e.message : e);
      return { features: (hit?.features as SignFeature[]) ?? [], status: "unavailable" };
    }
  });
