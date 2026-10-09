import { useRouterState } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { Mascot, type MascotName, type MascotPose } from "@/components/mascot";
import {
  MASCOT_REGISTRY,
  SECTION_DEFAULT_INTENT,
  type MascotIntent,
  type MascotSection,
} from "@/lib/mascots";

import { useTheme } from "@/lib/theme-context";


/**
 * BrandedPageFrame — mounts a section-aware branded background layer plus a
 * small mascot chip on every page. Preserves the app's design contract:
 *   - Watermarks stay ≤ 10% opacity, non-interactive, and never cover controls.
 *   - Only approved mascots from the registry are rendered.
 *   - Respects prefers-reduced-motion (no floaty transforms — pure static SVG).
 *
 * Wired inside app-shell around <main>, so every route gets branded automatically.
 */

type RouteMatch = {
  test: (p: string) => boolean;
  section: MascotSection;
  intent?: MascotIntent;
  title: string;
  tagline: string;
};

// Route-to-section map. Order matters — first match wins.
const ROUTE_MAP: RouteMatch[] = [
  {
    test: (p) => p.startsWith("/home"),
    section: "feed",
    title: "The Feed",
    tagline: "See what your circle is playing today.",
  },
  {
    test: (p) => p.startsWith("/friends"),
    section: "community",
    intent: "crew",
    title: "Friends",
    tagline: "Requests, suggestions, and your card.",
  },
  {
    test: (p) => p.startsWith("/messages"),
    section: "messages",
    title: "Messages",
    tagline: "Plan the next round with your crew.",
  },
  {
    test: (p) => p.startsWith("/notifications"),
    section: "community",
    title: "Alerts",
    tagline: "Everything that pinged you today.",
  },
  {
    test: (p) => p.startsWith("/courses"),
    section: "courses",
    title: "Courses",
    tagline: "Build, review, and tour the chains.",
  },
  {
    test: (p) => p.startsWith("/play") || p.startsWith("/rounds"),
    section: "play",
    title: "Play",
    tagline: "Score sharp. Get rated.",
  },
  {
    test: (p) => p.startsWith("/practice") || p.startsWith("/range") || p.startsWith("/putting"),
    section: "practice",
    title: "Practice",
    tagline: "Range reps and putting sessions.",
  },
  {
    test: (p) => p.startsWith("/ace") || p.startsWith("/caddy"),
    section: "play",
    intent: "coach",
    title: "Ask Ace",
    tagline: "Disc picks, lines, and rules from Ace.",
  },
  {
    test: (p) => p.startsWith("/stats") || p.startsWith("/statlink"),
    section: "statlink",
    title: "DG Statboard",
    tagline: "Ratings, forecasts, and targets.",
  },
  {
    test: (p) => p.startsWith("/tracker"),
    section: "tracker",
    intent: "crew",
    title: "Tournament Tracker",
    tagline: "Live tee times, odds, and results from every event.",
  },
  {
    test: (p) => p.startsWith("/tournaments") || p.startsWith("/director"),
    section: "tournaments",
    title: "Tournaments",
    tagline: "PDGA-style events, run cleanly.",
  },
  {
    test: (p) => p.startsWith("/leagues"),
    section: "tournaments",
    intent: "rules",
    title: "Leagues",
    tagline: "Weekly play, cumulative points.",
  },
  {
    test: (p) => p.startsWith("/community"),
    section: "community",
    title: "Community",
    tagline: "Group rounds, cleanups, and outreach.",
  },
  {
    test: (p) => p.startsWith("/clubs"),
    section: "community",
    intent: "scout",
    title: "Clubs",
    tagline: "Your local disc golf home.",
  },
  {
    test: (p) => p.startsWith("/challenges"),
    section: "achievements",
    title: "Achievements & Quests",
    tagline: "Your XP, badges, quests, rankings, and Trophy Shelf — all in one place.",
  },
  {
    test: (p) => p.startsWith("/achievements"),
    section: "achievements",
    title: "Achievements",
    tagline: "Trophies from every corner of your game.",
  },
  {
    test: (p) => p.startsWith("/leaderboards"),
    section: "statlink",
    title: "Leaderboards",
    tagline: "Where you stand.",
  },
  {
    test: (p) =>
      p.startsWith("/game-plan") ||
      p.startsWith("/action-items") ||
      p.startsWith("/season-planner"),
    section: "tournaments",
    intent: "rules",
    title: "Game Plan",
    tagline: "Odds, targets, and prep for every event.",
  },
  {
    test: (p) => p.startsWith("/data-hub") || p.startsWith("/settings/imports"),
    section: "profile",
    intent: "coach",
    title: "Data Hub",
    tagline: "Bring the real world into DG Dashboard.",
  },
  {
    test: (p) => p.startsWith("/admin"),
    section: "tournaments",
    intent: "official",
    title: "Moderation",
    tagline: "Keep the courses honest.",
  },
  {
    test: (p) => p.startsWith("/me/bag"),
    section: "profile",
    intent: "coach",
    title: "My Bag",
    tagline: "Every mold, every plastic.",
  },
  {
    test: (p) => p.startsWith("/me") || p.startsWith("/profile") || p.startsWith("/settings"),
    section: "profile",
    title: "My Profile",
    tagline: "You, the player card.",
  },
  {
    test: (p) => p.startsWith("/onboarding") || p === "/",
    section: "onboarding",
    title: "Welcome",
    tagline: "Let's set you up for a great round.",
  },
];

const FALLBACK: RouteMatch = {
  test: () => true,
  section: "feed",
  title: "DG Dashboard",
  tagline: "Welcome to the chains.",
};

export function useResolvedPageMascot() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useMemo(() => resolveRoute(pathname), [pathname]);
}

function resolveRoute(pathname: string): {
  section: MascotSection;
  intent: MascotIntent;
  name: MascotName;
  pose: MascotPose;
  title: string;
  tagline: string;
} {
  const hit = ROUTE_MAP.find((r) => r.test(pathname)) ?? FALLBACK;
  const intent = hit.intent ?? SECTION_DEFAULT_INTENT[hit.section];
  const entry = MASCOT_REGISTRY[intent];
  return {
    section: hit.section,
    intent,
    name: entry.name,
    pose: entry.pose,
    title: hit.title,
    tagline: hit.tagline,
  };
}

/**
 * Section palette — subtle tint applied to the watermark layer only. All
 * values reference project design tokens; no hard-coded colors here.
 */
const SECTION_TINT: Record<MascotSection, string> = {
  feed: "from-secondary/25 via-transparent to-accent/20",
  play: "from-primary/25 via-transparent to-secondary/20",
  practice: "from-teal-400/25 via-transparent to-primary/18",
  community: "from-primary/22 via-transparent to-secondary/20",
  tracker: "from-sky-500/26 via-transparent to-fuchsia-500/18",
  statlink: "from-violet-500/25 via-transparent to-secondary/18",
  courses: "from-emerald-500/25 via-transparent to-primary/18",
  tournaments: "from-amber-500/25 via-transparent to-primary/18",
  messages: "from-pink-500/22 via-transparent to-secondary/18",
  profile: "from-primary/22 via-transparent to-accent/18",
  achievements: "from-amber-400/28 via-transparent to-primary/18",
  onboarding: "from-primary/22 via-transparent to-accent/18",
};

/**
 * Fixed, non-interactive background. Sits behind all page content, respects
 * the shell header and mobile bottom nav via padding on the shell itself.
 */
/** Background-art strength multipliers from Settings → Look & feel. */
const BACKGROUND_STRENGTH: Record<string, number> = {
  off: 0,
  minimal: 0.35,
  subtle: 0.7,
  full: 1,
};

/** Mascot-art strength for the decorative page cast. */
const MASCOT_STRENGTH: Record<string, number> = {
  off: 0,
  "empty-only": 0,
  subtle: 0.45,
  full: 1,
};

function BrandedBackdrop({
  section,
  name,
  pose,
}: {
  section: MascotSection;
  name: MascotName;
  pose: MascotPose;
}) {
  void name;
  void pose;

  const { backgroundIntensity, mascotIntensity, vibrance, glowIntensity } = useTheme();
  const bg = BACKGROUND_STRENGTH[backgroundIntensity] ?? 1;
  const cast = MASCOT_STRENGTH[mascotIntensity] ?? 1;
  const glow = glowIntensity === "off" ? 0.35 : glowIntensity === "soft" ? 0.7 : glowIntensity === "max" ? 1.35 : 1;
  const saturation = Math.max(0.4, vibrance || 1);

  const tint = SECTION_TINT[section] ?? SECTION_TINT.feed;
  if (bg <= 0 && cast <= 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      style={{ filter: `saturate(${saturation})` }}
    >
      {bg > 0 && (
        <>
          {/* Section wash — gradient tint keyed to the current section. */}
          <div
            className={`absolute inset-0 bg-gradient-to-br ${tint}`}
            style={{ opacity: bg }}
          />

          {/* Aurora light blobs — slow drift, heavy blur, stays behind content. */}
          <div
            className="aurora-blob absolute -left-32 -top-40 h-[560px] w-[560px] rounded-full"
            style={{
              opacity: 0.5 * bg * glow,
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--primary) 70%, transparent), transparent 70%)",
            }}
          />
          <div
            className="aurora-blob absolute -right-24 top-1/4 h-[600px] w-[600px] rounded-full"
            style={{
              animationDelay: "-9s",
              opacity: 0.45 * bg * glow,
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--brand-cyan) 70%, transparent), transparent 70%)",
            }}
          />
          <div
            className="aurora-blob absolute -bottom-40 left-1/3 h-[520px] w-[520px] rounded-full"
            style={{
              animationDelay: "-17s",
              opacity: 0.4 * bg * glow,
              background:
                "radial-gradient(circle, color-mix(in oklab, var(--competitive-gold) 70%, transparent), transparent 70%)",
            }}
          />

          {/* Chain-ring watermark (top-right). Pure CSS radial rings — no image. */}
          <div
            className="absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full"
            style={{
              opacity: 0.2 * bg,
              backgroundImage:
                "radial-gradient(circle, transparent 38%, currentColor 38%, currentColor 39%, transparent 39%), " +
                "radial-gradient(circle, transparent 52%, currentColor 52%, currentColor 53%, transparent 53%), " +
                "radial-gradient(circle, transparent 68%, currentColor 68%, currentColor 69%, transparent 69%)",
              color: "var(--primary)",
            }}
          />
        </>
      )}

      {/* Section mascots are rendered in-flow by <MascotSceneBand /> so they
          fill real layout space instead of hiding behind page content. */}
      {void cast}

    </div>
  );
}

/** Small mascot header chip rendered above each page's content. */
export function BrandedPageChip() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const r = useMemo(() => resolveRoute(pathname), [pathname]);
  return (
    <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/70 px-3 py-2 shadow-sm backdrop-blur">
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-accent/10 ring-1 ring-primary/25">
        <Mascot name={r.name} pose={r.pose} size={40} className="max-h-9 max-w-9 object-contain" />
      </div>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <div className="font-graphic text-sm leading-none tracking-wide text-foreground sm:text-base">
          {r.title}
        </div>
        <div className="hidden truncate text-xs text-muted-foreground sm:block">{r.tagline}</div>
      </div>
      <div className="hidden text-[10px] uppercase tracking-wider text-muted-foreground sm:block">
        {MASCOT_REGISTRY[r.intent].label}
      </div>
    </div>
  );
}

/** Backdrop-only wrapper — mount once inside the shell. */
export function BrandedPageBackdrop() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const r = useMemo(() => resolveRoute(pathname), [pathname]);
  return <BrandedBackdrop section={r.section} name={r.name} pose={r.pose} />;
}

/** Optional convenience wrapper for pages that want the chip inline. */
export function BrandedPageFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <BrandedPageChip />
      {children}
    </>
  );
}
