/** Minimal shape needed to group automated achievement posts. */
export type GroupablePost = {
  id: string;
  author_id: string;
  body?: string | null;
  score_data?: { auto?: string } | null;
};

/** Older badge posts were written without the auto marker, so the text counts too. */
export function isBadgePost(p: GroupablePost): boolean {
  return p.score_data?.auto === "achievement" || !!p.body?.startsWith("Unlocked a new badge:");
}

export type FeedItem<P extends GroupablePost> = { kind: "post"; post: P } | { kind: "badges"; posts: P[] };

/**
 * Back-to-back automated badge posts from the same player collapse into one item.
 * Human posts always stay individual.
 */
export function groupFeedPosts<P extends GroupablePost>(posts: P[]): FeedItem<P>[] {
  const out: FeedItem<P>[] = [];
  for (const p of posts) {
    const isBadge = isBadgePost(p);
    const last = out[out.length - 1];
    if (isBadge && last) {
      if (last.kind === "badges" && last.posts[0].author_id === p.author_id) {
        last.posts.push(p);
        continue;
      }
      if (last.kind === "post" && isBadgePost(last.post) && last.post.author_id === p.author_id) {
        out[out.length - 1] = { kind: "badges", posts: [last.post, p] };
        continue;
      }
    }
    out.push({ kind: "post", post: p });
  }
  return out;
}
