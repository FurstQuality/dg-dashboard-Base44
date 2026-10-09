import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EventAlertKind = "announcement" | "delay" | "course_issue";

export type EventAlert = {
  id: string;
  tournament_id: string;
  kind: EventAlertKind;
  title: string;
  body: string | null;
  hole_number: number | null;
  delay_minutes: number | null;
  is_active: boolean;
  created_at: string;
  resolved_at: string | null;
};

export const ALERT_KIND_LABEL: Record<EventAlertKind, string> = {
  announcement: "Announcement",
  delay: "Delay",
  course_issue: "Course issue",
};

/** One line players read at a glance, e.g. "Delay · 30 min" or "Course issue · Hole 7". */
export function alertMeta(a: Pick<EventAlert, "kind" | "hole_number" | "delay_minutes">): string {
  const parts: string[] = [ALERT_KIND_LABEL[a.kind]];
  if (a.kind === "delay" && a.delay_minutes) parts.push(`${a.delay_minutes} min`);
  if (a.hole_number) parts.push(`Hole ${a.hole_number}`);
  return parts.join(" · ");
}

/** Live list of an event's alerts (newest first), kept fresh via realtime. */
export function useEventAlerts(tournamentId: string | null | undefined) {
  const [alerts, setAlerts] = useState<EventAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await supabase
      .from("event_alerts")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(50);
    setAlerts((data as EventAlert[]) ?? []);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    void reload();
    const ch = supabase
      .channel(`event-alerts-${tournamentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "event_alerts", filter: `tournament_id=eq.${tournamentId}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [tournamentId, reload]);

  return { alerts, active: alerts.filter((a) => a.is_active), loading, reload };
}
