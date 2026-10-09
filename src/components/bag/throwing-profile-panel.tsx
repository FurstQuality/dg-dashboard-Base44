import { AlertTriangle, CheckCircle2, Gauge, Lightbulb, Pencil, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SHOT_SHAPES,
  bagSlotFindings,
  baseDistanceFt,
  profileCompleteness,
  resolvePowerBand,
  styleSuggestions,
  type ThrowingProfile,
} from "@/lib/throwing-profile";

type BagSummary = Parameters<typeof bagSlotFindings>[1];

/**
 * The player's throwing profile at a glance, plus the bag slots and shot shapes
 * their own answers point at.
 */
export function ThrowingProfilePanel({
  profile,
  bag,
  onEdit,
}: {
  profile: ThrowingProfile | null;
  bag: BagSummary;
  onEdit: () => void;
}) {
  const band = resolvePowerBand(profile);
  const completeness = profileCompleteness(profile);
  const findings = bagSlotFindings(profile, bag);
  const suggestions = styleSuggestions(profile);

  if (!profile) {
    return (
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Gauge className="h-4 w-4" /> Build your throwing profile
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Five short steps about how you throw — power, measured launch numbers if you have them,
          the shapes you trust, and the discs you like. Everything else on this page then reads from
          it: the flight map runs at your power, and bag advice stops guessing.
        </p>
        <Button className="mt-3" onClick={onEdit}>
          Start the survey
        </Button>
      </section>
    );
  }

  const shapes = SHOT_SHAPES.map((s) => ({
    ...s,
    score: profile.shot_confidence?.[s.key] ?? 0,
  })).sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <Gauge className="h-4 w-4" /> {band.label}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{band.blurb}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1 h-4 w-4" /> Update answers
          </Button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Full-power backhand" value={`${baseDistanceFt(profile)} ft`} />
          <Stat
            label="Comfortable throw"
            value={profile.backhand_comfort_ft ? `${profile.backhand_comfort_ft} ft` : "Not set"}
          />
          <Stat
            label="Forehand"
            value={profile.forehand_max_ft ? `${profile.forehand_max_ft} ft` : "Not set"}
          />
          <Stat label="Speed ceiling" value={`Speed ${band.maxUsefulSpeed}`} />
          <Stat
            label="Measured disc speed"
            value={profile.disc_speed_mph ? `${profile.disc_speed_mph} mph` : "Not measured"}
            hint={profile.measurement_device ?? undefined}
          />
          <Stat
            label="Spin"
            value={profile.spin_rpm ? `${profile.spin_rpm} rpm` : "Not measured"}
          />
          <Stat
            label="Putting range"
            value={profile.putting_confident_ft ? `${profile.putting_confident_ft} ft` : "Not set"}
          />
          <Stat label="Profile detail" value={`${completeness.pct}% filled in`} />
        </div>

        {completeness.missing.length ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Still blank: {completeness.missing.slice(0, 3).join(" · ")}
            {completeness.missing.length > 3 ? ` · +${completeness.missing.length - 3} more` : ""}
          </p>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Target className="h-4 w-4" /> Slots to look at
        </h3>
        <div className="mt-2 space-y-2">
          {findings.map((f) => (
            <div
              key={f.slot}
              className={`rounded-lg border p-3 ${
                f.severity === "gap"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : f.severity === "ok"
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                {f.severity === "ok" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
                {f.slot}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.detail}</p>
              <p className="mt-1 text-sm">{f.suggestion}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold">Shapes you trust</h3>
          <div className="mt-2 space-y-1.5">
            {shapes.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-28 shrink-0 truncate text-xs">{s.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(s.score / 5) * 100}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                  {s.score ? `${s.score}/5` : "—"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Lightbulb className="h-4 w-4" /> Worth practising next
          </h3>
          {suggestions.length ? (
            <div className="mt-2 space-y-2">
              {suggestions.map((s) => {
                const shape = SHOT_SHAPES.find((x) => x.key === s.shape);
                return (
                  <div key={s.shape} className="rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{shape?.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        From your answers
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.why}</p>
                    <p className="mt-1 text-sm">{s.drill}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              You rated every shape at least situational — keep sharpening the two you use most.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
