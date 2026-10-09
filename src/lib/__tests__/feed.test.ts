import { describe, expect, it } from "vitest";
import { rankForYou, EMPTY_AUDIENCE, type FeedAudience } from "@/lib/feed";
import type { FeedPost } from "@/components/post-card";

function post(id: string, author: string, overrides: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    author_id: author,
    type: "text",
    body: id,
    media: null,
    location: null,
    like_count: 0,
    comment_count: 0,
    created_at: new Date().toISOString(),
    author: null,
    ...overrides,
  } as FeedPost;
}

const audience: FeedAudience = {
  ...EMPTY_AUDIENCE,
  followingIds: ["friend"],
  localAuthorIds: ["neighbor"],
};

describe("rankForYou", () => {
  it("lifts posts from people you follow above strangers", () => {
    const ranked = rankForYou([post("a", "stranger"), post("b", "friend")], audience);
    expect(ranked[0].id).toBe("b");
  });

  it("puts local players above unrelated players", () => {
    const ranked = rankForYou([post("a", "stranger"), post("b", "neighbor")], audience);
    expect(ranked[0].id).toBe("b");
  });

  it("rewards engagement among equally-unrelated posts", () => {
    const ranked = rankForYou(
      [post("quiet", "x"), post("busy", "y", { like_count: 5, comment_count: 3 })],
      audience,
    );
    expect(ranked[0].id).toBe("busy");
  });

  it("prefers fresh posts over week-old ones", () => {
    const old = post("old", "x", {
      created_at: new Date(Date.now() - 7 * 86400_000).toISOString(),
    });
    const ranked = rankForYou([old, post("new", "x")], audience);
    expect(ranked[0].id).toBe("new");
  });

  it("does not mutate the input array", () => {
    const input = [post("a", "stranger"), post("b", "friend")];
    rankForYou(input, audience);
    expect(input[0].id).toBe("a");
  });
});

describe("pageCursor", () => {
  it("returns the oldest post in a ranked page", async () => {
    const { pageCursor } = await import("@/lib/feed");
    const page = [
      post("new", "a", { created_at: "2026-05-02T00:00:00.000Z" }),
      post("old", "b", { created_at: "2026-05-01T00:00:00.000Z" }),
      post("mid", "c", { created_at: "2026-05-01T12:00:00.000Z" }),
    ];
    expect(pageCursor(page)).toBe("2026-05-01T00:00:00.000Z");
  });

  it("is undefined for an empty page", async () => {
    const { pageCursor } = await import("@/lib/feed");
    expect(pageCursor([])).toBeUndefined();
  });
});

describe("feedReason", () => {
  it("credits people you follow", async () => {
    const { feedReason } = await import("@/lib/feed");
    expect(feedReason(post("a", "friend"), audience)).toBe("From someone you follow");
  });

  it("credits nearby players when a home state is known", async () => {
    const { feedReason } = await import("@/lib/feed");
    expect(feedReason(post("a", "neighbor"), { ...audience, homeState: "MI" })).toBe(
      "Playing in MI",
    );
  });

  it("credits busy posts and stays quiet otherwise", async () => {
    const { feedReason } = await import("@/lib/feed");
    expect(feedReason(post("a", "stranger", { like_count: 6 }), audience)).toBe(
      "Getting attention today",
    );
    expect(feedReason(post("b", "stranger"), audience)).toBeNull();
  });
});

describe("saved feed", () => {
  it("returns nothing for a signed-out viewer", async () => {
    const { fetchFeedPage } = await import("@/lib/feed");
    await expect(
      fetchFeedPage({ userId: null, filter: "saved", before: null, audience }),
    ).resolves.toEqual([]);
  });
});
