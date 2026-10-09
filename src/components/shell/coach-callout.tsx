import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Mascot } from "@/components/mascot";
import { mascotFor, nearestApprovedSize, type MascotIntent } from "@/lib/mascots";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

type Props = {
  /** Which contextual mascot to voice this callout. Defaults to Ace (coach). */
  intent?: MascotIntent;
  /** Short intro line — who's speaking or what section this is. */
  eyebrow?: string;
  /** The callout message. Keep to 1–3 short sentences. */
  message: ReactNode;
  /** Optional action button/link. */
  action?: ReactNode;
  className?: string;
  size?: number;
};

/**
 * CoachCallout — a compact card that pairs a mascot with a short piece
 * of guidance. Use for Ask Ace prompts, coaching tips, empty-state
 * encouragement, and onboarding nudges. Never use for arbitrary
 * decoration; every callout must carry a real message.
 *
 * Hidden entirely when the user chose `mascotIntensity: off` or
 * `empty-only`; when `subtle`, the mascot image drops but the message
 * remains inside the callout card.
 */
export function CoachCallout({
  intent = "coach",
  eyebrow,
  message,
  action,
  className,
  size = 72,
}: Props) {
  const { mascotIntensity } = useTheme();

  if (mascotIntensity === "off" || mascotIntensity === "empty-only") return null;

  const entry = mascotFor(intent);
  const approvedSize = nearestApprovedSize(intent, size);
  const showMascot = mascotIntensity === "full";

  return (
    <Card
      className={cn(
        "grid items-center gap-3 rounded-card border border-primary/25 bg-primary/5 p-3 sm:p-4",
        showMascot ? "grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-1",
        className,
      )}
    >
      {showMascot ? (
        <div className="shrink-0">
          <Mascot name={entry.name} pose={entry.pose} size={approvedSize} alt={entry.alt} />
        </div>
      ) : null}
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {eyebrow}
          </div>
        ) : null}
        <div className="text-sm leading-relaxed text-foreground [text-wrap:pretty]">{message}</div>
        {action ? <div className="pt-1">{action}</div> : null}
      </div>
    </Card>
  );
}
