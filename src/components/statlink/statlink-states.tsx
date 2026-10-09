import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * One retryable failure message shared by every StatLink panel, so a failed
 * read never looks like a panel that is still loading.
 */
export function StatlinkErrorState({
  title = "We couldn't load these numbers",
  message = "The connection dropped before your stats came back. Try again.",
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
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-border/60 bg-card px-4 py-6 text-center",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="max-w-sm text-[13px] text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1"
        >
          <RefreshCw
            className={cn("mr-1 h-3.5 w-3.5", retrying && "animate-spin")}
            aria-hidden="true"
          />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder cards that keep a StatLink panel's shape while data arrives. */
export function StatlinkPanelSkeleton({
  label = "Loading your stats…",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-20 w-full rounded-card" />
      <div className="space-y-2">
        {Array.from({ length: Math.max(1, rows) }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-card" />
        ))}
      </div>
    </div>
  );
}
