import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Radio-style option row: title, short explanation, and a selected dot. */
export function OptionRow({
  selected,
  onSelect,
  label,
  blurb,
  disabled,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  blurb?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
        selected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card hover:border-primary/40"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-snug">{label}</span>
        {blurb ? (
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
            {blurb}
          </span>
        ) : null}
      </span>
      <span
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
        }`}
      >
        {selected ? <Check className="h-3 w-3" /> : null}
      </span>
    </button>
  );
}

/** Segmented control for short, mutually exclusive choices. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
      {options.map((o) => (
        <Button
          key={String(o.value)}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "ghost"}
          className="h-8 px-3 text-[13px]"
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

/** Yes / No pair used by the extras and quick policy questions. */
export function YesNo({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Segmented<"yes" | "no">
      value={value ? "yes" : "no"}
      options={[
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]}
      onChange={(v) => onChange(v === "yes")}
      disabled={disabled}
    />
  );
}

/** Labelled block with an explanatory line, used for each question group. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[14px] font-semibold">{label}</div>
        {hint ? <p className="text-[13px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function StepIntro({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="space-y-1">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <p className="text-[13px] text-muted-foreground">{blurb}</p>
    </div>
  );
}
