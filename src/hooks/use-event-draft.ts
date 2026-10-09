import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftFields, EventDraftKind } from "@/lib/event-draft-state";
import { makeSnapshot } from "@/lib/event-draft-state";
import { deleteEventDraft, saveEventDraft } from "@/lib/event-drafts.functions";

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error";

type Options = {
  kind: EventDraftKind;
  /** Draft id when the builder was opened from an existing draft. */
  initialId?: string | null;
  /** Current builder answers — recomputed on every render by the wizard. */
  fields: DraftFields;
  /** Name shown in resume cards and director lists. */
  title: string;
  step: number;
  seriesId?: string | null;
  /** Autosave stays off until the builder has been opened/restored. */
  enabled?: boolean;
};

const DEBOUNCE_MS = 2000;

/**
 * Debounced autosave for the league and tournament builders. Saves a couple of
 * seconds after typing stops, immediately on step change, and when the page is
 * hidden. Failures surface through `status` and retry on the next change.
 */
export function useEventDraft({
  kind,
  initialId = null,
  fields,
  title,
  step,
  seriesId = null,
  enabled = true,
}: Options) {
  const [draftId, setDraftId] = useState<string | null>(initialId);
  const [status, setStatus] = useState<DraftSaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const payload = useMemo(
    () => ({ kind, title, step, series_id: seriesId, fields }),
    [kind, title, step, seriesId, fields],
  );

  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const draftIdRef = useRef(draftId);
  draftIdRef.current = draftId;
  const lastSentRef = useRef<string | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);

  const flush = useCallback(async () => {
    if (!enabledRef.current || inFlightRef.current) return;
    const current = payloadRef.current;
    const serialized = JSON.stringify({ ...current, id: draftIdRef.current });
    if (serialized === lastSentRef.current) return;
    // Never create a draft for an untouched builder.
    if (!draftIdRef.current && !hasContent(current.fields, current.title)) return;

    inFlightRef.current = true;
    setStatus("saving");
    try {
      const result = await saveEventDraft({
        data: {
          id: draftIdRef.current ?? undefined,
          kind: current.kind,
          title: current.title || null,
          step: current.step,
          series_id: current.series_id,
          state: makeSnapshot(current.fields),
        },
      });
      lastSentRef.current = serialized;
      setDraftId(result.id);
      draftIdRef.current = result.id;
      setLastSavedAt(result.updated_at);
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Debounced save on any change.
  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload, enabled, flush]);

  // Save right away when the user moves between steps.
  useEffect(() => {
    if (!enabled) return;
    void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, enabled]);

  // Save when the tab is hidden or the page is being left.
  useEffect(() => {
    if (!enabled) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [enabled, flush]);

  const discard = useCallback(async () => {
    const id = draftIdRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    enabledRef.current = false;
    setDraftId(null);
    draftIdRef.current = null;
    setStatus("idle");
    setLastSavedAt(null);
    lastSentRef.current = null;
    if (id) {
      try {
        await deleteEventDraft({ data: { id } });
      } catch {
        // A draft we can't delete is harmless; it ages out.
      }
    }
  }, []);

  /** Adopt an existing draft id after restoring it into the builder. */
  const adopt = useCallback((id: string | null) => {
    setDraftId(id);
    draftIdRef.current = id;
    lastSentRef.current = null;
  }, []);

  return { draftId, status, lastSavedAt, flush, discard, adopt };
}

/** True when the builder holds something worth saving. */
function hasContent(fields: DraftFields, title: string): boolean {
  if (title.trim()) return true;
  return Boolean(fields['course_id'] || fields['description'] || fields['start_date']);
}
