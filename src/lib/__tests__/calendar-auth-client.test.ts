import { afterEach, describe, expect, it, vi } from "vitest";
const create = vi.hoisted(() => vi.fn((_url: string, _key: string, _options: any) => ({ auth: {} })));
vi.mock("@supabase/supabase-js", () => ({ createClient: create }));
vi.mock("@/integrations/supabase/previewAuthStorage", () => ({ brokeredPreviewStorage: () => undefined }));
vi.mock("@/lib/public-supabase-key", () => ({ assertBrowserSupabaseKey: () => {} }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); create.mockClear(); });
describe("separate Calendar and sign-in callbacks", () => {
  it.each([["/google-calendar-callback", false], ["/auth-callback", true], ["/auth", true]])("initializes Supabase detection correctly on %s", async (pathname, detect) => {
    vi.resetModules(); vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    vi.stubGlobal("window", { location: { pathname } });
    const { supabase } = await import("@/integrations/supabase/client");
    void supabase.auth;
    expect(create.mock.calls[0]?.[2]?.auth.detectSessionInUrl).toBe(detect);
  });
});
