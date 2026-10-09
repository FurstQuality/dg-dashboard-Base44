import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchPageInteractions,
  fetchQuotedPosts,
  type PostInteraction,
  type QuotedPostData,
} from "@/lib/feed";

type FeedInteractionsValue = {
  ready: boolean;
  interactions: Record<string, PostInteraction>;
  quoted: Record<string, QuotedPostData | null>;
};

const FeedInteractionsContext = createContext<FeedInteractionsValue | null>(null);

/**
 * Loads reactions, saves and quoted posts for a whole feed page in a couple of
 * queries. Cards read from here instead of each asking the server themselves.
 */
export function FeedInteractionsProvider({
  postIds,
  quotedIds,
  userId,
  children,
}: {
  postIds: string[];
  quotedIds: string[];
  userId: string | null;
  children: ReactNode;
}) {
  const idKey = postIds.join(",");
  const quotedKey = quotedIds.join(",");

  const interactionsQuery = useQuery({
    queryKey: ["feed-interactions", userId, idKey],
    queryFn: () => fetchPageInteractions(postIds, userId),
    enabled: postIds.length > 0,
    staleTime: 30_000,
  });

  const quotedQuery = useQuery({
    queryKey: ["feed-quoted", quotedKey],
    queryFn: () => fetchQuotedPosts(quotedIds),
    enabled: quotedIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const value = useMemo<FeedInteractionsValue>(
    () => ({
      ready: postIds.length === 0 || interactionsQuery.isSuccess,
      interactions: interactionsQuery.data ?? {},
      quoted: quotedQuery.data ?? {},
    }),
    [postIds.length, interactionsQuery.isSuccess, interactionsQuery.data, quotedQuery.data],
  );

  return (
    <FeedInteractionsContext.Provider value={value}>{children}</FeedInteractionsContext.Provider>
  );
}

/** Prefetched reaction/save state for a post, or null when this card stands alone. */
export function usePrefetchedInteraction(postId: string): PostInteraction | null {
  const ctx = useContext(FeedInteractionsContext);
  if (!ctx || !ctx.ready) return null;
  return ctx.interactions[postId] ?? null;
}


/** Prefetched quoted post: `undefined` means "not batched here, fetch it yourself". */
export function usePrefetchedQuote(postId: string): QuotedPostData | null | undefined {
  const ctx = useContext(FeedInteractionsContext);
  if (!ctx) return undefined;
  if (!(postId in ctx.quoted)) return undefined;
  return ctx.quoted[postId];
}
