import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { ArrowRight, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "statboard" | "gameplan" | "coach" | "compare" | "neutral";

const TONE: Record<
  Tone,
  { border: string; bg: string; ring: string; text: string; iconBg: string }
> = {
  statboard: {
    border: "border-primary/30",
    bg: "bg-primary/5 hover:bg-primary/10",
    ring: "hover:border-primary/60",
    text: "text-primary",
    iconBg: "bg-primary/15 text-primary",
  },
  gameplan: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/5 hover:bg-amber-500/10",
    ring: "hover:border-amber-500/60",
    text: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  coach: {
    border: "border-violet-500/30",
    bg: "bg-violet-500/5 hover:bg-violet-500/10",
    ring: "hover:border-violet-500/60",
    text: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  },
  compare: {
    border: "border-teal-500/30",
    bg: "bg-teal-500/5 hover:bg-teal-500/10",
    ring: "hover:border-teal-500/60",
    text: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400",
  },
  neutral: {
    border: "border-border",
    bg: "bg-card hover:bg-accent/40",
    ring: "hover:border-primary/40",
    text: "text-foreground",
    iconBg: "bg-muted text-muted-foreground",
  },
};

type Variant = "card" | "chip" | "row";

type BaseProps = {
  label: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  variant?: Variant;
  className?: string;
};

type Props = BaseProps &
  ({ to: LinkProps["to"]; params?: LinkProps["params"]; search?: LinkProps["search"] } & Record<
    string,
    unknown
  >);

/**
 * SmartLink — the canonical cross-link used to surface Statboard / Game Plan /
 * coaching tools from anywhere in the app. Consistent tone + iconography so
 * users learn to recognize the pattern.
 */
export function SmartLink({
  label,
  hint,
  icon,
  tone = "statboard",
  variant = "card",
  className,
  ...linkProps
}: Props) {
  const t = TONE[tone];
  const Icon = icon ?? Sparkles;

  if (variant === "chip") {
    return (
      <Link
        {...(linkProps as LinkProps)}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
          t.border,
          t.bg,
          t.ring,
          t.text,
          className,
        )}
      >
        <Icon className="h-3 w-3" />
        <span>{label}</span>
        <ArrowRight className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
      </Link>
    );
  }

  if (variant === "row") {
    return (
      <Link
        {...(linkProps as LinkProps)}
        className={cn(
          "group flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm transition",
          t.border,
          t.bg,
          t.ring,
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md", t.iconBg)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className={cn("block truncate font-semibold", t.text)}>{label}</span>
            {hint ? (
              <span className="block truncate text-xs text-muted-foreground">{hint}</span>
            ) : null}
          </span>
        </span>
        <ArrowRight
          className={cn("h-4 w-4 shrink-0 transition group-hover:translate-x-0.5", t.text)}
        />
      </Link>
    );
  }

  return (
    <Link
      {...(linkProps as LinkProps)}
      className={cn(
        "group flex items-start gap-3 rounded-xl border p-3 transition",
        t.border,
        t.bg,
        t.ring,
        className,
      )}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", t.iconBg)}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1 text-sm font-semibold", t.text)}>
          {label}
          <ArrowRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" />
        </span>
        {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </Link>
  );
}
