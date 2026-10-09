import { cn } from "@/lib/utils";

/**
 * Branded section-level background patterns. Every pattern:
 *   - Is a small tiling SVG rendered inline.
 *   - Uses `currentColor`, so it inherits from `text-primary/40` and
 *     adapts to the active palette in every theme mode.
 *   - Is decorative (aria-hidden) and never contains text.
 *   - Preserves contrast — final opacity is capped by the layer wrapper
 *     in `PageShell` and stepped down by the `data-backgrounds` attribute
 *     on <html> (full / subtle / minimal / off).
 *   - Reduced-motion friendly (no animation).
 */

export type BrandedSection =
  | "feed"
  | "play"
  | "practice"
  | "community"
  | "statlink"
  | "courses"
  | "tournaments"
  | "messages"
  | "profile"
  | "achievements";

type Props = {
  section: BrandedSection;
  className?: string;
};

const PATTERNS: Record<BrandedSection, { id: string; tile: number; svg: React.ReactNode }> = {
  // Feed: interlocking chain-links, small tile
  feed: {
    id: "cl-pat-feed",
    tile: 56,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1.2">
        <ellipse cx="14" cy="14" rx="8" ry="4" />
        <ellipse cx="42" cy="14" rx="4" ry="8" />
        <ellipse cx="14" cy="42" rx="4" ry="8" />
        <ellipse cx="42" cy="42" rx="8" ry="4" />
      </g>
    ),
  },
  // Play: fairway lines + tee markers
  play: {
    id: "cl-pat-play",
    tile: 64,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M0 40 Q 32 20, 64 40" />
        <path d="M0 52 Q 32 32, 64 52" />
        <circle cx="8" cy="24" r="1.4" fill="currentColor" />
        <circle cx="56" cy="24" r="1.4" fill="currentColor" />
      </g>
    ),
  },
  // Practice: concentric target rings + throw path
  practice: {
    id: "cl-pat-practice",
    tile: 72,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <circle cx="36" cy="36" r="6" />
        <circle cx="36" cy="36" r="14" />
        <circle cx="36" cy="36" r="22" />
        <path d="M4 66 Q 20 50, 36 36" strokeDasharray="2 3" />
      </g>
    ),
  },
  // Community: connected nodes
  community: {
    id: "cl-pat-community",
    tile: 60,
    svg: (
      <g stroke="currentColor" strokeWidth="1" fill="currentColor">
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="48" cy="12" r="1.8" />
        <circle cx="30" cy="30" r="2.2" />
        <circle cx="12" cy="48" r="1.8" />
        <circle cx="48" cy="48" r="1.8" />
        <g fill="none">
          <path d="M12 12 L30 30 L48 12" />
          <path d="M12 48 L30 30 L48 48" />
        </g>
      </g>
    ),
  },
  // StatLink: analytical grid + rating tick
  statlink: {
    id: "cl-pat-statlink",
    tile: 48,
    svg: (
      <g stroke="currentColor" strokeWidth="0.8" fill="none">
        <path d="M0 12 H48 M0 24 H48 M0 36 H48" />
        <path d="M12 0 V48 M24 0 V48 M36 0 V48" />
        <path d="M6 30 L18 22 L30 26 L42 14" strokeWidth="1.3" />
      </g>
    ),
  },
  // Courses: contour map lines
  courses: {
    id: "cl-pat-courses",
    tile: 80,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M-4 20 Q 20 4, 44 20 T 84 20" />
        <path d="M-4 40 Q 20 24, 44 40 T 84 40" />
        <path d="M-4 60 Q 20 44, 44 60 T 84 60" />
      </g>
    ),
  },
  // Tournaments: bracket + trophy dot
  tournaments: {
    id: "cl-pat-tournaments",
    tile: 64,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M6 12 H22 V32 H42 V52 H58" />
        <path d="M6 52 H22 V32" />
        <circle cx="58" cy="52" r="1.6" fill="currentColor" />
      </g>
    ),
  },
  // Messages: speech + chain-link
  messages: {
    id: "cl-pat-messages",
    tile: 60,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M6 10 h30 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-18 l-8 6 v-6 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z" />
        <ellipse cx="46" cy="46" rx="6" ry="3" />
        <ellipse cx="54" cy="46" rx="3" ry="6" />
      </g>
    ),
  },
  // Profile: laurel arc
  profile: {
    id: "cl-pat-profile",
    tile: 64,
    svg: (
      <g fill="none" stroke="currentColor" strokeWidth="1">
        <path d="M16 40 Q 32 8, 48 40" />
        <path d="M20 40 Q 32 16, 44 40" />
      </g>
    ),
  },
  // Achievements: subtle starburst dots
  achievements: {
    id: "cl-pat-achievements",
    tile: 56,
    svg: (
      <g fill="currentColor">
        <circle cx="14" cy="14" r="1.6" />
        <circle cx="42" cy="14" r="1.2" />
        <circle cx="28" cy="28" r="2" />
        <circle cx="14" cy="42" r="1.2" />
        <circle cx="42" cy="42" r="1.6" />
      </g>
    ),
  },
};

/**
 * SectionPattern — one branded background per major section.
 * Rendered as a full-bleed absolutely-positioned layer by `PageShell`.
 * Consumers rarely mount this directly; pass `section` to `PageShell` instead.
 */
export function SectionPattern({ section, className }: Props) {
  const p = PATTERNS[section];
  return (
    <svg
      aria-hidden
      role="presentation"
      className={cn("h-full w-full text-primary [--cl-pat-color:currentColor]", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id={p.id} width={p.tile} height={p.tile} patternUnits="userSpaceOnUse">
          {p.svg}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${p.id})`} />
    </svg>
  );
}
