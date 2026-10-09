import type { CSSProperties } from "react";
import { useRouterState } from "@tanstack/react-router";
import { navMascotFor, navThemeFor, resolveNavAccent } from "@/lib/nav-theme";
import { useTheme } from "@/lib/theme-context";

export type RouteAccent = {
  /** CSS color for the current section. */
  accent: string;
  /** Style object exposing `--accent-color` to descendants. */
  style: CSSProperties;
  /** Bright mascot emblem for the current section. */
  mascot: string;
  /** Whether decorative mascot art should render at all. */
  showMascot: boolean;
};

/**
 * useRouteAccent — one hook that gives any widget the current section's accent
 * color and bright mascot emblem. Shared primitives (cards, stat tiles, empty
 * states) use this so every surface in the app is color-coded and branded the
 * same way the navigation is, without feature code importing asset paths.
 */
export function useRouteAccent(): RouteAccent {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { mascotIntensity, navColorMode } = useTheme();
  const mascot = navMascotFor(pathname);
  const accent = resolveNavAccent(navThemeFor(pathname).accent, navColorMode);
  return {
    accent,
    style: { "--accent-color": accent } as CSSProperties,
    mascot: mascot.url,
    showMascot: mascotIntensity === "full",
  };
}

/**
 * AccentMascotEmblem — bright, high-contrast mascot emblem used as a corner
 * accent on cards and widgets. Decorative only.
 */
export function AccentMascotEmblem({
  src,
  size = 64,
  className,
}: {
  src: string;
  size?: number;
  className?: string;
}) {
  return (
    <img
      aria-hidden
      alt=""
      src={src}
      draggable={false}
      loading="lazy"
      style={{ height: size, width: size }}
      className={
        "pointer-events-none absolute select-none object-contain mascot-emblem-glow " +
        (className ?? "-bottom-2 -right-1 opacity-45")
      }
    />
  );
}
