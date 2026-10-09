import { defineTool } from "@lovable.dev/mcp-js";
import { orFilterText } from "@/lib/postgrest-safe";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_courses",
  title: "Search courses",
  description:
    "Search approved disc golf courses in the DG Dashboard directory by name, city, or state and return hole count, location, and PDGA rating.",
  inputSchema: {
    query: z.string().trim().min(2).optional().describe("Course or city name to match."),
    state: z
      .string()
      .trim()
      .length(2)
      .optional()
      .describe("Two-letter US state code, e.g. TX."),
    limit: z.number().int().min(1).max(25).default(10).describe("How many courses to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, state, limit }, ctx) => {
    if (!ctx.isAuthenticated())
      return {
        content: [{ type: "text", text: "Sign in to search the course directory." }],
        isError: true,
      };
    const supabase = supabaseForUser(ctx);
    let request = supabase
      .from("courses")
      .select(
        "id, name, slug, city, state, hole_count, pdga_rating, difficulty, latitude, longitude",
      )
      .eq("moderation_status", "approved")
      .order("pdga_rating", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (state) request = request.ilike("state", state);
    const safeQuery = query ? orFilterText(query) : "";
    if (safeQuery) request = request.or(`name.ilike.%${safeQuery}%,city.ilike.%${safeQuery}%`);
    const { data, error } = await request;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const courses = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: courses.length
            ? JSON.stringify(courses)
            : "No approved courses matched that search. Try a broader name or drop the state filter.",
        },
      ],
      structuredContent: { courses },
    };
  },
});
