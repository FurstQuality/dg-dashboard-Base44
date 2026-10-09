import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_profile",
  title: "Get my player profile",
  description:
    "Return the signed-in player's DG Dashboard profile: display name, username, home course, home state, PDGA number and rating, and preferred division.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Sign in to read your profile." }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, display_name, username, player_code, bio, location, home_course, home_state, pdga_number, pdga_rating, preferred_division, player_since, reunited_count",
      )
      .eq("id", ctx.getUserId()!)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data)
      return {
        content: [{ type: "text", text: "No profile found for this account yet." }],
        isError: true,
      };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { profile: data },
    };
  },
});
