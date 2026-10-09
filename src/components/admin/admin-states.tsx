/**
 * Shared loading / error / empty treatments for admin tools.
 *
 * Every admin queue and registry uses these three so a failed read never
 * looks like an empty queue, and an empty queue always says what it is
 * waiting for.
 */
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function AdminErrorState({
  title = "We couldn't load this queue",
  message = "The connection dropped before the records came back. Try again.",
  onRetry,
  retrying,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-center",
        className,
      )}
    >
      <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" className="mt-1" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", retrying && "animate-spin")} aria-hidden />
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}

export function AdminPanelSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function AdminEmptyState({
  title,
  message,
  action,
  className,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card/60 px-4 py-8 text-center",
        className,
      )}
    >
      <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
