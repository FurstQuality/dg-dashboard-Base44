import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectorReadiness } from "../admin-operations";
import {
  assertOperationsAdmin,
  management,
  operationsOverview,
  readCloudResource,
  readSql,
  projectRef,
} from "../admin-operations.server";

beforeEach(() => {
  // Never read the developer's real connection vault in a unit test.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_CONNECTIONS_DIRECTORY", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const setup = () => {
  vi.stubEnv("SUPABASE_URL", "https://abcdefghijklmnopqrst.supabase.co");
  vi.stubEnv("SUPABASE_MANAGEMENT_TOKEN", "sbp_management_test_secret");
};
describe("admin operations authorization and provider isolation", () => {
  it("fails closed on role errors, missing role and nonboolean results", async () => {
    for (const response of [
      { data: false, error: null },
      { data: true, error: new Error("db failed") },
      { data: null, error: null },
      { data: "true", error: null },
    ]) {
      const rpc = vi.fn().mockResolvedValue(response);
      await expect(
        assertOperationsAdmin({ supabase: { rpc }, userId: "caller" } as never),
      ).rejects.toThrow("super admin");
      expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "caller", _role: "super_admin" });
    }
  });
  it("allows a verified super admin", async () => {
    await expect(
      assertOperationsAdmin({
        supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) },
        userId: "caller",
      } as never),
    ).resolves.toBeUndefined();
  });
  it("reports configuration presence without exposing values or claiming connectivity", async () => {
    setup();
    vi.stubEnv("GITHUB_TOKEN", "github_pat_test_secret");
    const overview = await operationsOverview();
    expect(JSON.stringify(overview)).not.toContain("sbp_management_test_secret");
    expect(JSON.stringify(overview)).not.toContain("github_pat_test_secret");
    expect(
      connectorReadiness({ SUPABASE_MANAGEMENT_TOKEN: "configured" }).find(
        (c) => c.id === "management",
      )?.state,
    ).toBe("configured");
    expect(connectorReadiness({}).find((c) => c.id === "search-console")?.state).toBe("setup");
  });
  it("only derives a project from a valid configured Supabase hostname", () => {
    expect(projectRef({ SUPABASE_URL: "https://attacker.example/path" } as never)).toBeNull();
    expect(projectRef({ SUPABASE_URL: "not-a-url" } as never)).toBeNull();
  });
  it("sends SQL with the provider read_only enforcement and never retries writes", async () => {
    setup();
    const request = vi.fn().mockResolvedValue(new Response("[]"));
    vi.stubGlobal("fetch", request);
    await readSql("delete from public.courses");
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      query: "delete from public.courses",
      read_only: true,
    });
    expect(request.mock.calls[0][0]).toBe(
      "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/database/query",
    );
    expect(request.mock.calls[0][1].redirect).toBe("error");
  });
  it("never returns secret values or digests from the provider's secret listing", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify([
              { name: "TEST_API_KEY", value: "private-secret-or-digest", updated_at: "2026-10-08" },
            ]),
          ),
        ),
    );
    const value = await readCloudResource("secrets");
    expect(value.rows).toEqual([
      { name: "TEST_API_KEY", updated_at: "2026-10-08", value: "Hidden" },
    ]);
    expect(JSON.stringify(value)).not.toContain("private-secret-or-digest");
  });
  it("does not leak provider error bodies containing credentials", async () => {
    setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("sbp_management_test_secret echoed here", { status: 403 })),
    );
    await expect(management("/functions")).rejects.toThrow("HTTP 403");
    await expect(management("/functions")).rejects.not.toThrow("sbp_management_test_secret");
  });
  it("does not make a request when management credentials are absent", async () => {
    vi.stubEnv("SUPABASE_MANAGEMENT_TOKEN", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(management("/functions")).rejects.toThrow("Configure");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
