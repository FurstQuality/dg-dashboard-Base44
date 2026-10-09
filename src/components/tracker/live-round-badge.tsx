/**
 * Compact, high-visibility LIVE indicator used everywhere in the tracker
 * (banner, event card header, member rows). Two variants share the same
 * pulsing red dot so the crew always recognises an in-progress round at a
 * glance, no matter which surface they're looking at.
 */
import { Radio } from "lucide-react";
import { formatToPar, type LiveMemberStatus } from "@/lib/tracker-live-status";

type Props = {
  status: LiveMemberStatus;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
};

export function LiveRoundBadge({ status, size = "sm", showDetails = true }: Props) {
  const scale =
    size === "lg"
      ? "gap-2 px-3 py-1 text-sm"
      : size === "md"
        ? "gap-1.5 px-2 py-0.5 text-xs"
        : "gap-1 px-1.5 py-0.5 text-[10px]";
  const dotSize = size === "lg" ? "h-2.5 w-2.5" : size === "md" ? "h-2 w-2" : "h-1.5 w-1.5";
  const label = status.completed ? "FINAL" : status.active ? "LIVE" : "PENDING";
  const tone = status.active
    ? "bg-red-500/15 text-red-600 border-red-500/40 dark:text-red-400"
    : status.completed
      ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400"
      : "bg-muted text-muted-foreground border-border";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${scale} ${tone}`}
    >
      <span className="relative inline-flex items-center">
        <span
          className={`inline-block rounded-full ${dotSize} ${status.active ? "bg-red-500" : status.completed ? "bg-emerald-500" : "bg-muted-foreground/60"}`}
        />
        {status.active && (
          <span className={`absolute inset-0 rounded-full ${dotSize} animate-ping bg-red-500/60`} />
        )}
      </span>
      <span>{label}</span>
      {showDetails && (status.active || status.completed) && (
        <span className="ml-0.5 flex items-center gap-1 font-medium normal-case tracking-normal">
          {status.round != null && <span>R{status.round}</span>}
          <span
            className={
              status.toPar < 0
                ? "text-emerald-600 dark:text-emerald-400"
                : status.toPar > 0
                  ? "text-orange-600 dark:text-orange-400"
                  : ""
            }
          >
            {formatToPar(status.toPar)}
          </span>
          <span className="text-muted-foreground">
            {status.completed ? "F" : `thru ${status.thru}`}
          </span>
          {status.place != null && <span>#{status.place}</span>}
        </span>
      )}
    </span>
  );
}

export function LiveDot({
  pulsing = true,
  className = "",
}: {
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
      {pulsing && (
        <span className="absolute inset-0 h-2 w-2 animate-ping rounded-full bg-red-500/60" />
      )}
      <Radio className="ml-1 h-3 w-3 text-red-500" />
    </span>
  );
}
