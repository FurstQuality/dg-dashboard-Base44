import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type TaggableFriend = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

/**
 * Accepted friends the caller is allowed to tag on their own posts.
 * Server-side so the client never decides who is taggable — the RLS insert
 * policy enforces the same rule on write.
 */
export const listTaggableFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TaggableFriend[]> => {
    const { supabase, userId } = context;
    const { data: rels, error } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(500);
    if (error) throw new Error(error.message);
    const ids = [
      ...new Set(
        (rels ?? [])
          .map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
          .filter((id): id is string => !!id && id !== userId),
      ),
    ];
    if (!ids.length) return [];
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .in("id", ids);
    return ((profs as TaggableFriend[] | null) ?? []).sort((a, b) =>
      (a.display_name ?? a.username ?? "").localeCompare(b.display_name ?? b.username ?? ""),
    );
  });

/**
 * Tag accepted friends on a post the caller authored, then notify each of them.
 * Non-friends and self-tags are rejected by both this handler and RLS.
 */
export const tagPlayersOnPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) =>
    z
      .object({
        postId: z.string().uuid(),
        userIds: z.array(z.string().uuid()).max(20),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const targets = [...new Set(data.userIds)].filter((id) => id !== userId);
    if (!targets.length) return { tagged: 0 };

    const { data: post, error: postErr } = await supabase
      .from("posts")
      .select("id, author_id, course_name")
      .eq("id", data.postId)
      .maybeSingle();
    if (postErr) throw new Error(postErr.message);
    if (!post || post.author_id !== userId) throw new Error("You can only tag on your own post");

    const { data: rels } = await supabase
      .from("friendships")
      .select("requester_id, addressee_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .limit(500);
    const friendIds = new Set(
      (rels ?? []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id)),
    );
    const allowed = targets.filter((id) => friendIds.has(id));
    if (!allowed.length) throw new Error("Those players aren't on your friends list yet");

    const { error } = await supabase.from("post_tags").upsert(
      allowed.map((id) => ({ post_id: data.postId, tagged_user_id: id, tagged_by: userId })),
      { onConflict: "post_id,tagged_user_id" },
    );
    if (error) throw new Error(error.message);

    await supabase.from("notifications").insert(
      allowed.map((id) => ({
        user_id: id,
        actor_id: userId,
        type: "mention" as const,
        post_id: data.postId,
        data: {
          kind: "round_tag",
          course_name: post.course_name ?? null,
          message: post.course_name
            ? `tagged you in a round at ${post.course_name}`
            : "tagged you in a round",
        },
      })),
    );


    return { tagged: allowed.length };
  });

/** A tagged player removing their own tag. */
export const untagMyself = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((raw) => z.object({ postId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("post_tags")
      .delete()
      .eq("post_id", data.postId)
      .eq("tagged_user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
