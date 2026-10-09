import { describe, expect, it } from "vitest";
import { computeTrending, type TrendingRow } from "@/components/home/trending-widget";

const row = (over: Partial<TrendingRow>): TrendingRow => ({
  body: null,
  course_name: null,
  like_count: 0,
  comment_count: 0,
  ...over,
});

describe("computeTrending", () => {
  it("returns empty lists when there are no recent posts", () => {
    expect(computeTrending([])).toEqual({ tags: [], courses: [] });
  });

  it("counts hashtags case-insensitively and weights engagement", () => {
    const result = computeTrending([
      row({ body: "Huge #Ace today" }),
      row({ body: "another #ace", like_count: 3, comment_count: 1 }),
      row({ body: "#birdie run" }),
    ]);
    expect(result.tags[0]).toEqual({ tag: "ace", count: 6 });
    expect(result.tags.map((t) => t.tag)).toContain("birdie");
  });

  it("aggregates tagged course names and trims whitespace", () => {
    const result = computeTrending([
      row({ course_name: " Maple Hill " }),
      row({ course_name: "Maple Hill", like_count: 2 }),
      row({ course_name: "Westwood" }),
    ]);
    expect(result.courses[0]).toEqual({ name: "Maple Hill", count: 4 });
    expect(result.courses).toHaveLength(2);
  });

  it("respects the requested limit", () => {
    const rows = ["a1", "b2", "c3", "d4"].map((t) => row({ body: `#${t}` }));
    expect(computeTrending(rows, 2).tags).toHaveLength(2);
  });
});
