import { Link } from "@tanstack/react-router";
import { Award } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials, timeAgo } from "@/lib/current-user";
import type { FeedPost } from "@/components/post-card";
import { groupFeedPosts } from "@/lib/feed-grouping";

export const groupFeed = (posts: FeedPost[]) => groupFeedPosts(posts);

/** One card for several automated badge posts from the same player. */
export function BadgeGroupCard({ posts }: { posts: FeedPost[] }) {
  const a = posts[0].author;
  const name = a?.display_name || a?.username || "Player";
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={a?.avatar_url ?? undefined} alt={name} />
          <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link to="/players/$username" params={{ username: a?.username ?? "" }} className="font-semibold hover:underline">
              {name}
            </Link>{" "}
            earned {posts.length} new achievements
          </p>
          <p className="text-xs text-muted-foreground">{timeAgo(posts[0].created_at)}</p>
        </div>
        <Award className="h-5 w-5 shrink-0 text-competitive-gold" />
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {posts.map((p) => (
          <li key={p.id} className="rounded-full border border-competitive-gold/40 bg-competitive-gold/10 px-2.5 py-0.5 text-xs font-medium">
            {p.score_data?.achievement_name ?? p.body?.replace("Unlocked a new badge:", "").split(" — ")[0].trim() ?? "Achievement"}
          </li>
        ))}
      </ul>
      <Link to="/community/achievements" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
        View achievements
      </Link>
    </article>
  );
}
