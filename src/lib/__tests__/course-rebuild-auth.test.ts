import { beforeEach, describe, expect, it, vi } from "vitest";
const admin = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: admin }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({
  middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; },
}) }));
import { rebuildCourseModels } from "../course-fit.functions";
beforeEach(() => vi.clearAllMocks());
describe("global rebuild authorization", () => {
  for (const roleResult of [{ data: false, error: null }, { data: true, error: {} }, { data: "true", error: null }]) {
    it(`fails closed for ${JSON.stringify(roleResult)}`, async () => {
      await expect((rebuildCourseModels as any)({ context: { userId: "user", supabase: { rpc: vi.fn(async () => roleResult) } } })).rejects.toThrow("super admin");
      expect(admin.rpc).not.toHaveBeenCalled();
    });
  }
  it("permits the database-verified super admin", async () => {
    admin.rpc.mockResolvedValue({ data: 2, error: null });
    expect(await (rebuildCourseModels as any)({ context: { userId: "admin", supabase: { rpc: vi.fn(async () => ({ data: true, error: null })) } } })).toEqual({ coursesRefreshed: 2, layoutsRefreshed: 2 });
  });
});
