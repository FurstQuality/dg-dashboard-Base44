import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { PostBody } from "@/components/feed/post-body";
import { usePrefetchedQuote } from "@/components/feed/feed-interactions";
import { supabase } from "@/integrations/supabase/client";
import { initials, timeAgo } from "@/lib/current-user";

type Quoted = {
  id: string;
  body: string | null;
  created_at: string;
  course_name: string | null;
  media: Array<{ url: string; type: string }> | null;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
};

/** Compact preview of the original post inside a repost. */
export function QuotedPost({ postId }: { postId: string }) {
  const batched = usePrefetchedQuote(postId);
  const [post, setPost] = useState<Quoted | null | "missing">(null);

  useEffect(() => {
    // Feed pages batch quoted posts; only standalone cards fetch on their own.
    if (batched !== undefined) {
      setPost(batched ?? "missing");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("posts")
        .select("id, body, created_at, course_name, media, author_id")
        .eq("id", postId)
        .maybeSingle();
      if (cancelled) return;
      if (!data) return setPost("missing");
      const { data: prof } = await supabase
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", data.author_id)
        .maybeSingle();
      if (cancelled) return;
      setPost({
        id: data.id,
        body: data.body,
        created_at: data.created_at,
        course_name: data.course_name,
        media: (data.media as Quoted["media"]) ?? null,
        author: (prof ?? null) as Quoted["author"],
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, batched]);


  if (post === null) return <Skeleton className="mx-4 mb-3 h-20 rounded-xl" />;
  if (post === "missing") {
    return (
      <div className="mx-4 mb-3 rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        The original post is no longer available.
      </div>
    );
  }

  const image = (post.media ?? []).find((m) => !m.type?.startsWith("video"));

  return (
    <Link
      to="/p/$postId"
      params={{ postId: post.id }}
      className="mx-4 mb-3 block rounded-xl border border-border bg-muted/20 p-3 transition hover:bg-muted/40"
    >
      <div className="flex items-center gap-2">
        <Avatar className="h-6 w-6">
          {post.author?.avatar_url ? <AvatarImage src={post.author.avatar_url} /> : null}
          <AvatarFallback>{initials(post.author?.display_name)}</AvatarFallback>
        </Avatar>
        <span className="text-xs font-semibold">{post.author?.display_name ?? "Player"}</span>
        <span className="text-[11px] text-muted-foreground">{timeAgo(post.created_at)}</span>
      </div>
      {post.body ? (
        <PostBody body={post.body} className="mt-1.5 line-clamp-4 px-0 text-sm" />
      ) : null}
      {post.course_name ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{post.course_name}</div>
      ) : null}
      {image ? (
        <img
          src={image.url}
          alt=""
          loading="lazy"
          className="mt-2 aspect-video w-full rounded-lg object-cover"
        />
      ) : null}
    </Link>
  );
}
