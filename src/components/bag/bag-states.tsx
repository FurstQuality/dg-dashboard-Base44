import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Matching placeholder cards while the bag loads. */
export function BagSkeleton({ label = "Loading your bag…" }: { label?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-2">
      <span className="sr-only">{label}</span>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-border bg-card/60"
          />
        ))}
      </div>
    </div>
  );
}

/** Retryable failure state for bag reads. */
export function BagErrorState({
  title = "We couldn't load your bag",
  message = "Your discs are safe — the list just didn't come through. Try again in a moment.",
  onRetry,
  retrying = false,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
          )}
          Try again
        </Button>
      ) : null}
    </div>
  );
}
