import { describe, expect, it } from "vitest";
import { publicAppOrigin } from "../public-app-origin.server";

describe("trusted invitation origins", () => {
  it("uses the configured app, without accepting request headers or an old fallback", () => {
    expect(
      publicAppOrigin({
        PUBLIC_APP_URL: "https://example.com/",
        HOST: "attacker.example",
        HTTP_X_FORWARDED_HOST: "attacker.example",
      }),
    ).toBe("https://example.com");
    expect(() => publicAppOrigin({ HOST: "attacker.example" })).toThrow("Set PUBLIC_APP_URL");
  });
  it.each([
    "not-a-url",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/other-app",
    "https://example.com/?next=attacker",
    "https://example.com/#preview",
    "javascript:alert(1)",
    "http://127.0.0.1:5180",
  ])("rejects unsafe or ambiguous published origins", (PUBLIC_APP_URL) => {
    expect(() => publicAppOrigin({ PUBLIC_APP_URL, NODE_ENV: "production" })).toThrow(
      "HTTPS origin",
    );
  });
  it("permits HTTP loopback only for explicit local development", () => {
    expect(
      publicAppOrigin({ PUBLIC_APP_URL: "http://127.0.0.1:5180/", NODE_ENV: "development" }),
    ).toBe("http://127.0.0.1:5180");
    expect(() =>
      publicAppOrigin({ PUBLIC_APP_URL: "http://example.com", NODE_ENV: "development" }),
    ).toThrow();
  });
});
