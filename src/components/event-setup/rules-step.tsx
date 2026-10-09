import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  EXTRA_FIELDS,
  type EventSetupState,
  type ExtraKey,
} from "@/lib/event-setup";
import { Field, StepIntro, YesNo } from "./controls";

export function RulesStep({
  value,
  onChange,
}: {
  value: EventSetupState;
  onChange: (next: EventSetupState) => void;
}) {
  const s = value;
  const setRules = (patch: Partial<EventSetupState["rules"]>) =>
    onChange({ ...s, rules: { ...s.rules, ...patch } });
  const setExtra = (key: ExtraKey, patch: { enabled?: boolean; notes?: string }) =>
    onChange({ ...s, extras: { ...s.extras, [key]: { ...s.extras[key], ...patch } } });

  return (
    <div className="space-y-6">
      <StepIntro
        title="Rules and extras"
        blurb="Local rules players need before they tee off, plus the side games and amenities they filter on."
      />

      <Field label="Rules of play" hint="Which rule set the event runs under.">
        <Input
          value={s.rules.rules_edition}
          onChange={(e) => setRules({ rules_edition: e.target.value })}
          placeholder="PDGA Official Rules of Disc Golf"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Out of bounds" hint="Water, roads, fences, parking — and the penalty.">
          <Textarea
            rows={3}
            value={s.rules.ob_notes}
            onChange={(e) => setRules({ ob_notes: e.target.value })}
            placeholder="Creek on 4 and 12 is OB, one stroke, drop at last in-bounds."
          />
        </Field>
        <Field label="Mandos and drop zones">
          <Textarea
            rows={3}
            value={s.rules.mando_notes}
            onChange={(e) => setRules({ mando_notes: e.target.value })}
            placeholder="Hole 9 right mando, drop zone at the tree line."
          />
        </Field>
        <Field label="Mulligans" hint="Allowed at all? How many, and what do they cost?">
          <Input
            value={s.rules.mulligans}
            onChange={(e) => setRules({ mulligans: e.target.value })}
            placeholder="None"
          />
        </Field>
        <Field label="Pace of play">
          <Input
            value={s.rules.pace_of_play}
            onChange={(e) => setRules({ pace_of_play: e.target.value })}
            placeholder="Keep up with the card ahead; 30 seconds per throw"
          />
        </Field>
        <Field label="Carts and caddies">
          <Input
            value={s.rules.carts}
            onChange={(e) => setRules({ carts: e.target.value })}
            placeholder="Carts welcome on cart paths"
          />
        </Field>
        <Field label="Pets">
          <Input
            value={s.rules.pets}
            onChange={(e) => setRules({ pets: e.target.value })}
            placeholder="Leashed dogs allowed"
          />
        </Field>
        <Field label="Alcohol">
          <Input
            value={s.rules.alcohol}
            onChange={(e) => setRules({ alcohol: e.target.value })}
            placeholder="No alcohol on the course"
          />
        </Field>
        <Field label="Weather policy" hint="What happens if the round is cut short.">
          <Input
            value={s.rules.weather_policy}
            onChange={(e) => setRules({ weather_policy: e.target.value })}
            placeholder="Lightning suspends play; refunds if fewer than 9 holes complete"
          />
        </Field>
      </div>

      <Field label="Side games and amenities" hint="Players use these to decide whether to show up.">
        <div className="space-y-2">
          {EXTRA_FIELDS.map((f) => {
            const extra = s.extras[f.key];
            return (
              <div key={f.key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold">{f.label}</div>
                    <p className="text-[13px] text-muted-foreground">{f.question}</p>
                  </div>
                  <YesNo value={extra.enabled} onChange={(v) => setExtra(f.key, { enabled: v })} />
                </div>
                {extra.enabled && f.notesLabel ? (
                  <Input
                    className="mt-2"
                    value={extra.notes}
                    onChange={(e) => setExtra(f.key, { notes: e.target.value })}
                    placeholder={f.notesLabel}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </Field>
    </div>
  );
}
