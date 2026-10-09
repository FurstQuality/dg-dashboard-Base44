import { describe, it, expect } from "vitest";
import { parseUdiscPhoto, parseUdiscIdentity } from "@/lib/profile-photo.server";

const html = `
<meta property="og:title" content="Furst (@furst93) | UDisc Community"/>
<div class="sentry-block relative rounded-full ring-4"><img class="h-full w-full rounded-full" src="https://d22ksth68ujgu2.cloudfront.net/abc_5f70_player_20221017030031.jpg" alt="Furst"/></div>
<img src="/images/app-store-badge.svg" alt="Apple App Store"/>
`;

describe("UDisc share-link profile parsing", () => {
  it("reads the avatar from the UDisc image CDN", () => {
    expect(parseUdiscPhoto(html)).toBe(
      "https://d22ksth68ujgu2.cloudfront.net/abc_5f70_player_20221017030031.jpg",
    );
  });

  it("reads display name and username", () => {
    expect(parseUdiscIdentity(html)).toEqual({ displayName: "Furst", username: "furst93" });
  });

  it("returns null when no member photo is present", () => {
    expect(parseUdiscPhoto('<img src="/images/google-play-badge.svg"/>')).toBeNull();
  });
});
