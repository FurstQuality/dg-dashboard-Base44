/**
 * Single entry point for manual data syncing.
 *
 * Every connector (PDGA, UDisc, Disc Golf Scene, Google Calendar) is synced
 * from Settings → Data & sync. Any other surface that wants to offer a refresh
 * links here instead of running its own sync, so there is exactly one
 * go-to place for updating data.
 */
import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SYNC_HUB_PATH = "/settings/imports" as const;

export function SyncDataCta({
  label = "Sync data",
  size = "sm",
  variant = "outline",
  className,
}: {
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Button asChild size={size} variant={variant} className={className}>
      <Link to={SYNC_HUB_PATH}>
        <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden />
        {label}
      </Link>
    </Button>
  );
}

/** Inline sentence pointing at the sync hub. */
export function SyncDataHint({ children }: { children?: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground">
      {children ?? "Refresh PDGA, UDisc, and Disc Golf Scene data in "}
      <Link to={SYNC_HUB_PATH} className="text-primary underline underline-offset-2">
        Settings → Data &amp; sync
      </Link>
      .
    </p>
  );
}
