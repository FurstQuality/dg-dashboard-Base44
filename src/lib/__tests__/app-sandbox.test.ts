import { describe, it, expect } from "vitest";
import { appOrigin, previewAddress, previewRoutePath, sandboxSettings } from "../app-sandbox";
import { sandboxRuntimeStatus } from "../sandbox-runtime";
describe("sandbox preview boundaries", () => {
  it("accepts HTTPS and loopback previews without carrying credentials or paths", () => {
    expect(appOrigin("http://127.0.0.1:5190/courses")).toBe("http://127.0.0.1:5190");
    expect(appOrigin("https://preview.example.com/courses")).toBe("https://preview.example.com");
    expect(appOrigin("https://user:secret@example.com")).toBeNull();
    expect(appOrigin("http://public.example.com")).toBeNull();
    expect(appOrigin("javascript:alert(1)")).toBeNull();
  });
  it("refuses navigation outside the selected preview and recursive embedding", () => {
    const origin = "http://127.0.0.1:5190";
    expect(previewAddress(origin, "/courses?q=park")).toBe(origin + "/courses?q=park");
    for (const path of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "/admin/sandbox/",
      "/admin/sandbox?foo=1",
    ])
      expect(() => previewAddress(origin, path)).toThrow();
  });
  it("never presents the live origin as a draft preview or exports secrets", () => {
    const data = sandboxSettings({
      PUBLIC_APP_URL: "https://live.example",
      SANDBOX_PREVIEW_URL: "https://live.example",
      GITHUB_TOKEN: "secret",
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    });
    expect(data.previewOrigin).toBeNull();
    expect(JSON.stringify(data)).not.toContain("secret");
    expect(data.deployedCommit).toBeNull();
  });
  it("does not label sandbox's own PUBLIC_APP_URL as live", () => {
    expect(
      sandboxSettings({ DGD_SANDBOX: "1", PUBLIC_APP_URL: "http://127.0.0.1:5190" }).liveOrigin,
    ).toBeNull();
  });
  it("never relays OAuth codes, tokens or fragments through preview navigation", () => {
    expect(
      previewRoutePath(
        "/courses?q=park&access_token=private&code=private&api_key=private#token=private",
      ),
    ).toBe("/courses?q=park");
  });
  it("requires server and browser to share a draft database distinct from known production", () => {
    const env = {
      DGD_SANDBOX: "1",
      SUPABASE_URL: "https://draft.supabase.co",
      VITE_SUPABASE_URL: "https://draft.supabase.co",
      DGD_PRODUCTION_SUPABASE_URL: "https://live.supabase.co",
    };
    expect(sandboxRuntimeStatus(env).isolated).toBe(true);
    for (const override of [
      { DGD_SANDBOX: "0" },
      { DGD_PRODUCTION_SUPABASE_URL: "" },
      { SUPABASE_URL: "https://live.supabase.co" },
      { VITE_SUPABASE_URL: "https://other.supabase.co" },
      { DGD_PRODUCTION_SUPABASE_URL: env.SUPABASE_URL },
    ]) {
      expect(sandboxRuntimeStatus({ ...env, ...override }).isolated).toBe(false);
    }
  });
});
