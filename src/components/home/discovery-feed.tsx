import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { PostCard, type FeedPost } from "@/components/post-card";
import { FeedInteractionsProvider } from "@/components/feed/feed-interactions";
import { useFeedKeyboardNav } from "@/hooks/use-feed-keyboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import {
  EMPTY_AUDIENCE,
  FEED_PAGE_SIZE,
  fetchFeedPage,
  loadFeedAudience,
  pageCursor,
} from "@/lib/feed";

/**
 * Populates the feed with recent public posts when the personal feed is empty.
 * Reads through the shared feed logic, so blocks, mutes and hidden posts apply here too.
 */
export function DiscoveryFeed({ currentUserId }: { currentUserId: string | null }) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedListRef = useRef<HTMLDivElement | null>(null);
  useFeedKeyboardNav(feedListRef);

  const audienceQuery = useQuery({
    queryKey: ["feed-audience", currentUserId],
    queryFn: () =>
      currentUserId ? loadFeedAudience(currentUserId) : Promise.resolve(EMPTY_AUDIENCE),
    staleTime: 60_000,
  });
  const audience = audienceQuery.data ?? null;

  const query = useInfiniteQuery({
    queryKey: ["discovery-feed", currentUserId],
    enabled: audience !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchFeedPage({
        userId: currentUserId,
        filter: "for-you",
        before: pageParam,
        audience: audience ?? EMPTY_AUDIENCE,
      }),
    getNextPageParam: (lastPage: FeedPost[]) =>
      lastPage.length < FEED_PAGE_SIZE ? undefined : pageCursor(lastPage),
    staleTime: 60_000,
  });

  const posts = useMemo(() => {
    const pages = query.data?.pages;
    if (!pages) return null;
    const seen = new Set<string>();
    const out: FeedPost[] = [];
    for (const page of pages) {
      for (const p of page) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [query.data]);

  const postIds = useMemo(() => (posts ?? []).map((p) => p.id), [posts]);
  const quotedIds = useMemo(
    () => (posts ?? []).map((p) => p.repost_of).filter((id): id is string => !!id),
    [posts],
  );

  useEffect(() => {
    if (!query.hasNextPage || posts === null) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !query.isFetchingNextPage) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [query, posts]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Discover on DG Dashboard
      </div>
      {query.error && !posts?.length ? (
        <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm">
          <p className="text-foreground">We couldn't load public posts just now.</p>
          <Button size="sm" className="mt-3" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : posts === null ? (
        <>
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          The public feed is quiet — share a round, a highlight, or a course you love to kick it
          off.
        </div>
      ) : (
        <>
          <FeedInteractionsProvider postIds={postIds} quotedIds={quotedIds} userId={currentUserId}>
            <div ref={feedListRef} className="space-y-4">
              {posts.map((p) => (
                <PostCard key={p.id} post={p} currentUserId={currentUserId} />
              ))}
            </div>
          </FeedInteractionsProvider>
          {query.hasNextPage ? (
            <div
              ref={sentinelRef}
              className="flex items-center justify-center py-6 text-xs text-muted-foreground"
            >
              {query.isFetchingNextPage ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading more posts…
                </span>
              ) : (
                <span className="opacity-60">Scroll for more</span>
              )}
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-muted-foreground">
              You're all caught up.
            </div>
          )}
        </>
      )}
    </div>
  );
}
