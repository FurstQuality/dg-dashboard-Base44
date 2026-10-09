import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One retryable failure message shared by every tracker page. */
export function TrackerErrorState({
  title = "We couldn't load this tracker",
  message = "The connection dropped on the way to PDGA. Try again.",
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

/** Placeholder cards matching the tracker page layout while data loads. */
export function TrackerPageSkeleton({ label = "Loading tracker…" }: { label?: string }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-24 w-full rounded-card" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
      <Skeleton className="h-48 w-full rounded-card" />
    </div>
  );
}
