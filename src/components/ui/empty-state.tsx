import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  /** Optional css var name (without --) for a category accent tint */
  accent?: string;
  className?: string;
};

/**
 * Compact, actionable empty state.
 * Replaces oversized dashed panels. Uses solid border + subtle background,
 * with optional category accent tint on the icon frame.
 */
export function EmptyState({ icon: Icon, title, description, action, accent, className }: Props) {
  const accentVar = accent ? `var(--${accent})` : undefined;
  return (
    <div
      className={
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-6 py-8 text-center " +
        (className ?? "")
      }
    >
      {Icon ? (
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{
            backgroundColor: accentVar
              ? `color-mix(in oklab, ${accentVar} 14%, transparent)`
              : "hsl(var(--muted))",
            color: accentVar ?? undefined,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className="text-[15px] font-semibold leading-snug">{title}</p>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
