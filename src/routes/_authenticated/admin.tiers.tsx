import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/current-user";
import { useAdminAccess } from "@/lib/admin-access";
import { useState } from "react";
import {
  AdminErrorState,
  AdminPanelSkeleton,
  AdminEmptyState,
} from "@/components/admin/admin-states";

export const Route = createFileRoute("/_authenticated/admin/tiers")({
  component: AdminTiers,
  head: () => ({
    meta: [
      { title: "Tiers · Admin · DG Dashboard" },
      {
        name: "description",
        content: "Edit prices, trial periods, and provider IDs for every plan.",
      },
      { property: "og:title", content: "Tiers · Admin · DG Dashboard" },
      {
        property: "og:description",
        content: "Edit prices, trial periods, and provider IDs for every plan.",
      },
    ],
  }),
});

type Tier = {
  id: string;
  key: string;
  name: string;
  tagline: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  is_public: boolean;
  color: string | null;
  icon: string | null;
  monthly_price_cents: number;
  yearly_price_cents: number;
  currency: string;
  trial_days: number;
  stripe_product_id: string | null;
  stripe_monthly_price_id: string | null;
  stripe_yearly_price_id: string | null;
  apple_product_id: string | null;
  google_product_id: string | null;
};

function AdminTiers() {
  const { user, loading } = useSession();
  const { isAdmin } = useAdminAccess();
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["admin", "tiers"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("subscription_tiers").select("*").order("sort_order");
      return (data ?? []) as Tier[];
    },
  });

  const save = useMutation({
    mutationFn: async (t: Tier) => {
      const { error } = await supabase
        .from("subscription_tiers")
        .update({
          name: t.name,
          tagline: t.tagline,
          description: t.description,
          sort_order: t.sort_order,
          is_active: t.is_active,
          is_public: t.is_public,
          color: t.color,
          icon: t.icon,
          monthly_price_cents: t.monthly_price_cents,
          yearly_price_cents: t.yearly_price_cents,
          currency: t.currency,
          trial_days: t.trial_days,
          stripe_product_id: t.stripe_product_id || null,
          stripe_monthly_price_id: t.stripe_monthly_price_id || null,
          stripe_yearly_price_id: t.stripe_yearly_price_id || null,
          apple_product_id: t.apple_product_id || null,
          google_product_id: t.google_product_id || null,
        })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier saved");
      qc.invalidateQueries({ queryKey: ["admin", "tiers"] });
      qc.invalidateQueries({ queryKey: ["subscription-tiers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const create = useMutation({
    mutationFn: async (input: { key: string; name: string }) => {
      const { error } = await supabase.from("subscription_tiers").insert({
        key: input.key,
        name: input.name,
        sort_order: (q.data?.length ?? 0) * 10 + 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier created");
      qc.invalidateQueries({ queryKey: ["admin", "tiers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subscription_tiers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tier deleted");
      qc.invalidateQueries({ queryKey: ["admin", "tiers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [newKey, setNewKey] = useState("");
  const [newName, setNewName] = useState("");

  if (loading) return null;
  if (!user || !isAdmin)
    return (
      <PageShell>
        <PageHeader title="Admin only" description="Super admin access required." />
      </PageShell>
    );

  return (
    <PageShell>
      <PageHeader
        eyebrow="Admin"
        title="Subscription tiers"
        description="Edit prices, feature access, and provider IDs for every plan. Changes take effect immediately across the app."
      />

      <div className="rounded-xl border bg-card p-4">
        <div className="text-sm font-semibold">Add a new tier</div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div className="min-w-40">
            <Label className="text-xs">Key</Label>
            <Input
              placeholder="team, td_pro, ..."
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>
          <div className="min-w-40">
            <Label className="text-xs">Display name</Label>
            <Input
              placeholder="Team"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <Button
            onClick={() => {
              if (!newKey || !newName) return;
              create.mutate({ key: newKey, name: newName });
              setNewKey("");
              setNewName("");
            }}
            disabled={create.isPending}
          >
            <Plus className="mr-1 h-4 w-4" /> Add tier
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {q.isError ? (
          <AdminErrorState
            title="We couldn't load the plans"
            message="The tier list didn't come back. Try again in a moment."
            onRetry={() => void q.refetch()}
            retrying={q.isFetching}
          />
        ) : q.isPending ? (
          <AdminPanelSkeleton rows={3} />
        ) : !q.data?.length ? (
          <AdminEmptyState
            title="No plans yet"
            message="Create your first plan above to start assigning features and limits."
          />
        ) : (
          q.data.map((tier) => (
            <TierEditor key={tier.id} tier={tier} onSave={save.mutate} onDelete={remove.mutate} />
          ))
        )}
      </div>
    </PageShell>
  );
}

function TierEditor({
  tier,
  onSave,
  onDelete,
}: {
  tier: Tier;
  onSave: (t: Tier) => void;
  onDelete: (id: string) => void;
}) {
  const [t, setT] = useState<Tier>(tier);
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t.key}</div>
          <Input
            value={t.name}
            onChange={(e) => setT({ ...t, name: e.target.value })}
            className="mt-1 font-display text-lg"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant={t.is_active ? "secondary" : "outline"}
            onClick={() => setT({ ...t, is_active: !t.is_active })}
          >
            {t.is_active ? (
              <>
                <Archive className="mr-1 h-3.5 w-3.5" /> Active
              </>
            ) : (
              <>
                <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Archived
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant={t.is_public ? "secondary" : "outline"}
            onClick={() => setT({ ...t, is_public: !t.is_public })}
          >
            {t.is_public ? "Public" : "Hidden"}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-xs">Tagline</Label>
        <Input value={t.tagline ?? ""} onChange={(e) => setT({ ...t, tagline: e.target.value })} />
      </div>
      <div className="mt-3">
        <Label className="text-xs">Description</Label>
        <Textarea
          rows={2}
          value={t.description ?? ""}
          onChange={(e) => setT({ ...t, description: e.target.value })}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <NumField
          label="Monthly ($)"
          value={t.monthly_price_cents / 100}
          onChange={(v) => setT({ ...t, monthly_price_cents: Math.round(v * 100) })}
        />
        <NumField
          label="Yearly ($)"
          value={t.yearly_price_cents / 100}
          onChange={(v) => setT({ ...t, yearly_price_cents: Math.round(v * 100) })}
        />
        <NumField
          label="Trial (days)"
          value={t.trial_days}
          onChange={(v) => setT({ ...t, trial_days: Math.max(0, Math.round(v)) })}
        />
        <NumField
          label="Sort order"
          value={t.sort_order}
          onChange={(v) => setT({ ...t, sort_order: Math.round(v) })}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="Stripe Product ID"
          value={t.stripe_product_id}
          onChange={(v) => setT({ ...t, stripe_product_id: v })}
          placeholder="prod_..."
        />
        <TextField
          label="Stripe Monthly Price ID"
          value={t.stripe_monthly_price_id}
          onChange={(v) => setT({ ...t, stripe_monthly_price_id: v })}
          placeholder="price_..."
        />
        <TextField
          label="Stripe Yearly Price ID"
          value={t.stripe_yearly_price_id}
          onChange={(v) => setT({ ...t, stripe_yearly_price_id: v })}
          placeholder="price_..."
        />
        <TextField
          label="Apple Product ID"
          value={t.apple_product_id}
          onChange={(v) => setT({ ...t, apple_product_id: v })}
          placeholder="com.dgdashboard.pro.monthly"
        />
        <TextField
          label="Google Product ID"
          value={t.google_product_id}
          onChange={(v) => setT({ ...t, google_product_id: v })}
          placeholder="pro_monthly"
        />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => onSave(t)}>
          <Save className="mr-1 h-4 w-4" /> Save
        </Button>
        <Button
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Delete tier "${t.name}"? Existing subscribers keep access.`))
              onDelete(t.id);
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
