import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  /** What failed, in the player's words. */
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
};

/** One retryable failure message shared by every Community panel. */
export function CommunityErrorState({
  title = "This didn't load",
  message = "The connection dropped on the way to your circle. Try again.",
  onRetry,
  className,
}: Props) {
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
        <Button size="sm" variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
