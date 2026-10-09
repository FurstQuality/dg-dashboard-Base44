import {
  appOrigin,
  base44ProjectUrl,
  sandboxSettings,
  type SandboxSettings,
  type StudioConfiguration,
} from "./app-sandbox";
import {
  configuredConnectionStore,
  connectionStorageStatus,
} from "./admin-connections-store.server";
import { readBoundedText } from "./http-safety";
import { sandboxRuntimeStatus } from "./sandbox-runtime";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceFingerprint } from "../../scripts/release-snapshot.mjs";

export async function studioReleaseStatus(): Promise<NonNullable<SandboxSettings["release"]>> {
  const absent = { state: "missing" as const, sourceHash: null, checkedAt: null, checks: [] };
  if (!import.meta.env.DEV) return absent;
  try {
    const report = JSON.parse(
      await readFile(join(process.cwd(), ".sandbox/release-check.json"), "utf8"),
    );
    if (
      report.version !== 1 ||
      !/^[a-f0-9]{64}$/.test(report.sourceHash) ||
      !Array.isArray(report.checks)
    )
      return absent;
    const current = await sourceFingerprint(process.cwd());
    return {
      state: current.hash !== report.sourceHash ? "stale" : report.passed ? "checked" : "failed",
      sourceHash: report.sourceHash,
      checkedAt: report.checkedAt,
      checks: report.checks.map((check: { name: string; passed: boolean }) => ({
        name: check.name,
        passed: check.passed === true,
      })),
    };
  } catch {
    return absent;
  }
}

function normalizedConfig(input: StudioConfiguration): StudioConfiguration {
  const origin = (value: string) => {
    if (!value.trim()) return "";
    const result = appOrigin(value);
    if (!result) throw new Error("Use HTTPS or a local loopback URL without credentials.");
    return result;
  };
  const result = {
    ...input,
    previewOrigin: origin(input.previewOrigin),
    liveOrigin: origin(input.liveOrigin),
    previewDatabaseOrigin: origin(input.previewDatabaseOrigin),
    productionDatabaseOrigin: origin(input.productionDatabaseOrigin),
    base44AppUrl: base44ProjectUrl(input.base44AppUrl) ?? "",
  };
  if (result.previewOrigin && result.previewOrigin === result.liveOrigin)
    throw new Error("Draft and live apps must have separate origins.");
  if (
    result.previewDatabaseOrigin &&
    result.previewDatabaseOrigin === result.productionDatabaseOrigin
  )
    throw new Error("Draft and live databases must be different.");
  return result;
}

export async function saveStudioConfiguration(input: StudioConfiguration): Promise<void> {
  const config = normalizedConfig(input);
  const store = configuredConnectionStore();
  if (!store) throw new Error(connectionStorageStatus().message);
  await store.update((vault) => {
    if ((vault.studio?.revision ?? 0) !== input.revision)
      throw new Error("Preview settings changed. Reload before saving.");
    vault.studio = { ...config, revision: input.revision + 1 };
  });
}

export async function readStudioSettings(): Promise<SandboxSettings> {
  const saved = (await configuredConnectionStore()?.read())?.studio;
  const settings = sandboxSettings({
    ...process.env,
    ...(saved
      ? { SANDBOX_PREVIEW_URL: saved.previewOrigin, SANDBOX_LIVE_URL: saved.liveOrigin }
      : {}),
  });
  const config = saved ?? {
    previewOrigin: settings.previewOrigin ?? "",
    liveOrigin: settings.liveOrigin ?? "",
    previewDatabaseOrigin: "",
    productionDatabaseOrigin:
      appOrigin(process.env.DGD_PRODUCTION_SUPABASE_URL ?? process.env.SUPABASE_URL) ?? "",
    base44AppUrl: "",
    base44Workspace: "Mikes workspace",
    revision: 0,
  };
  return {
    ...settings,
    base44AppUrl: config.base44AppUrl || null,
    base44Workspace: config.base44Workspace || "Mikes workspace",
    revision: config.revision,
    storageAvailable: connectionStorageStatus().available,
    previewDatabaseOrigin: config.previewDatabaseOrigin || null,
    productionDatabaseOrigin: config.productionDatabaseOrigin || null,
    release: await studioReleaseStatus(),
  };
}

export async function checkStudioPreview(): Promise<NonNullable<SandboxSettings["preview"]>> {
  const settings = await readStudioSettings();
  const checkedAt = new Date().toISOString();
  if (
    !settings.previewOrigin ||
    !settings.previewDatabaseOrigin ||
    !settings.productionDatabaseOrigin
  ) {
    return {
      ready: false,
      checkedAt,
      message: "Configure the draft app and separate draft/live database URLs first.",
    };
  }
  try {
    const response = await fetch(`${settings.previewOrigin}/api/public/preview-status`, {
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("not_ready");
    const status = JSON.parse(await readBoundedText(response, 8192));
    const expected = sandboxRuntimeStatus({
      DGD_SANDBOX: "1",
      SUPABASE_URL: status.databaseOrigin,
      VITE_SUPABASE_URL: settings.previewDatabaseOrigin,
      DGD_PRODUCTION_SUPABASE_URL: settings.productionDatabaseOrigin,
    });
    if (status.kind !== "dgd-sandbox" || status.isolated !== true || !expected.isolated)
      throw new Error("not_isolated");
    return {
      ready: true,
      checkedAt,
      message:
        "Draft app is running with a separate database. Code changes update every page through hot reload.",
    };
  } catch {
    return {
      ready: false,
      checkedAt,
      message:
        "Draft app is offline or its database isolation could not be verified. Start npm run sandbox with the configured draft database.",
    };
  }
}
