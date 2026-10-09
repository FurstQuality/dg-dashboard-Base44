import * as React from "react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/brand/brand-mark";
import { SyncStatusChip, type SyncStatus } from "@/components/mobile/sync-status-chip";
import { cn } from "@/lib/utils";
import { ChevronLeft, Flag, MoreVertical, Wind, ListOrdered, Info } from "lucide-react";
import { ActionSheet, type ActionSheetItem } from "@/components/mobile/action-sheet";

/**
 * Compact round header for the scoring shell.
 * Slim 56–60px sticky bar with three sections: left (identity), center (round context), right (status/actions).
 * Never wraps; long labels truncate with a native title tooltip; overflow menu absorbs any action that doesn't fit.
 */
export function RoundHeader({
  courseName,
  holeInfo,
  layoutName,
  format,
  holeCurrent,
  holeTotal,
  eventName,
  syncStatus,
  syncLabel,
  weatherChip,
  onExit,
  onOpenScorecard,
  onOpenLeaderboard,
  onFinish,
  canFinish,
  overflow,
}: {
  courseName?: string;
  /** Phone subtitle, e.g. "Par 3 · 179 ft" — replaces the long course name. */
  holeInfo?: string;
  layoutName?: string;
  format?: string;
  holeCurrent: number;
  holeTotal: number;
  eventName?: string;
  syncStatus: SyncStatus;
  syncLabel?: string;
  weatherChip?: React.ReactNode;
  onExit: () => void;
  onOpenScorecard: () => void;
  onOpenLeaderboard?: () => void;
  onFinish?: () => void;
  canFinish?: boolean;
  overflow?: ActionSheetItem[];
}) {
  const overflowItems: ActionSheetItem[] = [
    {
      label: "Open scorecard",
      icon: <ListOrdered className="h-4 w-4" />,
      onSelect: onOpenScorecard,
    },
    ...(onOpenLeaderboard
      ? [
          {
            label: "Event leaderboard",
            icon: <Flag className="h-4 w-4" />,
            onSelect: onOpenLeaderboard,
          },
        ]
      : []),
    ...(overflow ?? []),
    ...(onFinish
      ? [{ label: "End round", icon: <Flag className="h-4 w-4" />, onSelect: onFinish }]
      : []),
  ];

  return (
    <header
      className={cn(
        "flex h-14 items-center gap-2 border-b border-border bg-card/85 px-2 backdrop-blur",
        "sm:px-3",
      )}
    >
      {/* Left: exit + brand + title */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onExit}
          aria-label="Exit scoring"
          className="min-h-11 min-w-11 shrink-0"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="hidden shrink-0 sm:block">
          <BrandMark variant="compact" className="h-7 w-auto" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-base font-bold tabular-nums sm:hidden">
              Hole {holeCurrent} / {holeTotal}
            </span>
            <span
              className="hidden truncate font-display text-sm font-semibold sm:inline sm:text-base"
              title={eventName || courseName || "Round"}
            >
              {eventName || courseName || "Round"}
            </span>
            {eventName ? (
              <span className="hidden shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary sm:inline">
                Event
              </span>
            ) : null}
          </div>
          <div
            className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground"
            title={[courseName, layoutName, format].filter(Boolean).join(" · ")}
          >
            <span className="truncate sm:hidden">{holeInfo || eventName || courseName}</span>
            {eventName && courseName ? <span className="hidden truncate sm:inline">{courseName}</span> : null}
            {layoutName ? <span className="truncate">· {layoutName}</span> : null}
            {format ? <span className="hidden truncate wide:inline">· {format}</span> : null}
            <span className="ml-auto hidden shrink-0 tabular-nums sm:ml-2 sm:inline">
              Hole {holeCurrent} of {holeTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Right: status + weather + actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <SyncStatusChip status={syncStatus} label={syncLabel} className="hidden sm:inline-flex" />
        <div className="hidden wide:block">{weatherChip}</div>

        <div id="round-header-actions-slot" className="contents" />
        <div id="round-header-report-slot" className="contents" />
        <ActionSheet
          title="Round menu"
          items={overflowItems}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Round menu"
              className="min-h-11 min-w-11"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          }
        />

        {onFinish ? (
          <Button
            size="sm"
            onClick={onFinish}
            disabled={!canFinish}
            className="hidden min-h-11 gap-1 font-semibold wide:inline-flex"
          >
            <Flag className="h-4 w-4" />
            <span className="hidden sm:inline">End Round & Submit</span>
            <span className="sm:hidden">End & Submit</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

/** Small weather chip suitable for the header on md+ screens. */
export function HeaderWeatherChip({
  temp,
  wind,
  gust,
  windDir,
  code,
  Icon,
}: {
  temp?: number | null;
  wind?: number | null;
  gust?: number | null;
  windDir?: string | null;
  code?: string;
  Icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs"
      title={code || "Weather"}
      role="status"
    >
      {Icon ? <Icon className="h-3.5 w-3.5 text-primary" /> : <Info className="h-3.5 w-3.5" />}
      <span className="tabular-nums">{temp != null ? `${Math.round(temp)}°` : "—"}</span>
      <span className="flex items-center gap-1 text-muted-foreground">
        <Wind className="h-3 w-3" />
        <span className="tabular-nums">
          {wind != null ? Math.round(wind) : "—"}
          {gust != null && wind != null && gust > wind ? `/${Math.round(gust)}g` : ""}
        </span>
        {windDir ? <span>{windDir}</span> : null}
      </span>
    </div>
  );
}
