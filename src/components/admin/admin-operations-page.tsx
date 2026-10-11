import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowUpRight, Cloud, Plug, RefreshCw, Shield, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageShell, PageHeader } from "@/components/shell";
import { AdminConnectionsPanel } from "./admin-connections-panel";
import {
  CONNECTOR_CATALOG,
  OPERATION_LABELS,
  type OperationSection,
  type OperationResult,
} from "@/lib/admin-operations";
import {
  getOperationsOverview,
  getOperationsResource,
  runOperationsQuery,
  testOperationsConnection,
  getProjectNotes,
  saveProjectNotes,
} from "@/lib/admin-operations.functions";

const groups: { title: string; items: OperationSection[] }[] = [
  { title: "Project", items: ["overview", "connections", "connectors", "ai", "agents", "payments"] },
  {
    title: "Cloud",
    items: [
      "database",
      "users",
      "storage",
      "emails",
      "secrets",
      "jobs",
      "functions",
      "sql",
      "logs",
      "usage",
    ],
  },
  { title: "Quality", items: ["security", "seo"] },
  { title: "Settings", items: ["knowledge", "domains", "git"] },
];
const resources = [
  "database",
  "users",
  "storage",
  "secrets",
  "jobs",
  "functions",
  "logs",
  "usage",
  "ai",
  "security",
  "git",
] as const;
type Resource = (typeof resources)[number] | "backups";
const externalPaths: Partial<Record<OperationSection, string>> = {
  database: "/editor",
  users: "/auth/users",
  storage: "/storage/buckets",
  emails: "/auth/templates",
  secrets: "/functions/secrets",
  jobs: "/integrations/cron/jobs",
  functions: "/functions",
  sql: "/sql/new",
  logs: "/logs/explorer",
  usage: "/usage",
  security: "/advisors/security",
  domains: "/settings/general",
};
const card = "rounded-xl border border-border bg-card p-5";

function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}
function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {retry && (
        <Button size="sm" variant="outline" className="mt-3" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function OperationsResult({ data }: { data: OperationResult }) {
  const columns = [...new Set(data.rows.flatMap((row) => Object.keys(row)))].slice(0, 12);
  return (
    <div className="min-w-0 space-y-3">
      {data.note && <p className="text-sm text-muted-foreground">{data.note}</p>}
      <p className="text-xs text-muted-foreground">
        Checked {new Date(data.checkedAt).toLocaleString()} · {data.rows.length} displayed records
        {data.more ? " · More records available" : ""}
      </p>
      {!data.rows.length ? (
        <p className={card}>No records returned by this source.</p>
      ) : (
        <div className="max-h-[560px] overflow-auto rounded-xl border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {columns.map((column) => (
                  <th className="whitespace-nowrap px-4 py-3 font-medium" key={column}>
                    {column.replaceAll("_", " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, i) => (
                <tr key={String(row.id ?? i)} className="border-t">
                  {columns.map((column) => (
                    <td className="max-w-sm break-words px-4 py-3 align-top" key={column}>
                      {row[column] == null ? (
                        "—"
                      ) : typeof row[column] === "object" ? (
                        <details>
                          <summary className="cursor-pointer text-primary">View details</summary>
                          <pre className="mt-2 whitespace-pre-wrap break-all text-xs">
                            {JSON.stringify(row[column], null, 2)}
                          </pre>
                        </details>
                      ) : (
                        String(row[column])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AdminOperationsPage({
  section,
  onSection,
}: {
  section: OperationSection;
  onSection: (s: OperationSection) => void;
}) {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getOperationsOverview),
    resourceFn = useServerFn(getOperationsResource),
    testFn = useServerFn(testOperationsConnection);
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [testId, setTestId] = useState<string | null>(null);
  const [test, setTest] = useState<OperationResult | null>(null),
    [testError, setTestError] = useState<Error | null>(null),
    [testing, setTesting] = useState(false);
  const [backup, setBackup] = useState(false);
  const overview = useQuery({
    queryKey: ["admin", "operations", "overview"],
    queryFn: () => overviewFn(),
    retry: false,
    staleTime: 30000,
  });
  const resource = (backup && section === "database" ? "backups" : section) as Resource;
  const source = useQuery({
    queryKey: ["admin", "operations", resource, page],
    queryFn: () => resourceFn({ data: { resource, page } }),
    enabled: resources.includes(section as (typeof resources)[number]),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const base = overview.data?.projectRef
    ? `https://supabase.com/dashboard/project/${overview.data.projectRef}`
    : "https://supabase.com/dashboard";
  const select = (next: OperationSection) => {
    setPage(1);
    setBackup(false);
    setTest(null);
    setTestError(null);
    onSection(next);
  };
  const configured = overview.data?.connectors.filter((c) => c.configured).length;
  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Platform operations"
        description="Connect services, manage your cloud, and track what still needs configuration."
      />
      <div className="grid min-w-0 gap-5 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border bg-card p-3 lg:self-start">
          <label className="flex items-center gap-3 text-sm lg:hidden">
            Section
            <select aria-label="Operations section" className="min-w-0 flex-1 rounded-lg border bg-background p-2" value={section} onChange={e => select(e.target.value as OperationSection)}>
              {groups.map(group => <optgroup key={group.title} label={group.title}>{group.items.map(item => <option key={item} value={item}>{OPERATION_LABELS[item]}</option>)}</optgroup>)}
            </select>
          </label>
          <nav
            aria-label="Platform operations"
            className="hidden space-y-5 lg:block"
          >
            {groups.map((group) => (
              <div key={group.title} className="min-w-[145px]">
                <h2 className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </h2>
                {group.items.map((item) => (
                  <button
                    key={item}
                    aria-current={section === item ? "page" : undefined}
                    onClick={() => select(item)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${section === item ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {OPERATION_LABELS[item]}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">{OPERATION_LABELS[section]}</h2>
            <div className="flex flex-wrap items-center gap-3">
              {externalPaths[section] && (
                <External href={base + (overview.data?.projectRef ? externalPaths[section] : "")}>
                  Open Supabase console
                </External>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={overview.isFetching || source.isFetching}
                onClick={() => {
                  void overview.refetch();
                  if (section === "connections")
                    void queryClient.invalidateQueries({ queryKey: ["admin", "connections"] });
                  if (resources.includes(section as (typeof resources)[number]))
                    void source.refetch();
                }}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>
          </div>
          {overview.error && (
            <ErrorBox error={overview.error} retry={() => void overview.refetch()} />
          )}
          {section === "overview" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: Plug,
                    value: configured == null ? "—" : `${configured} / ${CONNECTOR_CATALOG.length}`,
                    label: "Credential sets present",
                  },
                  {
                    icon: Cloud,
                    value: overview.data?.projectRef ? "Existing project" : "Not verified",
                    label: "Supabase cloud",
                  },
                  { icon: Shield, value: "Super admin", label: "Server-enforced access" },
                ].map(({ icon: Icon, value, label }) => (
                  <div className={card} key={label}>
                    <Icon className="mb-4 h-5 w-5 text-primary" />
                    <p className="text-xl font-semibold">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              <div className={card}>
                <h3 className="font-semibold">Finish connecting the platform</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Credential presence is a setup check. Use each supported connection test to verify
                  access. Lovable gateway services remain labelled until their direct integrations
                  are implemented.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => select("connections")}>Connect GitHub &amp; Supabase</Button>
                  <Button variant="outline" onClick={() => select("connectors")}>All connectors</Button>
                  <Button variant="outline" onClick={() => select("secrets")}>
                    Review credentials
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/admin/platform">Platform settings</Link>
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    title: "Cloud management",
                    detail: "Tables, users, storage, jobs, functions and backups.",
                    to: "database",
                    icon: Cloud,
                  },
                  {
                    title: "Security & search",
                    detail: "Provider findings, project notes and search tools.",
                    to: "security",
                    icon: Shield,
                  },
                  {
                    title: "AI & integrations",
                    detail: "Connection readiness and real saved AI activity.",
                    to: "ai",
                    icon: Activity,
                  },
                  {
                    title: "Project settings",
                    detail: "Knowledge, domain setup and Git status.",
                    to: "knowledge",
                    icon: Settings2,
                  },
                ].map((item) => (
                  <button
                    className={`${card} text-left hover:border-primary/50`}
                    key={item.title}
                    onClick={() => select(item.to as OperationSection)}
                  >
                    <item.icon className="mb-3 h-5 w-5 text-primary" />
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                  </button>
                ))}
              </div>
            </>
          )}
          {section === "connections" && <AdminConnectionsPanel />}
          {section === "connectors" && (
            <>
              <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
                <div><h3 className="font-semibold">GitHub &amp; Supabase connection settings</h3><p className="mt-1 text-sm text-muted-foreground">Save your repository, project and private access tokens directly in DG Dashboard.</p></div>
                <Button onClick={() => select("connections")}>Manage connections</Button>
              </div>
              <Input
                aria-label="Search connectors"
                placeholder="Search connectors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="grid gap-3 xl:grid-cols-2">
                {CONNECTOR_CATALOG.filter((c) =>
                  `${c.name} ${c.category}`.toLowerCase().includes(search.toLowerCase()),
                ).map((connector) => {
                  const status = overview.data?.connectors.find((c) => c.id === connector.id);
                  const testable = [
                    "supabase",
                    "management",
                    "google-auth",
                    "github",
                    "stripe",
                  ].includes(connector.id);
                  return (
                    <section className={card} key={connector.id}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">{connector.category}</p>
                          <h3 className="mt-1 font-semibold">{connector.name}</h3>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-[11px]">
                          {status
                            ? status.state === "configured"
                              ? "Credentials present"
                              : status.state === "setup"
                                ? "Setup required"
                                : "Missing credentials"
                            : "Not checked"}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">{connector.description}</p>
                      <p className="mt-2 text-xs">Connection: {status?.mode ?? connector.mode}</p>
                      {["ai", "email"].includes(connector.id) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Set these values in the app host’s server settings (Base44 for the hosted app,
                          or the private environment file for local development). Supabase Edge secrets
                          do not configure this app server. No test requests or emails are sent by this page.
                        </p>
                      )}
                      {!!status?.missing.length && (
                        <p className="mt-2 break-all text-xs text-amber-600 dark:text-amber-400">
                          Required: {status.missing.join(", ")}
                        </p>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {["github", "supabase", "management"].includes(connector.id) && <Button size="sm" onClick={() => select("connections")}>Connection settings</Button>}
                        <External
                          href={
                            connector.id === "google-auth" && overview.data?.projectRef
                              ? `${base}/auth/providers`
                              : status?.setup ?? connector.setup
                          }
                        >
                          Configure provider
                        </External>
                        {testable && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={testing}
                            onClick={async () => {
                              setTestId(connector.id);
                              setTesting(true);
                              setTest(null);
                              setTestError(null);
                              try {
                                setTest(
                                  await testFn({
                                    data: {
                                      id: connector.id as
                                        | "supabase"
                                        | "management"
                                        | "google-auth"
                                        | "github"
                                        | "stripe",
                                    },
                                  }),
                                );
                              } catch (e) {
                                setTestError(e instanceof Error ? e : new Error(String(e)));
                              } finally {
                                setTesting(false);
                              }
                            }}
                          >
                            {testing && testId === connector.id ? "Checking…" : "Test connection"}
                          </Button>
                        )}
                      </div>
                      {testId === connector.id && (
                        <div className="mt-3">
                          {testError && <ErrorBox error={testError} />}
                          {test && <OperationsResult data={test} />}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </>
          )}
          {section === "database" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={!backup ? "default" : "outline"}
                onClick={() => setBackup(false)}
              >
                Tables
              </Button>
              <Button
                size="sm"
                variant={backup ? "default" : "outline"}
                onClick={() => setBackup(true)}
              >
                Backups
              </Button>
              <Button size="sm" variant="outline" onClick={() => select("sql")}>
                Open SQL editor
              </Button>
            </div>
          )}
          {section === "secrets" && (
            <div className={card}>
              <h3 className="font-semibold">App server credentials</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Set these in your hosting environment or local .env, then restart or redeploy. Edge
                Function secrets below belong to a different runtime. Values are never returned to
                this page.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {overview.data?.runtime.map((item) => (
                  <div
                    className="flex min-w-0 justify-between gap-3 rounded border p-2 text-xs"
                    key={item.name}
                  >
                    <code className="break-all">{item.name}</code>
                    <span className="shrink-0">{item.configured ? "Present" : "Missing"}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <External href={`${base}${overview.data?.projectRef ? "/functions/secrets" : ""}`}>
                  Add or replace an Edge secret in Supabase
                </External>
              </div>
            </div>
          )}
          {resources.includes(section as (typeof resources)[number]) && (
            <>
              {source.isPending && (
                <p role="status" className={card}>
                  Loading {OPERATION_LABELS[section].toLowerCase()}…
                </p>
              )}
              {source.error && (
                <ErrorBox error={source.error} retry={() => void source.refetch()} />
              )}
              {source.data && <OperationsResult data={source.data} />}
              {section === "users" && (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 1 || source.isFetching}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">Page {page}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!source.data?.more || source.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
          {section === "sql" && <SqlEditor />}
          {section === "knowledge" && <ProjectNotes />}
          {section === "security" && (
            <div className={card}>
              <h3 className="font-semibold">Security review scope</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Provider findings are shown above when access is available. Dependency scans,
                application authorization review and ignored Lovable findings require separate
                review. No scan is marked clean when it has not run.
              </p>
              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => select("knowledge")}>
                  Edit security notes
                </Button>
              </div>
            </div>
          )}
          {section === "agents" && (
            <div className={card}>
              <h3 className="font-semibold">Agent and MCP integrations</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The app's installed Lovable MCP package does not transfer workspace connector
                permissions to this deployment. Authorize each service with its provider before an
                agent can use it. An in-app agent connection and tool-execution service is not
                installed yet.
              </p>
              <div className="mt-4">
                <Button variant="outline" onClick={() => select("connectors")}>
                  Review app connectors
                </Button>
              </div>
            </div>
          )}
          {section === "payments" && (
            <div className={card}>
              <h3 className="font-semibold">Stripe and billing</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Configure the Stripe account and webhook, then manage the existing app billing
                tools.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {[
                  { to: "/admin/tiers", text: "Plans & pricing" },
                  { to: "/admin/subscriptions", text: "Subscriptions" },
                  { to: "/admin/billing-events", text: "Billing events" },
                ].map((item) => (
                  <Button key={item.to} asChild size="sm" variant="outline">
                    <Link to={item.to}>{item.text}</Link>
                  </Button>
                ))}
                <External href="https://dashboard.stripe.com">Stripe dashboard</External>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Shopify commerce is not installed. Payment account setup and live transactions
                require your provider account.
              </p>
            </div>
          )}
          {section === "emails" && (
            <div className={card}>
              <h3 className="font-semibold">Authentication and transactional email</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Authentication templates and SMTP are managed by Supabase. Event invitations and
                kiosk signup emails support direct Resend delivery. Check the email connector for
                the selected provider and missing settings; delivery and bounce history remain in
                that provider’s dashboard.
              </p>
              <div className="mt-4 flex gap-3">
                <External href={`${base}${overview.data?.projectRef ? "/auth/templates" : ""}`}>
                  Templates and SMTP
                </External>
                <Button variant="outline" size="sm" onClick={() => select("connectors")}>
                  Email connector status
                </Button>
              </div>
            </div>
          )}
          {(section === "seo" || section === "domains") && (
            <div className={card}>
              <h3 className="font-semibold">
                {section === "seo" ? "Search visibility" : "App domain"}
              </h3>
              <p className="mt-2 break-all text-sm">
                {overview.data?.publicUrl ?? "PUBLIC_APP_URL is not configured"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {section === "seo"
                  ? "Verify ownership in Search Console and submit the sitemap. Traffic reports and SEO scans require a connected search provider; no scores are inferred from configuration."
                  : "App DNS and certificates belong to your hosting provider. Supabase custom domains configure the API host, not the website. Updating PUBLIC_APP_URL does not change DNS."}
              </p>
              <div className="mt-4 flex flex-wrap gap-4">
                <External href="https://search.google.com/search-console">
                  Google Search Console
                </External>
                {overview.data?.publicUrl && (
                  <External href={`${overview.data.publicUrl}/sitemap.xml`}>
                    Inspect sitemap
                  </External>
                )}
                <External href="https://pagespeed.web.dev/">PageSpeed Insights</External>
              </div>
            </div>
          )}
          {section === "git" && (
            <div className={card}>
              <p className="text-sm text-muted-foreground">
                Manage your repository, branch and private token in Connections. Git status reads
                the saved connection. DEPLOY_COMMIT_SHA comes from the deployment environment.
              </p>
              <Button className="mt-3" onClick={() => select("connections")}>Configure GitHub connection</Button>
            </div>
          )}
        </main>
      </div>
    </PageShell>
  );
}

function SqlEditor() {
  const run = useServerFn(runOperationsQuery),
    [query, setQuery] = useState(
      "select schemaname, tablename from pg_tables where schemaname = 'public' order by tablename limit 50;",
    );
  const [data, setData] = useState<OperationResult | null>(null),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Queries run with the provider's read-only option. Use the provider SQL console for reviewed
        migrations and data changes.
      </p>
      <label className="block text-sm font-medium">
        SQL
        <Textarea
          className="mt-2 min-h-48 font-mono text-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={12000}
        />
      </label>
      <Button
        disabled={busy || !query.trim()}
        onClick={async () => {
          setBusy(true);
          setError(null);
          setData(null);
          try {
            setData(await run({ data: { query } }));
          } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Running…" : "Run read-only query"}
      </Button>
      {error && <ErrorBox error={error} />}
      {data && <OperationsResult data={data} />}
    </div>
  );
}

function ProjectNotes() {
  const load = useServerFn(getProjectNotes),
    save = useServerFn(saveProjectNotes);
  const query = useQuery({
    queryKey: ["admin", "project-notes"],
    queryFn: () => load(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<{
      knowledge: string;
      security_notes: string;
      revision: number;
    } | null>(null),
    [reason, setReason] = useState(""),
    [error, setError] = useState<Error | null>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  const value = draft ?? query.data;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Private reference notes for platform admins. These notes do not automatically change model
        prompts or dismiss security findings. Keep credentials in the provider secret store.
      </p>
      {query.error && <ErrorBox error={query.error} retry={() => void query.refetch()} />}
      {query.isPending && <p>Loading project notes…</p>}
      {value && (
        <>
          <label className="block text-sm font-medium">
            Project knowledge
            <Textarea
              className="mt-2 min-h-56"
              aria-label="Project knowledge"
              value={value.knowledge}
              maxLength={30000}
              onChange={(e) => {
                setDraft({ ...value, knowledge: e.target.value });
                setSaved(false);
              }}
              placeholder="Purpose, audience, architecture and project rules…"
            />
          </label>
          <label className="block text-sm font-medium">
            Security notes
            <Textarea
              className="mt-2 min-h-32"
              aria-label="Security notes"
              value={value.security_notes}
              maxLength={30000}
              onChange={(e) => {
                setDraft({ ...value, security_notes: e.target.value });
                setSaved(false);
              }}
              placeholder="Review decisions, unresolved findings and follow-up…"
            />
          </label>
          <label className="block text-sm font-medium">
            Reason for this update
            <Input
              className="mt-2"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button
            disabled={busy || !draft || reason.trim().length < 5}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const r = await save({ data: { ...value, reason } });
                setDraft({ ...value, revision: r.revision });
                setSaved(true);
                setReason("");
              } catch (e) {
                setError(e instanceof Error ? e : new Error(String(e)));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save project notes"}
          </Button>
          {saved && (
            <p role="status" className="text-sm text-primary">
              Project notes saved.
            </p>
          )}
        </>
      )}
      {error && <ErrorBox error={error} />}
    </div>
  );
}
