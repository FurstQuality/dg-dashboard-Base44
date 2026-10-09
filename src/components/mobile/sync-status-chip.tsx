import * as React from "react";
import { cn } from "@/lib/utils";
import { Check, CloudOff, Loader2, AlertTriangle, Save, RefreshCw } from "lucide-react";

export type SyncStatus = "saved" | "waiting" | "syncing" | "synced" | "failed" | "conflict";

const CFG: Record<
  SyncStatus,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  saved: { label: "Saved offline", className: "bg-muted text-foreground", icon: Save },
  waiting: {
    label: "Waiting to sync",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    icon: CloudOff,
  },
  syncing: { label: "Syncing…", className: "bg-primary/15 text-primary", icon: Loader2 },
  synced: {
    label: "Synced",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    icon: Check,
  },
  failed: {
    label: "Sync failed",
    className: "bg-destructive/15 text-destructive",
    icon: AlertTriangle,
  },
  conflict: {
    label: "Needs review",
    className: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
    icon: RefreshCw,
  },
};

/**
 * Universal offline/sync status chip. Same visual across scoring, drafts,
 * event builder, messaging, etc.
 */
export function SyncStatusChip({
  status,
  label,
  className,
}: {
  status: SyncStatus;
  label?: string;
  className?: string;
}) {
  const cfg = CFG[status];
  const Icon = cfg.icon;
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        cfg.className,
        className,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "syncing" && "animate-spin")} />
      {label ?? cfg.label}
    </span>
  );
}
