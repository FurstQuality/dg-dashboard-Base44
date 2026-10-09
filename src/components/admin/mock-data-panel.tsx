import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Copy, Beaker, Play, RotateCcw, KeyRound, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  getMockDataStatus,
  enableMockData,
  disableMockData,
  simulateMockActivity,
  rotateSandboxPassword,
} from "@/lib/mock-data.functions";

/**
 * Admin-only mock data controls. Lives inside AdminModerationPage above
 * the course moderation tabs so admins land on it right after signing
 * in with elevated privileges.
 */
export function MockDataPanel() {
  const qc = useQueryClient();
  const status = useServerFn(getMockDataStatus);
  const enable = useServerFn(enableMockData);
  const disable = useServerFn(disableMockData);
  const simulate = useServerFn(simulateMockActivity);
  const rotate = useServerFn(rotateSandboxPassword);

  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin", "mock-data-status"],
    queryFn: () => status({}),
    staleTime: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin", "mock-data-status"] });
    // Refresh anything that reads sandbox data
    qc.invalidateQueries({ queryKey: ["rounds"] });
    qc.invalidateQueries({ queryKey: ["tournaments"] });
    qc.invalidateQueries({ queryKey: ["courses"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
  };

  const enableMut = useMutation({
    mutationFn: (resetIfExists: boolean) => enable({ data: { resetIfExists } }),
    onSuccess: (res) => {
      toast.success(`Seeded ${res.seededCount} sandbox rows`);
      if (res.sandboxPassword) setRevealedPassword(res.sandboxPassword);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disableMut = useMutation({
    mutationFn: () => disable({}),
    onSuccess: () => {
      toast.success("Mock data cleared");
      setRevealedPassword(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const simulateMut = useMutation({
    mutationFn: () => simulate({}),
    onSuccess: (res) => {
      toast.success(
        `Sandbox Player logged a ${res.toPar >= 0 ? "+" : ""}${res.toPar} at ${res.courseName}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: () => rotate({}),
    onSuccess: (res) => {
      setRevealedPassword(res.password);
      toast.success("New sandbox password generated");
      refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enabled = !!data?.enabled;
  const busy =
    enableMut.isPending || disableMut.isPending || simulateMut.isPending || rotateMut.isPending;

  return (
    <section className="rounded-2xl border border-border/70 bg-gradient-to-br from-brand-cyan/[0.05] via-card to-card p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-cyan/15 p-2 text-brand-cyan">
            <Beaker className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Mock data &amp; sandbox mode</h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Seed live-feeling tournaments, leagues, rounds, courses, and posts across the app so
              you can exercise every feature end-to-end. Includes a dedicated non-admin Sandbox
              Player account you can sign in as to test the player experience.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {enabled ? "Enabled" : "Off"}
          </span>
          <Switch
            checked={enabled}
            disabled={busy || isLoading}
            onCheckedChange={(v) => {
              if (v) enableMut.mutate(false);
              else if (
                confirm(
                  "Turn off mock data? All seeded rows and the Sandbox Player account will be removed.",
                )
              )
                disableMut.mutate();
            }}
          />
        </label>
      </header>

      {isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Checking sandbox status…</p>
      ) : enabled ? (
        <div className="mt-5 space-y-4">
          <SandboxCredentials
            email={data?.sandboxEmail ?? null}
            hint={data?.sandboxPasswordHint ?? null}
            revealedPassword={revealedPassword}
          />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Seeded rows" value={data?.total ?? 0} />
            <Stat label="Courses" value={data?.counts.courses ?? 0} />
            <Stat label="Tournaments" value={data?.counts.tournaments ?? 0} />
            <Stat label="Rounds" value={data?.counts.rounds ?? 0} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => simulateMut.mutate()}
              disabled={busy}
              className="gap-1.5"
            >
              {simulateMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Log a Sandbox round now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => enableMut.mutate(true)}
              disabled={busy}
              className="gap-1.5"
            >
              {enableMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              Reset &amp; reseed
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => rotateMut.mutate()}
              disabled={busy}
              className="gap-1.5"
            >
              {rotateMut.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Rotate sandbox password
            </Button>
          </div>

          {data?.lastActivityAt && (
            <p className="text-xs text-muted-foreground">
              Last activity {new Date(data.lastActivityAt).toLocaleString()}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-5">
          <Button onClick={() => enableMut.mutate(false)} disabled={busy} className="gap-1.5">
            {enableMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Beaker className="h-4 w-4" />
            )}
            Enable mock data
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Creates a Sandbox Player account, 2 courses, 3 tournaments, 1 league, 8 rounds, and a
            few feed posts.
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SandboxCredentials({
  email,
  hint,
  revealedPassword,
}: {
  email: string | null;
  hint: string | null;
  revealedPassword: string | null;
}) {
  if (!email) return null;
  return (
    <Alert>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        Sandbox Player account
        <Badge variant="outline" className="text-[10px]">
          non-admin
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Email:</span>
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{email}</code>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-1.5"
            onClick={() => {
              navigator.clipboard.writeText(email);
              toast.success("Email copied");
            }}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        {revealedPassword ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Password:</span>
            <code className="rounded bg-muted px-2 py-0.5 text-xs">{revealedPassword}</code>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5"
              onClick={() => {
                navigator.clipboard.writeText(revealedPassword);
                toast.success("Password copied");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
            <span className="text-[11px] text-muted-foreground">Shown once — copy it now.</span>
          </div>
        ) : hint ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Password on file (hint <code className="rounded bg-muted px-1">{hint}</code>). Rotate to
            reveal a new one.
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
