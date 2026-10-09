import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_post",
  title: "Post to the feed",
  description:
    "Publish a text post to the DG Dashboard feed as the signed-in player. Choose who can see it: everyone or friends only.",
  inputSchema: {
    body: z.string().trim().min(1).max(2000).describe("What the post says."),
    visibility: z
      .enum(["public", "friends"])
      .default("public")
      .describe("Who can see the post."),
    course_name: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Optional course to tag the post with."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ body, visibility, course_name }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Sign in to post to the feed." }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("posts")
      .insert({
        author_id: ctx.getUserId()!,
        type: "text",
        body,
        visibility,
        course_name: course_name ?? null,
      })
      .select("id, created_at, visibility, body")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Posted to the feed. ${JSON.stringify(data)}` }],
      structuredContent: { post: data },
    };
  },
});
