import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = {
  /** What kind of shape to skeleton. */
  variant?: "card" | "list" | "stat-grid" | "table" | "text";
  /** How many placeholder rows/tiles to render. */
  count?: number;
  className?: string;
};

/**
 * LoadingSkeleton — the shared loading treatment.
 *
 * Rules:
 *   - Always render a skeleton for slow reads instead of a spinner in
 *     the middle of the page.
 *   - Skeletons match the shape of the content they replace — no giant
 *     grey blocks where the real UI is a compact list.
 */
export function LoadingSkeleton({ variant = "card", count = 3, className }: Props) {
  if (variant === "stat-grid") {
    return (
      <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="rounded-card border border-border p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "list") {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-input border border-border p-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-10" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className={cn("space-y-1.5", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (variant === "text") {
    return (
      <div className={cn("space-y-1.5", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    );
  }
  // card
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-card border border-border p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
