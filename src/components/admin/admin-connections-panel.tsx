import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  GitBranch,
  KeyRound,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BASE44_WORKSPACE } from "@/lib/base44-workspace";
import {
  CONNECTION_SUGGESTIONS,
  connectionCredentialIssue,
  type ConnectionInput,
  type ConnectionSettings,
  type ConnectionView,
} from "@/lib/admin-connections";
import {
  getAdminConnections,
  saveAdminConnection,
  testAdminConnection,
} from "@/lib/admin-connections.functions";

const queryKey = ["admin", "connections"];
function ProviderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </a>
  );
}

export function AdminConnectionsPanel() {
  const load = useServerFn(getAdminConnections);
  const save = useServerFn(saveAdminConnection);
  const test = useServerFn(testAdminConnection);
  const client = useQueryClient();
  const settings = useQuery({
    queryKey,
    queryFn: () => load(),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const update = (connection: ConnectionView) => {
    client.setQueryData<ConnectionSettings>(queryKey, (current) =>
      current
        ? { ...current, connections: { ...current.connections, [connection.provider]: connection } }
        : current,
    );
    void client.invalidateQueries({ queryKey: ["admin", "operations"] });
  };
  if (settings.isPending) return <p role="status">Loading connection settings…</p>;
  if (!settings.data || settings.error)
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-5">
        <p>{settings.error?.message ?? "Connection settings could not be loaded."}</p>
        <Button variant="outline" onClick={() => void settings.refetch()}>
          Reload connection settings
        </Button>
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
        <h3 className="font-semibold">Connect your own GitHub and Supabase accounts</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Save your repository and destination project, then test access. These connections use the
          providers directly.
        </p>
        <p className="mt-3 text-sm">
          Current app database:{" "}
          <code className="break-all">{settings.data.activeProject ?? "Not configured"}</code>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your course data stays on this database until migration is verified and the app is
          switched over. Saving a connection does not publish or migrate the app.
        </p>
      </div>
      <section aria-label="Base44 and Codex development" className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Build with Base44 and Codex</h3>
          <ProviderLink href={BASE44_WORKSPACE.editorUrl}>Open Base44 editor</ProviderLink>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Use DG Dashboard in Mike’s Workspace. Connect its repository in Base44’s Dashboard →
          GitHub so both editors share changes. The GitHub access setting below checks this app’s
          access; it does not turn on Base44’s code sync.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>Create a feature branch for each task when working in both editors.</li>
          <li>Review and merge completed changes into main, then check the Base44 preview.</li>
          <li>Select Publish in Base44 when the reviewed version is ready for the public app.</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Direct Codex edits in the same Base44 sandbox temporarily pause its builder. Branches
          separate code changes; they still use the configured Supabase data.
        </p>
        <div className="mt-3">
          <ProviderLink href="https://docs.base44.com/Building-your-app/working-with-branches">
            How Base44 branches work
          </ProviderLink>
        </div>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {(["github", "supabase"] as const).map((provider) => (
          <ConnectionCard
            key={`${provider}:${settings.data.connections[provider].revision}`}
            connection={settings.data.connections[provider]}
            canSave={settings.data.storage.available}
            onSave={async (input) => {
              const value = await save({ data: input });
              update(value);
              return value;
            }}
            onTest={async (revision) => {
              const value = await test({ data: { provider, revision } });
              update(value);
              return value;
            }}
            onReload={() => void settings.refetch()}
          />
        ))}
      </div>
      <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p>{settings.data.storage.message}</p>
          <p className="mt-1">
            Only super admins can manage these settings. Saved tokens are never returned to the
            browser.
          </p>
        </div>
      </div>
      <details className="rounded-xl border bg-card p-4 text-sm">
        <summary className="cursor-pointer font-medium">
          Using these connections during migration
        </summary>
        <div className="mt-3 space-y-2 text-muted-foreground">
          <p>
            Git status uses your saved GitHub connection. Cloud tools continue to use the current
            app database; the saved Supabase token is used there when its project matches the
            current database.
          </p>
          <p>
            Connection checks verify access to the selected repository or project. Copying the
            database, users and storage, configuring sign-in, and publishing the app are separate
            migration steps.
          </p>
          <p>
            These settings belong to DG Dashboard. Connections used by your coding assistant are
            managed in that assistant’s settings.
          </p>
        </div>
      </details>
    </div>
  );
}

type CardProps = {
  connection: ConnectionView;
  canSave: boolean;
  onSave: (input: ConnectionInput) => Promise<ConnectionView>;
  onTest: (revision: number) => Promise<ConnectionView>;
  onReload: () => void;
};

export function ConnectionCard({ connection, canSave, onSave, onTest, onReload }: CardProps) {
  const github = connection.provider === "github";
  const name = github ? "GitHub" : "Supabase";
  const initialTarget = connection.target || CONNECTION_SUGGESTIONS[connection.provider];
  const [target, setTarget] = useState(initialTarget);
  const [branch, setBranch] = useState(connection.branch);
  const [token, setToken] = useState("");
  const [removeToken, setRemoveToken] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = target !== initialTarget || branch !== connection.branch || !!token || removeToken;
  const check = connection.lastCheck;
  const typedIssue = token ? connectionCredentialIssue(connection.provider, token) : null;
  const credentialIssue = removeToken ? null : token ? typedIssue : connection.credentialIssue;
  const status = credentialIssue
    ? "Wrong credential type"
    : dirty
      ? "Unsaved changes"
      : check
        ? check.ok
          ? "Access verified"
          : "Needs attention"
        : connection.tokenPresent
          ? "Ready to test"
          : connection.saved
            ? "Token needed"
            : "Not connected";
  const Icon = github ? GitBranch : Database;
  const settingsUrl = github
    ? "https://github.com/settings/personal-access-tokens/new"
    : "https://supabase.com/dashboard/account/tokens";
  const savedUrl = connection.target
    ? github
      ? `https://github.com/${connection.target}`
      : `https://supabase.com/dashboard/project/${connection.target}`
    : null;
  return (
    <section aria-label={`${name} connection`} className="min-w-0 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Icon className="h-5 w-5 text-primary" />
          {name}
        </h3>
        <span
          className={`rounded-full border px-2.5 py-1 text-xs ${!dirty && !credentialIssue && check?.ok ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground"}`}
        >
          {status}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {github
          ? "Repository, branch and commit status for DG Dashboard."
          : "Your dedicated DG Dashboard project and its management access."}
      </p>
      <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-sm">
        <ProviderLink href={settingsUrl}>1. Create a {name} personal access token</ProviderLink>
        <p className="mt-2 text-xs text-muted-foreground">
          {github
            ? "Choose the repository owner, select the repository entered below, and give Metadata and Contents read access. The token starts with github_pat_ (or ghp_ for a classic token)."
            : "Open your account’s Access tokens page, choose this project, and allow Project Settings read access. The token starts with sbp_."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          2. Paste that token below, save, then test access.
        </p>
        {github && (
          <details className="mt-3 border-t pt-3">
            <summary className="cursor-pointer text-sm font-medium">
              Permissions for migrating code and opening pull requests
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">
              For code updates, select the repository entered below and allow Contents, Pull
              requests, and Workflows read and write. Metadata stays read-only. Workflows access is
              needed for the app’s automated validation file.
            </p>
            <div className="mt-2">
              <ProviderLink href="https://github.com/settings/personal-access-tokens/new?name=DG%20Dashboard%20migration&target_name=FurstQuality&expires_in=30&contents=write&pull_requests=write&workflows=write&metadata=read">
                Create a token for code migration
              </ProviderLink>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Test saved connection verifies repository read access. It does not prove that a token
              can push code or publish the app. Save the replacement token here; do not paste it
              into chat.
            </p>
          </details>
        )}
      </div>
      {credentialIssue && (
        <div
          id={`${connection.provider}-credential-help`}
          role="alert"
          className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm"
        >
          <p className="font-medium">
            {token ? "This token belongs in a different field" : "Replace the saved credential"}
          </p>
          <p className="mt-1">{credentialIssue}</p>
        </div>
      )}
      <form
        className="mt-5 space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (credentialIssue) {
            setError(credentialIssue);
            return;
          }
          setBusy("save");
          setError(null);
          setNotice(null);
          try {
            const saved = await onSave({
              provider: connection.provider,
              target,
              branch,
              token,
              removeToken,
              revision: connection.revision,
            });
            setToken("");
            setRemoveToken(false);
            setTarget(saved.target);
            setNotice(
              saved.tokenPresent
                ? "Connection saved. Test access when you’re ready."
                : "Settings saved. Add a token to verify access.",
            );
          } catch (error) {
            setError(error instanceof Error ? error.message : "Unable to save this connection.");
          } finally {
            setBusy(null);
          }
        }}
      >
        <fieldset disabled={!!busy} className="min-w-0 space-y-4">
          <label className="block text-sm font-medium">
            {github ? "Repository URL or owner/repository" : "Project ID or Supabase URL"}
            <Input
              name={`${connection.provider}-target`}
              className="mt-2"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setNotice(null);
              }}
              required
              maxLength={500}
              spellCheck={false}
              autoCapitalize="none"
            />
          </label>
          {github && (
            <label className="block text-sm font-medium">
              Branch <span className="font-normal text-muted-foreground">(optional)</span>
              <Input
                name="github-branch"
                className="mt-2"
                value={branch}
                placeholder="Repository default branch"
                onChange={(event) => setBranch(event.target.value)}
                maxLength={200}
                spellCheck={false}
                autoCapitalize="none"
              />
            </label>
          )}
          <div>
            <label className="block text-sm font-medium">
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                {name} personal access token
              </span>
              <Input
                name={`${connection.provider}-token`}
                type="password"
                autoComplete="new-password"
                className="mt-2"
                value={token}
                aria-invalid={!!credentialIssue}
                aria-describedby={
                  credentialIssue ? `${connection.provider}-credential-help` : undefined
                }
                disabled={removeToken}
                onChange={(event) => {
                  setToken(event.target.value);
                  setNotice(null);
                }}
                placeholder={
                  connection.tokenPresent && !connection.credentialIssue
                    ? "Leave blank to keep the saved token"
                    : github
                      ? "github_pat_… or ghp_…"
                      : "sbp_… (account access token)"
                }
                maxLength={4096}
                spellCheck={false}
                autoCapitalize="none"
              />
            </label>
            <p className="mt-2 text-xs text-muted-foreground">
              {github
                ? "Supabase keys, repository secrets, and SSH keys cannot be used as a GitHub personal access token."
                : "The publishable, secret, anon and service_role keys under Project → API Keys serve app/database access. This field needs your account management token instead."}
            </p>
            {connection.tokenPresent && (
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={removeToken}
                  onChange={(event) => {
                    setRemoveToken(event.target.checked);
                    setToken("");
                  }}
                />
                Remove the saved {name} token on save
              </label>
            )}
            {target !== initialTarget && connection.tokenPresent && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Changing the target clears its old token unless you enter a new one.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={
                !canSave || !target.trim() || !!credentialIssue || (connection.saved && !dirty)
              }
            >
              {busy === "save" ? "Saving…" : `Save ${name} connection`}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!connection.tokenPresent || dirty || !!connection.credentialIssue}
              onClick={async () => {
                setBusy("test");
                setError(null);
                setNotice(null);
                try {
                  await onTest(connection.revision);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "Unable to test this connection.",
                  );
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "test" ? "Testing…" : "Test saved connection"}
            </Button>
          </div>
          {dirty && (
            <p className="text-xs text-muted-foreground">Save these changes before testing.</p>
          )}
        </fieldset>
      </form>
      {notice && (
        <p role="status" className="mt-4 text-sm text-primary">
          {notice}
        </p>
      )}
      {connection.updatedAt && !dirty && !notice && (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          Saved {new Date(connection.updatedAt).toLocaleString()}
          {!check && connection.tokenPresent && !credentialIssue ? " · Ready to test" : ""}
        </p>
      )}
      {error && (
        <div role="alert" className="mt-4 rounded-lg border border-amber-500/40 p-3 text-sm">
          <p>{error}</p>
          <Button variant="link" size="sm" className="mt-1 p-0" onClick={onReload}>
            Reload saved settings
          </Button>
        </div>
      )}
      {check && !dirty && !credentialIssue && (
        <div
          role="status"
          className={`mt-4 rounded-lg border p-3 text-sm ${check.ok ? "border-primary/30 bg-primary/5" : "border-amber-500/40"}`}
        >
          <p className="flex items-start gap-2">
            {check.ok && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            {check.message}
          </p>
          {!!Object.keys(check.details).length && (
            <dl className="mt-3 space-y-1.5">
              {Object.entries(check.details).map(([label, value]) => (
                <div key={label} className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-all">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Checked {new Date(check.checkedAt).toLocaleString()}
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4">
        <ProviderLink href={settingsUrl}>Create a {name} token</ProviderLink>
        {savedUrl && (
          <ProviderLink href={savedUrl}>Open {github ? "repository" : "project"}</ProviderLink>
        )}
      </div>
    </section>
  );
}
