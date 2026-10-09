import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { connectionCredentialIssue } from "./admin-connections";
import {
  CONNECTOR_CATALOG,
  connectorReadiness,
  type OperationsOverview,
  type OperationResult,
} from "./admin-operations";

export async function assertOperationsAdmin(context: {
  supabase: SupabaseClient<Database>;
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (error || data !== true)
    throw new Error("Only a verified super admin can use platform operations.");
}
export function projectRef(env = process.env): string | null {
  try {
    const host = new URL(env.SUPABASE_URL ?? "").hostname;
    return /^([a-z0-9]{20})\.supabase\.co$/.exec(host)?.[1] ?? null;
  } catch {
    return null;
  }
}
export async function operationsOverview(): Promise<OperationsOverview> {
  const { readConfiguredConnection, activeManagementToken } = await import("./admin-connections.server");
  const github = await readConfiguredConnection("github");
  const resolved = { ...process.env, GITHUB_REPOSITORY: github?.target, GITHUB_TOKEN: github?.token, SUPABASE_MANAGEMENT_TOKEN: await activeManagementToken() };
  const names = [...new Set(CONNECTOR_CATALOG.flatMap((c) => [...c.keys]))];
  let publicUrl: string | null = null;
  try { const url = new URL(process.env.PUBLIC_APP_URL ?? ""); if (url.protocol === "https:") publicUrl = url.origin; } catch { /* Invalid deployment URL stays unconfigured. */ }
  return {
    checkedAt: new Date().toISOString(),
    projectRef: projectRef(),
    publicUrl,
    connectors: connectorReadiness(resolved),
    runtime: names.map((name) => ({ name, configured: !!process.env[name]?.trim() })),
  };
}
/** The provider body may echo credentials. Report status only on failure. */
export async function management(path: string, body?: unknown): Promise<unknown> {
  const { activeManagementToken } = await import("./admin-connections.server");
  const token = await activeManagementToken(),
    ref = projectRef();
  if (!token || !ref)
    throw new Error(
      "Configure a Supabase connection for the current app project in Connections, or set SUPABASE_MANAGEMENT_TOKEN on the server. A destination project's token is reserved for that project until migration.",
    );
  const credentialIssue = connectionCredentialIssue("supabase", token);
  if (credentialIssue) throw new Error(credentialIssue);
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(
      `Supabase management returned HTTP ${response.status}. Check the token's project access and permissions.`,
    );
  const text = await response.text();
  if (text.length > 2_000_000)
    throw new Error("The result is too large. Use a smaller query or open the provider console.");
  return text ? JSON.parse(text) : null;
}
export const asRows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.map((v) =>
        typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v },
      )
    : value && typeof value === "object"
      ? [value as Record<string, unknown>]
      : [];
export const result = (rows: Record<string, unknown>[], note?: string): OperationResult => ({
  checkedAt: new Date().toISOString(),
  rows: JSON.parse(JSON.stringify(rows.slice(0, 200))),
  note,
  more: rows.length > 200,
});
export async function readSql(query: string) {
  return management("/database/query", { query, read_only: true });
}

const QUERIES = {
  database:
    "select schemaname as schema, relname as table, n_live_tup as estimated_rows, pg_size_pretty(pg_total_relation_size(relid)) as total_size from pg_stat_user_tables where schemaname='public' order by relname limit 200",
  jobs: "select jobid, schedule, active, database from cron.job order by jobid limit 200",
  logs: "select jobid, runid, status, start_time, end_time from cron.job_run_details order by start_time desc limit 100",
  usage:
    "select pg_size_pretty(pg_database_size(current_database())) as database_size, numbackends as connections, xact_commit as committed_transactions, xact_rollback as rolled_back_transactions, stats_reset from pg_stat_database where datname=current_database()",
} as const;
export async function readCloudResource(resource: string, page = 1): Promise<OperationResult> {
  if (resource in QUERIES)
    return result(
      asRows(await readSql(QUERIES[resource as keyof typeof QUERIES])),
      resource === "usage"
        ? "Database statistics since stats_reset; these are not billable credits or hosting costs."
        : resource === "database"
          ? "Estimated live rows, not exact counts. Showing up to 200 public tables."
          : resource === "logs"
            ? "Recent database job runs. Full request, auth and function logs are available in the provider console."
            : undefined,
    );
  if (resource === "secrets")
    return result(
      asRows(await management("/secrets")).map((row) => ({
        name: row.name,
        updated_at: row.updated_at,
        value: "Hidden",
      })),
      "These are Supabase Edge Function secrets. They do not configure the TanStack app server.",
    );
  if (resource === "functions")
    return result(
      asRows(await management("/functions")).map((row) => ({
        name: row.name,
        slug: row.slug,
        status: row.status,
        version: row.version,
        verify_jwt: row.verify_jwt,
      })),
    );
  if (resource === "backups")
    return result(
      asRows(await management("/database/backups")),
      "Backup availability depends on the project's plan. Restore through Supabase after reviewing its impact.",
    );
  if (resource === "security") {
    const data = (await management("/advisors/security")) as { lints?: unknown };
    return result(
      asRows(data.lints),
      "Latest provider database advisors. This does not certify application code, dependencies, or ignored Lovable findings.",
    );
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (resource === "users") {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 50 });
    if (error) throw new Error("Unable to list users. Check the server's Supabase admin key.");
    return {
      ...result(
        data.users.map((u) => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          providers: u.app_metadata.providers,
        })),
      ),
      more: data.users.length === 50,
    };
  }
  if (resource === "storage") {
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    if (error)
      throw new Error("Unable to list storage buckets. Check the server's Supabase admin key.");
    return result(
      data.map((b) => ({
        name: b.name,
        public: b.public,
        created_at: b.created_at,
        file_size_limit: b.file_size_limit,
        allowed_mime_types: b.allowed_mime_types,
      })),
    );
  }
  if (resource === "ai") {
    const { data, error } = await supabaseAdmin
      .from("caddy_messages")
      .select("id,created_at,role")
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Unable to read AI activity.");
    return result(
      data ?? [],
      "Latest 100 saved assistant messages. Request cost, latency, model and failures were not recorded by the existing integration and are unavailable here.",
    );
  }
  throw new Error("Unknown operations resource.");
}

export async function readGitStatus(): Promise<OperationResult> {
  const { readConfiguredConnection } = await import("./admin-connections.server");
  const connection = await readConfiguredConnection("github");
  const repo = connection?.target,
    token = connection?.token;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !token)
    throw new Error(
      "Save your GitHub repository and personal access token in Connections.",
    );
  const credentialIssue = connectionCredentialIssue("github", token);
  if (credentialIssue) throw new Error(credentialIssue);
  const get = async (path: string) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new Error(`GitHub returned HTTP ${response.status}. Check repository access.`);
    return response.json();
  };
  const info = await get("");
  const branch = connection?.branch || info.default_branch;
  const head = await get(`/commits/${encodeURIComponent(branch)}`);
  const deployed = process.env.DEPLOY_COMMIT_SHA || null;
  return result(
    [
      {
        repository: repo,
        branch,
        remote_commit: head.sha,
        deployed_commit: deployed,
        sync: deployed
          ? head.sha === deployed
            ? "Matches deployed commit"
            : "Remote differs from deployed commit"
          : "Deployment commit not configured",
        clone_https: `https://github.com/${repo}.git`,
      },
    ],
    "Read-only repository status from your direct GitHub connection. Deployment commit is reported only when supplied by the host.",
  );
}
