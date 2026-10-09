import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RotateCcw } from "lucide-react";

/** Shared loading / failure presentation for every Play overview widget, so
 *  each card looks and behaves the same while it waits or fails. */
export function PlayRowsSkeleton({
  rows = 3,
  height = "h-14",
}: {
  rows?: number;
  height?: string;
}) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`w-full ${height}`} />
      ))}
    </div>
  );
}

export function PlayErrorState({
  message,
  onRetry,
  retrying,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRetry} disabled={retrying}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      ) : null}
    </div>
  );
}
