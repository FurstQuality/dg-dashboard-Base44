/**
 * App tour — a 9-page flip-through that introduces every main section of
 * DG Dashboard to a new player.
 *
 * Opens once automatically (first authenticated visit, tracked in
 * localStorage) and can be reopened any time with `openAppTour()` or by
 * loading any page with `?tour=1`.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Flag,
  Home,
  Map,
  Palette,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MascotIllustration } from "@/components/shell/mascot-illustration";
import type { MascotIntent } from "@/lib/mascots";
import { cn } from "@/lib/utils";

const TOUR_SEEN_KEY = "dgd:app-tour:seen:v1";
const OPEN_TOUR_EVENT = "dgd:open-app-tour";

/** Open the tour from anywhere (menus, settings, help links). */
export function openAppTour(): void {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT));
}

type TourPage = {
  eyebrow: string;
  title: string;
  intro: string;
  icon: typeof Home;
  mascot: MascotIntent;
  points: string[];
  link?: { to: string; label: string };
};

const PAGES: TourPage[] = [
  {
    eyebrow: "Welcome",
    title: "This is your disc golf home base",
    intro:
      "DG Dashboard keeps your rounds, your stats, your crew, and your events in one place. Nine quick screens and you'll know where everything lives.",
    icon: Sparkles,
    mascot: "onboarding",
    points: [
      "On a phone, the bar at the bottom has Play, Courses, Events, Community and Me. Play is your home screen; the Feed now lives under Community.",
      "The buttons on the right of the header are Ace, notifications, progress, look and feel, and your profile.",
      "Flip through with the arrows below — you can close this and reopen it from Settings whenever you like.",
    ],
  },
  {
    eyebrow: "Page 2 · Feed",
    title: "Feed — what your circle is up to",
    intro:
      "Your home screen. Photos, aces, round cards, and event news from the players and clubs you follow.",
    icon: Home,
    mascot: "social",
    points: [
      "Post a photo, a note, or share a finished round straight from the top bar.",
      "Like, comment, and save posts; filter the feed when you only want rounds or aces.",
      "Side widgets show your next event, trending discs, and players worth following.",
    ],
    link: { to: "/home", label: "Open Feed" },
  },
  {
    eyebrow: "Page 3 · Play",
    title: "Play — start a round and keep score",
    intro:
      "Everything for the round in front of you: pick a course, add your card, and score hole by hole.",
    icon: Flag,
    mascot: "athletic",
    points: [
      "Start a round, add friends or guests, and score together — it works offline and syncs later.",
      "Live scoring shows par, distance, hole notes, and your running total.",
      "Rounds keeps your history; Schedule holds the rounds and events you've planned.",
    ],
    link: { to: "/play", label: "Open Play" },
  },
  {
    eyebrow: "Page 4 · Courses",
    title: "Courses — find, review, and build",
    intro:
      "A searchable map and directory of courses, opening on everything within 100 miles of you.",
    icon: Map,
    mascot: "scout",
    points: [
      "Filter by distance, state, hole count, difficulty, and rating — your filters are remembered.",
      "Course pages show holes, tees, baskets, photos, weather, and player reviews.",
      "Missing a course? Build it yourself: draw holes, set tees and baskets, and share it.",
    ],
    link: { to: "/courses", label: "Open Courses" },
  },
  {
    eyebrow: "Page 5 · Practice",
    title: "Practice — putting and field work",
    intro: "Structured practice sessions that feed the same stats as your rounds.",
    icon: Target,
    mascot: "range",
    points: [
      "Putting sessions log makes and misses by distance so you can see your real make rate.",
      "Field work tracks throws by disc, shot shape, and distance.",
      "Daily goals and challenges give you something to chase between rounds.",
    ],
    link: { to: "/practice", label: "Open Practice" },
  },
  {
    eyebrow: "Page 6 · DG Statboard",
    title: "DG Statboard — your numbers, explained",
    intro:
      "Scoring trends, course history, and your DGD Rating, all built from the rounds you've played.",
    icon: BarChart3,
    mascot: "analytics",
    points: [
      "DG Statboard shows your rating, which rounds are about to drop off, and what a round needs to move it.",
      "Scoring breaks down birdies, pars, bogeys, and where you're losing strokes.",
      "Compare yourself with friends, and set a rating or scoring goal to work toward.",
    ],
    link: { to: "/statlink", label: "Open DG Statboard" },
  },
  {
    eyebrow: "Page 7 · Community",
    title: "Community — friends, clubs, and gear",
    intro: "The social side: your crew, local clubs, meetups, and the marketplace.",
    icon: Users,
    mascot: "social",
    points: [
      "Friends: add players, accept requests, and see who's looking to play right now.",
      "Clubs: browse local clubs by distance and city, with suggestions based on where you play.",
      "Marketplace and lost and found: buy, sell, and trade discs nearby, or reunite a lost disc.",
    ],
    link: { to: "/community", label: "Open Community" },
  },
  {
    eyebrow: "Page 8 · Events",
    title: "Events, tournaments, and leagues",
    intro:
      "Live listings from PDGA, Disc Golf Scene, and UDisc, plus the tools to run your own event.",
    icon: Trophy,
    mascot: "official",
    points: [
      "Browse events within your radius in a list or calendar, and add any of them to your schedule.",
      "Register, check in, and follow live scoring — trackers let you watch groups hole by hole.",
      "Running one? The Event Director desk handles setup, divisions, sign-ups, check-in, and payouts.",
    ],
    link: { to: "/events", label: "Open Events" },
  },
  {
    eyebrow: "Page 9 · Ace and your look",
    title: "Ace, your caddy — and making it yours",
    intro:
      "Ace answers questions with your own numbers, and personalization decides how the whole app looks.",
    icon: Bot,
    mascot: "coach",
    points: [
      "Ask Ace what disc to throw, how to play a hole, or what your stats are saying.",
      "Personalization sets your theme, density, and how often mascots appear.",
      "Overview pages are dashboards — reorder, hide, or restore cards so each one fits how you play.",
    ],
    link: { to: "/settings", label: "Finish in Settings" },
  },
];

export function AppTour() {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour") === "1";
    if (forced) {
      setPage(0);
      setOpen(true);
      return;
    }
    try {
      if (!localStorage.getItem(TOUR_SEEN_KEY)) setOpen(true);
    } catch {
      // Private browsing with storage blocked — skip the auto-open.
    }
  }, []);

  useEffect(() => {
    const onOpen = () => {
      setPage(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
  }, []);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, new Date().toISOString());
    } catch {
      // Nothing to do — the tour simply shows again next visit.
    }
  }, []);

  const close = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) markSeen();
    },
    [markSeen],
  );

  const current = PAGES[page];
  const Icon = current.icon;
  const isLast = page === PAGES.length - 1;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-[640px] gap-0 overflow-hidden p-0">
        <div className="flex items-start gap-4 border-b border-border bg-primary/5 p-5">
          <MascotIllustration
            intent={current.mascot}
            size={96}
            context="callout"
            className="hidden shrink-0 sm:block"
          />
          <div className="min-w-0 space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Icon className="h-3.5 w-3.5" />
              {current.eyebrow}
            </span>
            <DialogTitle className="font-display text-xl leading-tight">
              {current.title}
            </DialogTitle>
            <DialogDescription className="text-sm">{current.intro}</DialogDescription>
          </div>
        </div>

        <ul className="space-y-2.5 p-5">
          {current.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        {current.link ? (
          <div className="px-5 pb-4">
            <Button asChild variant="outline" size="sm" onClick={() => close(false)}>
              <Link to={current.link.to}>
                {current.link.label}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 p-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {PAGES.map((p, i) => (
              <button
                key={p.title}
                type="button"
                onClick={() => setPage(i)}
                aria-label={`Go to page ${i + 1}`}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === page ? "w-5 bg-primary" : "w-2 bg-border hover:bg-muted-foreground",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {page + 1} of {PAGES.length}
            </span>
            {page > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setPage((p) => p - 1)}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => close(false)}>
                Skip tour
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={() => close(false)}>
                <Palette className="mr-1.5 h-4 w-4" />
                Start playing
              </Button>
            ) : (
              <Button size="sm" onClick={() => setPage((p) => p + 1)}>
                Next
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
