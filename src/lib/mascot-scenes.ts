/**
 * Mascot scene registry — per-section casts of multiple mascots in
 * situation-appropriate poses, rendered as decorative backdrop art.
 *
 * Rules honored here:
 *  - Only approved mascot artwork from src/assets/mascots is used.
 *  - Scene art is purely decorative: non-interactive, low opacity, behind
 *    content, hidden on small screens, and never contains rendered text.
 *  - Each section's cast reflects what that section actually does.
 */

import aceChat from "@/assets/mascots/ace-chat.webp";
import aceReview from "@/assets/mascots/ace-review.webp";
import chainBrainStudy from "@/assets/mascots/chain-brain-study.webp";
import hyzerCheer from "@/assets/mascots/hyzer-cheer.webp";
import hyzerWarmup from "@/assets/mascots/hyzer-warmup.webp";
import mulleyGlowCheer from "@/assets/mascots/mulley-glow-cheer.webp";
import mulleyGlowShare from "@/assets/mascots/mulley-glow-share.webp";
import puttBotLab from "@/assets/mascots/putt-bot-lab.webp";
import puttBotWarmup from "@/assets/mascots/putt-bot-warmup.webp";
import safeModeSamPrep from "@/assets/mascots/safe-mode-sam-prep.webp";
import scoutBagprep from "@/assets/mascots/scout-bagprep.webp";
import scoutChat from "@/assets/mascots/scout-chat.webp";
import scoutSpectate from "@/assets/mascots/scout-spectate.png";
import aceLiveScores from "@/assets/mascots/ace-livescores.png";
import mulleyGallery from "@/assets/mascots/mulley-glow-gallery.png";
import scrambleFoxCheer from "@/assets/mascots/scramble-fox-cheer.webp";
import scrambleFoxCleanup from "@/assets/mascots/scramble-fox-cleanup.webp";
import type { MascotSection } from "@/lib/mascots";

/** Anchor corners a scene actor can be pinned to. */
export type SceneAnchor =
  | "bottom-left"
  | "bottom-center"
  | "bottom-right"
  | "mid-left"
  | "mid-right"
  | "top-left"
  | "top-right";

export type SceneActor = {
  /** Imported mascot artwork URL. */
  src: string;
  /** Short description of what the mascot is doing (used for QA, never rendered). */
  doing: string;
  anchor: SceneAnchor;
  /** Rendered height in px at desktop. */
  height: number;
  /** Base opacity before personalization scaling. */
  opacity: number;
  /** Mirror horizontally so the cast faces inward. */
  flip?: boolean;
  /** Only render at large widths (used for third/fourth actors). */
  wideOnly?: boolean;
};

const ANCHOR_CLASS: Record<SceneAnchor, string> = {
  "bottom-left": "bottom-6 left-2",
  "bottom-center": "bottom-6 left-1/2 -translate-x-1/2",
  "bottom-right": "bottom-6 right-2",
  "mid-left": "top-1/3 left-2",
  "mid-right": "top-1/4 right-2",
  "top-left": "top-24 left-2",
  "top-right": "top-28 right-2",
};


export function sceneAnchorClass(anchor: SceneAnchor): string {
  return ANCHOR_CLASS[anchor];
}

/**
 * Section casts. Sections without a bespoke cast fall back to
 * `FALLBACK_SCENE` so every page still gets multi-mascot branding.
 */
export const MASCOT_SCENES: Partial<Record<MascotSection, SceneActor[]>> = {
  // Feed — mascots chatting, sharing photos, catching up.
  feed: [
    { src: scoutChat, doing: "texting the crew", anchor: "bottom-left", height: 330, opacity: 0.34 },
    {
      src: mulleyGlowShare,
      doing: "sharing a round photo",
      anchor: "bottom-right",
      height: 360,
      opacity: 0.36,
      flip: true,
    },
    {
      src: aceChat,
      doing: "listening in on the thread",
      anchor: "mid-right",
      height: 240,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  // Play — warming up, stretching, packing the bag before a round.
  play: [
    {
      src: hyzerWarmup,
      doing: "shoulder stretch warmup",
      anchor: "bottom-right",
      height: 370,
      opacity: 0.36,
    },
    {
      src: puttBotWarmup,
      doing: "putting warmup reps",
      anchor: "bottom-left",
      height: 320,
      opacity: 0.32,
      flip: true,
    },
    {
      src: scoutBagprep,
      doing: "sorting discs in the bag",
      anchor: "mid-left",
      height: 250,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  practice: [
    {
      src: puttBotWarmup,
      doing: "putting reps",
      anchor: "bottom-right",
      height: 360,
      opacity: 0.36,
    },
    {
      src: hyzerWarmup,
      doing: "form work",
      anchor: "bottom-left",
      height: 310,
      opacity: 0.3,
      flip: true,
    },
  ],

  // Tournaments / Event Director — prepping the event, rules, course cleanup.
  tournaments: [
    {
      src: safeModeSamPrep,
      doing: "reading up on the rulebook",
      anchor: "bottom-right",
      height: 360,
      opacity: 0.36,
    },
    {
      src: mulleyGlowCheer,
      doing: "hyping the field before the players' meeting",
      anchor: "bottom-left",
      height: 340,
      opacity: 0.32,
      flip: true,
    },
    {
      src: scrambleFoxCleanup,
      doing: "clearing sticks off the fairway",
      anchor: "mid-right",
      height: 260,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  // Community / Tracker — cheering, celebrating, hyping each other up.
  community: [
    {
      src: mulleyGlowCheer,
      doing: "celebrating a big finish",
      anchor: "bottom-right",
      height: 360,
      opacity: 0.36,
    },
    {
      src: scrambleFoxCheer,
      doing: "fist pumping for a card mate",
      anchor: "bottom-left",
      height: 330,
      opacity: 0.32,
      flip: true,
    },
    {
      src: hyzerCheer,
      doing: "clapping in the gallery",
      anchor: "mid-right",
      height: 250,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  // Tracker — spectating live cards, following scores, working the gallery.
  tracker: [
    {
      src: scoutSpectate,
      doing: "tracking a live card through binoculars",
      anchor: "bottom-left",
      height: 350,
      opacity: 0.34,
    },
    {
      src: aceLiveScores,
      doing: "following live scores on a phone",
      anchor: "bottom-right",
      height: 340,
      opacity: 0.34,
      flip: true,
    },
    {
      src: mulleyGallery,
      doing: "waving a foam finger from the gallery",
      anchor: "mid-right",
      height: 250,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  // StatLink — research, form analysis, sports science.
  statlink: [
    {
      src: chainBrainStudy,
      doing: "breaking down form on the whiteboard",
      anchor: "bottom-right",
      height: 370,
      opacity: 0.36,
    },
    {
      src: puttBotLab,
      doing: "measuring release data",
      anchor: "bottom-left",
      height: 330,
      opacity: 0.32,
      flip: true,
    },
    {
      src: aceReview,
      doing: "reviewing slow-motion footage",
      anchor: "mid-left",
      height: 260,
      opacity: 0.2,
      wideOnly: true,
    },
  ],

  courses: [
    {
      src: scoutBagprep,
      doing: "scouting and gearing up",
      anchor: "bottom-right",
      height: 350,
      opacity: 0.34,
    },
    {
      src: scrambleFoxCleanup,
      doing: "tidying the fairway",
      anchor: "bottom-left",
      height: 320,
      opacity: 0.3,
      flip: true,
    },
  ],

  messages: [
    { src: scoutChat, doing: "typing a reply", anchor: "bottom-right", height: 340, opacity: 0.34 },
    {
      src: aceChat,
      doing: "sharing the plan",
      anchor: "bottom-left",
      height: 300,
      opacity: 0.28,
      flip: true,
    },
  ],

  achievements: [
    {
      src: mulleyGlowCheer,
      doing: "celebrating the trophy",
      anchor: "bottom-right",
      height: 360,
      opacity: 0.36,
    },
    {
      src: hyzerCheer,
      doing: "applauding the milestone",
      anchor: "bottom-left",
      height: 320,
      opacity: 0.3,
      flip: true,
    },
  ],

  profile: [
    {
      src: aceReview,
      doing: "reviewing the player card",
      anchor: "bottom-right",
      height: 350,
      opacity: 0.34,
    },
    {
      src: scoutBagprep,
      doing: "organizing the bag",
      anchor: "bottom-left",
      height: 310,
      opacity: 0.28,
      flip: true,
    },
  ],

  onboarding: [
    {
      src: aceChat,
      doing: "welcoming a new player",
      anchor: "bottom-right",
      height: 350,
      opacity: 0.34,
    },
    {
      src: puttBotWarmup,
      doing: "showing the putting drill",
      anchor: "bottom-left",
      height: 300,
      opacity: 0.28,
      flip: true,
    },
  ],
};

export const FALLBACK_SCENE: SceneActor[] = [
  { src: aceChat, doing: "greeting the player", anchor: "bottom-right", height: 340, opacity: 0.32 },
  {
    src: scoutChat,
    doing: "chatting with the crew",
    anchor: "bottom-left",
    height: 300,
    opacity: 0.26,
    flip: true,
  },
];

export function sceneFor(section: MascotSection): SceneActor[] {
  return MASCOT_SCENES[section] ?? FALLBACK_SCENE;
}
