export type ThemeMode = "dark" | "light";

export type Palette = {
  bg: string; // background
  surface: string; // cards / panels
  accent: string; // primary CTA, headings pop
  highlight: string; // best-stat glow, deltas, chart secondary
};

export type BackgroundKind = "solid" | "gradient" | "image";
export type BackgroundSetting = { kind: BackgroundKind; value: string };

export type ThemePreset = {
  key: string;
  name: string;
  mode: ThemeMode;
  palette: Palette;
  background: BackgroundSetting;
  tagline: string;
};

// 8 curated themes. Each is complete: mode + palette + background.
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: "chain-reaction",
    name: "Chain Reaction",
    mode: "dark",
    tagline: "Chain-lime + electric magenta",
    palette: { bg: "#0A1628", surface: "#111f38", accent: "#00E5C7", highlight: "#FF2D87" },
    background: {
      kind: "gradient",
      value: "radial-gradient(1200px 600px at 15% 10%, #12314f 0%, #0A1628 60%)",
    },
  },
  {
    key: "ace-neon",
    name: "Ace Neon",
    mode: "dark",
    tagline: "Cyber cyan on midnight",
    palette: { bg: "#0D0A1F", surface: "#171238", accent: "#00F0FF", highlight: "#B026FF" },
    background: {
      kind: "gradient",
      value: "linear-gradient(160deg, #0D0A1F 0%, #1a0f3a 55%, #240a3d 100%)",
    },
  },
  {
    key: "podium-gold",
    name: "Podium Gold",
    mode: "dark",
    tagline: "Trophy warmth",
    palette: { bg: "#1A1410", surface: "#231a13", accent: "#FFC94A", highlight: "#00D97E" },
    background: {
      kind: "gradient",
      value: "radial-gradient(900px 500px at 80% 0%, #3a2a12 0%, #1A1410 60%)",
    },
  },
  {
    key: "fairway-sunrise",
    name: "Fairway Sunrise",
    mode: "dark",
    tagline: "Sunrise on the tee pad",
    palette: { bg: "#141414", surface: "#1e1a17", accent: "#FF6B35", highlight: "#C4F000" },
    background: {
      kind: "gradient",
      value: "linear-gradient(140deg, #141414 0%, #2a1a12 60%, #3a1f10 100%)",
    },
  },
  {
    key: "midnight-chains",
    name: "Midnight Chains",
    mode: "dark",
    tagline: "The default, refined",
    palette: { bg: "#0E1E1A", surface: "#1F2124", accent: "#76D64A", highlight: "#24BBFF" },
    background: { kind: "solid", value: "" },
  },
  {
    key: "paper-course",
    name: "Paper Course",
    mode: "light",
    tagline: "Bright, clear, daytime",
    palette: { bg: "#F7F5EF", surface: "#FFFFFF", accent: "#2F6B3A", highlight: "#F4A63C" },
    background: { kind: "solid", value: "" },
  },
  {
    key: "sunset-tour",
    name: "Sunset Tour",
    mode: "dark",
    tagline: "Coral, magenta, violet",
    palette: { bg: "#1a0d1a", surface: "#26142a", accent: "#FF3D8B", highlight: "#FFC94A" },
    background: {
      kind: "gradient",
      value: "linear-gradient(160deg, #1a0d1a 0%, #2a0f26 55%, #3a1234 100%)",
    },
  },
  {
    key: "emerald-prestige",
    name: "Emerald Prestige",
    mode: "dark",
    tagline: "Emerald + gold",
    palette: { bg: "#052e2b", surface: "#0b3d38", accent: "#26D989", highlight: "#F0D78C" },
    background: {
      kind: "gradient",
      value: "radial-gradient(1000px 500px at 20% 0%, #0d4a44 0%, #052e2b 60%)",
    },
  },
];

// Preset gradient backgrounds (available on any palette).
export const BG_GRADIENTS: { key: string; name: string; value: string }[] = [
  {
    key: "aurora",
    name: "Aurora",
    value: "linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)",
  },
  {
    key: "chain-glow",
    name: "Chain Glow",
    value: "radial-gradient(900px 500px at 20% 10%, #1a3b2e 0%, #0d1f18 60%)",
  },
  {
    key: "sunset",
    name: "Sunset",
    value: "linear-gradient(140deg, #2d0b45 0%, #6b1e5f 55%, #a83a4e 100%)",
  },
  {
    key: "ocean",
    name: "Ocean Deep",
    value: "linear-gradient(160deg, #0c2340 0%, #1a4a6e 60%, #2d8a9e 100%)",
  },
  {
    key: "ember",
    name: "Ember",
    value: "radial-gradient(900px 500px at 80% 90%, #4a1a10 0%, #1a0a08 60%)",
  },
  {
    key: "mint",
    name: "Neon Mint",
    value: "linear-gradient(135deg, #0d1b2a 0%, #1b4332 60%, #2dd4a8 130%)",
  },
];

// Themed image backgrounds — SVG-encoded so they always ship.
export const BG_IMAGES: { key: string; name: string; value: string }[] = [
  {
    key: "chainlink",
    name: "DG Dashboard Weave",
    value: `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><g fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='2'><circle cx='30' cy='30' r='18'/><circle cx='90' cy='30' r='18'/><circle cx='30' cy='90' r='18'/><circle cx='90' cy='90' r='18'/><circle cx='60' cy='60' r='18'/></g></svg>`,
    )}")`,
  },
  {
    key: "disc-arcs",
    name: "Disc Arcs",
    value: `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><g fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='1.5'><path d='M0 100 Q100 0 200 100'/><path d='M0 140 Q100 40 200 140'/><path d='M0 60 Q100 -40 200 60'/></g></svg>`,
    )}")`,
  },
  {
    key: "topo",
    name: "Course Topo",
    value: `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><g fill='none' stroke='rgba(255,255,255,0.05)' stroke-width='1'><path d='M0 30 Q60 60 120 30 T240 30'/><path d='M0 70 Q60 100 120 70 T240 70'/><path d='M0 110 Q60 140 120 110 T240 110'/><path d='M0 150 Q60 180 120 150 T240 150'/><path d='M0 190 Q60 220 120 190 T240 190'/></g></svg>`,
    )}")`,
  },
  {
    key: "fairway",
    name: "Fairway Grid",
    value: `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='60'><g fill='none' stroke='rgba(255,255,255,0.04)'><path d='M0 0h60M0 15h60M0 30h60M0 45h60M0 60h60'/></g></svg>`,
    )}")`,
  },
];

export const DEFAULT_PRESET_KEY = "midnight-chains";

export function getPreset(key: string | null | undefined): ThemePreset {
  return (
    THEME_PRESETS.find((p) => p.key === key) ??
    THEME_PRESETS.find((p) => p.key === DEFAULT_PRESET_KEY)!
  );
}
