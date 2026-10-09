import { Link } from "@tanstack/react-router";
import { CourseConditionInline } from "@/components/courses/course-condition-badge";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolvePdgaDgsLink } from "@/lib/pdga-dgs-link.functions";
import { publishedName } from "@/lib/tracker/placeholder-layout";
import {
  AlarmClock,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Flag,
  MapPin,
  Radio,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type TrackedEventDetails = {
  name: string;
  event_date: string | null;
  end_date?: string | null;
  location: string | null;
  tier: string | null;
  sanctioning_tier: string | null;
  event_classification: string | null;
  event_status: string | null;
  start_type: string | null;
  time_zone: string | null;
  url: string | null;
  registration_url: string | null;
  results_url: string | null;
  live_scoring_url: string | null;
  live_status: string | null;
  live_current_round: number | null;
  live_last_synced_at: string | null;
  last_synced_at: string | null;
  sync_error: string | null;
  pdga_event_ref: string | null;
  /** The event's own "about" copy, when it publishes one. */
  description?: string | null;
  venue_name?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  registration_status?: string | null;
  field_size?: number | null;
  field_capacity?: number | null;
  rounds_planned?: number | null;
};

export type TrackedEventRound = {
  id: string;
  round_number: number;
  round_label: string | null;
  round_date: string | null;
  /** true when the date was worked out from the event's dates, not published per round. */
  round_date_expected?: boolean;
  course_name: string | null;
  course_id?: string | null;
  course_layout: string | null;
  division: string | null;
  pool: string | null;
  start_type: string | null;
  start_window_start: string | null;
  start_window_end: string | null;
  tee_interval_minutes: number | null;
};

export interface EventDetailsCardProps {
  event: TrackedEventDetails;
  rounds: TrackedEventRound[];
  /** Players seen in live scoring — used when the event publishes no field size. */
  fieldObserved?: number;
}

const START_LABEL: Record<string, string> = {
  shotgun: "Shotgun start",
  tee: "Tee times",
  tee_times: "Tee times",
  flex: "Flex start",
};

/** Live-sync states, in plain language for players. */
const LIVE_LABEL: Record<string, string> = {
  ok: "Live scores connected",
  no_matches: "No scores posted yet",
};

function liveLabel(status: string): string {
  if (status.startsWith("error:")) return "Live scores unavailable";
  return LIVE_LABEL[status] ?? pretty(status) ?? status;
}

const STATUS_TONE: Record<string, string> = {
  withdrawn: "border-rose-500/40 text-rose-500",
  cancelled: "border-rose-500/40 text-rose-500",
  completed: "border-emerald-500/40 text-emerald-500",
  in_progress: "border-primary/50 text-primary",
};

function dateLabel(d: string | null): string {
  if (!d) return "Date to be announced";
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function dateRange(start: string | null, end: string | null | undefined): string {
  if (!start) return "Date to be announced";
  if (!end || end === start) return dateLabel(start);
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

/** "start format and registration" — a readable list for the footnote. */
function listSentence(items: string[]): string {
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function timeLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pretty(v: string | null): string | null {
  if (!v) return null;
  return v.replace(/_/g, " ");
}

/**
 * The event's own details: when and where it is, how it starts, its sanctioning,
 * the round-by-round schedule, and the official links (registration, results,
 * live scoring). Read-only — this mirrors what the event publishes.
 */
/**
 * One row per round: a round played by several divisions on the same course is
 * a single line listing those divisions, not one line each.
 */
function mergeRounds(rounds: TrackedEventRound[]): (TrackedEventRound & { divisions: string[] })[] {
  const byKey = new Map<string, TrackedEventRound & { divisions: string[] }>();
  for (const r of rounds) {
    const key = [
      r.round_number,
      r.round_date ?? "",
      r.course_name ?? "",
      r.course_layout ?? "",
      r.pool ?? "",
      r.start_window_start ?? "",
    ].join("::");
    const found = byKey.get(key);
    if (!found) {
      byKey.set(key, { ...r, divisions: r.division ? [r.division] : [] });
      continue;
    }
    if (r.division && !found.divisions.includes(r.division)) found.divisions.push(r.division);
    // Keep whichever row published the most detail.
    if (!found.course_name && r.course_name) found.course_name = r.course_name;
    if (!found.course_id && r.course_id) found.course_id = r.course_id;
    if (!found.course_layout && r.course_layout) found.course_layout = r.course_layout;
    if (!found.start_type && r.start_type) found.start_type = r.start_type;
    if (!found.start_window_start && r.start_window_start)
      found.start_window_start = r.start_window_start;
    if (found.round_date_expected && r.round_date && !r.round_date_expected) {
      found.round_date = r.round_date;
      found.round_date_expected = false;
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.round_number - b.round_number || (a.round_date ?? "").localeCompare(b.round_date ?? ""),
  );
}

export function EventDetailsCard({ event, rounds, fieldObserved }: EventDetailsCardProps) {
  // Registration lives on the event's Disc Golf Scene page; the PDGA page is
  // only a fallback when no Scene page can be found.
  const resolveDgs = useServerFn(resolvePdgaDgsLink);
  const ref = event.pdga_event_ref;
  const dgsQuery = useQuery({
    queryKey: ["pdga-dgs-link", ref],
    enabled: !!ref,
    queryFn: () => resolveDgs({ data: { eventRef: ref! } }),
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const storedReg = event.registration_url;
  const storedIsScene = !!storedReg && /discgolfscene\.com/i.test(storedReg);
  const registrationHref =
    (storedIsScene ? storedReg : null) ??
    dgsQuery.data?.dgs_event_url ??
    storedReg;
  const scheduleRows = mergeRounds(rounds);
  const roundStart = rounds.find((r) => r.start_type)?.start_type ?? null;
  const startSource = event.start_type ?? roundStart;
  const startLabel = (startSource && (START_LABEL[startSource] ?? pretty(startSource))) || null;
  const liveSynced = timeLabel(event.live_last_synced_at ?? event.last_synced_at);
  // Only publish what the event actually publishes: empty rows become one short
  // footnote instead of a grid of "Not published".
  const details: { label: string; icon: React.ReactNode; value: string | null }[] = [
    {
      label: "Date",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      value: event.event_date
        ? `${dateRange(event.event_date, event.end_date)}${event.time_zone ? ` · ${event.time_zone}` : ""}`
        : null,
    },
    {
      label: "Location",
      icon: <MapPin className="h-3.5 w-3.5" />,
      value:
        event.location ||
        [event.venue_name, event.city, event.state, event.country].filter(Boolean).join(", ") ||
        null,
    },
    {
      label: "Sanctioning",
      icon: <Flag className="h-3.5 w-3.5" />,
      value:
        event.sanctioning_tier || event.tier
          ? `${event.sanctioning_tier ?? event.tier}${
              event.event_classification ? ` · ${pretty(event.event_classification)}` : ""
            }`
          : null,
    },
    { label: "Start format", icon: <AlarmClock className="h-3.5 w-3.5" />, value: startLabel },
    {
      label: "Scores last checked",
      icon: <Radio className="h-3.5 w-3.5" />,
      value: liveSynced ?? "Not synced yet",
    },
    {
      label: "PDGA event",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      value: event.pdga_event_ref ? `#${event.pdga_event_ref}` : null,
    },
    {
      label: "Field",
      icon: <Users className="h-3.5 w-3.5" />,
      value: event.field_size
        ? `${event.field_size} registered${event.field_capacity ? ` of ${event.field_capacity}` : ""}`
        : fieldObserved
          ? `${fieldObserved} players on the live scores`
          : null,
    },
    {
      label: "Registration",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      value: pretty(event.registration_status ?? null),
    },
    {
      label: "Rounds planned",
      icon: <CalendarDays className="h-3.5 w-3.5" />,
      value: event.rounds_planned ? `${event.rounds_planned}` : null,
    },
  ];
  const missing = details.filter((d) => !d.value).map((d) => d.label.toLowerCase());

  const links = [
    {
      href: registrationHref,
      label: registrationHref && !/discgolfscene\.com/i.test(registrationHref) ? "Registration (PDGA)" : "Registration",
    },
    { href: event.live_scoring_url, label: "Live scoring" },
    { href: event.results_url, label: "Official results" },
    { href: event.url, label: "Event page" },
  ].filter((l): l is { href: string; label: string } => !!l.href);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-primary" />
            Event details
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {event.event_status && (
              <Badge
                variant="outline"
                className={`text-[10px] ${STATUS_TONE[event.event_status] ?? ""}`}
              >
                {pretty(event.event_status)}
              </Badge>
            )}
            {event.live_status && (
              <Badge variant="outline" className="gap-1 text-[10px]">
                <Radio className="h-3 w-3" />
                {liveLabel(event.live_status)}
                {event.live_current_round ? ` · round ${event.live_current_round}` : ""}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {details
            .filter((d) => d.value)
            .map((d) => (
              <Detail key={d.label} icon={d.icon} label={d.label}>
                {d.value}
              </Detail>
            ))}
        </dl>

        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            The event hasn&apos;t published {listSentence(missing)} yet.
          </p>
        )}

        {event.description && (
          <div className="space-y-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              About this event
            </div>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{event.description}</p>
          </div>
        )}

        {event.sync_error && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-500">
            Last sync had trouble: {event.sync_error}
          </p>
        )}

        {scheduleRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Round schedule
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">Round</th>
                    <th className="px-3 py-1.5 text-left font-medium">Date</th>
                    <th className="px-3 py-1.5 text-left font-medium">Course</th>
                    <th className="px-3 py-1.5 text-left font-medium">Layout</th>
                    <th className="px-3 py-1.5 text-left font-medium">Start</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">
                        {r.round_label || `Round ${r.round_number}`}
                        {r.divisions.length > 0 ? (
                          <span className="text-muted-foreground"> · {r.divisions.join(", ")}</span>
                        ) : null}
                        {r.pool ? <span className="text-muted-foreground"> · pool {r.pool}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.round_date
                          ? `${dateLabel(r.round_date)}${r.round_date_expected ? " (expected)" : ""}`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.course_id ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <Link to="/courses/$courseId" params={{ courseId: r.course_id }} className="hover:underline">
                              {publishedName(r.course_name) ?? "Course"}
                            </Link>
                            <CourseConditionInline courseId={r.course_id} />
                          </span>
                        ) : (publishedName(r.course_name) ?? "Course not published")}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {publishedName(r.course_layout) ?? "Layout not published"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.start_window_start
                          ? `${r.start_window_start}${r.start_window_end ? `–${r.start_window_end}` : ""}`
                          : r.start_type
                            ? (START_LABEL[r.start_type] ?? pretty(r.start_type))
                            : "—"}
                        {r.tee_interval_minutes ? ` · every ${r.tee_interval_minutes} min` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
              >
                {l.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}
