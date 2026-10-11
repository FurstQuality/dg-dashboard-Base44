import { describe, expect, it } from "vitest";
import { previewPageRedirect } from "../preview-page-redirect";

describe("imported app preview routing", () => {
  it.each([
    ["/ForgotPassword", "/auth?mode=forgot"],
    ["/Login", "/auth"],
    ["/Register", "/auth?mode=signup"],
    ["/ResetPassword?code=example", "/reset-password?code=example"],
    ["/OAuthConsent?authorization_id=example", "/.lovable/oauth/consent?authorization_id=example"],
  ])("connects scaffold address %s to the real app", (source, destination) => {
    const response = previewPageRedirect(new Request(`https://preview.example${source}`));
    expect(response?.status).toBe(307);
    expect(response?.headers.get("Location")).toBe(destination);
    expect(response?.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("leaves actual app routes and user actions unchanged", () => {
    for (const path of ["/", "/auth", "/play", "/_serverFn/test", "/unknown"])
      expect(previewPageRedirect(new Request(`https://preview.example${path}`))).toBeNull();
    expect(previewPageRedirect(new Request("https://preview.example/Login", { method: "POST" }))).toBeNull();
  });
});