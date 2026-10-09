/**
 * Shared live-condition reads (browser; public read policy covers open/confirmed
 * unexpired reports) plus the offline report outbox used when a phone has no signal.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LiveCondition = {
  id: string;
  course_id: string;
  hole_number: number | null;
  kind: string;
  severity: string;
  lat: number | null;
  lng: number | null;
  status: string;
  created_at: string;
};

export function useLiveConditions(courseIds: string[]) {
  const ids = [...new Set(courseIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["live-conditions", ids],
    enabled: ids.length > 0,
    staleTime: 120_000,
    queryFn: async (): Promise<LiveCondition[]> => {
      const { data } = await supabase
        .from("course_reports")
        .select("id, course_id, hole_number, kind, severity, lat, lng, status, created_at")
        .in("course_id", ids.slice(0, 200))
        .in("status", ["open", "confirmed"])
        .gt("expires_at", new Date().toISOString())
        .limit(500);
      return (data ?? []) as LiveCondition[];
    },
  });
}

export type CourseStatusRow = { course_id: string; status: string; note: string | null };

/** Current status for many courses at once (directory badges, event alerts). */
export function useCourseStatuses(courseIds: string[]) {
  const ids = [...new Set(courseIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["course-statuses", ids],
    enabled: ids.length > 0,
    staleTime: 120_000,
    queryFn: async (): Promise<Map<string, CourseStatusRow>> => {
      const { data } = await supabase
        .from("course_status")
        .select("course_id, status, note")
        .in("course_id", ids.slice(0, 200));
      return new Map(((data ?? []) as CourseStatusRow[]).map((r) => [r.course_id, r]));
    },
  });
}

// ---------------------------------------------------------------- outbox

export type ReportDraft = {
  localId: string;
  course_id: string;
  kind: string;
  severity: "minor" | "moderate" | "blocking";
  hole_number: number | null;
  description: string | null;
  lat?: number | null;
  lng?: number | null;
  savedAt: string;
};

const OUTBOX_KEY = "dgd:course-report-outbox";

export function readOutbox(): ReportDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(OUTBOX_KEY) ?? "[]");
    return Array.isArray(v) ? (v as ReportDraft[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(rows: ReportDraft[]) {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(rows.slice(-50)));
  window.dispatchEvent(new Event("dgd:outbox"));
}

export function saveDraft(d: Omit<ReportDraft, "localId" | "savedAt">) {
  writeOutbox([
    ...readOutbox(),
    { ...d, localId: crypto.randomUUID(), savedAt: new Date().toISOString() },
  ]);
}

export function removeDraft(localId: string) {
  writeOutbox(readOutbox().filter((d) => d.localId !== localId));
}

/** True when a send failed because there's no connection (not a server refusal). */
export function isOfflineError(e: unknown) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const m = e instanceof Error ? e.message : String(e);
  return /failed to fetch|networkerror|load failed|network request failed/i.test(m);
}
