import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

/** Shared presentation primitives for the friend tracker surfaces. */

export function fmtDate(d?: string | null): string {
  if (!d) return "TBD";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function SectionIntro({
  title,
  description,
  compact,
  action,
}: {
  title: string;
  description: string;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
      <div className={compact ? "min-w-0 space-y-0.5" : "min-w-0 space-y-1"}>
        <h2 className={`font-display font-semibold ${compact ? "text-sm" : "text-base"}`}>
          {title}
        </h2>
        <p className={`text-muted-foreground ${compact ? "text-xs" : "text-[13px]"}`}>
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PhasePlaceholder({ label }: { label: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{label}</CardContent>
    </Card>
  );
}

export function KpiTile({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-base font-bold leading-tight">{value}</div>
      {subtitle && <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>}
    </div>
  );
}

/** Small segmented control used by the tracker sub-views. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
}) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-1 rounded-md border p-0.5 text-xs ${className ?? ""}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`shrink-0 whitespace-nowrap rounded px-2.5 py-1 transition ${
            value === o.value
              ? "bg-primary text-primary-foreground font-medium"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
