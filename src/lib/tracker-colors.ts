/**
 * Crew member color palette.
 *
 * Two families:
 *  • Solids — dark + light versions of the six primary/secondary hues
 *    (Red, Blue, Yellow, Green, Purple, Orange). 12 total.
 *  • Two-tone emblems — a filled hue with a contrasting border ring, encoded
 *    as `"#fill|#border"`. The `|` separator round-trips cleanly through
 *    the string column in Supabase and through URL params.
 *
 * Rendering helpers (`parseCrewColor`, `crewSwatchStyle`) normalize the two
 * formats so every badge in the app renders consistently.
 */

import type { CSSProperties } from "react";

export type CrewColor = string; // "#RRGGBB" or "#RRGGBB|#RRGGBB"

const HUES = {
  red: { dark: "#b91c1c", light: "#fca5a5" },
  blue: { dark: "#1d4ed8", light: "#93c5fd" },
  yellow: { dark: "#ca8a04", light: "#fde047" },
  green: { dark: "#15803d", light: "#86efac" },
  purple: { dark: "#7e22ce", light: "#d8b4fe" },
  orange: { dark: "#c2410c", light: "#fdba74" },
} as const;

/** 12 solids — light + dark for each of the 6 hues. */
export const SOLID_COLORS: CrewColor[] = [
  HUES.red.dark,
  HUES.red.light,
  HUES.orange.dark,
  HUES.orange.light,
  HUES.yellow.dark,
  HUES.yellow.light,
  HUES.green.dark,
  HUES.green.light,
  HUES.blue.dark,
  HUES.blue.light,
  HUES.purple.dark,
  HUES.purple.light,
];

/** Two-tone emblems — dark fill with a contrasting light border. */
export const TWO_TONE_COLORS: CrewColor[] = [
  `${HUES.blue.dark}|${HUES.red.light}`,
  `${HUES.red.dark}|${HUES.blue.light}`,
  `${HUES.yellow.dark}|${HUES.green.light}`,
  `${HUES.green.dark}|${HUES.yellow.light}`,
  `${HUES.purple.dark}|${HUES.orange.light}`,
  `${HUES.orange.dark}|${HUES.purple.light}`,
  `${HUES.blue.dark}|${HUES.yellow.light}`,
  `${HUES.red.dark}|${HUES.yellow.light}`,
  `${HUES.green.dark}|${HUES.blue.light}`,
  `${HUES.purple.dark}|${HUES.yellow.light}`,
];

/** Full ordered palette used by the crew color picker (22 total). */
export const MEMBER_COLORS: CrewColor[] = [...SOLID_COLORS, ...TWO_TONE_COLORS];

/** Split a stored color string into fill + optional border. */
export function parseCrewColor(color: string | null | undefined): {
  fill: string;
  border: string | null;
} {
  const c = (color ?? "").trim();
  if (!c) return { fill: "#64748b", border: null };
  const [fill, border] = c.split("|");
  return { fill: fill || "#64748b", border: border || null };
}

/**
 * Inline style for a circular crew swatch/badge.
 * Uses an inset ring for the border so the badge stays the same physical size
 * regardless of whether the color is a solid or a two-tone emblem.
 */
export function crewSwatchStyle(color: string | null | undefined, ringPx = 3): CSSProperties {
  const { fill, border } = parseCrewColor(color);
  return border
    ? { background: fill, boxShadow: `inset 0 0 0 ${ringPx}px ${border}` }
    : { background: fill };
}

export function pickMemberColor(index: number): string {
  return MEMBER_COLORS[index % MEMBER_COLORS.length];
}

/** First 1-2 initials from a display name, uppercase. */
export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
