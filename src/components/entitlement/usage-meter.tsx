import { useEntitlements, featureUsage } from "@/hooks/use-entitlements";
import { cn } from "@/lib/utils";

/** Small pill: "8 / 10 this month". Hides itself if the feature is unlimited. */
export function UsageMeter({
  feature,
  label,
  className,
}: {
  feature: string;
  label?: string;
  className?: string;
}) {
  const { data: snap } = useEntitlements();
  const u = featureUsage(snap, feature);
  if (!u.enabled || u.unlimited) return null;

  const pct = u.limit ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
  const tone =
    pct >= 100
      ? "bg-destructive/15 text-destructive ring-destructive/30"
      : pct >= 80
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30"
        : "bg-muted text-foreground ring-border";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone,
        className,
      )}
      title={`${u.used} of ${u.limit} used`}
    >
      {label ? <span className="opacity-80">{label}</span> : null}
      <span className="tabular-nums">
        {u.used} / {u.limit}
      </span>
    </span>
  );
}
