// Centralized chart palette — mirrors --chart-* tokens in src/styles.css.
// Recharts consumes SVG attributes and cannot resolve CSS var() references,
// so we mirror the token values here as the single source of truth for JS.
export const chartColors = {
  primary: "#76D64A",
  secondary: "#24BBFF",
  tertiary: "#F4A63C",
  accent: "#A78BFA",
  neutral: "#64748B",
  grid: "#1E293B",
  axis: "#94A3B8",
  danger: "#EF4444",
  // Extended series colors for compare/rating-studio
  sky: "#38BDF8",
  rose: "#FB7185",
  amber: "#F59E0B",
  cyan: "#22D3EE",
  violet: "#A78BFA",
  pink: "#F472B6",
  emerald: "#34D399",
  blue: "#60A5FA",
  slateMuted: "#94A3B8",
  slateText: "#CBD5E1",
  bgTooltip: "#0F172A",
} as const;

export const chartSeriesPalette = [
  chartColors.cyan,
  chartColors.violet,
  chartColors.amber,
  chartColors.pink,
  chartColors.emerald,
  chartColors.blue,
];
