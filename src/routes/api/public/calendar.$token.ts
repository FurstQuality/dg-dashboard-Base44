/**
 * ICS calendar feed — private per-user subscription URL.
 * Any calendar client (Apple, Google, Outlook) can subscribe to
 * `/api/public/calendar/<token>` and receive live event updates.
 *
 * Token is verified against profiles.ics_feed_token — no session required
 * (calendar clients cannot authenticate). Do not expose PII.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function escapeICSText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function fmtDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function foldLine(line: string): string {
  // RFC 5545: lines longer than 75 octets should be folded
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, 74));
  remaining = remaining.slice(74);
  while (remaining.length > 73) {
    parts.push(" " + remaining.slice(0, 73));
    remaining = remaining.slice(73);
  }
  if (remaining.length > 0) parts.push(" " + remaining);
  return parts.join("\r\n");
}

export const Route = createFileRoute("/api/public/calendar/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || token.length < 20) {
          return new Response("Not found", { status: 404 });
        }
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, display_name")
          .eq("ics_feed_token", token)
          .maybeSingle();
        if (!profile) return new Response("Not found", { status: 404 });
        const userId = (profile as { id: string }).id;
        const displayName =
          (profile as { display_name: string | null }).display_name ?? "DG Dashboard";

        const { data: events } = await supabase
          .from("scheduled_events")
          .select(
            "id, title, event_url, location, city, state, starts_on, ends_on, starts_at, all_day, notes, status, updated_at, recurrence_dow",
          )
          .eq("user_id", userId)
          .in("status", ["interested", "registered", "waitlisted", "confirmed"])
          .not("starts_on", "is", null)
          .order("starts_on", { ascending: true });

        const lines: string[] = [];
        lines.push("BEGIN:VCALENDAR");
        lines.push("VERSION:2.0");
        lines.push("PRODID:-//DG Dashboard Disc Golf//Calendar Feed//EN");
        lines.push("CALSCALE:GREGORIAN");
        lines.push("METHOD:PUBLISH");
        lines.push(`X-WR-CALNAME:${escapeICSText(displayName + " — Disc Golf")}`);
        lines.push("X-WR-TIMEZONE:UTC");
        lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
        lines.push("X-PUBLISHED-TTL:PT1H");

        const nowStamp = fmtDateTime(new Date().toISOString());
        const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
        for (const raw of (events ?? []) as Array<{
          id: string;
          title: string;
          event_url: string | null;
          location: string | null;
          city: string | null;
          state: string | null;
          starts_on: string;
          ends_on: string | null;
          starts_at: string | null;
          all_day: boolean;
          notes: string | null;
          status: string;
          updated_at: string;
          recurrence_dow: number | null;
        }>) {
          const uid = `${raw.id}@dgdashboard.app`;
          const loc = raw.location ?? [raw.city, raw.state].filter(Boolean).join(", ");
          const dow = typeof raw.recurrence_dow === "number" ? raw.recurrence_dow : null;
          lines.push("BEGIN:VEVENT");
          lines.push(`UID:${uid}`);
          lines.push(`DTSTAMP:${nowStamp}`);
          lines.push(`LAST-MODIFIED:${fmtDateTime(raw.updated_at)}`);
          if (dow !== null) {
            // Weekly recurring league: emit a single-day event on the first
            // matching weekday within [starts_on, ends_on] and repeat weekly.
            const first = new Date(`${raw.starts_on}T00:00:00Z`);
            while (first.getUTCDay() !== dow) first.setUTCDate(first.getUTCDate() + 1);
            const firstIso = first.toISOString().slice(0, 10);
            const dayAfter = new Date(first);
            dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
            lines.push(`DTSTART;VALUE=DATE:${fmtDate(firstIso)}`);
            lines.push(`DTEND;VALUE=DATE:${fmtDate(dayAfter.toISOString().slice(0, 10))}`);
            const untilBase = raw.ends_on ?? raw.starts_on;
            const untilDate = new Date(`${untilBase}T00:00:00Z`);
            untilDate.setUTCDate(untilDate.getUTCDate() + 1);
            const until = fmtDate(untilDate.toISOString().slice(0, 10));
            lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[dow]};UNTIL=${until}`);
          } else if (raw.all_day || !raw.starts_at) {
            lines.push(`DTSTART;VALUE=DATE:${fmtDate(raw.starts_on)}`);
            const endBase = raw.ends_on ?? raw.starts_on;
            const end = new Date(`${endBase}T00:00:00Z`);
            end.setUTCDate(end.getUTCDate() + 1);
            lines.push(`DTEND;VALUE=DATE:${fmtDate(end.toISOString().slice(0, 10))}`);
          } else {
            lines.push(`DTSTART:${fmtDateTime(raw.starts_at)}`);
            lines.push(`DTEND:${fmtDateTime(raw.starts_at)}`);
          }
          lines.push(foldLine(`SUMMARY:${escapeICSText(raw.title)}`));
          if (loc) lines.push(foldLine(`LOCATION:${escapeICSText(loc)}`));
          const descParts = [raw.notes, raw.event_url, `Status: ${raw.status}`].filter(Boolean);
          if (descParts.length > 0) {
            lines.push(foldLine(`DESCRIPTION:${escapeICSText(descParts.join("\n\n"))}`));
          }
          if (raw.event_url) lines.push(foldLine(`URL:${raw.event_url}`));
          lines.push(`STATUS:${raw.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
          lines.push("END:VEVENT");
        }
        lines.push("END:VCALENDAR");

        return new Response(lines.join("\r\n"), {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "public, max-age=900",
            "Content-Disposition": `inline; filename=\"dg-dashboard-schedule.ics\"`,
          },
        });
      },
    },
  },
});
