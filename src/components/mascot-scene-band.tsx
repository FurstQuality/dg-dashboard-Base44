import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useResolvedPageMascot } from "@/components/branded-page-frame";
import { sceneFor } from "@/lib/mascot-scenes";
import type { MascotSection } from "@/lib/mascots";
import { useTheme } from "@/lib/theme-context";

/**
 * MascotSceneBand — an in-flow, full-opacity mascot scene that closes out a
 * page. Unlike the fixed backdrop art, this band participates in layout, so
 * the cast fills the leftover space at the bottom of short pages and reads as
 * a deliberate part of the app instead of a watermark hidden behind cards.
 *
 * Each section gets copy and links tied to what that section actually does.
 */

type BandCopy = {
  headline: string;
  body: string;
  links: Array<{ label: string; to: string }>;
};

const SECTION_COPY: Record<MascotSection, BandCopy> = {
  feed: {
    headline: "The crew is talking",
    body: "Share a round, react to a card, or post a ratings update — the feed fills in as your circle plays.",
    links: [
      { label: "Find friends", to: "/friends" },
      { label: "Open messages", to: "/dgim" },
    ],
  },
  play: {
    headline: "Warmed up and ready",
    body: "Pick a course, start a card, and score hole by hole. Practice reps count toward your form trends too.",
    links: [
      { label: "Start a round", to: "/play/pick-course" },
      { label: "Practice tools", to: "/practice" },
    ],
  },
  practice: {
    headline: "Reps that show up in your stats",
    body: "Log range throws and putting sets, then watch make rates move on your DG Statboard trends.",
    links: [
      { label: "Log a session", to: "/practice" },
      { label: "See trends", to: "/statlink" },
    ],
  },
  community: {
    headline: "Better with your people",
    body: "Clubs, group rounds, outreach events, and the local marketplace all live here.",
    links: [
      { label: "Browse clubs", to: "/clubs" },
      { label: "Buy / sell / trade", to: "/marketplace" },
    ],
  },
  tracker: {
    headline: "Follow the live cards",
    body: "Track tee times, hole-by-hole scores, and finishes for the events and players you care about.",
    links: [
      { label: "Open the tracker", to: "/tracker" },
      { label: "Event directory", to: "/events" },
    ],
  },
  statlink: {
    headline: "The numbers behind your game",
    body: "Ratings math, scoring splits, course readiness, and goal trajectories — all from your real rounds.",
    links: [
      { label: "Ratings Lab", to: "/statlink" },
      { label: "Import rounds", to: "/settings/imports" },
    ],
  },
  courses: {
    headline: "Know the layout before you tee",
    body: "Build layouts, review holes, and check distances and par for every course in reach.",
    links: [
      { label: "Course directory", to: "/courses" },
      { label: "Build a course", to: "/courses?add=1" },
    ],
  },
  tournaments: {
    headline: "Run event day cleanly",
    body: "Registrations, divisions, check-in, and results — the director desk keeps the weekend on rails.",
    links: [
      { label: "Director desk", to: "/director" },
      { label: "Check-in station", to: "/director/check-in" },
    ],
  },
  messages: {
    headline: "Plan the next round",
    body: "Message a friend, spin up a group card thread, or share a course with the crew.",
    links: [
      { label: "Open DGIM", to: "/dgim" },
      { label: "Your friends", to: "/friends" },
    ],
  },
  profile: {
    headline: "Your player card",
    body: "Keep your bag, privacy, and connected data current so your profile reflects how you actually play.",
    links: [
      { label: "My bag", to: "/me/bag" },
      { label: "Data & sync", to: "/settings/imports" },
    ],
  },
  achievements: {
    headline: "Proof of the grind",
    body: "Badges, trophies, and quests unlock from rounds you already play — no busywork required.",
    links: [
      { label: "Trophy shelf", to: "/me" },
      { label: "Play a round", to: "/play/pick-course" },
    ],
  },
  onboarding: {
    headline: "Let's get you set up",
    body: "Link your data, pick your home courses, and your dashboard fills in from there.",
    links: [
      { label: "Finish setup", to: "/settings" },
      { label: "Explore courses", to: "/courses" },
    ],
  },
};

const SECTION_WASH: Record<MascotSection, string> = {
  feed: "from-secondary/20 to-accent/10",
  play: "from-primary/20 to-secondary/10",
  practice: "from-teal-400/20 to-primary/10",
  community: "from-primary/18 to-secondary/12",
  tracker: "from-sky-500/20 to-fuchsia-500/12",
  statlink: "from-violet-500/20 to-secondary/12",
  courses: "from-emerald-500/20 to-primary/12",
  tournaments: "from-amber-500/20 to-primary/12",
  messages: "from-pink-500/18 to-secondary/12",
  profile: "from-primary/18 to-accent/12",
  achievements: "from-amber-400/22 to-primary/12",
  onboarding: "from-primary/18 to-accent/12",
};

/** Mascot-art strength from Settings → Look & feel. */
const STRENGTH: Record<string, number> = {
  off: 0,
  "empty-only": 0.6,
  subtle: 0.8,
  full: 1,
};

export function MascotSceneBand({ className = "" }: { className?: string }) {
  const { section } = useResolvedPageMascot();
  const { mascotIntensity } = useTheme();
  const strength = STRENGTH[mascotIntensity] ?? 1;
  if (strength <= 0) return null;

  const copy = SECTION_COPY[section] ?? SECTION_COPY.feed;
  const cast = sceneFor(section);
  const wash = SECTION_WASH[section] ?? SECTION_WASH.feed;

  return (
    <section
      className={`relative mt-6 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${wash} ${className}`}
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-6">
        <div className="min-w-0">
          <h2 className="font-graphic text-base tracking-wide text-foreground sm:text-lg">
            {copy.headline}
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{copy.body}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {copy.links.map((l) => (
              <Link
                key={l.to}
                to={l.to as never}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/70 px-3 py-1.5 text-sm text-foreground transition hover:border-primary/60 hover:bg-card"
              >
                {l.label}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none flex select-none items-end justify-center gap-1 sm:gap-3 lg:justify-end"
          style={{
            // One shared height for the whole cast so every mascot reads at the
            // same scale and stands on the same ground line — no dwarfing.
            ["--band-mascot-height" as string]: `clamp(112px, 16vw, ${Math.round(
              210 * (strength === 1 ? 1 : 0.85),
            )}px)`,
          }}
        >
          {cast.map((actor, i) => (
            <img
              key={`${actor.src}-${i}`}
              src={actor.src}
              alt=""
              loading="lazy"
              draggable={false}
              className={`h-[var(--band-mascot-height)] w-auto object-contain object-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.45)] ${
                actor.flip ? "-scale-x-100" : ""
              } ${i > 1 ? "hidden xl:block" : ""} ${i === 1 ? "hidden sm:block" : ""}`}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
