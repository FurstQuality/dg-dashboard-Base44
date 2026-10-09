import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot";
import { mascotFor, nearestApprovedSize, type MascotIntent } from "@/lib/mascots";
import { useTheme } from "@/lib/theme-context";
import { cn } from "@/lib/utils";

type Props = {
  /** Which contextual mascot to show. */
  intent?: MascotIntent;
  /** Display size in px (rounded to nearest approved size). */
  size?: number;
  /** Alt text override — otherwise the registry provides one. */
  alt?: string;
  className?: string;
  /** Absolutely-positioned watermark treatment (low opacity, behind content). */
  watermark?: boolean;
  /** Rendering context — determines whether the personalization intensity
   *  hides this mascot. Empty states remain visible even on `empty-only`. */
  context?: "hero" | "empty" | "callout" | "watermark";
  children?: ReactNode;
};

/**
 * MascotIllustration — the ONLY component that turns an intent into a
 * mascot image (aside from `CoachCallout` and `MascotEmptyState`, which
 * compose this).
 *
 * Every mascot rendered anywhere in the app should route through here or
 * one of its sibling primitives so intents stay consistent and asset
 * paths never leak into feature code.
 *
 * Respects the global mascot intensity from `useTheme()`:
 *   - `off`        → nothing renders
 *   - `empty-only` → only `context="empty"` renders
 *   - `subtle`     → hero/watermark hidden, callouts + empties render
 *   - `full`       → everything renders
 */
export function MascotIllustration({
  intent = "coach",
  size = 96,
  alt,
  className,
  watermark,
  context,
  children,
}: Props) {
  const { mascotIntensity } = useTheme();
  const ctx = context ?? (watermark ? "watermark" : "hero");

  if (mascotIntensity === "off") return null;
  if (mascotIntensity === "empty-only" && ctx !== "empty") return null;
  if (mascotIntensity === "subtle" && (ctx === "hero" || ctx === "watermark")) {
    return null;
  }

  const entry = mascotFor(intent);
  const approvedSize = nearestApprovedSize(intent, size);

  if (watermark) {
    return (
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-0 top-0 -z-0 opacity-[0.22] mascot-emblem-glow",
          className,
        )}
      >
        <Mascot
          name={entry.name}
          pose={entry.pose}
          size={approvedSize}
          alt=""
          className="select-none"
        />
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <Mascot name={entry.name} pose={entry.pose} size={approvedSize} alt={alt ?? entry.alt} />
      {children ? <div className="text-center">{children}</div> : null}
    </div>
  );
}
