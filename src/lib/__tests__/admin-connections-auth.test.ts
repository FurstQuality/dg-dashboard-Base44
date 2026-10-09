import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  readConnectionSettings: vi.fn(),
  saveConnectionSettings: vi.fn(),
  testSavedConnection: vi.fn(),
}));
vi.mock("../admin-connections.server", () => store);
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: ((input: unknown) => unknown) | undefined;
    return {
      middleware() {
        return this;
      },
      inputValidator(fn: (input: unknown) => unknown) {
        validate = fn;
        return this;
      },
      handler(fn: (input: unknown) => unknown) {
        return (input: { context: unknown; data?: unknown }) =>
          fn({ ...input, data: validate ? validate(input.data) : input.data });
      },
    };
  },
}));

import {
  getAdminConnections,
  saveAdminConnection,
  testAdminConnection,
} from "../admin-connections.functions";

beforeEach(() => vi.clearAllMocks());
const input = { provider: "github", target: "FurstQuality/Disc-Golf-Dashboard", revision: 0 };

describe("connection action authorization", () => {
  for (const [name, action, data] of [
    ["read", getAdminConnections, undefined],
    ["save", saveAdminConnection, input],
    ["test", testAdminConnection, { provider: "github", revision: 0 }],
  ] as const) {
    it(`blocks ${name} before touching credentials when the database denies the admin role`, async () => {
      const context = {
        userId: "regular-user",
        supabase: { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) },
      };
      await expect(
        (action as unknown as (input: unknown) => Promise<unknown>)({ context, data }),
      ).rejects.toThrow("super admin");
      expect(store.readConnectionSettings).not.toHaveBeenCalled();
      expect(store.saveConnectionSettings).not.toHaveBeenCalled();
      expect(store.testSavedConnection).not.toHaveBeenCalled();
    });
  }
  it("records the verified caller on an authorized save", async () => {
    const context = {
      userId: "verified-admin",
      supabase: { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) },
    };
    await (saveAdminConnection as unknown as (input: unknown) => Promise<unknown>)({
      context,
      data: input,
    });
    expect(store.saveConnectionSettings).toHaveBeenCalledWith(
      expect.objectContaining(input),
      "verified-admin",
    );
  });
});
