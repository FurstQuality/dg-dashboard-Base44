import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { StudioConfiguration } from "../app-sandbox";

const state = vi.hoisted(() => ({
  vault: { version: 1, connections: { github: { token: "private-provider-token" } } } as Record<
    string,
    any
  >,
  available: true,
}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockRejectedValue(new Error("No report")),
}));
vi.mock("../admin-connections-store.server", () => ({
  connectionStorageStatus: () => ({
    available: state.available,
    message: "Private storage required",
  }),
  configuredConnectionStore: () =>
    state.available
      ? {
          read: async () => state.vault,
          update: async (change: (vault: typeof state.vault) => void) => {
            change(state.vault);
            return state.vault;
          },
        }
      : null,
}));
import {
  checkStudioPreview,
  readStudioSettings,
  saveStudioConfiguration,
} from "../app-studio.server";

const config: StudioConfiguration = {
  previewOrigin: "http://127.0.0.1:5190",
  liveOrigin: "https://live.example",
  previewDatabaseOrigin: "https://draft.supabase.co",
  productionDatabaseOrigin: "https://live.supabase.co",
  base44Workspace: "Mikes workspace",
  base44AppUrl: "https://app.base44.com/apps/example/editor",
  revision: 0,
};
beforeEach(() => {
  state.vault = { version: 1, connections: { github: { token: "private-provider-token" } } };
  state.available = true;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("app studio configuration", () => {
  it("preserves provider secrets and rejects stale saves", async () => {
    await saveStudioConfiguration(config);
    const saved = await readStudioSettings();
    expect(saved).toMatchObject({
      base44Workspace: "Mikes workspace",
      revision: 1,
      previewDatabaseOrigin: config.previewDatabaseOrigin,
    });
    expect(JSON.stringify(saved)).not.toContain("private-provider-token");
    await expect(
      saveStudioConfiguration({ ...config, base44Workspace: "Wrong workspace" }),
    ).rejects.toThrow("changed");
    expect(state.vault.studio.base44Workspace).toBe("Mikes workspace");
    expect(state.vault.connections.github.token).toBe("private-provider-token");
  });
  it("rejects live app/database overlap and incorrect Base44 targets before writing", async () => {
    for (const input of [
      { ...config, previewOrigin: config.liveOrigin },
      { ...config, previewDatabaseOrigin: config.productionDatabaseOrigin },
      { ...config, previewOrigin: "https://user:password@example.com" },
      { ...config, base44AppUrl: "https://app.base44.com.evil.example/apps/example/editor" },
    ])
      await expect(saveStudioConfiguration(input)).rejects.toThrow();
    expect(state.vault.studio).toBeUndefined();
  });
  it("fails closed without private persistent storage", async () => {
    state.available = false;
    await expect(saveStudioConfiguration(config)).rejects.toThrow("Private storage required");
    expect((await readStudioSettings()).storageAvailable).toBe(false);
  });
  it("removes URL query credentials from saved destinations", async () => {
    await saveStudioConfiguration({
      ...config,
      previewOrigin: config.previewOrigin + "/courses?token=private",
      base44AppUrl: config.base44AppUrl + "?token=private#fragment",
    });
    const saved = await readStudioSettings();
    expect(saved.previewOrigin).toBe(config.previewOrigin);
    expect(saved.base44AppUrl).toBe(config.base44AppUrl);
  });
});

describe("preview readiness", () => {
  it("requires configured isolation before making a request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect((await checkStudioPreview()).ready).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies the running draft database and disallows redirects", async () => {
    await saveStudioConfiguration(config);
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          kind: "dgd-sandbox",
          isolated: true,
          databaseOrigin: config.previewDatabaseOrigin,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    expect((await checkStudioPreview()).ready).toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      config.previewOrigin + "/api/public/preview-status",
      expect.objectContaining({ redirect: "error" }),
    );
  });
  it("blocks production, unexpected, unisolated and oversized responses", async () => {
    await saveStudioConfiguration(config);
    for (const body of [
      { kind: "dgd-sandbox", isolated: true, databaseOrigin: config.productionDatabaseOrigin },
      { kind: "dgd-sandbox", isolated: true, databaseOrigin: "https://other.supabase.co" },
      { kind: "dgd-sandbox", isolated: false, databaseOrigin: config.previewDatabaseOrigin },
      { kind: "app", isolated: true, databaseOrigin: config.previewDatabaseOrigin },
      {
        kind: "dgd-sandbox",
        isolated: true,
        databaseOrigin: config.previewDatabaseOrigin,
        padding: "x".repeat(9000),
      },
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
      expect((await checkStudioPreview()).ready).toBe(false);
    }
  });
});
