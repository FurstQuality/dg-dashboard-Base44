import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  BG_GRADIENTS,
  BG_IMAGES,
  DEFAULT_PRESET_KEY,
  getPreset,
  type BackgroundSetting,
  type Palette,
  type ThemeMode,
} from "./theme-presets";

// ── Types ────────────────────────────────────────────────────────────────

export type Appearance = "system" | "dark" | "light";
export type AccentPalette =
  | "dgd-cyan"
  | "fairway-green"
  | "tournament-gold"
  | "statlink-blue"
  | "coaching-violet"
  | "sunset-orange"
  | "ace-red"
  | "electric-lime"
  | "magenta-pulse"
  | "glacier-mint"
  | "midnight-indigo"
  | "hot-coral"
  | "aurora-teal"
  | "custom";
export type VisualIntensity = "full" | "balanced" | "minimal";
export type SurfaceStyle = "solid" | "soft" | "elevated";
export type Density = "compact" | "cozy" | "comfortable";
export type RadiusScale = "compact" | "standard" | "rounded";
export type TextScaleTier = "small" | "standard" | "large";
export type MotionPreference = "full" | "reduced" | "system";
export type MascotIntensity = "full" | "subtle" | "empty-only" | "off";
export type BackgroundIntensity = "full" | "subtle" | "minimal" | "off";
export type NavigationPreference = "labels" | "compact";
export type GlowIntensity = "off" | "soft" | "vivid" | "max";
export type NavColorMode = "section" | "accent" | "mono";

export const VIBRANCE_MIN = 0.8;
export const VIBRANCE_MAX = 1.6;
export const VIBRANCE_STEP = 0.05;

export type DashboardPreferences = {
  dragEnabled: boolean;
  showControls: boolean;
  preset: string | null;
};

type ThemeState = {
  // Legacy palette state (kept for backwards compat with theme-studio color pickers)
  mode: ThemeMode;
  palette: Palette;
  background: BackgroundSetting;
  preset: string | null;

  // Personalization contract
  appearance: Appearance;
  accentPalette: AccentPalette;
  visualIntensity: VisualIntensity;
  surfaceStyle: SurfaceStyle;
  density: Density;
  radiusScale: RadiusScale;
  textScale: number; // 0.75 – 1.25, 1 = default
  textScaleTier: TextScaleTier;
  motionPreference: MotionPreference;
  reducedMotion: boolean;
  highContrast: boolean;
  mascotIntensity: MascotIntensity;
  backgroundIntensity: BackgroundIntensity;
  navigationPreference: NavigationPreference;
  /** Strength of the glowing borders, halos, and text glow across the app. */
  glowIntensity: GlowIntensity;
  /** Color saturation multiplier applied to accents, charts, and mascot art. */
  vibrance: number;
  /** Whether navigation and card accents follow each section's color, your
   *  chosen accent, or stay monochrome. */
  navColorMode: NavColorMode;
  dashboardPreferences: DashboardPreferences;
};

type ThemeContextValue = ThemeState & {
  setMode: (m: ThemeMode) => void;
  setAppearance: (a: Appearance) => void;
  setAccentPalette: (a: AccentPalette) => void;
  setPalette: (p: Partial<Palette>) => void;
  setBackground: (b: BackgroundSetting) => void;
  applyPreset: (key: string) => void;
  resetDefault: () => void;
  setTextScale: (n: number) => void;
  setTextScaleTier: (t: TextScaleTier) => void;
  setDensity: (d: Density) => void;
  setRadiusScale: (r: RadiusScale) => void;
  setVisualIntensity: (v: VisualIntensity) => void;
  setSurfaceStyle: (s: SurfaceStyle) => void;
  setMotionPreference: (m: MotionPreference) => void;
  setReducedMotion: (v: boolean) => void;
  setHighContrast: (v: boolean) => void;
  setMascotIntensity: (v: MascotIntensity) => void;
  setBackgroundIntensity: (v: BackgroundIntensity) => void;
  setNavigationPreference: (v: NavigationPreference) => void;
  setGlowIntensity: (v: GlowIntensity) => void;
  setVibrance: (v: number) => void;
  setNavColorMode: (v: NavColorMode) => void;
  setDashboardPreferences: (patch: Partial<DashboardPreferences>) => void;
  save: () => Promise<void>;
  saving: boolean;
};

export const TEXT_SCALE_MIN = 0.75;
export const TEXT_SCALE_MAX = 1.25;
export const TEXT_SCALE_STEP = 0.05;
export const TEXT_SCALE_TIERS: Record<TextScaleTier, number> = {
  small: 0.9,
  standard: 1,
  large: 1.15,
};

// Accent presets — every accent-palette selection maps to concrete brand colors.
export const ACCENT_PRESETS: Record<
  Exclude<AccentPalette, "custom">,
  { name: string; accent: string; highlight: string; chart: string; description: string }
> = {
  "dgd-cyan": {
    name: "DG Dashboard Cyan",
    accent: "#24BBFF",
    highlight: "#76D64A",
    chart: "#24BBFF",
    description: "The signature DG Dashboard identity.",
  },
  "fairway-green": {
    name: "Fairway Green",
    accent: "#76D64A",
    highlight: "#2DD4BF",
    chart: "#76D64A",
    description: "Course & community energy.",
  },
  "tournament-gold": {
    name: "Tournament Gold",
    accent: "#F4A63C",
    highlight: "#F59E0B",
    chart: "#F4A63C",
    description: "Competitive, event-day tone.",
  },
  "statlink-blue": {
    name: "DG Statboard Blue",
    accent: "#38BDF8",
    highlight: "#818CF8",
    chart: "#38BDF8",
    description: "Analytics-forward, data-first.",
  },
  "coaching-violet": {
    name: "Coaching Violet",
    accent: "#A78BFA",
    highlight: "#F0ABFC",
    chart: "#A78BFA",
    description: "Ask Ace and coaching surfaces.",
  },
  "sunset-orange": {
    name: "Sunset Orange",
    accent: "#FF8A3D",
    highlight: "#FFD166",
    chart: "#FF8A3D",
    description: "Golden-hour rounds and last-light finishes.",
  },
  "ace-red": {
    name: "Ace Red",
    accent: "#FF4D5E",
    highlight: "#FF9A8B",
    chart: "#FF4D5E",
    description: "High-stakes, chains-rattling energy.",
  },
  "electric-lime": {
    name: "Electric Lime",
    accent: "#B6FF3C",
    highlight: "#4ADE80",
    chart: "#B6FF3C",
    description: "Bright plastic, tournament-bag loud.",
  },
  "magenta-pulse": {
    name: "Magenta Pulse",
    accent: "#F45BE0",
    highlight: "#8B5CF6",
    chart: "#F45BE0",
    description: "Neon night-glow league nights.",
  },
  "glacier-mint": {
    name: "Glacier Mint",
    accent: "#34E5C8",
    highlight: "#7DD3FC",
    chart: "#34E5C8",
    description: "Cool, crisp, early-morning tee times.",
  },
  "midnight-indigo": {
    name: "Midnight Indigo",
    accent: "#7C8CFF",
    highlight: "#C084FC",
    chart: "#7C8CFF",
    description: "Deep focus for stats and film review.",
  },
  "hot-coral": {
    name: "Hot Coral",
    accent: "#FF6B6B",
    highlight: "#FFB86B",
    chart: "#FF6B6B",
    description: "Warm, social, club-night friendly.",
  },
  "aurora-teal": {
    name: "Aurora Teal",
    accent: "#2DD4BF",
    highlight: "#38BDF8",
    chart: "#2DD4BF",
    description: "Balanced teal for long analysis sessions.",
  },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = "cl_theme_v2";

const defaultPreset = getPreset(DEFAULT_PRESET_KEY);
const DEFAULT_STATE: ThemeState = {
  mode: defaultPreset.mode,
  palette: defaultPreset.palette,
  background: defaultPreset.background,
  preset: defaultPreset.key,
  appearance: "dark",
  accentPalette: "dgd-cyan",
  visualIntensity: "balanced",
  surfaceStyle: "soft",
  density: "cozy",
  radiusScale: "standard",
  textScale: 1,
  textScaleTier: "standard",
  motionPreference: "system",
  reducedMotion: false,
  highContrast: false,
  mascotIntensity: "full",
  backgroundIntensity: "subtle",
  navigationPreference: "labels",
  glowIntensity: "vivid",
  vibrance: 1.1,
  navColorMode: "section",
  dashboardPreferences: { dragEnabled: true, showControls: true, preset: null },
};

// ── Color math ────────────────────────────────────────────────────────────

function clamp(n: number, lo = 0, hi = 255): number {
  return Math.max(lo, Math.min(hi, n));
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const s =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(s || "000000", 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => clamp(Math.round(v)).toString(16).padStart(2, "0")).join("");
}
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function readableOn(bg: string): string {
  // Pick whichever of dark/light yields the higher WCAG contrast on `bg`.
  const dark = "#0B0F0D";
  const light = "#F7FBF5";
  return contrastRatio(bg, dark) >= contrastRatio(bg, light) ? dark : light;
}
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Boost (or soften) a hex color's saturation, keeping hue and lightness. */
function saturateHex(hex: string, factor: number): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.max(0, Math.min(1, s * factor)), l);
}

function resolveAppearance(appearance: Appearance): "dark" | "light" {
  if (appearance === "dark" || appearance === "light") return appearance;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function adaptPaletteToMode(palette: Palette, mode: ThemeMode): Palette {
  const [ah, as] = hexToHsl(palette.accent);
  const [bh, bs] = hexToHsl(palette.bg);
  const hueSource = as > 0.15 ? [ah, as] : bs > 0.05 ? [bh, bs] : [ah, 0.35];
  const [h, s] = hueSource;
  if (mode === "dark") {
    return {
      bg: hslToHex(h, Math.min(s, 0.45), 0.09),
      surface: hslToHex(h, Math.min(s, 0.4), 0.16),
      accent: palette.accent,
      highlight: palette.highlight,
    };
  }
  return {
    bg: hslToHex(h, Math.min(s, 0.55), 0.94),
    surface: hslToHex(h, Math.min(s, 0.5), 0.99),
    accent: palette.accent,
    highlight: palette.highlight,
  };
}

/**
 * Public: verify a custom accent has enough contrast against the palette bg.
 * Returns null when safe; returns an explanatory string when not.
 */
export function unsafeAccentReason(accent: string, bg: string): string | null {
  const ratio = contrastRatio(accent, bg);
  if (ratio < 3)
    return `That accent color is hard to read on this background (contrast ${ratio.toFixed(2)}:1). Pick something more vivid.`;
  return null;
}

// ── CSS variable application ─────────────────────────────────────────────

function applyToRoot(state: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolveAppearance(state.appearance);
  const mode: ThemeMode = resolved;
  const vibrance = Math.max(VIBRANCE_MIN, Math.min(VIBRANCE_MAX, state.vibrance || 1));
  const rawPalette = {
    ...state.palette,
    accent: saturateHex(state.palette.accent, vibrance),
    highlight: saturateHex(state.palette.highlight, vibrance),
  };
  const isDark = mode === "dark";
  const palette = adaptPaletteToMode(rawPalette, mode);

  root.classList.toggle("dark", isDark);
  root.classList.toggle("light", !isDark);

  const fg = readableOn(palette.bg);
  // Keep muted text high-contrast enough to meet WCAG AA on card/muted surfaces.
  const muted = mix(fg, palette.bg, 0.22);
  const cardFg = readableOn(palette.surface);
  const accentFg = readableOn(palette.accent);
  const highlightFg = readableOn(palette.highlight);
  const secondary = mix(palette.accent, palette.highlight, 0.5);

  const set = (k: string, v: string) => root.style.setProperty(k, v);

  set("--background", palette.bg);
  set("--foreground", fg);
  set("--card", palette.surface);
  set("--card-foreground", cardFg);
  set("--popover", palette.surface);
  set("--popover-foreground", cardFg);
  set("--primary", palette.accent);
  set("--primary-foreground", accentFg);
  set("--secondary", palette.highlight);
  set("--secondary-foreground", highlightFg);
  set("--muted", mix(palette.surface, palette.bg, 0.4));
  set("--muted-foreground", muted);
  set("--accent", palette.highlight);
  set("--accent-foreground", highlightFg);
  const borderAlpha = state.highContrast ? 0.32 : isDark ? 0.14 : 0.12;
  const inputAlpha = state.highContrast ? 0.36 : isDark ? 0.16 : 0.14;
  set("--border", rgba(fg, borderAlpha));
  set("--input", rgba(fg, inputAlpha));
  set("--border-subtle", rgba(fg, state.highContrast ? 0.22 : isDark ? 0.08 : 0.08));
  set("--border-strong", rgba(fg, state.highContrast ? 0.55 : isDark ? 0.18 : 0.22));
  set("--ring", palette.accent);
  set("--chain", palette.accent);
  set("--chain-foreground", accentFg);

  // Surface layers respect the surface style choice
  const surfaceRaisedMix =
    state.surfaceStyle === "elevated" ? 0.25 : state.surfaceStyle === "soft" ? 0.15 : 0.05;
  const surfaceInteractiveMix =
    state.surfaceStyle === "elevated" ? 0.4 : state.surfaceStyle === "soft" ? 0.25 : 0.1;
  set("--canvas", palette.bg);
  set("--surface", palette.surface);
  set("--surface-raised", mix(palette.surface, fg, surfaceRaisedMix * 0.15));
  set("--surface-interactive", mix(palette.surface, fg, surfaceInteractiveMix * 0.15));

  set("--chart-1", palette.accent);
  set("--chart-2", palette.highlight);
  set("--chart-3", mix(palette.accent, palette.highlight, 0.35));
  set("--chart-4", mix(palette.highlight, palette.bg, 0.35));
  set("--chart-5", mix(palette.accent, "#ffffff", 0.35));
  set("--chart-primary", palette.accent);
  set("--chart-secondary", palette.highlight);
  set("--chart-tertiary", mix(palette.accent, palette.highlight, 0.35));
  set("--chart-grid", rgba(fg, isDark ? 0.08 : 0.1));
  set("--chart-axis", muted);

  set("--sidebar", mix(palette.surface, palette.bg, 0.3));
  set("--sidebar-foreground", fg);
  set("--sidebar-primary", palette.accent);
  set("--sidebar-primary-foreground", accentFg);
  set("--sidebar-accent", palette.surface);
  set("--sidebar-accent-foreground", cardFg);
  set("--sidebar-border", rgba(fg, 0.1));
  set("--sidebar-ring", palette.accent);

  set(
    "--gradient-hero",
    `linear-gradient(135deg, ${palette.accent} 0%, ${secondary} 55%, ${palette.highlight} 100%)`,
  );
  set(
    "--gradient-chain",
    `linear-gradient(135deg, ${palette.accent}, ${mix(palette.accent, palette.bg, 0.55)})`,
  );
  const glowScale =
    state.glowIntensity === "off"
      ? 0
      : state.glowIntensity === "soft"
        ? 0.6
        : state.glowIntensity === "max"
          ? 1.6
          : 1;
  set("--shadow-glow", `0 0 ${Math.round(24 * (glowScale || 0.2))}px 0 ${rgba(palette.accent, 0.35 * glowScale)}`);
  set(
    "--shadow-pop",
    `0 6px 0 0 ${rgba("#000000", isDark ? 0.55 : 0.15)}, 0 12px 32px -10px ${rgba("#000000", isDark ? 0.6 : 0.2)}`,
  );

  // Body background respecting selection
  const body = document.body;
  if (body) {
    const bg = state.background;
    if (bg.kind === "solid" || !bg.value) {
      body.style.backgroundImage = "";
      body.style.backgroundColor = palette.bg;
    } else if (bg.kind === "gradient") {
      body.style.backgroundImage = bg.value;
      body.style.backgroundColor = palette.bg;
      body.style.backgroundAttachment = "fixed";
      body.style.backgroundSize = "cover";
    } else if (bg.kind === "image") {
      body.style.backgroundImage = bg.value;
      body.style.backgroundColor = palette.bg;
      body.style.backgroundAttachment = "fixed";
      body.style.backgroundSize = "auto";
      body.style.backgroundRepeat = "repeat";
    }
  }
}

function applyPersonalization(state: ThemeState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const scale = Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, state.textScale || 1));
  root.style.setProperty("--text-scale", scale.toFixed(3));
  root.style.setProperty("--font-scale", String(scale));

  // Density → CSS scale variable driving spacing utilities
  const densityScale =
    state.density === "compact" ? 0.85 : state.density === "comfortable" ? 1.15 : 1;
  root.style.setProperty("--cl-density-scale", String(densityScale));

  // Radius scale
  const radiusMap = {
    compact: { control: "6px", input: "8px", card: "10px", pill: "9999px", base: "0.5rem" },
    standard: { control: "10px", input: "12px", card: "16px", pill: "9999px", base: "1rem" },
    rounded: { control: "14px", input: "16px", card: "22px", pill: "9999px", base: "1.25rem" },
  } as const;
  const radii = radiusMap[state.radiusScale];
  root.style.setProperty("--radius", radii.base);
  root.style.setProperty("--radius-control", radii.control);
  root.style.setProperty("--radius-input", radii.input);
  root.style.setProperty("--radius-card", radii.card);
  root.style.setProperty("--radius-pill", radii.pill);

  root.dataset.appearance = resolveAppearance(state.appearance);
  root.dataset.appearancePref = state.appearance;
  root.dataset.accentPalette = state.accentPalette;
  root.dataset.visualIntensity = state.visualIntensity;
  root.dataset.surfaceStyle = state.surfaceStyle;
  root.dataset.density = state.density;
  root.dataset.radiusScale = state.radiusScale;
  root.dataset.textScale = state.textScaleTier;
  root.dataset.reducedMotion = state.reducedMotion ? "true" : "false";
  root.dataset.motionPreference = state.motionPreference;
  root.dataset.highContrast = state.highContrast ? "true" : "false";
  root.dataset.mascots = state.mascotIntensity;
  root.dataset.backgrounds = state.backgroundIntensity;
  root.dataset.navigation = state.navigationPreference;
  root.dataset.glow = state.glowIntensity;
  root.dataset.navColor = state.navColorMode;

  const vibrance = Math.max(VIBRANCE_MIN, Math.min(VIBRANCE_MAX, state.vibrance || 1));
  root.style.setProperty("--cl-vibrance", String(vibrance));

  const bgOpacity =
    state.backgroundIntensity === "off"
      ? 0
      : state.backgroundIntensity === "minimal"
        ? 0.03
        : state.backgroundIntensity === "full"
          ? 0.12
          : 0.06;
  const intensityMultiplier =
    state.visualIntensity === "minimal" ? 0.4 : state.visualIntensity === "full" ? 1.15 : 1;
  root.style.setProperty("--cl-backdrop-opacity", String(bgOpacity * intensityMultiplier));
  root.style.setProperty(
    "--cl-mascot-opacity",
    state.mascotIntensity === "off"
      ? "0"
      : state.mascotIntensity === "subtle"
        ? "0.55"
        : state.mascotIntensity === "empty-only"
          ? "1"
          : "1",
  );
}

// ── Persistence ──────────────────────────────────────────────────────────

/** When this device last changed a look & feel setting. */
const LOCAL_STAMP_KEY = `${STORAGE_KEY}:updated-at`;

function readLocalStamp(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(LOCAL_STAMP_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function writeLocal(state: ThemeState, stamp: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.setItem(LOCAL_STAMP_KEY, String(stamp));
  } catch {
    /* noop */
  }
}

/** Older saved prefs used the pre-rebrand palette id. */
function normalizeAccentPalette(value: unknown): AccentPalette | undefined {
  if (value === "chainlink-cyan") return "dgd-cyan";
  return typeof value === "string" ? (value as AccentPalette) : undefined;
}

function readInitial(): ThemeState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem("cl_theme_v1");
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ThemeState>;
    return {
      ...DEFAULT_STATE,
      ...parsed,
      palette: { ...DEFAULT_STATE.palette, ...(parsed.palette ?? {}) },
      dashboardPreferences: {
        ...DEFAULT_STATE.dashboardPreferences,
        ...(parsed.dashboardPreferences ?? {}),
      },
      accentPalette:
        normalizeAccentPalette(parsed.accentPalette) ?? DEFAULT_STATE.accentPalette,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function applyAccentPreset(state: ThemeState, accentPalette: AccentPalette): ThemeState {
  if (accentPalette === "custom") return { ...state, accentPalette };
  const preset = ACCENT_PRESETS[accentPalette];
  if (!preset) return state;
  return {
    ...state,
    accentPalette,
    palette: {
      ...state.palette,
      accent: preset.accent,
      highlight: preset.highlight,
    },
    preset: null,
  };
}

// ── Provider ─────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const initial = readInitial();
    setState(initial);
    applyToRoot(initial);
    applyPersonalization(initial);
    setHydrated(true);

    (async () => {
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      const { data } = await supabase
        .from("user_theme_prefs")
        .select("mode, palette, background, preset, prefs, updated_at")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data) {
        // Only let the saved copy win when it is newer than what this device
        // last changed. Otherwise a slow round-trip silently reverts the choice
        // the user just made (looks like the control "does nothing").
        const remoteStamp = data.updated_at ? Date.parse(data.updated_at as string) : 0;
        if (remoteStamp && remoteStamp <= readLocalStamp()) return;
        const cloudPrefs = (data.prefs ?? {}) as Partial<ThemeState>;
        const remote: ThemeState = {
          ...initial,
          ...cloudPrefs,
          mode: (data.mode as ThemeMode) ?? initial.mode,
          palette: {
            ...initial.palette,
            ...(data.palette as Partial<Palette>),
            ...(cloudPrefs.palette ?? {}),
          },
          background: (data.background as BackgroundSetting) ?? initial.background,
          preset: data.preset ?? cloudPrefs.preset ?? null,
          dashboardPreferences: {
            ...initial.dashboardPreferences,
            ...(cloudPrefs.dashboardPreferences ?? {}),
          },
          accentPalette:
            normalizeAccentPalette(cloudPrefs.accentPalette) ?? initial.accentPalette,
        };
        setState(remote);
        applyToRoot(remote);
        applyPersonalization(remote);
        writeLocal(remote, remoteStamp || Date.now());
      }
    })().catch(() => {
      // Aborted on navigation — locally stored theme is already applied.
    });

    // Respond to system appearance changes when appearance === "system"
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const listener = () => {
      setState((s) => {
        if (s.appearance !== "system") return s;
        applyToRoot(s);
        return s;
      });
    };
    media?.addEventListener?.("change", listener);
    return () => media?.removeEventListener?.("change", listener);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applyToRoot(state);
    applyPersonalization(state);
    writeLocal(state, Date.now());
  }, [state, hydrated]);

  // Auto-save to the account so choices follow the user across devices. Saved
  // quickly (and flushed when the tab hides) so navigating right after a change
  // still stores it.
  useEffect(() => {
    if (!hydrated) return;
    let done = false;
    const save = async () => {
      if (done) return;
      done = true;
      const { data: session } = await supabase.auth.getUser();
      if (!session.user) return;
      await supabase.from("user_theme_prefs").upsert({
        user_id: session.user.id,
        mode: state.mode,
        palette: state.palette as unknown as never,
        background: state.background as unknown as never,
        preset: state.preset,
        prefs: state as unknown as never,
        updated_at: new Date().toISOString(),
      });
    };
    const t = window.setTimeout(() => void save(), 300);
    const flush = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", () => void save());
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", flush);
    };
  }, [state, hydrated]);

  const setMode = useCallback((mode: ThemeMode) => {
    setState((s) => ({ ...s, mode, appearance: mode, preset: null }));
  }, []);
  const setAppearance = useCallback((appearance: Appearance) => {
    setState((s) => ({ ...s, appearance, mode: resolveAppearance(appearance) }));
  }, []);
  const setAccentPalette = useCallback((a: AccentPalette) => {
    setState((s) => applyAccentPreset(s, a));
  }, []);
  const setPalette = useCallback((patch: Partial<Palette>) => {
    setState((s) => ({
      ...s,
      palette: { ...s.palette, ...patch },
      accentPalette: "custom",
      preset: null,
    }));
  }, []);
  const setBackground = useCallback((background: BackgroundSetting) => {
    setState((s) => ({ ...s, background, preset: null }));
  }, []);
  const applyPreset = useCallback((key: string) => {
    const p = getPreset(key);
    setState((s) => ({
      ...s,
      mode: p.mode,
      appearance: p.mode as Appearance,
      palette: p.palette,
      background: p.background,
      preset: p.key,
      accentPalette: "custom",
    }));
  }, []);
  const resetDefault = useCallback(() => {
    setState(() => ({ ...DEFAULT_STATE }));
  }, []);
  const setTextScale = useCallback((n: number) => {
    const v = Math.max(
      TEXT_SCALE_MIN,
      Math.min(TEXT_SCALE_MAX, Math.round(n / TEXT_SCALE_STEP) * TEXT_SCALE_STEP),
    );
    setState((s) => ({
      ...s,
      textScale: v,
      textScaleTier: v <= 0.95 ? "small" : v >= 1.1 ? "large" : "standard",
    }));
  }, []);
  const setTextScaleTier = useCallback((tier: TextScaleTier) => {
    setState((s) => ({ ...s, textScaleTier: tier, textScale: TEXT_SCALE_TIERS[tier] }));
  }, []);
  const setDensity = useCallback((density: Density) => setState((s) => ({ ...s, density })), []);
  const setRadiusScale = useCallback(
    (radiusScale: RadiusScale) => setState((s) => ({ ...s, radiusScale })),
    [],
  );
  const setVisualIntensity = useCallback(
    (visualIntensity: VisualIntensity) => setState((s) => ({ ...s, visualIntensity })),
    [],
  );
  const setSurfaceStyle = useCallback(
    (surfaceStyle: SurfaceStyle) => setState((s) => ({ ...s, surfaceStyle })),
    [],
  );
  const setMotionPreference = useCallback((motionPreference: MotionPreference) => {
    setState((s) => {
      const reduced =
        motionPreference === "reduced" ||
        (motionPreference === "system" &&
          typeof window !== "undefined" &&
          window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
      return { ...s, motionPreference, reducedMotion: reduced };
    });
  }, []);
  const setReducedMotion = useCallback(
    (v: boolean) =>
      setState((s) => ({ ...s, reducedMotion: v, motionPreference: v ? "reduced" : "full" })),
    [],
  );
  const setHighContrast = useCallback(
    (v: boolean) => setState((s) => ({ ...s, highContrast: v })),
    [],
  );
  const setMascotIntensity = useCallback(
    (v: MascotIntensity) => setState((s) => ({ ...s, mascotIntensity: v })),
    [],
  );
  const setBackgroundIntensity = useCallback(
    (v: BackgroundIntensity) => setState((s) => ({ ...s, backgroundIntensity: v })),
    [],
  );
  const setNavigationPreference = useCallback(
    (v: NavigationPreference) => setState((s) => ({ ...s, navigationPreference: v })),
    [],
  );
  const setGlowIntensity = useCallback(
    (glowIntensity: GlowIntensity) => setState((s) => ({ ...s, glowIntensity })),
    [],
  );
  const setVibrance = useCallback((n: number) => {
    const v = Math.max(
      VIBRANCE_MIN,
      Math.min(VIBRANCE_MAX, Math.round(n / VIBRANCE_STEP) * VIBRANCE_STEP),
    );
    setState((s) => ({ ...s, vibrance: v }));
  }, []);
  const setNavColorMode = useCallback(
    (navColorMode: NavColorMode) => setState((s) => ({ ...s, navColorMode })),
    [],
  );
  const setDashboardPreferences = useCallback((patch: Partial<DashboardPreferences>) => {
    setState((s) => ({ ...s, dashboardPreferences: { ...s.dashboardPreferences, ...patch } }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      if (session.user) {
        await supabase.from("user_theme_prefs").upsert({
          user_id: session.user.id,
          mode: state.mode,
          palette: state.palette as unknown as never,
          background: state.background as unknown as never,
          preset: state.preset,
          prefs: state as unknown as never,
        });
      }
    } finally {
      setSaving(false);
    }
  }, [state]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...state,
      setMode,
      setAppearance,
      setAccentPalette,
      setPalette,
      setBackground,
      applyPreset,
      resetDefault,
      setTextScale,
      setTextScaleTier,
      setDensity,
      setRadiusScale,
      setVisualIntensity,
      setSurfaceStyle,
      setMotionPreference,
      setReducedMotion,
      setHighContrast,
      setMascotIntensity,
      setBackgroundIntensity,
      setNavigationPreference,
      setGlowIntensity,
      setVibrance,
      setNavColorMode,
      setDashboardPreferences,
      save,
      saving,
    }),
    [
      state,
      setMode,
      setAppearance,
      setAccentPalette,
      setPalette,
      setBackground,
      applyPreset,
      resetDefault,
      setTextScale,
      setTextScaleTier,
      setDensity,
      setRadiusScale,
      setVisualIntensity,
      setSurfaceStyle,
      setMotionPreference,
      setReducedMotion,
      setHighContrast,
      setMascotIntensity,
      setBackgroundIntensity,
      setNavigationPreference,
      setGlowIntensity,
      setVibrance,
      setNavColorMode,
      setDashboardPreferences,
      save,
      saving,
    ],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export { BG_GRADIENTS, BG_IMAGES };
