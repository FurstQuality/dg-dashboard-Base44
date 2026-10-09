import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventDraftRow } from "@/lib/event-draft-state";
import { draftTitle, savedAgo } from "@/lib/event-draft-state";

type Props = {
  draft: EventDraftRow;
  /** Label of the step the draft was left on. */
  stepLabel: string | null;
  busy?: boolean;
  onResume: () => void;
  onDiscard: () => void;
};

/** Offers to pick up an unfinished league or tournament setup. */
export function DraftResumeCard({ draft, stepLabel, busy, onResume, onDiscard }: Props) {
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{draftTitle(draft)}</div>
          <div className="text-[13px] text-muted-foreground">
            {stepLabel ? `Left off on ${stepLabel} · ` : ""}
            saved {savedAgo(draft.updated_at)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onResume} disabled={busy}>
            {busy ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1 h-4 w-4" />
            )}
            Continue setup
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} disabled={busy}>
            <Trash2 className="mr-1 h-4 w-4" />
            Discard draft
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small header line showing autosave state. */
export function DraftSaveStatusLine({
  status,
  lastSavedAt,
}: {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
}) {
  if (status === "idle" && !lastSavedAt) return null;
  const text =
    status === "saving"
      ? "Saving…"
      : status === "error"
        ? "Couldn't save — we'll retry on your next change"
        : lastSavedAt
          ? `Saved ${savedAgo(lastSavedAt)}`
          : "Saved";
  return (
    <div
      className={`text-xs ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
      aria-live="polite"
    >
      {text}
    </div>
  );
}
