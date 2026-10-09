/**
 * Series markers for league nights. A night is listed on its own date, so it
 * needs to say which league it belongs to and offer a way to the full schedule.
 */
import { Link } from "@tanstack/react-router";
import { CalendarRange, ExternalLink } from "lucide-react";
import type { SeriesInfo } from "@/lib/event-series";

/** Plain text marker — safe inside a card that is already one big link. */
export function SeriesNote({
  series,
  className,
}: {
  series: SeriesInfo;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${className ?? ""}`}
    >
      <CalendarRange className="h-3 w-3 shrink-0" />
      <span className="truncate">
        Night {series.index} of {series.total} · {series.label}
      </span>
    </span>
  );
}

/** Link out to the whole league schedule. */
export function SeriesLink({ series, className }: { series: SeriesInfo; className?: string }) {
  const cls = `inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline ${className ?? ""}`;
  if (series.to) {
    return (
      <Link to={series.to} params={series.params} className={cls}>
        <CalendarRange className="h-3 w-3" /> Full series
      </Link>
    );
  }
  if (series.url) {
    return (
      <a href={series.url} target="_blank" rel="noopener noreferrer" className={cls}>
        <CalendarRange className="h-3 w-3" /> Full series
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    );
  }
  return null;
}
