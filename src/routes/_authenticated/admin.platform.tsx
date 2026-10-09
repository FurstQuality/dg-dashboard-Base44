import { createFileRoute, redirect } from "@tanstack/react-router";
import { PageShell } from "@/components/shell/page-shell";
import { PageHeader } from "@/components/shell/page-header";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sliders, Save, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformConfig, savePlatformConfig } from "@/lib/platform-config.functions";
import { PLATFORM_CONFIG_DEFAULTS, type PlatformConfig } from "@/lib/platform-config";

export const Route = createFileRoute("/_authenticated/admin/platform")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", uid)
      .in("role", ["super_admin", "admin"])
      .maybeSingle();
    if (!data) throw redirect({ to: "/home" });
  },
  head: () => ({
    meta: [
      { title: "Platform Configuration · DG Dashboard" },
      {
        name: "description",
        content:
          "Configure platform-wide defaults, integrations, and feature switches for DG Dashboard | Ace.",
      },
      { property: "og:title", content: "Platform Configuration · DG Dashboard" },
      {
        property: "og:description",
        content: "Admin controls for platform defaults, integrations, and feature switches.",
      },
    ],
  }),
  component: PlatformConfigPage,
});

function PlatformConfigPage() {
  const load = useServerFn(getPlatformConfig);
  const save = useServerFn(savePlatformConfig);
  const [cfg, setCfg] = useState<PlatformConfig>(PLATFORM_CONFIG_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load()
      .then((r) => setCfg(r))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [load]);

  async function onSave() {
    setSaving(true);
    try {
      await save({ data: { config: cfg } });
      toast.success("Platform config saved — changes apply immediately");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetSection<K extends keyof PlatformConfig>(section: K) {
    setCfg((c) => ({ ...c, [section]: PLATFORM_CONFIG_DEFAULTS[section] }));
  }

  const set = <K extends keyof PlatformConfig>(section: K, patch: Partial<PlatformConfig[K]>) =>
    setCfg((c) => ({
      ...c,
      [section]: { ...(c[section] as object), ...patch } as PlatformConfig[K],
    }));

  return (
    <PageShell>
      <PageHeader
        title="Platform configuration"
        description="Admin-only controls for platform-wide defaults, integrations, and feature switches."
      />
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-primary">
          <Sparkles className="h-4 w-4" /> Admin-only platform configuration
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          These values apply to every player. Changes save instantly and are picked up on the next
          page load. Sensitive server behavior (webhooks, secrets, DB schema) is not exposed here.
        </div>
      </div>

      <Section
        title="Brand copy"
        hint="Displayed in headers, emails, and share cards."
        onReset={() => resetSection("brand")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Display name"
            value={cfg.brand.displayName}
            onChange={(v) => set("brand", { displayName: v })}
          />
          <TextField
            label="Tagline"
            value={cfg.brand.tagline}
            onChange={(v) => set("brand", { tagline: v })}
          />
          <TextField
            label="Support email"
            value={cfg.brand.supportEmail}
            onChange={(v) => set("brand", { supportEmail: v })}
          />
          <TextField
            label="Support URL"
            value={cfg.brand.supportUrl}
            onChange={(v) => set("brand", { supportUrl: v })}
          />
          <TextField
            label="Marketing URL"
            value={cfg.brand.marketingUrl}
            onChange={(v) => set("brand", { marketingUrl: v })}
          />
        </div>
      </Section>

      <Section
        title="Rating engine"
        hint="Controls the PDGA-style rolling average used across DG Statboard."
        onReset={() => resetSection("rating")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <NumField
            label="Window size (rounds)"
            value={cfg.rating.windowSize}
            onChange={(v) => set("rating", { windowSize: v })}
            min={5}
            max={100}
          />
          <NumField
            label="Drop worst N"
            value={cfg.rating.dropWorst}
            onChange={(v) => set("rating", { dropWorst: v })}
            min={0}
            max={10}
          />
          <NumField
            label="Min confident rounds"
            value={cfg.rating.minConfidentRounds}
            onChange={(v) => set("rating", { minConfidentRounds: v })}
            min={1}
            max={50}
          />
          <NumField
            label="Recency decay (0.5–1.0)"
            value={cfg.rating.recencyDecay}
            onChange={(v) => set("rating", { recencyDecay: v })}
            min={0.5}
            max={1}
            step={0.01}
          />
        </div>
      </Section>

      <Section
        title="XP & levels"
        hint="Tune progression rewards for the challenges/achievements system."
        onReset={() => resetSection("xp")}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField
            label="XP per round"
            value={cfg.xp.perRound}
            onChange={(v) => set("xp", { perRound: v })}
            min={0}
          />
          <NumField
            label="XP per birdie"
            value={cfg.xp.perBirdie}
            onChange={(v) => set("xp", { perBirdie: v })}
            min={0}
          />
          <NumField
            label="XP per eagle"
            value={cfg.xp.perEagle}
            onChange={(v) => set("xp", { perEagle: v })}
            min={0}
          />
          <NumField
            label="XP per ace"
            value={cfg.xp.perAce}
            onChange={(v) => set("xp", { perAce: v })}
            min={0}
          />
          <NumField
            label="Level base"
            value={cfg.xp.levelBase}
            onChange={(v) => set("xp", { levelBase: v })}
            min={10}
          />
          <NumField
            label="Level curve"
            value={cfg.xp.levelCurve}
            onChange={(v) => set("xp", { levelCurve: v })}
            min={1}
            max={3}
            step={0.05}
          />
        </div>
      </Section>

      <Section
        title="PDGA sync cadence"
        hint="How often background jobs refresh PDGA data."
        onReset={() => resetSection("pdga")}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <NumField
            label="Rating refresh (hours)"
            value={cfg.pdga.ratingRefreshHours}
            onChange={(v) => set("pdga", { ratingRefreshHours: v })}
            min={1}
            max={168}
          />
          <NumField
            label="Schedule refresh (hours)"
            value={cfg.pdga.scheduleRefreshHours}
            onChange={(v) => set("pdga", { scheduleRefreshHours: v })}
            min={1}
            max={168}
          />
          <NumField
            label="Profile touch window (days)"
            value={cfg.pdga.profileTouchDays}
            onChange={(v) => set("pdga", { profileTouchDays: v })}
            min={7}
            max={365}
          />
        </div>
      </Section>

      <Section
        title="Feature flags"
        hint="Global kill switches. Turning off hides the surface everywhere; existing data is preserved."
        onReset={() => resetSection("features")}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(cfg.features) as (keyof PlatformConfig["features"])[]).map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3"
            >
              <div className="text-sm font-medium capitalize">
                {k.replace(/([A-Z])/g, " $1").trim()}
              </div>
              <Switch
                checked={cfg.features[k]}
                onCheckedChange={(v) =>
                  set("features", { [k]: v } as Partial<PlatformConfig["features"]>)
                }
              />
            </label>
          ))}
        </div>
      </Section>

      <Section
        title="Beta mode"
        hint="When enabled, every paid feature is unlocked for all users regardless of subscription tier."
      >
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3">
          <div>
            <div className="text-sm font-medium">Global beta unlock</div>
            <div className="text-[11px] text-muted-foreground">Ignores tier gating everywhere.</div>
          </div>
          <Switch
            checked={cfg.betaMode}
            onCheckedChange={(v) => setCfg((c) => ({ ...c, betaMode: v }))}
          />
        </label>
      </Section>

      <div className="sticky bottom-4 flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => setCfg(PLATFORM_CONFIG_DEFAULTS)}
          disabled={loading}
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> Reset all
        </Button>
        <Button onClick={onSave} disabled={loading || saving}>
          <Save className="mr-1.5 h-4 w-4" />
          {saving ? "Saving…" : "Save platform config"}
        </Button>
      </div>
    </PageShell>
  );
}

function Section({
  title,
  hint,
  children,
  onReset,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  onReset?: () => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sliders className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
        </div>
        {onReset && (
          <Button variant="ghost" size="sm" onClick={onReset} className="text-xs">
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset section
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </div>
  );
}
