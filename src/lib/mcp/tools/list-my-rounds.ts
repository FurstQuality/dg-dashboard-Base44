import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_rounds",
  title: "List my rounds",
  description:
    "List the signed-in player's most recent rounds with course name, status, start and end times, and whether the round counted toward ratings.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("How many rounds to return."),
    status: z
      .enum(["in_progress", "completed", "abandoned"])
      .optional()
      .describe("Only return rounds in this state."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, status }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Sign in to read your rounds." }], isError: true };
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("rounds")
      .select("id, status, started_at, ended_at, is_rated, notes, courses(name, city, state)")
      .eq("created_by", ctx.getUserId()!)
      .order("started_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rounds = data ?? [];
    return {
      content: [
        {
          type: "text",
          text: rounds.length
            ? JSON.stringify(rounds)
            : "No rounds match that filter yet — start one from the Play tab.",
        },
      ],
      structuredContent: { rounds },
    };
  },
});
