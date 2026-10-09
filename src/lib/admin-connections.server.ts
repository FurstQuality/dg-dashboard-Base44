import {
  connectionCredentialIssue,
  normalizeProject,
  normalizeRepository,
  parseConnectionInput,
  type ConnectionCheck,
  type ConnectionInput,
  type ConnectionProvider,
  type ConnectionSettings,
  type ConnectionView,
} from "./admin-connections";
import {
  configuredConnectionStore,
  connectionStorageStatus,
  type StoredConnection,
} from "./admin-connections-store.server";

export function activeConnectionProject(): string | null {
  try {
    return normalizeProject(process.env.SUPABASE_URL ?? "");
  } catch {
    return null;
  }
}

function environmentConnection(provider: ConnectionProvider): StoredConnection | undefined {
  try {
    const target =
      provider === "github"
        ? normalizeRepository(process.env.GITHUB_REPOSITORY ?? "")
        : process.env.SUPABASE_MANAGEMENT_TOKEN
          ? activeConnectionProject()
          : null;
    if (!target) return undefined;
    return {
      target,
      branch: provider === "github" ? (process.env.GITHUB_BRANCH ?? "") : "",
      token:
        (provider === "github"
          ? process.env.GITHUB_TOKEN
          : process.env.SUPABASE_MANAGEMENT_TOKEN) ?? "",
      revision: 0,
      updatedAt: "",
      updatedBy: "environment",
      lastCheck: null,
    };
  } catch {
    return undefined;
  }
}

function publicConnection(provider: ConnectionProvider, value?: StoredConnection): ConnectionView {
  return {
    provider,
    target: value?.target ?? "",
    branch: value?.branch ?? "",
    revision: value?.revision ?? 0,
    saved: !!value?.revision,
    tokenPresent: !!value?.token,
    tokenSource: value?.token ? (value.revision ? "saved" : "environment") : null,
    credentialIssue: connectionCredentialIssue(provider, value?.token ?? ""),
    updatedAt: value?.updatedAt || null,
    lastCheck: value?.lastCheck ?? null,
  };
}

export async function readConfiguredConnection(
  provider: ConnectionProvider,
): Promise<StoredConnection | undefined> {
  const vault = await configuredConnectionStore()?.read();
  return vault?.connections[provider] ?? environmentConnection(provider);
}

export async function readConnectionSettings(): Promise<ConnectionSettings> {
  const vault = await configuredConnectionStore()?.read();
  return {
    storage: connectionStorageStatus(),
    activeProject: activeConnectionProject(),
    connections: {
      github: publicConnection(
        "github",
        vault?.connections.github ?? environmentConnection("github"),
      ),
      supabase: publicConnection(
        "supabase",
        vault?.connections.supabase ?? environmentConnection("supabase"),
      ),
    },
  };
}

export async function saveConnectionSettings(
  input: ConnectionInput,
  userId: string,
): Promise<ConnectionView> {
  const data = parseConnectionInput(input);
  const store = configuredConnectionStore();
  if (!store) throw new Error(connectionStorageStatus().message);
  const vault = await store.update((vault) => {
    const previous = vault.connections[data.provider] ?? environmentConnection(data.provider);
    if ((previous?.revision ?? 0) !== data.revision)
      throw new Error("Another admin changed this connection. Reload its settings before saving.");
    const sameTarget = previous?.target.toLowerCase() === data.target.toLowerCase();
    const token = data.removeToken ? "" : data.token || (sameTarget ? previous?.token : "") || "";
    const credentialIssue = connectionCredentialIssue(data.provider, token);
    if (credentialIssue) throw new Error(credentialIssue);
    const branch = data.provider === "github" ? data.branch : "";
    vault.connections[data.provider] = {
      target: data.target,
      branch,
      token,
      revision: data.revision + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
      lastCheck:
        sameTarget && previous?.token === token && previous?.branch === branch
          ? previous.lastCheck
          : null,
    };
  });
  return publicConnection(data.provider, vault.connections[data.provider]);
}

class ProviderFailure extends Error {}
async function providerGet(
  url: string,
  token: string,
  provider: ConnectionProvider,
): Promise<{ status: number; value: Record<string, unknown> }> {
  const label = provider === "github" ? "GitHub" : "Supabase";
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(provider === "github"
          ? { "X-GitHub-Api-Version": "2026-03-10", "User-Agent": "DG-Dashboard" }
          : {}),
      },
    });
  } catch {
    throw new ProviderFailure(
      `${label} could not be reached. Check the server network and try again.`,
    );
  }
  if (provider === "github" && response.status === 409) return { status: 409, value: {} };
  if (!response.ok) {
    const help =
      response.status === 401
        ? "Replace the expired or invalid token."
        : response.status === 403
          ? "Grant this token access to the selected project or repository; organization approval may be required."
          : response.status === 404
            ? "Check the target and the token owner's access to it."
            : response.status === 429
              ? "The provider rate limit was reached. Try again later."
              : "Try again or review the provider's status.";
    throw new ProviderFailure(`${label} returned HTTP ${response.status}. ${help}`);
  }
  const body = await response.text();
  if (body.length > 1_000_000)
    throw new ProviderFailure(`${label} returned an unexpectedly large response.`);
  try {
    return { status: response.status, value: JSON.parse(body) };
  } catch {
    throw new ProviderFailure(`${label} returned an unreadable response. Try again.`);
  }
}

/** Only provider metadata is whitelisted; response bodies and tokens never reach the browser. */
export async function probeConnection(
  provider: ConnectionProvider,
  connection: StoredConnection,
): Promise<ConnectionCheck> {
  const checkedAt = new Date().toISOString();
  if (!connection.token)
    return {
      ok: false,
      checkedAt,
      message: "Add a personal access token and save the connection first.",
      details: {},
    };
  const credentialIssue = connectionCredentialIssue(provider, connection.token);
  if (credentialIssue) return { ok: false, checkedAt, message: credentialIssue, details: {} };
  const clean = (value: unknown) =>
    typeof value === "string"
      ? value.replaceAll(connection.token, "[hidden]").slice(0, 250)
      : "Unknown";
  try {
    if (provider === "supabase") {
      const target = normalizeProject(connection.target);
      const { value } = await providerGet(
        `https://api.supabase.com/v1/projects/${target}`,
        connection.token,
        provider,
      );
      if ((value.ref ?? value.id) !== target)
        throw new ProviderFailure("Supabase returned a different project. Check the project ID.");
      return {
        ok: true,
        checkedAt,
        message: "Project access verified. Database migration and app sign-in are separate checks.",
        details: {
          Project: clean(value.name),
          "Project ID": target,
          Region: clean(value.region),
          Status: clean(value.status),
        },
      };
    }
    const target = normalizeRepository(connection.target);
    const { value } = await providerGet(
      `https://api.github.com/repos/${target}`,
      connection.token,
      provider,
    );
    const branch =
      connection.branch ||
      (typeof value.default_branch === "string" ? value.default_branch : "main");
    const head = await providerGet(
      `https://api.github.com/repos/${target}/commits/${encodeURIComponent(branch)}`,
      connection.token,
      provider,
    );
    return {
      ok: true,
      checkedAt,
      message:
        head.status === 409
          ? "Repository access verified. This repository has no commits yet."
          : "Repository and branch read access verified.",
      details: {
        Repository: target,
        Branch: clean(branch),
        Visibility: value.private === true ? "Private" : "Public",
        Commit: head.status === 409 ? "No commits" : clean(head.value.sha),
      },
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      message:
        error instanceof ProviderFailure
          ? error.message
          : "Connection check failed. Check the saved target and try again.",
      details: {},
    };
  }
}

export async function testSavedConnection(
  provider: ConnectionProvider,
  revision: number,
): Promise<ConnectionView> {
  const connection = await readConfiguredConnection(provider);
  if (!connection || connection.revision !== revision)
    throw new Error("Reload and save the connection before testing it.");
  const check = await probeConnection(provider, connection);
  const store = configuredConnectionStore();
  // Environment connections can be checked even when the host has no writable store.
  if (!connection.revision || !store)
    return publicConnection(provider, { ...connection, lastCheck: check });
  const vault = await store.update((vault) => {
    const current = vault.connections[provider];
    if (current?.revision !== revision)
      throw new Error("The connection changed during this check. Test the latest settings again.");
    current.lastCheck = check;
  });
  return publicConnection(provider, vault.connections[provider]);
}

/** Cloud tools remain on the active app database until an explicit migration cutover. */
export async function activeManagementToken(): Promise<string | undefined> {
  const connection = await readConfiguredConnection("supabase");
  return connection?.target === activeConnectionProject()
    ? connection.token || undefined
    : process.env.SUPABASE_MANAGEMENT_TOKEN;
}
