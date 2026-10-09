import { beforeEach, describe, expect, it, vi } from "vitest";
const backend = vi.hoisted(() => ({
  readStudioSettings: vi.fn(),
  saveStudioConfiguration: vi.fn(),
  checkStudioPreview: vi.fn(),
}));
vi.mock("../app-studio.server", () => backend);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: ((input: unknown) => unknown) | undefined;
    return {
      middleware() {
        return this;
      },
      inputValidator(fn: typeof validator) {
        validator = fn;
        return this;
      },
      handler(fn: (input: unknown) => unknown) {
        return (input: { context: unknown; data?: unknown }) =>
          fn({ ...input, data: validator ? validator(input.data) : input.data });
      },
    };
  },
}));
import {
  getSandboxSettings,
  saveSandboxSettings,
  checkSandboxPreview,
} from "../app-sandbox.functions";
const config = {
  previewOrigin: "",
  liveOrigin: "",
  previewDatabaseOrigin: "",
  productionDatabaseOrigin: "",
  base44AppUrl: "",
  base44Workspace: "Mikes workspace",
  revision: 0,
};
beforeEach(() => vi.clearAllMocks());
describe("studio server authorization", () => {
  for (const [name, fn, data] of [
    ["read", getSandboxSettings, undefined],
    ["save", saveSandboxSettings, config],
    ["check", checkSandboxPreview, undefined],
  ] as const) {
    it(`requires a verified super admin for ${name}`, async () => {
      for (const result of [
        { data: false, error: null },
        { data: true, error: new Error("DB failed") },
        { data: "true", error: null },
      ]) {
        const context = { userId: "user", supabase: { rpc: vi.fn().mockResolvedValue(result) } };
        await expect(
          (fn as unknown as (input: unknown) => Promise<unknown>)({ context, data }),
        ).rejects.toThrow("super admin");
      }
      Object.values(backend).forEach((mock) => expect(mock).not.toHaveBeenCalled());
    });
  }
  it("allows an authorized admin to save the requested workspace", async () => {
    const context = {
      userId: "admin",
      supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) },
    };
    await (saveSandboxSettings as unknown as (input: unknown) => Promise<unknown>)({
      context,
      data: config,
    });
    expect(backend.saveStudioConfiguration).toHaveBeenCalledWith(config);
  });
});
