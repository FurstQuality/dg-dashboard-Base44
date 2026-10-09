import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { useEffect, useState } from "react";
import { AdminErrorState, AdminPanelSkeleton } from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/features")({
  component: AdminFeatures,
  head: () => ({
    meta: [
      { title: "Feature matrix · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Toggle capabilities and per-period limits for each subscription plan.",
      },
      { property: "og:title", content: "Feature matrix · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Toggle capabilities and per-period limits for each subscription plan.",
      },
    ],
  }),
});

type Feature = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  unit: "boolean" | "count" | "per_month" | "per_day";
  sort_order: number;
  is_active: boolean;
};

type Tier = { id: string; key: string; name: string; sort_order: number };

type TierFeature = {
  id: string;
  tier_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
  reset_period: "month" | "day" | "never";
};

function AdminFeatures() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "features-matrix"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const [f, t, tf] = await Promise.all([
        supabase.from("feature_flags").select("*").order("sort_order"),
        supabase.from("subscription_tiers").select("id, key, name, sort_order").order("sort_order"),
        supabase.from("tier_features").select("*"),
      ]);
      return {
        features: (f.data ?? []) as Feature[],
        tiers: (t.data ?? []) as Tier[],
        tierFeatures: (tf.data ?? []) as TierFeature[],
      };
    },
  });

  const upsertCell = useMutation({
    mutationFn: async (row: {
      tier_id: string;
      feature_key: string;
      enabled: boolean;
      limit_value: number | null;
      reset_period: string;
    }) => {
      const { error } = await supabase
        .from("tier_features")
        .upsert(row, { onConflict: "tier_id,feature_key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "features-matrix"] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const createFeature = useMutation({
    mutationFn: async (f: Partial<Feature>) => {
      if (!f.key || !f.label) throw new Error("Key and label are required");
      const { error } = await supabase.from("feature_flags").insert({
        key: f.key,
        label: f.label,
        description: f.description ?? null,
        category: f.category ?? "general",
        unit: f.unit ?? "boolean",
        sort_order: (q.data?.features.length ?? 0) * 10 + 200,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feature created");
      qc.invalidateQueries({ queryKey: ["admin", "features-matrix"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [newFeature, setNewFeature] = useState<Partial<Feature>>({
    unit: "boolean",
    category: "general",
  });

  if (loading) return null;
  if (!user || !isAdmin)
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super admin access required." />
      </PageShell>
    );

  const { features = [], tiers = [], tierFeatures = [] } = q.data ?? {};

  function findCell(tierId: string, featureKey: string): TierFeature | undefined {
    return tierFeatures.find((r) => r.tier_id === tierId && r.feature_key === featureKey);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Feature matrix"
        description="Toggle which capabilities each tier includes and set per-period limits. Rows are features, columns are tiers."
      />

      {q.isError ? (
        <AdminErrorState
          title="We couldn't load the feature matrix"
          message="The plans and features didn't come back. Try again in a moment."
          onRetry={() => void q.refetch()}
          retrying={q.isFetching}
        />
      ) : q.isPending ? (
        <AdminPanelSkeleton rows={5} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Feature</th>
                <th className="px-3 py-2 text-left">Unit</th>
                {tiers.map((t) => (
                  <th key={t.id} className="px-3 py-2 text-left">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((f) => (
                <tr key={f.id} className="border-t align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-[11px] text-muted-foreground">{f.key}</div>
                    {f.description ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground [text-wrap:pretty]">
                        {f.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{f.unit}</td>
                  {tiers.map((t) => {
                    const cell = findCell(t.id, f.key);
                    return (
                      <td key={t.id} className="px-3 py-3">
                        <MatrixCell
                          tierId={t.id}
                          featureKey={f.key}
                          unit={f.unit}
                          cell={cell}
                          onChange={(row) => upsertCell.mutate(row)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <div className="text-sm font-semibold">Add a new feature</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label className="text-xs">Key</Label>
            <Input
              placeholder="events.host_pdga"
              value={newFeature.key ?? ""}
              onChange={(e) => setNewFeature({ ...newFeature, key: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Label</Label>
            <Input
              placeholder="Host PDGA-sanctioned events"
              value={newFeature.label ?? ""}
              onChange={(e) => setNewFeature({ ...newFeature, label: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Input
              value={newFeature.category ?? ""}
              onChange={(e) => setNewFeature({ ...newFeature, category: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={newFeature.unit ?? "boolean"}
              onChange={(e) =>
                setNewFeature({ ...newFeature, unit: e.target.value as Feature["unit"] })
              }
            >
              <option value="boolean">boolean</option>
              <option value="count">count</option>
              <option value="per_month">per_month</option>
              <option value="per_day">per_day</option>
            </select>
          </div>
          <div className="sm:col-span-2 lg:col-span-4">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={newFeature.description ?? ""}
              onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={() => {
              if (!newFeature.key || !newFeature.label) {
                toast.error("Key and label are required");
                return;
              }
              createFeature.mutate(newFeature);
              setNewFeature({ unit: "boolean", category: "general" });
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add feature
          </Button>
        </div>
      </div>
    </PageShell>
  );
}

function MatrixCell({
  tierId,
  featureKey,
  unit,
  cell,
  onChange,
}: {
  tierId: string;
  featureKey: string;
  unit: Feature["unit"];
  cell?: TierFeature;
  onChange: (row: {
    tier_id: string;
    feature_key: string;
    enabled: boolean;
    limit_value: number | null;
    reset_period: string;
  }) => void;
}) {
  const [enabled, setEnabled] = useState(cell?.enabled ?? false);
  const [limit, setLimit] = useState<string>(
    cell?.limit_value == null ? "" : String(cell.limit_value),
  );
  const [reset, setReset] = useState<string>(
    cell?.reset_period ?? (unit === "per_day" ? "day" : unit === "per_month" ? "month" : "never"),
  );

  // Keep local state in sync when the row's cell prop actually changes.
  useEffect(() => {
    setEnabled(cell?.enabled ?? false);
    setLimit(cell?.limit_value == null ? "" : String(cell.limit_value));
    setReset(
      cell?.reset_period ?? (unit === "per_day" ? "day" : unit === "per_month" ? "month" : "never"),
    );
  }, [cell?.id, cell?.enabled, cell?.limit_value, cell?.reset_period, unit]);

  function commit(nextEnabled = enabled) {
    onChange({
      tier_id: tierId,
      feature_key: featureKey,
      enabled: nextEnabled,
      limit_value: limit === "" ? null : Number(limit),
      reset_period: reset,
    });
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs">
        <input
          type="checkbox"
          className="h-3.5 w-3.5"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            commit(e.target.checked);
          }}
        />
        {enabled ? "Included" : "Locked"}
      </label>
      {enabled && unit !== "boolean" ? (
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-16 text-xs"
            placeholder="∞"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            onBlur={() => commit()}
          />
          <select
            className="h-7 rounded-md border bg-background px-1 text-xs"
            value={reset}
            onChange={(e) => {
              setReset(e.target.value);
              onChange({
                tier_id: tierId,
                feature_key: featureKey,
                enabled,
                limit_value: limit === "" ? null : Number(limit),
                reset_period: e.target.value,
              });
            }}
          >
            <option value="never">total</option>
            <option value="day">/day</option>
            <option value="month">/month</option>
          </select>
        </div>
      ) : null}
    </div>
  );
}
