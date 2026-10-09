import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot";
import { mascotFor, nearestApprovedSize, type MascotIntent } from "@/lib/mascots";
import { useRouteAccent } from "@/components/shell/route-accent";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

type Props = {
  /** Which contextual mascot voices this empty state. */
  intent?: MascotIntent;
  /** Short, human title — e.g. "Your DG Dashboard crew starts here." */
  title: string;
  /** Optional supporting sentence — what this section will fill up with. */
  description?: ReactNode;
  /** Actions row — primary + optional secondary buttons/links. */
  actions?: ReactNode;
  /** Optional footnote or hint text below the actions. */
  hint?: ReactNode;
  className?: string;
  /** Rendered mascot size (rounded to nearest approved size). */
  size?: number;
};

/**
 * MascotEmptyState — the canonical empty-state pattern for DG Dashboard.
 *
 * Every list, feed, board, or dashboard slot that can be empty should
 * render this instead of a bare "No data" line. Copy voice is warm,
 * disc-golf aware, and always names the next action.
 *
 * Respects `mascotIntensity`: when `off`, the mascot image is dropped
 * but the copy + actions remain visible so the empty state still guides
 * the user.
 */
export function MascotEmptyState({
  intent = "coach",
  title,
  description,
  actions,
  hint,
  className,
  size = 128,
}: Props) {
  const { mascotIntensity } = useTheme();
  const { style } = useRouteAccent();
  const entry = mascotFor(intent);
  const approvedSize = nearestApprovedSize(intent, size);
  const showMascot = mascotIntensity !== "off";

  return (
    <div
      style={style}
      className={cn(
        "flex flex-col items-center gap-4 rounded-card border bg-card px-6 py-10 text-center accent-panel",
        className,
      )}
    >
      {showMascot ? (
        <Mascot
          name={entry.name}
          pose={entry.pose}
          size={approvedSize}
          alt={entry.alt}
          className="mascot-emblem-glow"
        />
      ) : null}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold text-foreground text-glow [text-wrap:balance]">{title}</h3>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground [text-wrap:pretty]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{actions}</div>
      ) : null}
      {hint ? <p className="text-[12px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
