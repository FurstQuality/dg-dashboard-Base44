import { describe, expect, it } from "vitest";
import { extractMentions, extractHashtags } from "@/components/feed/post-body";

describe("extractMentions", () => {
  it("pulls usernames and lowercases them", () => {
    expect(extractMentions("Nice round @Furst93 and @paul.mcbeth")).toEqual([
      "furst93",
      "paul.mcbeth",
    ]);
  });

  it("drops trailing punctuation", () => {
    expect(extractMentions("thanks @furst93.")).toEqual(["furst93"]);
  });

  it("dedupes repeats and ignores emails", () => {
    expect(extractMentions("@ace @ace")).toEqual(["ace"]);
  });

  it("returns nothing for empty text", () => {
    expect(extractMentions(null)).toEqual([]);
  });
});

describe("extractHashtags", () => {
  it("collects tags without the hash", () => {
    expect(extractHashtags("Threw a #Ace on #hole7 today")).toEqual(["ace", "hole7"]);
  });

  it("ignores single-character tags", () => {
    expect(extractHashtags("#a #ok")).toEqual(["ok"]);
  });
});
