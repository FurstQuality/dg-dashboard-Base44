import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Monitor,
  Smartphone,
  ExternalLink,
  RefreshCw,
  FlaskConical,
  Settings2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSandboxSettings,
  saveSandboxSettings,
  checkSandboxPreview,
} from "@/lib/app-sandbox.functions";
import { previewAddress, previewRoutePath, type StudioConfiguration } from "@/lib/app-sandbox";

const PAGES = [
  ["Courses", "/courses"],
  ["Play", "/play"],
  ["Events", "/events"],
  ["Community", "/community"],
  ["Profile", "/profile"],
  ["Admin", "/admin"],
];
const empty: StudioConfiguration = {
  previewOrigin: "",
  liveOrigin: "",
  previewDatabaseOrigin: "",
  productionDatabaseOrigin: "",
  base44AppUrl: "",
  base44Workspace: "Mikes workspace",
  revision: 0,
};

export function AppSandboxPanel() {
  const getSettings = useServerFn(getSandboxSettings);
  const saveSettings = useServerFn(saveSandboxSettings);
  const checkPreview = useServerFn(checkSandboxPreview);
  const cache = useQueryClient();
  const settings = useQuery({
    queryKey: ["app-sandbox-settings"],
    queryFn: () => getSettings(),
    refetchInterval: 30_000,
  });
  const [configuration, setConfiguration] = useState(empty);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [path, setPath] = useState("/courses");
  const [currentPath, setCurrentPath] = useState("/courses");
  const [address, setAddress] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = settings.data?.previewOrigin;
  const save = useMutation({
    mutationFn: () => saveSettings({ data: configuration }),
    onSuccess: async () => {
      setAddress(null);
      setConnected(false);
      verify.reset();
      await cache.invalidateQueries({ queryKey: ["app-sandbox-settings"] });
    },
  });
  const verify = useMutation({
    mutationFn: () => checkPreview(),
    onSuccess: (result) => {
      if (!result.ready) {
        setAddress(null);
        setConnected(false);
        return;
      }
      try {
        if (origin) {
          const route = previewRoutePath(path);
          setCurrentPath(route);
          setPath(route);
          setAddress(previewAddress(origin, route));
        }
      } catch (error) {
        setError((error as Error).message);
      }
    },
  });
  useEffect(() => {
    const data = settings.data;
    if (!data) return;
    setConfiguration({
      previewOrigin: data.previewOrigin ?? "",
      liveOrigin: data.liveOrigin ?? "",
      previewDatabaseOrigin: data.previewDatabaseOrigin ?? "",
      productionDatabaseOrigin: data.productionDatabaseOrigin ?? "",
      base44AppUrl: data.base44AppUrl ?? "",
      base44Workspace: data.base44Workspace ?? "Mikes workspace",
      revision: data.revision ?? 0,
    });
  }, [settings.data?.revision]);
  useEffect(() => {
    if (
      settings.data?.previewOrigin &&
      settings.data.previewDatabaseOrigin &&
      settings.data.productionDatabaseOrigin
    )
      verify.mutate();
  }, [settings.data?.revision]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        !origin ||
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.environment !== "sandbox" ||
        event.data?.type !== "dgd:preview:location"
      )
        return;
      try {
        const route = previewRoutePath(event.data.path);
        setPath(route);
        setCurrentPath(route);
        setConnected(true);
      } catch {
        /* Ignore invalid navigation messages. */
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin]);
  function navigate(next: string) {
    try {
      if (!origin || !verify.data?.ready)
        throw new Error("Check the draft connection before previewing.");
      const route = previewRoutePath(next);
      const url = previewAddress(origin, route);
      setError(null);
      setPath(route);
      setCurrentPath(route);
      if (connected && frame.current?.contentWindow)
        frame.current.contentWindow.postMessage(
          { type: "dgd:preview:navigate", path: route },
          origin,
        );
      else {
        setConnected(false);
        setAddress(url);
      }
    } catch (error) {
      setError((error as Error).message);
    }
  }
  const release = settings.data?.release;
  const edit = (key: keyof StudioConfiguration, value: string) =>
    setConfiguration((current) => ({ ...current, [key]: value }));
  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border bg-card p-4" aria-label="Draft workflow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <FlaskConical className="size-4" /> Whole-app draft
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit in Codex, navigate the full app below, then review a release. Saving code does
              not publish it.
            </p>
          </div>
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
            Unpublished workspace
          </span>
        </div>
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
          <p>
            <strong>Code</strong>
            <br />
            <span className="text-muted-foreground">Every page updates with hot reload.</span>
          </p>
          <p>
            <strong>Data</strong>
            <br />
            <span className="text-muted-foreground">Preview uses its own Supabase project.</span>
          </p>
          <p>
            <strong>Release</strong>
            <br />
            <span className="text-muted-foreground">
              Publish requires a checked version and a verified host.
            </span>
          </p>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="App preview">
        <div className="space-y-3 border-b p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {connected
                ? "Draft connected · updates automatically"
                : verify.data?.ready
                  ? "Draft available · connecting navigation"
                  : "Draft connection required"}
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={verify.isPending}
                onClick={() => verify.mutate()}
              >
                <RefreshCw className={verify.isPending ? "animate-spin" : ""} />
                Check connection
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Desktop preview"
                aria-pressed={device === "desktop"}
                onClick={() => setDevice("desktop")}
              >
                <Monitor />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                aria-label="Phone preview"
                aria-pressed={device === "phone"}
                onClick={() => setDevice("phone")}
              >
                <Smartphone />
              </Button>
            </div>
          </div>
          <form
            className="flex min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(path);
            }}
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Back in preview"
              disabled={!connected}
              onClick={() =>
                frame.current?.contentWindow?.postMessage({ type: "dgd:preview:back" }, origin!)
              }
            >
              <ArrowLeft />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Forward in preview"
              disabled={!connected}
              onClick={() =>
                frame.current?.contentWindow?.postMessage({ type: "dgd:preview:forward" }, origin!)
              }
            >
              <ArrowRight />
            </Button>
            <Input
              aria-label="App path"
              className="min-w-0 flex-1"
              value={path}
              maxLength={500}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/courses"
            />
            <Button type="submit" disabled={!verify.data?.ready}>
              Go
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Reload preview"
              disabled={!address}
              onClick={() => {
                setConnected(false);
                if (origin) setAddress(previewAddress(origin, currentPath));
                setReload((value) => value + 1);
              }}
            >
              <RefreshCw />
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {PAGES.map(([label, route]) => (
              <Button
                key={route}
                size="sm"
                variant="ghost"
                disabled={!verify.data?.ready}
                onClick={() => navigate(route)}
              >
                {label}
              </Button>
            ))}
            {address && origin && (
              <a
                className="ml-auto inline-flex items-center gap-1 text-xs underline"
                href={previewAddress(origin, currentPath)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open full app <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {(error || settings.error || verify.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error ?? settings.error?.message ?? verify.error?.message}
            </p>
          )}
          {verify.data && (
            <p
              role="status"
              className={`text-sm ${verify.data.ready ? "text-muted-foreground" : "text-amber-600 dark:text-amber-300"}`}
            >
              {verify.data.message}
            </p>
          )}
        </div>
        <div className="w-full overflow-auto bg-muted/30 p-2 md:p-3">
          {address && verify.data?.ready ? (
            <iframe
              ref={frame}
              key={`${address}-${reload}`}
              src={address}
              title="Draft app preview"
              className="mx-auto block rounded-lg border bg-background"
              style={{
                width: device === "phone" ? 390 : "100%",
                maxWidth: "100%",
                height: device === "phone" ? 844 : "75vh",
                minHeight: 480,
              }}
              onLoad={() =>
                frame.current?.contentWindow?.postMessage({ type: "dgd:preview:ping" }, origin!)
              }
              referrerPolicy="no-referrer"
              allow="geolocation; camera; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            />
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 p-6 text-center">
              <Monitor className="size-9 text-muted-foreground" />
              <h3 className="font-semibold">One preview for the entire app</h3>
              <p className="max-w-lg text-sm text-muted-foreground">
                Connect a running sandbox below. Once isolation is verified, browse, sign in, edit
                courses and test features here. Your code changes refresh the running app
                automatically.
              </p>
            </div>
          )}
        </div>
      </section>
      <details
        open={!settings.data?.previewDatabaseOrigin}
        className="rounded-xl border bg-card p-4"
      >
        <summary className="cursor-pointer font-semibold">
          <Settings2 className="mr-2 inline size-4" />
          Preview and publishing connections
        </summary>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {(
            [
              ["previewOrigin", "Draft app URL", "http://127.0.0.1:5190"],
              ["liveOrigin", "Public app URL", "https://dgdashboard.app"],
              ["previewDatabaseOrigin", "Draft Supabase URL", "https://draft-project.supabase.co"],
              ["productionDatabaseOrigin", "Live Supabase URL", "https://live-project.supabase.co"],
              ["base44Workspace", "Base44 workspace", "Mikes workspace"],
              ["base44AppUrl", "Base44 app dashboard URL", "https://app.base44.com/apps/…/editor"],
            ] as const
          ).map(([key, label, placeholder]) => (
            <label key={key} className="text-sm">
              {label}
              <Input
                className="mt-1"
                aria-label={label}
                value={configuration[key]}
                placeholder={placeholder}
                onChange={(event) => edit(key, event.target.value)}
              />
            </label>
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            URLs identify existing environments. Configure runtime keys in each environment; they
            are never copied from live into preview. Saving a Base44 workspace name records your
            intended destination—it does not move an app.
          </p>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button disabled={save.isPending || !settings.data?.storageAvailable}>
              {save.isPending ? "Saving…" : "Save connections"}
            </Button>
            {save.isSuccess && (
              <span role="status" className="text-sm">
                Connections saved
              </span>
            )}
          </div>
          {save.error && (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {save.error.message}
            </p>
          )}
        </form>
      </details>
      <section className="rounded-xl border bg-card p-4" aria-label="Publish review">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <UploadCloud className="size-4" />
            Publish review
          </h2>
          <Button
            disabled
            title="Verify Base44 compatibility and connect production deployment first"
          >
            Publish · setup required
          </Button>
        </div>
        <p className="mt-2 text-sm">
          Destination: <strong>{settings.data?.base44Workspace ?? "Mikes workspace"}</strong> ·
          Base44
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {release?.state === "checked"
            ? "This exact source version passed local release checks."
            : release?.state === "stale"
              ? "Code changed after the last checks. Run checks again before publishing."
              : release?.state === "failed"
                ? "Release checks found a failure. Fix it before publishing."
                : "Run npm run release:check in this workspace to prepare a reviewed version."}
        </p>
        {!!release?.checks.length && (
          <ul className="mt-3 space-y-1 text-xs">
            {release.checks.map((check) => (
              <li key={check.name} className="flex items-center gap-2">
                <CheckCircle2
                  className={`size-3 ${check.passed ? "text-green-500" : "text-destructive"}`}
                />
                {check.name}: {check.passed ? "passed" : "failed"}
              </li>
            ))}
          </ul>
        )}
        {release?.sourceHash && (
          <p className="mt-2 text-xs text-muted-foreground">
            Reviewed version: {release.sourceHash.slice(0, 12)} ·{" "}
            {release.checkedAt ? new Date(release.checkedAt).toLocaleString() : ""}
          </p>
        )}
        <p className="mt-3 text-sm text-muted-foreground">
          Base44's standard hosting uploads frontend files; this app also needs its server functions
          and Supabase. The imported project and server runtime must be verified before enabling
          Publish. Database migrations are reviewed separately; draft data is never published as
          live data.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          {settings.data?.base44AppUrl && (
            <a
              className="underline"
              href={settings.data.base44AppUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Base44 project
            </a>
          )}
          <a
            className="underline"
            href="https://docs.base44.com/documentation/building-your-app/uploading-to-app-stores"
            target="_blank"
            rel="noopener noreferrer"
          >
            Apple and Google submission setup
          </a>
          {settings.data?.liveOrigin && (
            <a
              className="underline"
              href={settings.data.liveOrigin}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open public app
            </a>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Store releases also need developer accounts, signed packages and a verified in-app
          purchase flow for digital subscriptions. Opening the public app uses live data.
        </p>
      </section>
      <details className="rounded-xl border bg-card p-4">
        <summary className="cursor-pointer font-semibold">Run the draft in Codex</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Configure a separate Supabase project in <code>.env.sandbox.local</code> using{" "}
            <code>.env.sandbox.example</code>.
          </li>
          <li>
            Run <code>npm run sandbox</code>. Every page and server function runs from this
            workspace on port 5190.
          </li>
          <li>
            Save the matching draft/database URLs above and check the connection. Use Open full app
            for OAuth if embedding prevents sign-in.
          </li>
          <li>
            Ask Codex to make changes. When ready, run <code>npm run release:check</code> and review
            the exact version before publishing.
          </li>
        </ol>
      </details>
    </div>
  );
}
