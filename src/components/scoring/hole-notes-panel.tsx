import * as React from "react";
import { NotebookPen, ChevronDown, ChevronUp, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Hole Notes — quick per-hole memos scoped by (courseId, layoutId, holeNumber),
 * persisted in localStorage. Useful for wind, disc selection, tree lines,
 * OB reminders. No backend hop; ready for future sync to profile if needed.
 */

type NotesMap = Record<string, string>;

function storageKey(courseId: string, layoutId: string | null) {
  return `dgd.hole_notes.${courseId}.${layoutId ?? "default"}`;
}

function readAll(courseId: string, layoutId: string | null): NotesMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(courseId, layoutId));
    return raw ? (JSON.parse(raw) as NotesMap) : {};
  } catch {
    return {};
  }
}

function writeAll(courseId: string, layoutId: string | null, next: NotesMap) {
  try {
    window.localStorage.setItem(storageKey(courseId, layoutId), JSON.stringify(next));
  } catch {
    /* quota — ignore */
  }
}

export function HoleNotesPanel({
  courseId,
  layoutId,
  holeNumber,
}: {
  courseId: string;
  layoutId: string | null;
  holeNumber: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<NotesMap>(() => readAll(courseId, layoutId));
  const [draft, setDraft] = React.useState("");
  const [dirty, setDirty] = React.useState(false);

  // Refresh notes when course/layout changes.
  React.useEffect(() => {
    setNotes(readAll(courseId, layoutId));
  }, [courseId, layoutId]);

  // Load draft for current hole.
  React.useEffect(() => {
    setDraft(notes[String(holeNumber)] ?? "");
    setDirty(false);
  }, [holeNumber, notes]);

  const holesWithNotes = Object.keys(notes).filter((k) => notes[k]?.trim().length).length;

  const save = () => {
    const trimmed = draft.trim();
    const next = { ...notes };
    if (trimmed) next[String(holeNumber)] = trimmed;
    else delete next[String(holeNumber)];
    setNotes(next);
    writeAll(courseId, layoutId, next);
    setDirty(false);
    toast.success(
      trimmed ? `Note saved for hole ${holeNumber}` : `Note cleared for hole ${holeNumber}`,
    );
  };

  const clear = () => {
    setDraft("");
    setDirty(true);
  };

  return (
    <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
      >
        <span className="flex items-center gap-1">
          <NotebookPen className="h-3 w-3" /> Hole notes
          {holesWithNotes > 0 ? (
            <span className="ml-1 rounded-full bg-primary/15 px-1.5 py-[1px] text-[9px] font-semibold text-primary">
              {holesWithNotes}
            </span>
          ) : null}
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open ? (
        <div className="border-t border-border/60 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Hole {holeNumber}</span>
            <span>{draft.length}/280</span>
          </div>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, 280));
              setDirty(true);
            }}
            placeholder="Wind, disc used, safe line, OB reminder…"
            className="min-h-[64px] w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          <div className="mt-1 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={clear}
              disabled={!draft}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground",
                !draft && "opacity-40",
              )}
            >
              <Trash2 className="h-3 w-3" /> Clear
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty}
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground",
                !dirty && "opacity-50",
              )}
            >
              <Save className="h-3 w-3" /> Save
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Notes stay on this device and unlock automatically the next time you play here.
          </p>
        </div>
      ) : null}
    </div>
  );
}
