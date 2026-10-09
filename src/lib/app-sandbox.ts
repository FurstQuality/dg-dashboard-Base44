export type SandboxSettings = {
  previewOrigin: string | null;
  liveOrigin: string | null;
  currentEnvironment: "sandbox" | "app";
  deployedCommit: string | null;
  base44AppUrl?: string | null;
  base44Workspace?: string;
  release?: {
    state: "missing" | "stale" | "failed" | "checked";
    sourceHash: string | null;
    checkedAt: string | null;
    checks: { name: string; passed: boolean }[];
  };
  revision?: number;
  storageAvailable?: boolean;
  previewDatabaseOrigin?: string | null;
  productionDatabaseOrigin?: string | null;
  preview?: { ready: boolean; message: string; checkedAt: string };
};

export type StudioConfiguration = {
  previewOrigin: string;
  liveOrigin: string;
  base44AppUrl: string;
  previewDatabaseOrigin: string;
  productionDatabaseOrigin: string;
  revision: number;
  base44Workspace: string;
};

export function base44ProjectUrl(raw: string): string | null {
  if (!raw.trim()) return null;
  const url = new URL(raw);
  if (
    url.origin !== "https://app.base44.com" ||
    !/^\/apps\/[a-zA-Z0-9_-]+(?:\/|$)/.test(url.pathname) ||
    url.username ||
    url.password
  ) {
    throw new Error("Use your Base44 app's dashboard URL (https://app.base44.com/apps/…).");
  }
  return url.origin + url.pathname;
}

/** Navigation messages never include OAuth fragments or credential query values. */
export function previewRoutePath(raw: string): string {
  const url = new URL(previewAddress("https://preview.example", raw));
  for (const name of [...url.searchParams.keys()]) {
    if (/token|secret|password|key|code|signature/i.test(name)) url.searchParams.delete(name);
  }
  return url.pathname + url.search;
}

export function appOrigin(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    if (url.username || url.password) return null;
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function previewAddress(origin: string, path: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\s]/.test(path))
    throw new Error("Enter an app path beginning with /.");
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Preview must stay within the selected app.");
  if (url.pathname.replace(/\/+$/, "") === "/admin/sandbox")
    throw new Error("Choose an app page to avoid opening the preview inside itself.");
  return url.href;
}

export function sandboxSettings(env: Record<string, string | undefined>): SandboxSettings {
  const previewOrigin = appOrigin(env.SANDBOX_PREVIEW_URL ?? "http://127.0.0.1:5190");
  const liveOrigin = appOrigin(
    env.SANDBOX_LIVE_URL ?? (env.DGD_SANDBOX === "1" ? undefined : env.PUBLIC_APP_URL),
  );
  return {
    previewOrigin: previewOrigin === liveOrigin ? null : previewOrigin,
    liveOrigin,
    currentEnvironment: env.DGD_SANDBOX === "1" ? "sandbox" : "app",
    deployedCommit: /^[a-f0-9]{40}$/i.test(env.DEPLOY_COMMIT_SHA ?? "")
      ? env.DEPLOY_COMMIT_SHA!
      : null,
  };
}
