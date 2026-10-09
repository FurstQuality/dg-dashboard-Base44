/**
 * Prominent, page-level LIVE ROUND banner. Renders when at least one tracked
 * crew member is currently playing a round. Shows each active player's
 * running score, place, and thru, and links directly into the event card.
 */
import { Link } from "@tanstack/react-router";
import { Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TrackerEvent, TrackerMember } from "@/lib/tracker.functions";
import { formatToPar, type LiveMemberStatus } from "@/lib/tracker-live-status";
import { crewSwatchStyle } from "@/lib/tracker-colors";

type Props = {
  groupId: string;
  activeStatuses: Array<{ member: TrackerMember; status: LiveMemberStatus }>;
  eventById: Map<string, TrackerEvent>;
  refreshing: boolean;
  onRefresh: () => void;
};

export function LiveRoundBanner({
  groupId: _groupId,
  activeStatuses,
  eventById,
  refreshing,
  onRefresh,
}: Props) {
  if (activeStatuses.length === 0) return null;

  return (
    <section
      className="relative overflow-hidden rounded-lg border border-red-500/40 bg-gradient-to-r from-red-500/15 via-red-500/10 to-transparent px-3 py-2 shadow-sm"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5">
          <span className="relative inline-flex h-2.5 w-2.5 items-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500/60" />
            <span className="relative inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <Radio className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span className="text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
            Live Round
          </span>
          <span className="text-xs text-muted-foreground">
            {activeStatuses.length} player{activeStatuses.length === 1 ? "" : "s"} on the course
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 gap-1 px-2 text-[11px]"
          onClick={onRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Refresh scores
        </Button>
      </div>

      <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {activeStatuses.map(({ member, status }) => {
          const event = eventById.get(status.score.event_id);
          const name = member.display_name || status.score.player_name || `#${member.pdga_number}`;
          const initials = name
            .split(/\s+/)
            .filter(Boolean)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const toParClass =
            status.toPar < 0
              ? "text-emerald-600 dark:text-emerald-400"
              : status.toPar > 0
                ? "text-orange-600 dark:text-orange-400"
                : "text-foreground";
          return (
            <div
              key={member.id}
              className="flex items-center gap-2 rounded-md border bg-background/85 px-2 py-1.5"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white shadow-sm"
                style={crewSwatchStyle(member.color)}
              >
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Link
                    to="/tracker/$groupId/player/$memberId"
                    params={{ groupId: member.group_id, memberId: member.id }}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {name}
                  </Link>
                  <span className="rounded-full border border-red-500/40 bg-red-500/15 px-1.5 py-0 text-[9px] font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
                    Live
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {status.round != null && <span className="font-medium">R{status.round}</span>}
                  <span>Thru {status.thru}</span>
                  {status.place != null && <span>#{status.place}</span>}
                  {event && <span className="truncate italic">{event.name}</span>}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold leading-none tabular-nums ${toParClass}`}>
                  {formatToPar(status.toPar)}
                </div>
                {status.total > 0 && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {status.total}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
