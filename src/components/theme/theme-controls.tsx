import {
  Palette as PaletteIcon,
  Sun,
  Moon,
  Monitor,
  Check,
  RotateCcw,
  Sparkles,
  Type,
  Rows3,
  Minus,
  Plus,
  Droplets,
  Compass,
  Squircle,
  Image as ImageIcon,
  Smile,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  useTheme,
  ACCENT_PRESETS,
  TEXT_SCALE_MIN,
  TEXT_SCALE_MAX,
  TEXT_SCALE_STEP,
  VIBRANCE_MIN,
  VIBRANCE_MAX,
  VIBRANCE_STEP,
  type Density,
  type Appearance,
  type AccentPalette,
  type GlowIntensity,
  type NavColorMode,
  type RadiusScale,
  type MascotIntensity,
  type BackgroundIntensity,
} from "@/lib/theme-context";

/**
 * Single source of truth for every personalization control. Both the
 * Look & feel settings page and the Personalize side panel render this,
 * so the two surfaces always offer identical options and identical wording.
 * State lives in the shared theme context, so a change on one surface is
 * instantly reflected on the other.
 */

export type ThemeControlVariant = "page" | "panel";

export const APPEARANCE_OPTIONS: { key: Appearance; label: string; icon: typeof Sun }[] = [
  { key: "system", label: "System", icon: Monitor },
  { key: "dark", label: "Dark", icon: Moon },
  { key: "light", label: "Light", icon: Sun },
];

export const DENSITY_OPTIONS: { key: Density; label: string; hint: string }[] = [
  { key: "compact", label: "Compact", hint: "Tighter spacing" },
  { key: "cozy", label: "Comfortable", hint: "Balanced default" },
  { key: "comfortable", label: "Spacious", hint: "Extra breathing room" },
];

export const GLOW_OPTIONS: { key: GlowIntensity; label: string; hint: string }[] = [
  { key: "off", label: "Off", hint: "Flat borders" },
  { key: "soft", label: "Soft", hint: "Gentle halos" },
  { key: "vivid", label: "Vivid", hint: "Bright and lively" },
  { key: "max", label: "Max", hint: "Full neon" },
];

export const NAV_COLOR_OPTIONS: { key: NavColorMode; label: string; hint: string }[] = [
  { key: "section", label: "Section colors", hint: "Each area keeps its own color" },
  { key: "accent", label: "One accent", hint: "Everything follows your accent" },
  { key: "mono", label: "Monochrome", hint: "No color coding" },
];

export const RADIUS_OPTIONS: { key: RadiusScale; label: string; hint: string }[] = [
  { key: "compact", label: "Sharp", hint: "Tight corners" },
  { key: "standard", label: "Standard", hint: "Balanced default" },
  { key: "rounded", label: "Pillowy", hint: "Extra-round cards" },
];

export const MASCOT_OPTIONS: { key: MascotIntensity; label: string; hint: string }[] = [
  { key: "full", label: "Everywhere", hint: "Cards, headers, empty states" },
  { key: "subtle", label: "Subtle", hint: "Dialed-back art" },
  { key: "empty-only", label: "Empty states", hint: "Only when there's nothing to show" },
  { key: "off", label: "Off", hint: "No mascot art" },
];

export const BACKGROUND_OPTIONS: { key: BackgroundIntensity; label: string; hint: string }[] = [
  { key: "full", label: "Vivid", hint: "Aurora and chain art" },
  { key: "subtle", label: "Subtle", hint: "Light branding" },
  { key: "minimal", label: "Minimal", hint: "Barely there" },
  { key: "off", label: "Off", hint: "Plain canvas" },
];

const SECTION_HINTS = {
  appearance: "Match your device or lock in a mode.",
  accent: "Applied to buttons, links, badges, and charts.",
  vibrance: "Push accents, charts, and mascot art brighter or calmer.",
  glow: "How much the borders, titles, and halos light up.",
  nav: "Color-code each section, follow one accent, or go monochrome.",
  mascots: "Where DG Dashboard characters show up.",
  backgrounds: "Branded aurora and chain art behind your pages.",
  radius: "Corner rounding for cards and controls.",
  density: "How much room DG Dashboard gives each card.",
  textScale: "Everything from body copy to badges scales with this.",
} as const;

function OptionGrid<K extends string>({
  options,
  activeKey,
  onSelect,
  cols,
}: {
  options: { key: K; label: string; hint: string }[];
  activeKey: K;
  onSelect: (key: K) => void;
  cols: 2 | 3 | 4;
}) {
  const grid =
    cols === 4 ? "grid-cols-2 sm:grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={"grid gap-2 " + grid}>
      {options.map((o) => {
        const active = activeKey === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            aria-pressed={active}
            className={
              "rounded-lg border-2 px-2.5 py-2 text-left transition " +
              (active ? "border-primary bg-primary/10" : "border-border hover:border-primary/60")
            }
          >
            <div className="text-sm font-semibold">{o.label}</div>
            <div className="text-[11px] text-muted-foreground">{o.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  hint,
  icon: Icon,
  variant,
  children,
}: {
  title: string;
  hint: string;
  icon: typeof Sun;
  variant: ThemeControlVariant;
  children: React.ReactNode;
}) {
  if (variant === "panel") {
    return (
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {title}
        </h3>
        {children}
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Every personalization control, shared by the settings page and side panel. */
export function ThemeControls({ variant = "page" }: { variant?: ThemeControlVariant }) {
  const theme = useTheme();
  const panel = variant === "panel";
  const cols4 = panel ? 2 : 4;
  const scalePct = Math.round(theme.textScale * 100);
  const bumpScale = (delta: number) => theme.setTextScale(theme.textScale + delta);

  return (
    <div className={panel ? "space-y-6" : "space-y-4"}>
      <Section title="Appearance" hint={SECTION_HINTS.appearance} icon={Sun} variant={variant}>
        <div className="grid grid-cols-3 gap-2">
          {APPEARANCE_OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = theme.appearance === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => theme.setAppearance(o.key)}
                className={
                  "flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition " +
                  (active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4" /> {o.label}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Accent color"
        hint={SECTION_HINTS.accent}
        icon={PaletteIcon}
        variant={variant}
      >
        <div className={"grid gap-2 " + (panel ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
          {(Object.keys(ACCENT_PRESETS) as (keyof typeof ACCENT_PRESETS)[]).map((key) => {
            const p = ACCENT_PRESETS[key];
            const active = theme.accentPalette === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => theme.setAccentPalette(key as AccentPalette)}
                className={
                  "flex items-center gap-2.5 rounded-lg border-2 p-2.5 text-left transition " +
                  (active ? "border-primary bg-primary/5" : "border-border hover:border-primary/60")
                }
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                  style={{
                    background: `linear-gradient(135deg, ${p.accent}, ${p.highlight})`,
                    boxShadow: `0 0 18px -2px ${p.accent}`,
                  }}
                >
                  {active ? <Check className="h-4 w-4 text-background" /> : null}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{p.name}</div>
                  {panel ? null : (
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.description}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Color vibrance"
        hint={SECTION_HINTS.vibrance}
        icon={Droplets}
        variant={variant}
      >
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
          <span className="text-xs font-semibold text-muted-foreground">Calm</span>
          <Slider
            className="flex-1"
            value={[theme.vibrance]}
            min={VIBRANCE_MIN}
            max={VIBRANCE_MAX}
            step={VIBRANCE_STEP}
            onValueChange={(v) => theme.setVibrance(v[0] ?? 1)}
            aria-label="Color vibrance"
          />
          <span className="text-xs font-semibold text-muted-foreground">Electric</span>
          <div className="w-11 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(theme.vibrance * 100)}%
          </div>
        </div>
      </Section>

      <Section title="Glow" hint={SECTION_HINTS.glow} icon={Sparkles} variant={variant}>
        <OptionGrid
          cols={cols4}
          options={GLOW_OPTIONS}
          activeKey={theme.glowIntensity}
          onSelect={theme.setGlowIntensity}
        />
      </Section>

      <Section title="Navigation colors" hint={SECTION_HINTS.nav} icon={Compass} variant={variant}>
        <OptionGrid
          cols={3}
          options={NAV_COLOR_OPTIONS}
          activeKey={theme.navColorMode}
          onSelect={theme.setNavColorMode}
        />
      </Section>

      <Section title="Mascots" hint={SECTION_HINTS.mascots} icon={Smile} variant={variant}>
        <OptionGrid
          cols={cols4}
          options={MASCOT_OPTIONS}
          activeKey={theme.mascotIntensity}
          onSelect={theme.setMascotIntensity}
        />
      </Section>

      <Section
        title="Background art"
        hint={SECTION_HINTS.backgrounds}
        icon={ImageIcon}
        variant={variant}
      >
        <OptionGrid
          cols={cols4}
          options={BACKGROUND_OPTIONS}
          activeKey={theme.backgroundIntensity}
          onSelect={theme.setBackgroundIntensity}
        />
      </Section>

      <Section title="Corner style" hint={SECTION_HINTS.radius} icon={Squircle} variant={variant}>
        <OptionGrid
          cols={3}
          options={RADIUS_OPTIONS}
          activeKey={theme.radiusScale}
          onSelect={theme.setRadiusScale}
        />
      </Section>

      <Section title="Density" hint={SECTION_HINTS.density} icon={Rows3} variant={variant}>
        <OptionGrid
          cols={3}
          options={DENSITY_OPTIONS}
          activeKey={theme.density}
          onSelect={theme.setDensity}
        />
      </Section>

      <Section title="Text size" hint={SECTION_HINTS.textScale} icon={Type} variant={variant}>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Smaller text"
            onClick={() => bumpScale(-TEXT_SCALE_STEP)}
            disabled={theme.textScale <= TEXT_SCALE_MIN + 0.001}
            className="h-9 w-9 shrink-0"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <div className="flex-1 px-1">
            <div className="mb-1 flex items-end justify-between text-muted-foreground">
              <span className="text-[11px] leading-none">A</span>
              <span className="rounded-full border border-border/60 bg-card px-2 py-0.5 font-mono text-[11px] tabular-nums">
                {scalePct}%
              </span>
              <span className="text-lg leading-none">A</span>
            </div>
            <Slider
              value={[theme.textScale]}
              min={TEXT_SCALE_MIN}
              max={TEXT_SCALE_MAX}
              step={TEXT_SCALE_STEP}
              onValueChange={(v) => theme.setTextScale(v[0] ?? 1)}
              aria-label="Text size"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Larger text"
            onClick={() => bumpScale(TEXT_SCALE_STEP)}
            disabled={theme.textScale >= TEXT_SCALE_MAX - 0.001}
            className="h-9 w-9 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </Section>
    </div>
  );
}

/** Reset / Save actions, shared so both surfaces behave identically. */
export function ThemeActions({ variant = "page" }: { variant?: ThemeControlVariant }) {
  const theme = useTheme();
  const panel = variant === "panel";

  const reset = () => {
    theme.resetDefault();
    toast.success("Restored DG Dashboard defaults");
  };
  const save = async () => {
    await theme.save();
    toast.success("Look saved — it'll follow you across every device.");
  };

  if (panel) {
    return (
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border/60 bg-background/95 p-3 backdrop-blur">
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
          <RotateCcw className="h-4 w-4" /> Reset
        </Button>
        <Button className="ml-auto" onClick={save} disabled={theme.saving}>
          {theme.saving ? "Saving…" : "Save"}
        </Button>
      </div>
    );
  }

  return (
    <div className="sticky bottom-4 flex justify-end gap-2">
      <Button variant="outline" onClick={reset}>
        <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
      </Button>
      <Button onClick={save} disabled={theme.saving}>
        <Save className="mr-1.5 h-4 w-4" />
        {theme.saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
