import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SectionPattern, type BrandedSection } from "./section-pattern";

type Props = {
  children: ReactNode;
  className?: string;
  /**
   * Branded section motif rendered as a subtle low-opacity backdrop
   * layer behind page content. Uses the registered SVG pattern for the
   * given section (feed / play / community / statlink / …). Intensity is
   * globally controlled by the user's personalization setting.
   */
  section?: BrandedSection;
  /**
   * Escape hatch for pages that need a bespoke backdrop node. Prefer
   * `section` unless the page has a truly custom background need.
   */
  backdrop?: ReactNode;
  /** Compact page — used for narrow content like Messages, Auth. */
  narrow?: boolean;
};

/**
 * Canonical DG Dashboard page shell.
 *
 * Enforces the max-width, page padding, and section spacing every route
 * shares. Every content route should mount its body inside a `<PageShell>`.
 *
 * The optional `section` prop paints one of the branded SVG patterns
 * from `SectionPattern` behind the content. Opacity is capped low and
 * stepped by the `data-backgrounds` attribute on `<html>` (full / subtle
 * / minimal / off) so the pattern never interferes with contrast.
 *
 * Do NOT hand-roll `mx-auto max-w-* px-* space-y-*` inside a route — use
 * the shell so the whole app moves in lockstep when tokens change.
 */
export function PageShell({ children, className, section, backdrop, narrow }: Props) {
  const backdropNode = backdrop ?? (section ? <SectionPattern section={section} /> : null);

  return (
    <div
      className={cn(
        "relative mx-auto w-full",
        // Content stretches with the viewport so wide screens do not leave
        // large empty gutters; the ceiling keeps line lengths readable.
        narrow ? "max-w-[980px]" : "max-w-[1560px] 2xl:max-w-[1840px]",
        "px-1 pb-12 sm:px-5 lg:px-8 2xl:px-10",
        "space-y-6",
        className,
      )}

    >
      {backdropNode ? (
        <div
          aria-hidden
          data-section-backdrop={section ?? "custom"}
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 overflow-hidden",
            // Intensity is driven by the html data attribute. Base = subtle.
            "opacity-[var(--cl-backdrop-opacity,0.06)]",
          )}
        >
          {backdropNode}
        </div>
      ) : null}
      {children}
    </div>
  );
}
