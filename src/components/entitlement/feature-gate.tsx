import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Lock, Sparkles } from "lucide-react";
import { useEntitlements, hasFeature, featureUsage } from "@/hooks/use-entitlements";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BETA_MODE } from "@/lib/ace-tier";

type Mode = "block" | "preview" | "inline";

type Props = {
  feature: string;
  children: ReactNode;
  /** How to present the gate when the feature is locked. */
  mode?: Mode;
  /** Custom title on the upgrade card. */
  title?: string;
  /** Custom body on the upgrade card. */
  description?: string;
  /** Extra classes on the upgrade card. */
  className?: string;
};

export function FeatureGate({
  feature,
  children,
  mode = "block",
  title,
  description,
  className,
}: Props) {
  const { data: snap } = useEntitlements();
  const enabled = hasFeature(snap, feature);
  const usage = featureUsage(snap, feature);

  // Beta mode or fully unlocked → just render.
  if (BETA_MODE || (enabled && !usage.atLimit)) return <>{children}</>;

  const upgrade = (
    <UpgradeCard
      feature={feature}
      title={title}
      description={description}
      className={className}
      atLimit={usage.atLimit}
      used={usage.used}
      limit={usage.limit}
    />
  );

  if (mode === "preview") {
    return (
      <div className={cn("relative", className)}>
        <div aria-hidden className="pointer-events-none select-none opacity-50 blur-[1.5px]">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">{upgrade}</div>
      </div>
    );
  }

  if (mode === "inline") {
    return (
      <div className={cn("inline-flex", className)}>
        <UpgradeInline feature={feature} atLimit={usage.atLimit} />
      </div>
    );
  }

  return upgrade;
}

function UpgradeCard({
  title,
  description,
  className,
  atLimit,
  used,
  limit,
}: {
  feature: string;
  title?: string;
  description?: string;
  className?: string;
  atLimit: boolean;
  used: number;
  limit: number | null;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-sm ring-1 ring-primary/20",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
          {atLimit ? <Lock className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-base font-semibold">
            {title ?? (atLimit ? "You've hit your plan limit" : "Unlock this on a paid plan")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground [text-wrap:pretty]">
            {description ??
              (atLimit && limit !== null
                ? `You've used ${used} of ${limit} this period. Upgrade to Pro or Elite for higher limits.`
                : "This capability is included on Pro and Elite. Every feature is previewable — upgrade to remove caps and unlock the full experience.")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link to="/pricing">Compare plans</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/billing">Manage billing</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpgradeInline({ atLimit }: { feature: string; atLimit: boolean }) {
  return (
    <Link
      to="/pricing"
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
    >
      {atLimit ? <Lock className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
      {atLimit ? "Limit reached — Upgrade" : "Upgrade to unlock"}
    </Link>
  );
}
