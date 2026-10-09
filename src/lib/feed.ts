import { supabase } from "@/integrations/supabase/client";
import type { FeedPost } from "@/components/post-card";

/** Every feed surface (home, discovery, saved) reads through this module. */
export type FeedFilter = "for-you" | "following" | "local" | "clubs" | "tournaments" | "saved";

export const FEED_PAGE_SIZE = 20;

export const FEED_SELECT =
  "id, author_id, type, body, media, location, like_count, comment_count, created_at, course_name, round_id, score_data, snapshot, club_id, posted_as_club, repost_of, share_count, visibility";

export type FeedAudience = {
  /** Friends + people you follow. */
  followingIds: string[];
  /** People you blocked — never shown in any feed. */
  blockedIds: string[];
  /** Players this viewer muted — hidden from their feeds only. */
  mutedIds: string[];
  /** Individual posts this viewer chose to hide. */
  hiddenPostIds: string[];
  /** Clubs you belong to. */
  clubIds: string[];
  /** Your home state, used for the Local filter. */
  homeState: string | null;
  /** Authors in your home state (bounded). */
  localAuthorIds: string[];
};

export const EMPTY_AUDIENCE: FeedAudience = {
  followingIds: [],
  blockedIds: [],
  mutedIds: [],
  hiddenPostIds: [],
  clubIds: [],
  homeState: null,
  localAuthorIds: [],
};

/**
 * Resolves who the viewer's feed should include/exclude.
 * Bounded queries — safe to call on every feed mount.
 */
let audienceCache: { userId: string; at: number; value: Promise<FeedAudience> } | null = null;
const AUDIENCE_TTL_MS = 60_000;

/** Clears the cached audience so the next feed mount refetches follows/blocks. */
export function invalidateFeedAudience() {
  audienceCache = null;
}

export async function loadFeedAudience(userId: string | null): Promise<FeedAudience> {
  if (!userId) return EMPTY_AUDIENCE;

  // Re-entering the feed within a minute reuses the in-flight/last result instead of
  // re-running seven queries before the first post can load.
  if (audienceCache && audienceCache.userId === userId && Date.now() - audienceCache.at < AUDIENCE_TTL_MS) {
    return audienceCache.value;
  }
  const pending = loadFeedAudienceUncached(userId);
  audienceCache = { userId, at: Date.now(), value: pending };
  pending.catch(() => {
    audienceCache = null;
  });
  return pending;
}

async function loadFeedAudienceUncached(userId: string): Promise<FeedAudience> {

  const [followsRes, friendsRes, blocksRes, clubsRes, profileRes, mutedRes, hiddenRes] =
    await Promise.all([
      supabase.from("follows").select("followee_id").eq("follower_id", userId).limit(2000),
      supabase
        .from("friendships")
        .select("requester_id, addressee_id")
        .eq("status", "accepted")
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .limit(2000),
      supabase.from("blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
      supabase.from("club_members").select("club_id").eq("user_id", userId).limit(200),
      supabase.from("profiles").select("home_state").eq("id", userId).maybeSingle(),
      supabase.from("muted_authors").select("muted_id").eq("user_id", userId).limit(1000),
      supabase.from("hidden_posts").select("post_id").eq("user_id", userId).limit(2000),
    ]);

  const following = new Set<string>();
  for (const r of followsRes.data ?? []) following.add(r.followee_id);
  for (const r of friendsRes.data ?? []) {
    following.add(r.requester_id === userId ? r.addressee_id : r.requester_id);
  }
  following.delete(userId);

  const homeState = (profileRes.data?.home_state ?? null) || null;
  let localAuthorIds: string[] = [];
  if (homeState) {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("home_state", homeState)
      .limit(500);
    localAuthorIds = (data ?? []).map((r) => r.id);
  }

  return {
    followingIds: [...following],
    blockedIds: (blocksRes.data ?? []).map((r) => r.blocked_id),
    mutedIds: (mutedRes.data ?? []).map((r) => r.muted_id),
    hiddenPostIds: (hiddenRes.data ?? []).map((r) => r.post_id),
    clubIds: (clubsRes.data ?? []).map((r) => r.club_id),
    homeState,
    localAuthorIds,
  };
}

async function attachAuthors(rows: Record<string, unknown>[]): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.map((p) => p["author_id"] as string))];
  const postIds = rows.map((p) => p["id"] as string);
  const [{ data: authors }, { data: tagRows }] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids),
    supabase.from("post_tags").select("post_id, tagged_user_id").in("post_id", postIds),
  ]);

  // Tagged players need their own profile lookup — they are not post authors.
  const taggedIds = [...new Set((tagRows ?? []).map((t) => t.tagged_user_id))];
  const missing = taggedIds.filter((id) => !ids.includes(id));
  const { data: taggedProfiles } = missing.length
    ? await supabase.from("profiles").select("id, username, display_name").in("id", missing)
    : { data: [] as Array<{ id: string; username: string | null; display_name: string | null }> };

  // Posts published under a club identity render the club, not the player.
  const clubIds = [
    ...new Set(
      rows
        .filter((p) => p["posted_as_club"] === true && p["club_id"])
        .map((p) => p["club_id"] as string),
    ),
  ];
  const { data: clubRows } = clubIds.length
    ? await supabase.from("clubs").select("id, name, slug, avatar_url").in("id", clubIds)
    : { data: [] as Array<{ id: string; name: string; slug: string; avatar_url: string | null }> };
  const clubMap = new Map((clubRows ?? []).map((c) => [c.id, c]));

  const map = new Map((authors ?? []).map((a) => [a.id, a]));
  const nameMap = new Map<string, { id: string; username: string | null; display_name: string | null }>();
  for (const a of authors ?? []) nameMap.set(a.id, a);
  for (const p of taggedProfiles ?? []) nameMap.set(p.id, p);

  const tagsByPost = new Map<string, NonNullable<FeedPost["tagged"]>>();
  for (const t of tagRows ?? []) {
    const profile = nameMap.get(t.tagged_user_id);
    if (!profile) continue;
    const list = tagsByPost.get(t.post_id) ?? [];
    list.push({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
    });
    tagsByPost.set(t.post_id, list);
  }

  return rows.map((p) => ({
    ...(p as unknown as FeedPost),
    media: p["media"] as FeedPost["media"],
    author: (map.get(p["author_id"] as string) ?? null) as FeedPost["author"],
    tagged: tagsByPost.get(p["id"] as string) ?? null,
    club:
      p["posted_as_club"] === true && p["club_id"]
        ? (clubMap.get(p["club_id"] as string) ?? null)
        : null,
  }));
}

/**
 * Drops rows the viewer should never see: blocked accounts, muted authors, and
 * individual posts they hid. Exported so every feed surface applies the same rule.
 */
export function filterViewerExclusions<T extends Record<string, unknown>>(
  rows: T[],
  audience: FeedAudience,
): T[] {
  const authors = new Set([...audience.blockedIds, ...audience.mutedIds]);
  const hidden = new Set(audience.hiddenPostIds);
  if (authors.size === 0 && hidden.size === 0) return rows;
  return rows.filter(
    (r) => !authors.has(r["author_id"] as string) && !hidden.has(r["id"] as string),
  );
}

export type FeedPageArgs = {
  userId: string | null;
  filter: FeedFilter;
  before: string | null;
  audience: FeedAudience;
};

/** PostgREST `not.in` lists travel in the URL, so only short lists go to SQL. */
const SQL_EXCLUSION_LIMIT = 150;

function excludedAuthorIds(audience: FeedAudience): string[] {
  return [...new Set([...audience.blockedIds, ...audience.mutedIds])];
}

type PostQuery = ReturnType<typeof buildBaseQuery>;

function buildBaseQuery(limit: number = FEED_PAGE_SIZE) {
  return supabase
    .from("posts")
    .select(FEED_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
}

/**
 * "For You" ranks a wider pool than one screenful so a good post from someone you
 * follow isn't stranded twenty posts down.
 */
const FOR_YOU_POOL = FEED_PAGE_SIZE * 2;

/**
 * How many posts a single page of this filter can hold. "For you" pulls a wider
 * pool so ranking has something to work with, so the "is there another page?"
 * check has to compare against the same number the fetch used.
 */
export function feedPageLimit(filter: FeedFilter): number {
  return filter === "for-you" ? FOR_YOU_POOL : FEED_PAGE_SIZE;
}

/** Oldest post in a page — the cursor for the next page, whatever the sort order. */
export function pageCursor(page: FeedPost[]): string | undefined {
  let oldest: string | undefined;
  for (const p of page) {
    if (!oldest || p.created_at < oldest) oldest = p.created_at;
  }
  return oldest;
}

/** Plain-language explanation of why a post is in the For You feed. */
export function feedReason(post: FeedPost, audience: FeedAudience): string | null {
  if (audience.followingIds.includes(post.author_id)) return "From someone you follow";
  if (post.club_id && audience.clubIds.includes(post.club_id)) return "From one of your clubs";
  if (audience.localAuthorIds.includes(post.author_id) && audience.homeState) {
    return `Playing in ${audience.homeState}`;
  }
  if ((post.like_count ?? 0) + (post.comment_count ?? 0) >= 5) return "Getting attention today";
  return null;
}

/** Pushes viewer exclusions into the query so pages come back full. */
function applyExclusions(q: PostQuery, audience: FeedAudience): PostQuery {
  let out = q;
  const authors = excludedAuthorIds(audience);
  if (authors.length > 0 && authors.length <= SQL_EXCLUSION_LIMIT) {
    out = out.not("author_id", "in", `(${authors.join(",")})`);
  }
  const hidden = audience.hiddenPostIds;
  if (hidden.length > 0 && hidden.length <= SQL_EXCLUSION_LIMIT) {
    out = out.not("id", "in", `(${hidden.join(",")})`);
  }
  return out;
}

/**
 * One page of the feed for a given filter.
 * Keyset paginated on created_at; blocked, muted and hidden content is excluded
 * inside the query, then re-checked client-side for oversized exclusion lists.
 * Keeps pulling until a full page is assembled so "You're all caught up" is honest.
 */
export async function fetchFeedPage({
  userId,
  filter,
  before,
  audience,
}: FeedPageArgs): Promise<FeedPost[]> {
  // Saved posts read through post_saves, newest save first.
  if (filter === "saved") {
    if (!userId) return [];
    const { data: saves, error: savesError } = await supabase
      .from("post_saves")
      .select("post_id")
      .eq("user_id", userId)
      .limit(500);
    if (savesError) throw savesError;
    const ids = (saves ?? []).map((s) => s.post_id);
    if (ids.length === 0) return [];
    let q = applyExclusions(buildBaseQuery(), audience).in("id", ids);
    if (before) q = q.lt("created_at", before);
    const { data, error } = await q;
    if (error) throw error;
    return attachAuthors(
      filterViewerExclusions((data ?? []) as Record<string, unknown>[], audience),
    );
  }

  const pageLimit = filter === "for-you" ? FOR_YOU_POOL : FEED_PAGE_SIZE;

  const runPage = async (cursor: string | null) => {
    let q = applyExclusions(buildBaseQuery(pageLimit), audience);
    if (cursor) q = q.lt("created_at", cursor);

    if (filter === "following") {
      const authors = audience.followingIds;
      if (authors.length === 0) return { rows: [] as Record<string, unknown>[], raw: 0 };
      q = q.in("author_id", authors);
    }

    if (filter === "local") {
      // Posts from players in your state, or posts tagged with a place in your state.
      const state = audience.homeState;
      const authors = audience.localAuthorIds;
      if (!state && authors.length === 0) return { rows: [] as Record<string, unknown>[], raw: 0 };
      const clauses: string[] = [];
      if (authors.length) clauses.push(`author_id.in.(${authors.join(",")})`);
      if (state) {
        clauses.push(`location.ilike.%${state}%`);
        clauses.push(`course_name.ilike.%${state}%`);
      }
      q = q.or(clauses.join(","));
    }

    if (filter === "clubs") {
      if (audience.clubIds.length === 0) return { rows: [] as Record<string, unknown>[], raw: 0 };
      q = q.in("club_id", audience.clubIds);
    }

    if (filter === "tournaments") q = q.eq("type", "tournament");

    const { data, error } = await q;
    if (error) throw error;
    const raw = (data ?? []) as Record<string, unknown>[];
    return { rows: filterViewerExclusions(raw, audience), raw: raw.length };
  };

  const collected: Record<string, unknown>[] = [];
  let cursor = before;
  // At most three passes: enough to backfill client-side exclusions without stalling.
  for (let pass = 0; pass < 3; pass += 1) {
    const { rows, raw } = await runPage(cursor);
    collected.push(...rows);
    if (raw < pageLimit) break;
    if (collected.length >= pageLimit) break;
    cursor = (rows[rows.length - 1]?.["created_at"] ??
      null) as string | null;
    if (!cursor) break;
  }

  const posts = await attachAuthors(collected.slice(0, pageLimit));

  if (filter === "for-you") return rankForYou(posts, audience);
  return posts;
}

/** Reactions and saves for one page, read in two queries instead of two per card. */
export type PostInteraction = {
  counts: Record<string, number>;
  total: number;
  mine: string | null;
  saved: boolean;
};

export async function fetchPageInteractions(
  postIds: string[],
  userId: string | null,
): Promise<Record<string, PostInteraction>> {
  const out: Record<string, PostInteraction> = {};
  if (postIds.length === 0) return out;
  for (const id of postIds) out[id] = { counts: {}, total: 0, mine: null, saved: false };

  const [likesRes, savesRes] = await Promise.all([
    supabase.from("post_likes").select("post_id, user_id, reaction").in("post_id", postIds),
    userId
      ? supabase.from("post_saves").select("post_id").eq("user_id", userId).in("post_id", postIds)
      : Promise.resolve({ data: [] as Array<{ post_id: string }> }),
  ]);

  for (const row of likesRes.data ?? []) {
    const entry = out[row.post_id];
    if (!entry) continue;
    const key = (row as { reaction?: string | null }).reaction ?? "like";
    entry.counts[key] = (entry.counts[key] ?? 0) + 1;
    entry.total += 1;
    if (userId && row.user_id === userId) entry.mine = key;
  }
  for (const row of savesRes.data ?? []) {
    const entry = out[row.post_id];
    if (entry) entry.saved = true;
  }
  return out;
}

/** Quoted posts for a page of reposts, batched instead of one fetch per card. */
export type QuotedPostData = {
  id: string;
  body: string | null;
  created_at: string;
  course_name: string | null;
  media: Array<{ url: string; type: string }> | null;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
};

export async function fetchQuotedPosts(
  ids: string[],
): Promise<Record<string, QuotedPostData | null>> {
  const out: Record<string, QuotedPostData | null> = {};
  if (ids.length === 0) return out;
  const unique = [...new Set(ids)];
  for (const id of unique) out[id] = null;

  const { data: rows } = await supabase
    .from("posts")
    .select("id, body, created_at, course_name, media, author_id")
    .in("id", unique);
  const authorIds = [...new Set((rows ?? []).map((r) => r.author_id))];
  const { data: profs } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", authorIds)
    : { data: [] as Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> };
  const profMap = new Map((profs ?? []).map((p) => [p.id, p]));

  for (const r of rows ?? []) {
    out[r.id] = {
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      course_name: r.course_name,
      media: (r.media as QuotedPostData["media"]) ?? null,
      author: (profMap.get(r.author_id) ?? null) as QuotedPostData["author"],
    };
  }
  return out;
}


/**
 * "For You" keeps chronological order as the backbone but lifts posts from
 * people you follow and posts near you above cold global content in the page.
 */
export function rankForYou(posts: FeedPost[], audience: FeedAudience): FeedPost[] {
  const follows = new Set(audience.followingIds);
  const local = new Set(audience.localAuthorIds);
  const score = (p: FeedPost) => {
    let s = 0;
    if (follows.has(p.author_id)) s += 100;
    if (local.has(p.author_id)) s += 25;
    s += Math.min(20, (p.like_count ?? 0) * 2 + (p.comment_count ?? 0) * 3);
    const ageHours = (Date.now() - new Date(p.created_at).getTime()) / 3_600_000;
    if (ageHours < 24) s += 15;
    else if (ageHours < 72) s += 5;
    return s;
  };
  return [...posts].sort((a, b) => score(b) - score(a));
}

const IMPRESSION_KEY = "dgd:feed:impressions";

function seenToday(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(IMPRESSION_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { day: string; ids: string[] };
    if (parsed.day !== new Date().toISOString().slice(0, 10)) return new Set();
    return new Set(parsed.ids);
  } catch {
    return new Set();
  }
}

function persistSeen(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      IMPRESSION_KEY,
      JSON.stringify({ day: new Date().toISOString().slice(0, 10), ids: [...ids].slice(-2000) }),
    );
  } catch {
    /* storage full or blocked — impressions are best-effort */
  }
}

/**
 * Records feed views so creator analytics have real reach numbers.
 * First view of a post today counts as a unique viewer; repeats only bump impressions.
 */
export async function recordImpressions(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return;
  const seen = seenToday();
  const fresh = postIds.filter((id) => !seen.has(id));
  const repeats = postIds.filter((id) => seen.has(id));
  try {
    if (fresh.length) {
      await supabase.rpc("record_post_impressions", { _post_ids: fresh, _new_viewer: true });
      for (const id of fresh) seen.add(id);
      persistSeen(seen);
    }
    if (repeats.length) {
      await supabase.rpc("record_post_impressions", { _post_ids: repeats, _new_viewer: false });
    }
  } catch {
    /* view counting must never break the feed */
  }
}

/**
 * Posts carrying a given hashtag, newest first. Keyset paginated on created_at.
 * Matched on the post body so tags work without a separate index table.
 */
export async function fetchTagPage(tag: string, before: string | null): Promise<FeedPost[]> {
  const clean = tag.replace(/[^a-z0-9_]/gi, "").toLowerCase();
  if (!clean) return [];
  let q = supabase
    .from("posts")
    .select(FEED_SELECT)
    .ilike("body", `%#${clean}%`)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE);
  if (before) q = q.lt("created_at", before);
  const { data } = await q;
  return attachAuthors((data ?? []) as Record<string, unknown>[]);
}
