import type { ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  /** Short human title — never a stack trace. */
  title?: string;
  /** Explanation in plain language. */
  description?: string;
  /** Optional retry handler — shown as the primary action when provided. */
  onRetry?: () => void;
  /** Additional action slot (e.g. contact support). */
  action?: ReactNode;
  className?: string;
};

/**
 * ErrorState — the shared error surface for failed loads and unexpected
 * errors inside a page or widget.
 *
 * Never surface raw error strings ("Failed to fetch", "TypeError…") or
 * status codes. Every ErrorState reads like it was written by a person.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Give it another shot.",
  onRetry,
  action,
  className,
}: Props) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-danger/5 p-6 text-center",
        className,
      )}
    >
      <div className="grid h-10 w-10 place-items-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="max-w-md space-y-1">
        <p className="text-[15px] font-semibold leading-snug">{title}</p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {(onRetry || action) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button size="sm" variant="secondary" onClick={onRetry}>
              <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          ) : null}
          {action}
        </div>
      )}
    </Card>
  );
}
