import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bug,
  Lightbulb,
  Star,
  ShieldAlert,
  Save,
  Filter,
  Trash2,
  MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { BetaScreenshotPreview } from "@/components/beta/beta-screenshot-preview";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";
import {
  BETA_PRIORITIES,
  BETA_STATUSES,
  kindLabel,
  statusLabel,
  type BetaFeedback,
  type BetaFeedbackKind,
  type BetaFeedbackStatus,
  type BetaProgram,
} from "@/lib/beta";

export const Route = createFileRoute("/_authenticated/admin/beta")({
  component: AdminBeta,
  head: () => ({
    meta: [
      { title: "Beta triage · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Turn beta mode on, brief your testers, and triage every bug, idea, and rating.",
      },
      { property: "og:title", content: "Beta triage · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Turn beta mode on, brief your testers, and triage every bug, idea, and rating.",
      },
    ],
  }),
});

const KIND_ICON: Record<BetaFeedbackKind, typeof Bug> = { bug: Bug, idea: Lightbulb, rating: Star };

function AdminBeta() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();

  const programQ = useQuery({
    queryKey: ["beta", "program"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("beta_program").select("*").maybeSingle();
      if (error) throw error;
      return data as BetaProgram | null;
    },
  });

  const feedbackQ = useQuery({
    queryKey: ["beta", "admin-feedback"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beta_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as BetaFeedback[];
    },
  });

  const [statusFilter, setStatusFilter] = useState<BetaFeedbackStatus | "all">("all");
  const [kindFilter, setKindFilter] = useState<BetaFeedbackKind | "all">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const rows = feedbackQ.data ?? [];
  const areas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.feature_area).filter(Boolean) as string[])).sort(),
    [rows],
  );

  const filtered = rows.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (kindFilter !== "all" && r.kind !== kindFilter) return false;
    if (areaFilter !== "all" && r.feature_area !== areaFilter) return false;
    if (q.trim()) {
      const hay =
        `${r.title} ${r.body ?? ""} ${r.page_label ?? ""} ${r.route_path ?? ""}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const stats = useMemo(() => {
    const open = rows.filter((r) => !["resolved", "wont_fix", "duplicate"].includes(r.status));
    const ratings = rows.filter((r) => r.kind === "rating" && r.rating);
    const avg = ratings.length
      ? ratings.reduce((s, r) => s + (r.rating ?? 0), 0) / ratings.length
      : null;
    const testers = new Set(rows.map((r) => r.user_id)).size;
    const byPage = new Map<string, number>();
    for (const r of rows) {
      const k = r.page_label ?? r.route_path ?? "unknown";
      byPage.set(k, (byPage.get(k) ?? 0) + 1);
    }
    return {
      open: open.length,
      blockers: rows.filter((r) => r.severity === "blocker" && r.status !== "resolved").length,
      testers,
      avg,
      topPages: [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [rows]);

  const saveProgram = useMutation({
    mutationFn: async (p: Partial<BetaProgram>) => {
      const { error } = await supabase
        .from("beta_program")
        .update({ ...p, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Beta settings saved.");
      qc.invalidateQueries({ queryKey: ["beta"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRow = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BetaFeedback> }) => {
      const { error } = await supabase.from("beta_feedback").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["beta", "admin-feedback"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("beta_feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submission deleted.");
      qc.invalidateQueries({ queryKey: ["beta", "admin-feedback"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return null;
  if (!user || !isAdmin) {
    return (
      <PageShell>
        <PageHeader
          title="Admin only"
          description="You need super admin access to open beta triage."
        />
        <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          <ShieldAlert className="h-4 w-4" /> Access denied.
        </div>
      </PageShell>
    );
  }

  const program = programQ.data;

  return (
    <PageShell>
      <PageHeader
        title="Beta triage"
        description="Switch beta mode on for your testers, brief them on what to hit, and work the incoming feedback."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Open items" value={stats.open} />
        <Kpi label="Open blockers" value={stats.blockers} />
        <Kpi label="Testers reporting" value={stats.testers} />
        <Kpi label="Avg page rating" value={stats.avg ? stats.avg.toFixed(1) : "—"} />
      </div>

      <Tabs defaultValue="board">
        <TabsList>
          <TabsTrigger value="board">Triage board</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="settings">Program settings</TabsTrigger>
        </TabsList>

        <TabsContent value="board" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search title, details, or page"
              className="h-9 w-full sm:w-64"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as never)}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {BETA_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as never)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="bug">Bugs</SelectItem>
                <SelectItem value="idea">Ideas</SelectItem>
                <SelectItem value="rating">Page ratings</SelectItem>
              </SelectContent>
            </Select>
            <Select value={areaFilter} onValueChange={setAreaFilter}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue placeholder="Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All areas</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-auto text-sm text-muted-foreground">
              {filtered.length} of {rows.length}
            </span>
          </div>

          {feedbackQ.isError ? (
            <AdminErrorState
              title="We couldn't load tester feedback"
              message="The feedback list didn't come back. Try again in a moment."
              onRetry={() => void feedbackQ.refetch()}
              retrying={feedbackQ.isFetching}
            />
          ) : feedbackQ.isPending ? (
            <AdminPanelSkeleton rows={3} />
          ) : filtered.length === 0 ? (
            <AdminEmptyState
              title={rows.length ? "Nothing matches those filters" : "No feedback yet"}
              message={
                rows.length
                  ? "Widen the filters above to see the rest of the feedback."
                  : "As soon as a tester sends a report, it lands here with the screen they were on."
              }
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((r) => (
                <FeedbackCard
                  key={r.id}
                  row={r}
                  onPatch={(patch) => updateRow.mutate({ id: r.id, patch })}
                  onDelete={() => {
                    if (confirm("Delete this feedback report? This can't be undone."))
                      removeRow.mutate(r.id);
                  }}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="coverage" className="mt-4 space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-base font-semibold">Most-reported screens</h2>
            <p className="text-sm text-muted-foreground">
              Where testers are spending their attention — and where the app hurts most.
            </p>
            <ul className="mt-3 space-y-2">
              {stats.topPages.length === 0 ? (
                <li className="text-sm text-muted-foreground">No feedback yet.</li>
              ) : (
                stats.topPages.map(([page, count]) => (
                  <li key={page} className="flex items-center justify-between text-sm">
                    <span className="truncate">{page}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </li>
                ))
              )}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {program ? (
            <ProgramSettings
              program={program}
              onSave={(p) => saveProgram.mutate(p)}
              saving={saveProgram.isPending}
            />
          ) : (
            <AdminPanelSkeleton rows={2} />
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function FeedbackCard({
  row,
  onPatch,
  onDelete,
}: {
  row: BetaFeedback;
  onPatch: (patch: Partial<BetaFeedback>) => void;
  onDelete: () => void;
}) {
  const Icon = KIND_ICON[row.kind];
  const [note, setNote] = useState(row.resolution_note ?? "");

  return (
    <li className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.title}</span>
            {row.severity ? <Badge variant="outline">{row.severity}</Badge> : null}
            {row.rating ? <Badge variant="outline">{row.rating}★</Badge> : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {kindLabel(row.kind)} · {row.feature_area ?? "Unsorted"} ·{" "}
            {row.page_label ?? row.route_path ?? "—"} · {row.build_label ?? "no build"} ·{" "}
            {new Date(row.created_at).toLocaleString()}
          </p>
        </div>
        <Badge variant={row.status === "resolved" ? "default" : "secondary"}>
          {statusLabel(row.status)}
        </Badge>
      </div>

      {row.body ? (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{row.body}</p>
      ) : null}
      <BetaScreenshotPreview path={row.screenshot_path} />
      {row.viewport || row.user_agent ? (
        <p className="mt-2 truncate text-xs text-muted-foreground">
          {row.viewport ? `Viewport ${row.viewport}` : null}
          {row.user_agent ? ` · ${row.user_agent}` : null}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select
          value={row.status}
          onValueChange={(v) =>
            onPatch({
              status: v as BetaFeedbackStatus,
              resolved_at: v === "resolved" ? new Date().toISOString() : null,
            })
          }
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BETA_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(row.priority)}
          onValueChange={(v) => onPatch({ priority: Number(v) })}
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BETA_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={String(p.value)}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5 text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <div className="mt-3 space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs">
          <MessageSquare className="h-3.5 w-3.5" /> Reply to the tester
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Fixed in build beta-2 — tee times now come from the pool layout."
          />
          <Button
            variant="secondary"
            className="gap-1.5 sm:self-end"
            onClick={() => onPatch({ resolution_note: note.trim() || null })}
          >
            <Save className="h-4 w-4" /> Save
          </Button>
        </div>
      </div>
    </li>
  );
}

function ProgramSettings({
  program,
  onSave,
  saving,
}: {
  program: BetaProgram;
  onSave: (p: Partial<BetaProgram>) => void;
  saving: boolean;
}) {
  const [draft, setDraft] = useState<BetaProgram>(program);
  const set = <K extends keyof BetaProgram>(k: K, v: BetaProgram[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="font-medium">Beta mode</p>
          <p className="text-sm text-muted-foreground">
            When on, every signed-in player sees the beta banner and the feedback button.
          </p>
        </div>
        <Switch
          checked={draft.is_enabled}
          onCheckedChange={(v) => set("is_enabled", v)}
          aria-label="Beta mode"
        />
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
        <div>
          <p className="font-medium">Show the beta banner</p>
          <p className="text-sm text-muted-foreground">
            A slim strip at the top of the app naming the build under test.
          </p>
        </div>
        <Switch
          checked={draft.show_banner}
          onCheckedChange={(v) => set("show_banner", v)}
          aria-label="Beta banner"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Program name</Label>
          <Input
            id="p-name"
            value={draft.program_name}
            onChange={(e) => set("program_name", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-build">Build label</Label>
          <Input
            id="p-build"
            value={draft.build_label}
            onChange={(e) => set("build_label", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="p-welcome">Tester briefing</Label>
        <Textarea
          id="p-welcome"
          rows={3}
          value={draft.welcome_message}
          onChange={(e) => set("welcome_message", e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="p-focus">Focus areas (comma separated)</Label>
          <Input
            id="p-focus"
            value={(draft.focus_areas ?? []).join(", ")}
            onChange={(e) =>
              set(
                "focus_areas",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-email">Contact email for testers</Label>
          <Input
            id="p-email"
            type="email"
            value={draft.contact_email ?? ""}
            onChange={(e) => set("contact_email", e.target.value || null)}
          />
        </div>
      </div>

      <Button className="gap-2" disabled={saving} onClick={() => onSave(draft)}>
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save beta settings"}
      </Button>
    </div>
  );
}
