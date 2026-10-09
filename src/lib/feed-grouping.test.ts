import { describe, expect, it } from "vitest";
import { groupFeedPosts } from "./feed-grouping";

const badge = (id: string, a = "u1") => ({ id, author_id: a, score_data: { auto: "achievement" } });
const human = (id: string, a = "u1") => ({ id, author_id: a, score_data: null });

describe("groupFeedPosts", () => {
  it("collapses consecutive badge posts by one player", () => {
    const g = groupFeedPosts([badge("a"), badge("b"), badge("c"), human("d")]);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ kind: "badges" });
    expect(g[0].kind === "badges" && g[0].posts.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
  it("keeps a single badge and human posts individual", () => {
    expect(groupFeedPosts([badge("a"), human("b"), human("c")]).every((i) => i.kind === "post")).toBe(true);
  });
  it("does not merge different players", () => {
    expect(groupFeedPosts([badge("a", "u1"), badge("b", "u2")])).toHaveLength(2);
  });
});
