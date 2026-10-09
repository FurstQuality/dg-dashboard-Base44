import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Hash } from "lucide-react";
import { PageShell, PageHeader } from "@/components/shell";
import { PostCard, type FeedPost } from "@/components/post-card";
import { ImpressionTracker } from "@/components/feed/impression-tracker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTagPage } from "@/lib/feed";
import { useSession } from "@/lib/current-user";

export const Route = createFileRoute("/_authenticated/tag/$tag")({
  head: ({ params }) => {
    const tag = params.tag;
    return {
      meta: [
        { title: `#${tag} · DG Dashboard` },
        {
          name: "description",
          content: `Every disc golf post tagged #${tag} — rounds, aces, gear talk, and course beta from the community.`,
        },
        { property: "og:title", content: `#${tag} on DG Dashboard` },
        { property: "og:description", content: `Browse community posts tagged #${tag}.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: TagPage,
  errorComponent: () => (
    <PageShell>
      <PageHeader
        title="Tag unavailable"
        description="We couldn't load posts for that tag. Try again in a moment."
      />
      <Button asChild variant="secondary">
        <Link to="/home">Back to feed</Link>
      </Button>
    </PageShell>
  ),
});

function TagPage() {
  const { tag } = Route.useParams();
  const { user } = useSession();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const reload = useCallback(async () => {
    setPosts(null);
    setDone(false);
    const page = await fetchTagPage(tag, null);
    setPosts(page);
    if (page.length === 0) setDone(true);
  }, [tag]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!posts || posts.length === 0 || loadingMore || done) return;
    setLoadingMore(true);
    const page = await fetchTagPage(tag, posts[posts.length - 1].created_at);
    const seen = new Set(posts.map((p) => p.id));
    const fresh = page.filter((p) => !seen.has(p.id));
    setPosts([...posts, ...fresh]);
    if (fresh.length === 0) setDone(true);
    setLoadingMore(false);
  }

  return (
    <PageShell>
      <PageHeader
        title={`#${tag}`}
        description="Community posts tagged with this topic, newest first."
        primaryAction={
          <Button asChild variant="secondary" size="sm">
            <Link to="/home">Open feed</Link>
          </Button>
        }

      />

      <div className="mx-auto w-full max-w-2xl space-y-4">
        {posts === null ? (
          <>
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Hash className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing tagged #{tag} yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Be the first — add #{tag} to a post and it will show up here.
            </p>
            <Button asChild className="mt-4" size="sm">
              <Link to="/home">Write a post</Link>
            </Button>
          </div>
        ) : (
          <>
            {posts.map((p) => (
              <ImpressionTracker key={p.id} postId={p.id}>
                <PostCard post={p} currentUserId={user?.id ?? null} onChange={reload} />
              </ImpressionTracker>
            ))}
            {!done ? (
              <div className="flex justify-center">
                <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            ) : (
              <p className="pb-6 text-center text-xs text-muted-foreground">
                You've reached the end of #{tag}.
              </p>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
