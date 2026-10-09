/**
 * Server-only quiet-hours gate for push delivery.
 *
 * Reads the recipient's notification preferences (column-revoked from the
 * `authenticated` role, so this must run with server credentials) plus their
 * committed schedule rows around today, then decides whether a non-urgent push
 * should be held.
 */
import {
  buildTournamentQuietWindows,
  mergeNotificationPrefs,
  quietHoursStatus,
  type NotificationPrefs,
} from "@/lib/platform-config";

/** Bounded read: only events that could overlap "now" matter. */
const SCHEDULE_LOOKUP_LIMIT = 20;

export type QuietHold = "push_disabled" | "quiet_nightly" | "quiet_tournament";

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the reason a push should be held, or null when it may be sent.
 * Failures are non-fatal: if preferences can't be read the push proceeds.
 */
export async function holdPushForQuietHours(
  userId: string,
  now: Date = new Date(),
): Promise<QuietHold | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();
    const prefs: NotificationPrefs = mergeNotificationPrefs(
      (profile as { notification_prefs?: Partial<NotificationPrefs> | null } | null)
        ?.notification_prefs,
    );
    if (!prefs.channels.push) return "push_disabled";

    let windows: ReturnType<typeof buildTournamentQuietWindows> = [];
    if (prefs.quietHours.duringTournaments || prefs.quietHours.duringLeagues) {
      const { data: rows } = await supabaseAdmin
        .from("scheduled_events")
        .select("title, status, starts_on, ends_on, starts_at, source")
        .eq("user_id", userId)
        .gte("ends_on", isoDate(-1))
        .lte("starts_on", isoDate(1))
        .limit(SCHEDULE_LOOKUP_LIMIT);
      windows = buildTournamentQuietWindows(rows ?? [], {
        includeTournaments: prefs.quietHours.duringTournaments,
        includeLeagues: prefs.quietHours.duringLeagues,
      });
    }

    const status = quietHoursStatus(prefs, now, windows);
    if (!status.quiet) return null;
    return status.reason === "tournament" ? "quiet_tournament" : "quiet_nightly";
  } catch {
    return null;
  }
}
