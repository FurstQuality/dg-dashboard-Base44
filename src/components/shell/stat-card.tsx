import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AccentMascotEmblem, useRouteAccent } from "@/components/shell/route-accent";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "primary" | "gold" | "green" | "cyan" | "violet" | "warning" | "danger";

const TONE_ACCENT: Record<Tone, { icon: string; ring: string }> = {
  neutral: { icon: "text-muted-foreground", ring: "border-border" },
  primary: { icon: "text-primary", ring: "border-primary/40" },
  gold: { icon: "text-competitive-gold", ring: "border-competitive-gold/40" },
  green: { icon: "text-community-green", ring: "border-community-green/40" },
  cyan: { icon: "text-brand-cyan", ring: "border-brand-cyan/40" },
  violet: { icon: "text-coaching-violet", ring: "border-coaching-violet/40" },
  warning: { icon: "text-warning", ring: "border-warning/40" },
  danger: { icon: "text-danger", ring: "border-danger/40" },
};

type Props = {
  /** Short label above the value — describes what the metric is. */
  label: string;
  /** The metric — accepts a formatted string so the card never guesses. */
  value: ReactNode;
  /** One-line context: comparison, timeframe, or what the value means. */
  hint?: ReactNode;
  /** Icon at the top-left of the card. Always required — no faceless tiles. */
  icon?: LucideIcon;
  /** Delta or trend badge rendered next to the value. */
  trend?: ReactNode;
  /** Optional accent tone; keeps color use disciplined. */
  tone?: Tone;
  /** Full-card link target for keyboard/screen-reader affordance. */
  action?: ReactNode;
  className?: string;
};

/**
 * StatCard — the canonical single-metric tile.
 *
 * Rules:
 *   - Every card has an icon, a label, a value, and a hint.
 *   - No fixed heights: content dictates size.
 *   - Values are provided formatted — StatCard never does math.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  tone = "neutral",
  action,
  className,
}: Props) {
  const t = TONE_ACCENT[tone];
  const { style, mascot, showMascot } = useRouteAccent();
  return (
    <Card
      style={style}
      className={cn(
        "relative flex flex-col justify-between gap-3 overflow-hidden rounded-card border p-4",
        tone === "neutral" ? "accent-panel" : t.ring,
        className,
      )}
    >
      {showMascot ? (
        <AccentMascotEmblem src={mascot} size={72} className="-bottom-3 -right-2 opacity-20" />
      ) : null}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {Icon ? <Icon className={cn("h-3.5 w-3.5", t.icon)} /> : null}
            <span className="truncate">{label}</span>
          </div>
          <div
            className={cn(
              "font-display text-2xl font-bold tabular-nums leading-tight text-glow",
              tone === "neutral" ? "accent-text" : t.icon,
            )}
          >
            {value}
          </div>
          {hint ? (
            <div className="text-[12px] leading-snug text-muted-foreground">{hint}</div>
          ) : null}
        </div>
        {trend ? <div className="shrink-0 text-xs">{trend}</div> : null}
      </div>
      {action ? <div className="relative pt-1">{action}</div> : null}
    </Card>
  );
}
