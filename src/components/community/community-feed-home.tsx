import { Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense, type ReactNode } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  HeartHandshake,
  Loader2,
  MessageCircle,
  Search,
  Store,
  Tent,
  UserPlus,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useMyProfile } from "@/lib/current-user";
import { CommunityShell } from "@/components/community/community-shell";
import { PostComposer } from "@/components/post-composer";
import { PostCard, type FeedPost } from "@/components/post-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FeedFilterBar } from "@/components/home/feed-filter-bar";
import { EmptyFeedCta } from "@/components/home/empty-feed-cta";
import { WidgetBoundary } from "@/components/home/widget-boundary";
import { ImpressionTracker } from "@/components/feed/impression-tracker";
import { FeedFilterEmpty } from "@/components/feed/feed-filter-empty";
import { FeedInteractionsProvider } from "@/components/feed/feed-interactions";
import { useFeedKeyboardNav } from "@/hooks/use-feed-keyboard";
import {
  EMPTY_AUDIENCE,
  feedPageLimit,
  fetchFeedPage,
  loadFeedAudience,
  pageCursor,
  feedReason,
  type FeedFilter,
} from "@/lib/feed";
import { channelNonce } from "@/lib/realtime";
import { getCommunityOverview } from "@/lib/community.functions";
import { COMMUNITY_STALE, communityKeys } from "@/lib/community-queries";
import { ClubsSnapshot, EventsSnapshot, PeopleSnapshot } from "@/components/community/community-rail-pieces";
import { BadgeGroupCard, groupFeed } from "@/components/feed/badge-group";

const DiscGolfNewsWidget = lazy(() =>
  import("@/components/disc-golf-news").then((m) => ({ default: m.DiscGolfNewsWidget })),
);
const DiscoveryFeed = lazy(() =>
  import("@/components/home/discovery-feed").then((m) => ({ default: m.DiscoveryFeed })),
);
const TrendingWidget = lazy(() =>
  import("@/components/home/trending-widget").then((m) => ({ default: m.TrendingWidget })),
);
const FeedHighlightsStrip = lazy(() =>
  import("@/components/home/feed-highlights-strip").then((m) => ({
    default: m.FeedHighlightsStrip,
  })),
);

const RailFallback = () => <Skeleton className="h-24 w-full rounded-xl" />;

/** Community-only destinations. Play, Events, Courses and Statboard live in their own sections. */
const QUICK_LINKS = [
  { to: "/people", label: "Find players", icon: Search },
  { to: "/dgim", label: "Messages", icon: MessageCircle },
  { to: "/friends", label: "Friends & crew", icon: Users },
  { to: "/clubs", label: "Clubs", icon: HeartHandshake },
  { to: "/community/events", label: "Community events", icon: CalendarDays },
  { to: "/play/staging", label: "Clubhouse", icon: Tent },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/lost-found", label: "Lost & Found", icon: Search },
] as const;

function RailSection({ title, to, linkLabel, children }: { title: string; to?: string; linkLabel?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {to ? (
          <Link to={to} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            {linkLabel ?? "See all"} <ArrowRight className="h-3 w-3" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export function CommunityFeedHome() {
  const { user } = useSession();
  const { profile } = useMyProfile(user);
  const [filter, setFilter] = useState<FeedFilter>("for-you");
  const [newCount, setNewCount] = useState(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const feedListRef = useRef<HTMLDivElement | null>(null);
  useFeedKeyboardNav(feedListRef);
  const fetchOverview = useServerFn(getCommunityOverview);
  const overviewQuery = useQuery({
    queryKey: communityKeys.overview(user?.id),
    enabled: !!user?.id,
    staleTime: COMMUNITY_STALE.short,
    queryFn: () => fetchOverview(),
  });
  const ov = overviewQuery.data;
  const ovLoading = overviewQuery.isLoading || !ov;
  const unread = ov?.unreadMessages ?? 0;
  const pending = ov?.pendingFriendRequests ?? 0;
  const snapshot = [
    { label: "Friends", value: ov?.friendCount ?? 0, to: "/friends", show: true },
    { label: "Messages", value: unread, to: "/dgim", show: true },
    { label: "Requests", value: pending, to: "/friends", show: pending > 0 },
    { label: "Clubs", value: ov?.clubCount ?? 0, to: "/clubs", show: true },
  ].filter((s) => s.show);
  const userId = user?.id ?? null;

  // Who this viewer follows, blocks, and shares a state/club with — cached per viewer.
  const audienceQuery = useQuery({
    queryKey: ["feed-audience", userId],
    queryFn: () => (userId ? loadFeedAudience(userId) : Promise.resolve(EMPTY_AUDIENCE)),
    staleTime: 60_000,
  });
  const audience = audienceQuery.data ?? null;

  const feedQuery = useInfiniteQuery({
    queryKey: ["feed", filter, userId],
    enabled: audience !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchFeedPage({
        userId,
        filter,
        before: pageParam,
        audience: audience ?? EMPTY_AUDIENCE,
      }),
    getNextPageParam: (lastPage: FeedPost[]) =>
      lastPage.length < feedPageLimit(filter) ? undefined : pageCursor(lastPage),
    staleTime: 30_000,
  });

  // De-duplicated flat list — the same post can arrive twice around a page boundary.
  const posts = useMemo(() => {
    const pages = feedQuery.data?.pages;
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
  }, [feedQuery.data]);

  const postIds = useMemo(() => (posts ?? []).map((p) => p.id), [posts]);
  const quotedIds = useMemo(
    () => (posts ?? []).map((p) => p.repost_of).filter((id): id is string => !!id),
    [posts],
  );

  // Ids already on screen, so a post that arrives live and then shows up in a
  // refetch is never counted as "new" a second time.
  const loadedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    loadedIdsRef.current = new Set(postIds);
  }, [postIds]);

  const reload = useCallback(async () => {
    // Only clear the pill once fresh posts actually arrived — a failed refetch
    // used to hide the count and leave the reader on a stale feed.
    const res = await feedQuery.refetch();
    if (!res.isError) setNewCount(0);
  }, [feedQuery]);

  const loadMore = useCallback(() => {
    if (feedQuery.isFetchingNextPage || !feedQuery.hasNextPage) return;
    void feedQuery.fetchNextPage();
  }, [feedQuery]);

  const loadingMore = feedQuery.isFetchingNextPage;
  const done = !feedQuery.hasNextPage;
  const feedError = (audienceQuery.error ?? feedQuery.error) as Error | null;

  // Live "N new posts" pill instead of silently swapping the feed under the reader.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`feed-new-posts-${channelNonce()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts" }, (payload) => {
        const row = payload.new as { id?: string; author_id?: string } | null;
        if (!row?.id) return;
        if (row.author_id === user.id) return;
        if (loadedIdsRef.current.has(row.id)) return;
        loadedIdsRef.current.add(row.id);
        setNewCount((n) => n + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const rightRail = (
    <>
      <RailSection title={pending > 0 ? `${pending} friend request${pending === 1 ? "" : "s"}` : "People you may know"} to="/people" linkLabel="Find players">
        <PeopleSnapshot loading={ovLoading} requests={ov?.requests ?? []} suggestions={(ov?.suggestions ?? []).slice(0, 4)} />
      </RailSection>
      <RailSection title="Community events near you" to="/community/events">
        <EventsSnapshot loading={ovLoading} events={(ov?.events ?? []).slice(0, 3)} />
      </RailSection>
      {(ov?.clubs?.length ?? 0) > 0 ? (
        <RailSection title="From your clubs" to="/clubs">
          <ClubsSnapshot loading={ovLoading} clubs={(ov?.clubs ?? []).slice(0, 3)} />
        </RailSection>
      ) : null}
      <WidgetBoundary label="Trending">
        <Suspense fallback={<RailFallback />}>
          <TrendingWidget />
        </Suspense>
      </WidgetBoundary>
      <WidgetBoundary label="Around disc golf">
        <Suspense fallback={<RailFallback />}>
          <DiscGolfNewsWidget />
        </Suspense>
      </WidgetBoundary>
    </>
  );

  return (
    <CommunityShell
      title="Community"
      description="Your disc golf network, clubs and conversations."
      shareable={false}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/people">
              <Search className="mr-1.5 h-4 w-4" /> Find players
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/dgim">
              <MessageCircle className="mr-1.5 h-4 w-4" /> Messages
              {unread > 0 ? <span className="ml-1.5 rounded-full bg-background/25 px-1.5 text-xs tabular-nums">{unread}</span> : null}
            </Link>
          </Button>
        </>
      }
    >
      {pending > 0 ? (
        <Link
          to="/friends"
          className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-foreground hover:bg-primary/15"
        >
          <UserPlus className="h-4 w-4 text-primary" />
          {pending} friend request{pending === 1 ? "" : "s"} waiting
          <span className="ml-auto text-primary">Review</span>
        </Link>
      ) : null}

      {/* Phones and tablets: a short row of social actions instead of rails. */}
      <nav aria-label="Community shortcuts" className="flex flex-wrap gap-1.5 lg:hidden">
        {QUICK_LINKS.slice(0, 5).map((q) => (
          <Button key={q.to} asChild size="sm" variant="secondary" className="h-8 gap-1 px-2.5 text-[13px]">
            <Link to={q.to}>
              <q.icon className="h-3.5 w-3.5" />
              {q.label}
            </Link>
          </Button>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[220px_minmax(0,1fr)_300px] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside aria-label="Your community" className="hidden lg:block">
          <div className="sticky top-[76px] space-y-4">
            <RailSection title="Your community">
              {ovLoading ? (
                <Skeleton className="h-16 w-full rounded-lg" />
              ) : (
                <ul className="space-y-0.5">
                  {snapshot.map((s) => (
                    <li key={s.label}>
                      <Link to={s.to} className="flex items-center rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <span>{s.label}</span>
                        <span className={"ml-auto tabular-nums font-semibold " + (s.value ? "" : "text-muted-foreground")}>{s.value}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </RailSection>
            <nav aria-label="Community links" className="rounded-xl border border-border bg-card p-2">
              <ul className="space-y-0.5">
                {QUICK_LINKS.map((q) => (
                  <li key={q.to}>
                    <Link to={q.to} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                      <q.icon className="h-4 w-4 shrink-0" />
                      {q.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Center feed */}
        <section aria-label="Feed" className="min-w-0 space-y-4">
          <Suspense fallback={null}>
            <FeedHighlightsStrip userId={user?.id ?? null} />
          </Suspense>

          <PostComposer profile={profile} onCreated={reload} />

          <FeedFilterBar value={filter} onChange={setFilter} />

          {newCount > 0 ? (
            <div className="flex justify-center">
              <Button size="sm" variant="secondary" className="rounded-full" onClick={reload}>
                <ArrowUp className="mr-1.5 h-3.5 w-3.5" />
                {newCount === 1 ? "1 new post" : `${newCount} new posts`}
              </Button>
            </div>
          ) : null}

          {feedError && !posts?.length ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-center">
              <p className="text-sm font-medium text-foreground">
                We couldn't load your feed just now.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check your connection and give it another try.
              </p>
              <Button size="sm" className="mt-3" onClick={reload}>
                Try again
              </Button>
            </div>
          ) : posts === null ? (
            <>
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </>
          ) : posts.length === 0 ? (
            filter === "for-you" ? (
              <>
                <EmptyFeedCta />
                <Suspense fallback={<RailFallback />}>
                  <DiscoveryFeed currentUserId={user?.id ?? null} />
                </Suspense>
              </>
            ) : (
              <FeedFilterEmpty filter={filter} />
            )
          ) : (
            <>
              {feedError ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  <span>Showing your last loaded posts — refreshing failed.</span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={reload}>
                    Retry
                  </Button>
                </div>
              ) : null}
              <FeedInteractionsProvider postIds={postIds} quotedIds={quotedIds} userId={userId}>
                <div ref={feedListRef} className="space-y-4">
                  {groupFeed(posts).map((item) =>
                    item.kind === "badges" ? (
                      <BadgeGroupCard key={item.posts[0].id} posts={item.posts} />
                    ) : (
                      <ImpressionTracker key={item.post.id} postId={item.post.id}>
                        <PostCard
                          post={item.post}
                          currentUserId={user?.id ?? null}
                          onChange={reload}
                          reason={
                            filter === "for-you" ? feedReason(item.post, audience ?? EMPTY_AUDIENCE) : null
                          }
                        />
                      </ImpressionTracker>
                    ),
                  )}
                </div>
              </FeedInteractionsProvider>

              {/* Endless scroll: the sentinel keeps pulling the next page in as
                   the reader approaches the bottom of the list. */}
              <div ref={sentinelRef} aria-hidden className="h-px" />
              {!done ? (
                <div
                  className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading more posts…</span>
                  {!loadingMore ? (
                    <Button variant="ghost" size="sm" className="h-7" onClick={loadMore}>
                      Load now
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  You're all caught up.
                </div>
              )}
            </>
          )}
        </section>


        <aside aria-label="People, events and clubs" className="space-y-4">
          <div className="space-y-4 md:sticky md:top-[76px]">{rightRail}</div>
        </aside>
      </div>
    </CommunityShell>
  );
}
