import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  setSession: vi.fn(), exchangeCodeForSession: vi.fn(), verifyOtp: vi.fn(),
  getSession: vi.fn(), onAuthStateChange: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
import { consumePostLoginPath, persistSessionFromUrl, rememberPostLoginPath, waitForAuthSession } from "../auth-flow";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    location: { pathname: "/auth-callback", search: "", hash: "" },
    history: { state: null, replaceState: vi.fn() },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  vi.stubGlobal("document", { title: "Completing sign in" });
});
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("Supabase OAuth callback", () => {
  it("saves an implicit OAuth session and removes credentials from the URL", async () => {
    window.location.hash = "#access_token=access&refresh_token=refresh";
    const session = { user: { id: "test-user" } };
    auth.setSession.mockResolvedValue({ data: { session }, error: null });
    expect(await persistSessionFromUrl()).toBe(session);
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "Completing sign in", "/auth-callback");
  });

  it("rejects provider errors instead of returning an old signed-in session", async () => {
    window.location.hash = "#error=access_denied&error_description=Denied";
    await expect(waitForAuthSession()).rejects.toThrow("cancelled or rejected");
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it("retains the intended page across the redirect and consumes it once", () => {
    rememberPostLoginPath("/courses?q=ponds");
    expect(consumePostLoginPath()).toBe("/courses?q=ponds");
    expect(consumePostLoginPath()).toBe("/play");
  });

  it.each(["https://other.example", "//other.example", "/\\other.example", "/auth-callback"])(
    "does not forward to an unsafe or looping destination: %s", (path) => {
      rememberPostLoginPath(path);
      expect(consumePostLoginPath()).toBe("/play");
    },
  );
});
