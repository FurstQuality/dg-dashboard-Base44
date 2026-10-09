import { Check, CircleAlert } from "lucide-react";

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

/**
 * Inline save confirmation shown beside a Settings panel's save button, so it
 * is always clear whether the panel holds changes that have not been stored.
 */
export function SaveStateNote({ state, className }: { state: SaveState; className?: string }) {
  if (state === "clean") return null;
  const base = "flex items-center gap-1.5 text-xs " + (className ?? "");
  if (state === "dirty")
    return (
      <p className={base + " text-muted-foreground"}>
        <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Unsaved changes on this page.
      </p>
    );
  if (state === "saving") return <p className={base + " text-muted-foreground"}>Saving…</p>;
  if (state === "saved")
    return (
      <p className={base + " text-emerald-500"} role="status">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        Saved to your account.
      </p>
    );
  return (
    <p className={base + " text-destructive"} role="alert">
      <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
      That didn&apos;t save. Check your connection and try again.
    </p>
  );
}
