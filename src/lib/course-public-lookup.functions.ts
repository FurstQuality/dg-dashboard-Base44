/**
 * Public course data lookup for the course builder.
 * Thin server-fn wrapper; helpers live in course-public-lookup.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { PublicCourseLookup } from "@/lib/course-public-lookup.server";

const Input = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(40).optional().default(""),
  sources: z
    .array(z.enum(["pdga", "udisc", "dgcr"]))
    .min(1)
    .optional()
    .default(["pdga", "udisc", "dgcr"]),
});

export type { PublicCourseCandidate, PublicCourseLookup } from "@/lib/course-public-lookup.server";

export const lookupPublicCourseData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data, context }): Promise<PublicCourseLookup> => {
    const { gatherUdiscCandidate, gatherDgcrCandidate, mapPdgaKbRow } = await import(
      "@/lib/course-public-lookup.server"
    );
    const want = new Set(data.sources);
    const city = data.city.trim() || null;
    const state = data.state.trim() || null;

    const [pdga, udisc, dgcr] = await Promise.all([
      want.has("pdga")
        ? context.supabase
            .rpc("pdga_kb_search_courses", { _q: data.name, _limit: 5 })
            .then(({ data: rows, error }) =>
              error ? { rows: [], note: error.message } : { rows: rows ?? [], note: null },
            )
        : Promise.resolve({ rows: [], note: null }),
      want.has("udisc")
        ? gatherUdiscCandidate(data.name, city, state)
        : Promise.resolve({ candidate: null, note: null }),
      want.has("dgcr")
        ? gatherDgcrCandidate(data.name, city, state)
        : Promise.resolve({ candidate: null, note: null }),
    ]);

    const result: PublicCourseLookup = { candidates: [], notes: [] };

    if (pdga.note) result.notes.push({ source: "pdga", message: pdga.note });
    for (const row of pdga.rows as Parameters<typeof mapPdgaKbRow>[0][]) {
      result.candidates.push(mapPdgaKbRow(row));
    }
    if (want.has("pdga") && !pdga.rows.length && !pdga.note) {
      result.notes.push({ source: "pdga", message: "No PDGA course match found." });
    }

    if (udisc.candidate) result.candidates.push(udisc.candidate);
    if (udisc.note) result.notes.push({ source: "udisc", message: udisc.note });

    if (dgcr.candidate) result.candidates.push(dgcr.candidate);
    if (dgcr.note) result.notes.push({ source: "dgcr", message: dgcr.note });

    result.candidates.sort((a, b) => b.confidence - a.confidence);
    return result;
  });
