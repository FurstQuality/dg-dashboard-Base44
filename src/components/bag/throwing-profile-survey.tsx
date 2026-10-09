import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, Gauge } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LABELS,
  GOAL_OPTIONS,
  PLASTIC_PREFERENCES,
  PUTTING_STYLES,
  SHOT_SHAPES,
  STABILITY_BIASES,
  THROW_STYLES,
  WIND_COMFORT,
  emptyThrowingProfile,
  saveThrowingProfile,
  throwingProfileQueryOptions,
  type ShotShapeKey,
  type ThrowingProfile,
} from "@/lib/throwing-profile";

type Props = {
  userId: string;
  profile: ThrowingProfile | null;
  onDone?: () => void;
};

const STEPS = ["You", "Power", "Measured numbers", "Shot shapes", "Discs & goals"] as const;

function num(value: string): number | null {
  const n = Number(value);
  return value.trim() === "" || Number.isNaN(n) ? null : n;
}

/** The throwing profile survey: five short steps, all optional to skip. */
export function ThrowingProfileSurvey({ userId, profile, onDone }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ThrowingProfile>(
    () => profile ?? emptyThrowingProfile(userId),
  );

  const set = <K extends keyof ThrowingProfile>(key: K, value: ThrowingProfile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const toggleList = (key: "secondary_styles" | "goals", value: string) =>
    setDraft((d) => {
      const list = d[key] ?? [];
      return {
        ...d,
        [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
      };
    });

  const setShape = (kind: "shot_confidence" | "shot_usage", shape: ShotShapeKey, value: number) =>
    setDraft((d) => ({ ...d, [kind]: { ...(d[kind] ?? {}), [shape]: value } }));

  const answered = useMemo(
    () => Object.keys(draft.shot_confidence ?? {}).length,
    [draft.shot_confidence],
  );

  async function save() {
    setSaving(true);
    try {
      const { user_id: _ignored, ...rest } = draft;
      await saveThrowingProfile(userId, rest);
      await queryClient.invalidateQueries({
        queryKey: throwingProfileQueryOptions(userId).queryKey,
      });
      toast.success("Throwing profile saved — your bag advice now uses it.");
      onDone?.();
    } catch {
      toast.error("We couldn't save your throwing profile. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              index === step
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {index + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Throwing hand">
            <Choice
              options={[
                { value: "right", label: "Right" },
                { value: "left", label: "Left" },
              ]}
              value={draft.handedness}
              onChange={(v) => set("handedness", v as ThrowingProfile["handedness"])}
            />
          </Field>
          <Field label="Main throw">
            <Choice
              options={[
                { value: "backhand", label: "Backhand" },
                { value: "forehand", label: "Forehand" },
              ]}
              value={draft.primary_style}
              onChange={(v) => set("primary_style", v as ThrowingProfile["primary_style"])}
            />
          </Field>
          <Field label="Other throws you use" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {THROW_STYLES.map((s) => (
                <Toggle
                  key={s.key}
                  active={(draft.secondary_styles ?? []).includes(s.key)}
                  onClick={() => toggleList("secondary_styles", s.key)}
                >
                  {s.label}
                </Toggle>
              ))}
            </div>
          </Field>
          <Field label="Years playing">
            <Input
              type="number"
              min={0}
              value={draft.years_playing ?? ""}
              onChange={(e) => set("years_playing", num(e.target.value))}
            />
          </Field>
          <Field label="Rounds per month">
            <Input
              type="number"
              min={0}
              value={draft.rounds_per_month ?? ""}
              onChange={(e) => set("rounds_per_month", num(e.target.value))}
            />
          </Field>
          <Field label="Field-work sessions per month">
            <Input
              type="number"
              min={0}
              value={draft.field_work_per_month ?? ""}
              onChange={(e) => set("field_work_per_month", num(e.target.value))}
            />
          </Field>
          <Field label="Putting style">
            <Select
              options={PUTTING_STYLES}
              value={draft.putting_style}
              onChange={(v) => set("putting_style", v)}
            />
          </Field>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full-power backhand (ft)" hint="Your best throw on flat, open ground.">
            <Input
              type="number"
              min={50}
              max={800}
              value={draft.backhand_max_ft ?? ""}
              onChange={(e) => set("backhand_max_ft", num(e.target.value))}
            />
          </Field>
          <Field label="Comfortable backhand (ft)" hint="The throw you can repeat all round.">
            <Input
              type="number"
              min={50}
              max={800}
              value={draft.backhand_comfort_ft ?? ""}
              onChange={(e) => set("backhand_comfort_ft", num(e.target.value))}
            />
          </Field>
          <Field label="Full-power forehand (ft)">
            <Input
              type="number"
              min={0}
              max={800}
              value={draft.forehand_max_ft ?? ""}
              onChange={(e) => set("forehand_max_ft", num(e.target.value))}
            />
          </Field>
          <Field label="Comfortable forehand (ft)">
            <Input
              type="number"
              min={0}
              max={800}
              value={draft.forehand_comfort_ft ?? ""}
              onChange={(e) => set("forehand_comfort_ft", num(e.target.value))}
            />
          </Field>
          <Field label="Putts you expect to make (ft)">
            <Input
              type="number"
              min={5}
              max={100}
              value={draft.putting_confident_ft ?? ""}
              onChange={(e) => set("putting_confident_ft", num(e.target.value))}
            />
          </Field>
          <Field label="Wind">
            <Select
              options={WIND_COMFORT}
              value={draft.wind_comfort}
              onChange={(v) => set("wind_comfort", v)}
            />
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Gauge className="mt-0.5 h-4 w-4 shrink-0" />
            If you have thrown on a TechDisc, launch monitor or radar, put those numbers here. They
            sharpen every distance estimate in your bag. Leave them blank and we estimate from your
            reported distance instead.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Disc speed (mph)">
              <Input
                type="number"
                step="0.1"
                value={draft.disc_speed_mph ?? ""}
                onChange={(e) => set("disc_speed_mph", num(e.target.value))}
              />
            </Field>
            <Field label="Spin (RPM)">
              <Input
                type="number"
                value={draft.spin_rpm ?? ""}
                onChange={(e) => set("spin_rpm", num(e.target.value))}
              />
            </Field>
            <Field label="Launch angle (°)">
              <Input
                type="number"
                step="0.1"
                value={draft.launch_angle_deg ?? ""}
                onChange={(e) => set("launch_angle_deg", num(e.target.value))}
              />
            </Field>
            <Field label="Nose angle (°)">
              <Input
                type="number"
                step="0.1"
                value={draft.nose_angle_deg ?? ""}
                onChange={(e) => set("nose_angle_deg", num(e.target.value))}
              />
            </Field>
            <Field label="Hyzer angle (°)">
              <Input
                type="number"
                step="0.1"
                value={draft.hyzer_angle_deg ?? ""}
                onChange={(e) => set("hyzer_angle_deg", num(e.target.value))}
              />
            </Field>
            <Field label="Wobble (°)">
              <Input
                type="number"
                step="0.1"
                value={draft.wobble_deg ?? ""}
                onChange={(e) => set("wobble_deg", num(e.target.value))}
              />
            </Field>
            <Field label="Measured with">
              <Input
                placeholder="TechDisc, radar, launch monitor…"
                value={draft.measurement_device ?? ""}
                onChange={(e) => set("measurement_device", e.target.value || null)}
              />
            </Field>
            <Field label="Measured on">
              <Input
                type="date"
                value={draft.measured_at ?? ""}
                onChange={(e) => set("measured_at", e.target.value || null)}
              />
            </Field>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Rate each shape by how much you trust it in a round. {answered} of {SHOT_SHAPES.length}{" "}
            answered.
          </p>
          <div className="space-y-2">
            {SHOT_SHAPES.map((shape) => {
              const value = draft.shot_confidence?.[shape.key] ?? 0;
              return (
                <div key={shape.key} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold">{shape.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{shape.hint}</span>
                    </div>
                    {value ? (
                      <Badge variant="outline" className="text-[10px]">
                        {CONFIDENCE_LABELS[value - 1]}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CONFIDENCE_LABELS.map((label, index) => (
                      <Toggle
                        key={label}
                        active={value === index + 1}
                        onClick={() => setShape("shot_confidence", shape.key, index + 1)}
                      >
                        {label}
                      </Toggle>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Preferred weight — lightest (g)">
            <Input
              type="number"
              min={120}
              max={200}
              value={draft.preferred_weight_min_g ?? ""}
              onChange={(e) => set("preferred_weight_min_g", num(e.target.value))}
            />
          </Field>
          <Field label="Preferred weight — heaviest (g)">
            <Input
              type="number"
              min={120}
              max={200}
              value={draft.preferred_weight_max_g ?? ""}
              onChange={(e) => set("preferred_weight_max_g", num(e.target.value))}
            />
          </Field>
          <Field label="Plastic you reach for">
            <Select
              options={PLASTIC_PREFERENCES}
              value={draft.plastic_preference}
              onChange={(v) => set("plastic_preference", v)}
            />
          </Field>
          <Field label="Stability you lean on">
            <Select
              options={STABILITY_BIASES}
              value={draft.stability_bias}
              onChange={(v) => set("stability_bias", v)}
            />
          </Field>
          <Field label="What you're working on" className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {GOAL_OPTIONS.map((g) => (
                <Toggle
                  key={g.value}
                  active={(draft.goals ?? []).includes(g.value)}
                  onClick={() => toggleList("goals", g.value)}
                >
                  {g.label}
                </Toggle>
              ))}
            </div>
          </Field>
          <Field label="Anything physical we should respect" className="sm:col-span-2">
            <Input
              placeholder="Shoulder, elbow, back — we keep advice inside it"
              value={draft.physical_notes ?? ""}
              onChange={(e) => set("physical_notes", e.target.value || null)}
            />
          </Field>
          <Field label="Notes for your own reference" className="sm:col-span-2">
            <Textarea
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
            />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <div className="flex gap-2">
          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Next <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={step === STEPS.length - 1 ? "default" : "secondary"}
            onClick={save}
            disabled={saving}
          >
            <Check className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-sm">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-primary bg-primary/10 font-medium text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Choice({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Toggle key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Toggle>
      ))}
    </div>
  );
}

function Select({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm"
    >
      <option value="">Not set</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
