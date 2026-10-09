import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  connectionCredentialIssue,
  normalizeProject,
  normalizeRepository,
  parseConnectionInput,
} from "../admin-connections";
import { ConnectionStore } from "../admin-connections-store.server";
import {
  activeManagementToken,
  probeConnection,
  readConnectionSettings,
  saveConnectionSettings,
  testSavedConnection,
} from "../admin-connections.server";
import { operationsOverview, readGitStatus } from "../admin-operations.server";

const source = "abcdefghijklmnopqrst";
const target = "aosklgewcakrhuxdynik";
let directory: string;
let key: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "dgd-connections-test-"));
  key = randomBytes(32).toString("base64");
  vi.stubEnv("ADMIN_CONNECTIONS_DIRECTORY", directory);
  vi.stubEnv("ADMIN_CONNECTIONS_ENCRYPTION_KEY", key);
  vi.stubEnv("SUPABASE_URL", `https://${source}.supabase.co`);
  vi.stubEnv("SUPABASE_MANAGEMENT_TOKEN", "");
  vi.stubEnv("GITHUB_REPOSITORY", "");
  vi.stubEnv("GITHUB_TOKEN", "");
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
const githubInput = (overrides = {}) => ({
  provider: "github" as const,
  target: "FurstQuality/Disc-Golf-Dashboard",
  branch: "",
  token: "github_pat_private_test_token",
  removeToken: false,
  revision: 0,
  ...overrides,
});

describe("connection targets and token input", () => {
  it("accepts GitHub tokens and Supabase account tokens only in their matching fields", () => {
    for (const token of ["github_pat_test_value", "ghp_test_value", "ghs_test_value"])
      expect(connectionCredentialIssue("github", token)).toBeNull();
    for (const token of ["sbp_test_value", "sbp_fc_scoped_test_value"])
      expect(connectionCredentialIssue("supabase", token)).toBeNull();
  });
  it.each([
    ["github", "sb_publishable_private_fixture_value", "publishable API key"],
    ["github", "sb_secret_private_fixture_value", "secret API key"],
    ["github", "sbp_private_fixture_value", "Supabase personal access token"],
    [
      "github",
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
      "JWT/project API key",
    ],
    ["supabase", "sb_publishable_private_fixture_value", "publishable API key"],
    ["supabase", "sb_secret_private_fixture_value", "secret API key"],
    [
      "supabase",
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
      "JWT/project API key",
    ],
    ["supabase", "github_pat_private_fixture_value", "GitHub access token"],
  ] as const)(
    "blocks %s credential mix-ups without echoing the submitted value",
    (provider, token, description) => {
      const issue = connectionCredentialIssue(provider, token);
      expect(issue).toContain(description);
      expect(issue).not.toContain(token);
      expect(() =>
        parseConnectionInput(
          githubInput({
            provider,
            token,
            target: provider === "github" ? "FurstQuality/Disc-Golf-Dashboard" : target,
          }),
        ),
      ).toThrow(description);
    },
  );
  it("explains unknown credential formats and Bearer wrappers without reflecting input", () => {
    expect(connectionCredentialIssue("github", "a-repository-secret")).toContain("github_pat_");
    expect(connectionCredentialIssue("supabase", "Bearer sbp_private_fixture")).toContain(
      "without the Bearer prefix",
    );
  });
  it("accepts the user's supplied repository and Supabase URLs", () => {
    expect(normalizeRepository("https://github.com/FurstQuality/Disc-Golf-Dashboard.git")).toBe(
      "FurstQuality/Disc-Golf-Dashboard",
    );
    expect(
      normalizeProject(`https://supabase.com/dashboard/project/${target}/settings/integration`),
    ).toBe(target);
    expect(normalizeProject(`https://${target}.supabase.co`)).toBe(target);
  });
  it("rejects external hosts, credentials, queries, invalid targets and header injection", () => {
    for (const value of [
      "https://github.com.evil.test/a/b",
      "https://user:secret@github.com/a/b",
      "https://github.com/a/b?token=private",
      "a/..",
      "https://127.0.0.1/a/b",
    ])
      expect(() => normalizeRepository(value)).toThrow();
    for (const value of [
      "https://supabase.com.evil.test/dashboard/project/" + target,
      "https://127.0.0.1",
      "bad",
      `https://${target}.supabase.co?secret=value`,
    ])
      expect(() => normalizeProject(value)).toThrow();
    expect(() => parseConnectionInput(githubInput({ token: "secret\r\nInjected:header" }))).toThrow(
      "Check the connection fields",
    );
    expect(() => parseConnectionInput(githubInput({ branch: "../other" }))).toThrow();
  });
});

describe("encrypted connection persistence", () => {
  it("identifies an already saved wrong key, preserves it until corrected, and never sends it to GitHub", async () => {
    const store = new ConnectionStore({ directory, key, local: false });
    await store.update((vault) => {
      vault.connections.github = {
        target: "FurstQuality/Disc-Golf-Dashboard",
        branch: "main",
        token: "sb_publishable_saved_wrong_key",
        revision: 1,
        updatedAt: "now",
        updatedBy: "admin",
        lastCheck: null,
      };
    });
    const view = (await readConnectionSettings()).connections.github;
    expect(view.credentialIssue).toContain("Supabase publishable API key");
    expect(JSON.stringify(view)).not.toContain("sb_publishable_saved_wrong_key");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    expect((await testSavedConnection("github", 1)).lastCheck?.message).toContain(
      "Supabase publishable API key",
    );
    await expect(readGitStatus()).rejects.toThrow("Supabase publishable API key");
    expect(request).not.toHaveBeenCalled();
    await expect(
      saveConnectionSettings(githubInput({ token: "", revision: 1 }), "admin"),
    ).rejects.toThrow("Supabase publishable API key");
    expect((await store.read()).connections.github?.token).toBe("sb_publishable_saved_wrong_key");
    const fixed = await saveConnectionSettings(githubInput({ revision: 1 }), "admin");
    expect(fixed.credentialIssue).toBeNull();
    expect(fixed.lastCheck).toBeNull();
  });
  it("allows removal of a saved wrong credential", async () => {
    const store = new ConnectionStore({ directory, key, local: false });
    await store.update((vault) => {
      vault.connections.supabase = {
        target,
        branch: "",
        token: "sb_secret_wrong_purpose",
        revision: 1,
        updatedAt: "now",
        updatedBy: "admin",
        lastCheck: null,
      };
    });
    const removed = await saveConnectionSettings(
      { ...githubInput(), provider: "supabase", target, token: "", revision: 1, removeToken: true },
      "admin",
    );
    expect(removed.tokenPresent).toBe(false);
    expect(removed.credentialIssue).toBeNull();
  });
  it("creates and reuses a development key without returning it", async () => {
    const store = new ConnectionStore({ directory, local: true });
    await store.update((vault) => {
      vault.connections.github = {
        target: "FurstQuality/repo",
        branch: "",
        token: "local-only-token",
        revision: 1,
        updatedAt: "now",
        updatedBy: "admin",
        lastCheck: null,
      };
    });
    expect(Buffer.from(await readFile(join(directory, "key"), "utf8"), "base64")).toHaveLength(32);
    expect(
      (await new ConnectionStore({ directory, local: true }).read()).connections.github?.token,
    ).toBe("local-only-token");
    expect(await readFile(join(directory, "connections.enc"), "utf8")).not.toContain(
      "local-only-token",
    );
  });
  it("round trips across store instances without returning or writing plaintext tokens", async () => {
    const saved = await saveConnectionSettings(githubInput(), "admin-one");
    expect(saved.tokenPresent).toBe(true);
    expect(saved.tokenSource).toBe("saved");
    expect(JSON.stringify(saved)).not.toContain("github_pat_private_test_token");
    const disk = await readFile(join(directory, "connections.enc"), "utf8");
    expect(disk).not.toContain("github_pat_private_test_token");
    expect(disk).not.toContain("FurstQuality");
    const second = new ConnectionStore({ directory, key, local: false });
    expect((await second.read()).connections.github?.token).toBe("github_pat_private_test_token");
    expect(JSON.stringify(await readConnectionSettings())).not.toContain(
      "github_pat_private_test_token",
    );
    const overview = await operationsOverview();
    expect(overview.connectors.find((c) => c.id === "github")?.configured).toBe(true);
  });
  it("keeps a blank token, replaces it deliberately, and clears it on removal or target change", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    await saveConnectionSettings(
      githubInput({ token: "", branch: "staging", revision: 1 }),
      "admin",
    );
    const store = new ConnectionStore({ directory, key, local: false });
    expect((await store.read()).connections.github?.token).toBe("github_pat_private_test_token");
    await saveConnectionSettings(githubInput({ token: "ghp_replacement", revision: 2 }), "admin");
    expect((await store.read()).connections.github?.token).toBe("ghp_replacement");
    await saveConnectionSettings(
      githubInput({ token: "", removeToken: true, revision: 3 }),
      "admin",
    );
    expect((await store.read()).connections.github?.token).toBe("");
    await saveConnectionSettings(githubInput({ revision: 4 }), "admin");
    const moved = await saveConnectionSettings(
      githubInput({ token: "", target: "FurstQuality/another", revision: 5 }),
      "admin",
    );
    expect(moved.tokenPresent).toBe(false);
    expect(moved.lastCheck).toBeNull();
  });
  it("preserves both providers and rejects stale writes", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    await saveConnectionSettings(
      { ...githubInput(), provider: "supabase", target, token: "sbp_scoped-test-token" },
      "admin",
    );
    await expect(saveConnectionSettings(githubInput(), "second-admin")).rejects.toThrow(
      "Another admin",
    );
    const settings = await readConnectionSettings();
    expect(settings.connections.github.revision).toBe(1);
    expect(settings.connections.supabase.target).toBe(target);
  });
  it("fails closed and preserves a vault if its encryption key changes", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    const before = await readFile(join(directory, "connections.enc"), "utf8");
    vi.stubEnv("ADMIN_CONNECTIONS_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
    await expect(saveConnectionSettings(githubInput({ revision: 1 }), "admin")).rejects.toThrow(
      "could not be decrypted",
    );
    expect(await readFile(join(directory, "connections.enc"), "utf8")).toBe(before);
  });
  it("detects tampered ciphertext and never silently overwrites it", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    const path = join(directory, "connections.enc");
    const bytes = Buffer.from(await readFile(path, "utf8"), "base64");
    bytes[30] ^= 1;
    await writeFile(path, bytes.toString("base64"));
    await expect(readConnectionSettings()).rejects.toThrow("could not be decrypted");
  });
  it("has no implicit database or environment cutover when saving a destination", async () => {
    vi.stubEnv("SUPABASE_MANAGEMENT_TOKEN", "sbp_source_only_token");
    await saveConnectionSettings(
      { ...githubInput(), provider: "supabase", target, token: "sbp_destination_only_token" },
      "admin",
    );
    expect(await activeManagementToken()).toBe("sbp_source_only_token");
    expect(process.env.SUPABASE_URL).toBe(`https://${source}.supabase.co`);
    await saveConnectionSettings(
      {
        ...githubInput(),
        provider: "supabase",
        target: source,
        token: "sbp_new_source_token",
        revision: 1,
      },
      "admin",
    );
    expect(await activeManagementToken()).toBe("sbp_new_source_token");
  });
  it("refuses hosted persistence without an explicitly configured key and private directory", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ADMIN_CONNECTIONS_DIRECTORY", "");
    expect((await readConnectionSettings()).storage.available).toBe(false);
    await expect(saveConnectionSettings(githubInput(), "admin")).rejects.toThrow("persistent");
  });
  it("does not persist connection credentials in Base44's temporary Worker filesystem", async () => {
    vi.stubEnv("DGD_HOSTED_RUNTIME", "base44");
    expect((await readConnectionSettings()).storage.available).toBe(false);
    await expect(saveConnectionSettings(githubInput(), "admin")).rejects.toThrow("persistent");
  });
});

describe("provider checks", () => {
  it("tests the selected GitHub branch and persists only safe metadata", async () => {
    await saveConnectionSettings(githubInput({ branch: "codex/setup" }), "admin");
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ private: true, default_branch: "main", temp_clone_token: "hidden" }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ sha: "abc123", irrelevant: "github_pat_private_test_token" }),
        ),
      );
    vi.stubGlobal("fetch", request);
    const checked = await testSavedConnection("github", 1);
    expect(checked.lastCheck?.ok).toBe(true);
    expect(request.mock.calls[1][0]).toBe(
      "https://api.github.com/repos/FurstQuality/Disc-Golf-Dashboard/commits/codex%2Fsetup",
    );
    for (const call of request.mock.calls)
      expect(call[1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(JSON.stringify(checked)).not.toContain("github_pat_private_test_token");
    expect((await readConnectionSettings()).connections.github.lastCheck?.ok).toBe(true);
    await saveConnectionSettings(
      githubInput({ branch: "another", token: "", revision: 1 }),
      "admin",
    );
    expect((await readConnectionSettings()).connections.github.lastCheck).toBeNull();
  });
  it("checks the exact Supabase project through the management API", async () => {
    await saveConnectionSettings(
      { ...githubInput(), provider: "supabase", target, token: "sbp_test" },
      "admin",
    );
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: target,
          name: "DG Dashboard",
          status: "ACTIVE_HEALTHY",
          region: "us-east-1",
          database: { password: "do-not-return" },
        }),
      ),
    );
    vi.stubGlobal("fetch", request);
    const checked = await testSavedConnection("supabase", 1);
    expect(request.mock.calls[0][0]).toBe(`https://api.supabase.com/v1/projects/${target}`);
    expect(checked.lastCheck?.details.Project).toBe("DG Dashboard");
    expect(JSON.stringify(checked)).not.toContain("do-not-return");
    expect(checked.lastCheck?.message).toContain("separate checks");
  });
  it("retains settings and gives actionable errors without echoing provider bodies", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("github_pat_private_test_token", { status: 403 })),
    );
    const checked = await testSavedConnection("github", 1);
    expect(checked.lastCheck?.ok).toBe(false);
    expect(checked.lastCheck?.message).toContain("HTTP 403");
    expect(JSON.stringify(checked)).not.toContain("github_pat_private_test_token");
    expect(checked.tokenPresent).toBe(true);
  });
  it("uses the saved GitHub connection in the existing Git status page", async () => {
    await saveConnectionSettings(githubInput(), "admin");
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ default_branch: "main" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sha: "abc123" })));
    vi.stubGlobal("fetch", request);
    const result = await readGitStatus();
    expect(result.rows[0].repository).toBe("FurstQuality/Disc-Golf-Dashboard");
    expect(result.rows[0].remote_commit).toBe("abc123");
  });
  it("never contacts a provider without a token and redacts network failures", async () => {
    const request = vi.fn().mockRejectedValue(new Error("leaked-credential"));
    vi.stubGlobal("fetch", request);
    const store = {
      target: "FurstQuality/repo",
      token: "",
      branch: "",
      revision: 1,
      updatedAt: "",
      updatedBy: "",
      lastCheck: null,
    };
    expect((await probeConnection("github", store)).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(
      (await probeConnection("github", { ...store, token: "ghp_secret" })).message,
    ).not.toContain("leaked-credential");
  });
});
