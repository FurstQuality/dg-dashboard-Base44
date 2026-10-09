import { Input } from "@/components/ui/input";
import {
  FORMAT_FAMILY_OPTIONS,
  applyTemplate,
  PAIRING_OPTIONS,
  PLAY_STYLE_OPTIONS,
  SIGNUP_TYPE_OPTIONS,
  TEMPLATE_OPTIONS,
  normalizeSetup,
  requiresPreRegClose,
  type EventSetupState,
} from "@/lib/event-setup";
import { Field, OptionRow, Segmented, StepIntro, YesNo } from "./controls";

export function FormatStep({
  value,
  onChange,
  kind,
  registrationCloses,
  onRegistrationClosesChange,
}: {
  value: EventSetupState;
  onChange: (next: EventSetupState) => void;
  kind: "tournament" | "league";
  /** `datetime-local` value for the pre-registration cutoff, when the host wizard tracks one. */
  registrationCloses?: string;
  onRegistrationClosesChange?: (next: string) => void;
}) {
  const s = value;
  const set = (patch: Partial<EventSetupState>) => onChange(normalizeSetup({ ...s, ...patch }));
  const isTeam = s.format_family !== "singles";

  return (
    <div className="space-y-6">
      <StepIntro
        title="Format and sign-up"
        blurb={`How players compete and how they get into the ${kind}.`}
      />

      <Field
        label="Start from a template"
        hint="Sets sensible defaults. You can change anything after picking one."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATE_OPTIONS.map((t) => (
            <OptionRow
              key={t.value}
              selected={s.event_template === t.value}
              onSelect={() => onChange(normalizeSetup(applyTemplate(s, t.value)))}
              label={t.label}
              blurb={t.bullets.join(" · ")}
            />
          ))}
        </div>
      </Field>

      <Field label="Play format" hint="Do players keep their own score, or share one with a partner?">
        <div className="grid gap-2 sm:grid-cols-3">
          {FORMAT_FAMILY_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={s.format_family === o.value}
              onSelect={() => set({ format_family: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
      </Field>

      {isTeam ? (
        <>
          <Field label="How teams play" hint="Which disc the team throws after the tee.">
            <div className="grid gap-2 sm:grid-cols-2">
              {PLAY_STYLE_OPTIONS.filter((o) => o.value !== "own_shot").map((o) => (
                <OptionRow
                  key={o.value}
                  selected={s.play_style === o.value}
                  onSelect={() => set({ play_style: o.value })}
                  label={o.label}
                  blurb={o.blurb}
                />
              ))}
            </div>
          </Field>

          <Field label="How teams are formed">
            <div className="grid gap-2 sm:grid-cols-3">
              {PAIRING_OPTIONS.filter((o) => o.value !== "individual").map((o) => (
                <OptionRow
                  key={o.value}
                  selected={s.pairing_method === o.value}
                  onSelect={() => set({ pairing_method: o.value })}
                  label={o.label}
                  blurb={o.blurb}
                />
              ))}
            </div>
          </Field>

          {s.format_family === "teams" ? (
            <Field label="Players per team">
              <Input
                type="number"
                min={3}
                max={8}
                value={s.team_size ?? 3}
                onChange={(e) => set({ team_size: Math.max(3, Number(e.target.value) || 3) })}
                className="max-w-[120px]"
              />
            </Field>
          ) : null}
        </>
      ) : null}

      <Field
        label="How players sign up"
        hint="Walk-ups suit weekly rounds; lock the field when you need a fixed player list."
      >
        <div className="grid gap-2">
          {SIGNUP_TYPE_OPTIONS.map((o) => (
            <OptionRow
              key={o.value}
              selected={s.signup_type === o.value}
              onSelect={() => set({ signup_type: o.value })}
              label={o.label}
              blurb={o.blurb}
            />
          ))}
        </div>
        {requiresPreRegClose(s.signup_type) && onRegistrationClosesChange ? (
          <div className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
            <label
              htmlFor="signup-prereg-closes"
              className="block text-[13px] font-semibold leading-snug"
            >
              Pre-registration closes (required)
            </label>
            <Input
              id="signup-prereg-closes"
              type="datetime-local"
              value={registrationCloses ?? ""}
              onChange={(e) => onRegistrationClosesChange(e.target.value)}
            />
            <p className="text-[12px] leading-snug text-muted-foreground">
              After this time the field is locked and walk-ups are turned away at check-in.
            </p>
          </div>
        ) : null}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Who can see this event" hint="Private events are only visible by direct link.">
          <Segmented
            value={s.visibility}
            options={[
              { value: "public", label: "Public" },
              { value: "private", label: "Private" },
            ]}
            onChange={(v) => set({ visibility: v })}
          />
        </Field>

        <Field
          label="Players pick their card at sign-up"
          hint="Only available with pre-registration."
        >
          <YesNo
            value={s.card_selection_required}
            onChange={(v) => set({ card_selection_required: v })}
            disabled={s.signup_type === "casual"}
          />
        </Field>

        <Field label="Allow re-entry" hint="Can a player pay again to replace a bad score?">
          <YesNo value={s.reentry_allowed} onChange={(v) => set({ reentry_allowed: v })} />
        </Field>
      </div>
    </div>
  );
}
