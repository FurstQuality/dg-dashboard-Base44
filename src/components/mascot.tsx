import ace from "@/assets/mascots/ace.webp";
import aceAction from "@/assets/mascots/ace-action.webp";
import scrambleFox from "@/assets/mascots/scramble-fox.webp";
import scrambleFoxAction from "@/assets/mascots/scramble-fox-action.webp";
import puttBot from "@/assets/mascots/putt-bot.webp";
import puttBotAction from "@/assets/mascots/putt-bot-action.webp";
import hyzer from "@/assets/mascots/hyzer.webp";
import hyzerAction from "@/assets/mascots/hyzer-action.webp";
import safeModeSam from "@/assets/mascots/safe-mode-sam.webp";
import safeModeSamAction from "@/assets/mascots/safe-mode-sam-action.webp";
import scout from "@/assets/mascots/scout.webp";
import scoutAction from "@/assets/mascots/scout-action.webp";
import mulley from "@/assets/mascots/mulley.webp";
import mulleyAction from "@/assets/mascots/mulley-action.webp";
import mulleyGlow from "@/assets/mascots/mulley-glow.webp";
import mulleyGlowAction from "@/assets/mascots/mulley-glow-action.webp";
import fixIt from "@/assets/mascots/fix-it.png";
import chainBrain from "@/assets/mascots/chain-brain.webp";
import chainBrainAction from "@/assets/mascots/chain-brain-action.webp";

export type MascotName =
  | "ace"
  | "scramble-fox"
  | "putt-bot"
  | "hyzer"
  | "safe-mode-sam"
  | "scout"
  | "mulley"
  | "mulley-glow"
  | "chain-brain"
  | "fix-it";

export type MascotPose = "default" | "action";

type MascotData = {
  label: string;
  role: string;
  poses: Record<MascotPose, string>;
};

export const MASCOTS: Record<MascotName, MascotData> = {
  ace: {
    label: "Ace",
    role: "Your AI Caddy",
    poses: { default: ace, action: aceAction },
  },
  "scramble-fox": {
    label: "Scramble Fox",
    role: "Recovery Expert",
    poses: { default: scrambleFox, action: scrambleFoxAction },
  },
  "putt-bot": {
    label: "Putt Bot",
    role: "Stats & Analytics",
    poses: { default: puttBot, action: puttBotAction },
  },
  hyzer: {
    label: "Hyzer",
    role: "Big Arm Energy",
    poses: { default: hyzer, action: hyzerAction },
  },
  "safe-mode-sam": {
    label: "Safe Mode Sam",
    role: "Rules First",
    poses: { default: safeModeSam, action: safeModeSamAction },
  },
  scout: {
    label: "Scout",
    role: "Community Leader",
    poses: { default: scout, action: scoutAction },
  },
  mulley: {
    label: "Mulley",
    role: "Second-Chance Champion",
    poses: { default: mulley, action: mulleyAction },
  },
  "mulley-glow": {
    label: "Mulley Glow",
    role: "Good Vibes Only",
    poses: { default: mulleyGlow, action: mulleyGlowAction },
  },
  "fix-it": {
    label: "Fix-It",
    role: "Troubleshooting Help",
    poses: { default: fixIt, action: fixIt },
  },
  "chain-brain": {
    label: "Chain Brain",
    role: "Course Sage",
    poses: { default: chainBrain, action: chainBrainAction },
  },
};

export const MASCOT_LIST = Object.entries(MASCOTS).map(([name, m]) => ({
  name: name as MascotName,
  ...m,
}));

export function mascotUrl(name: MascotName, pose: MascotPose = "default") {
  return MASCOTS[name].poses[pose];
}

type Props = {
  name: MascotName;
  pose?: MascotPose;
  size?: number;
  className?: string;
  alt?: string;
};

/** A single mascot, rendered at the requested display size on transparent bg.
 *  The source PNGs are 1024×1024 with a lot of built-in padding around the
 *  character, so we render them in a square box and let the character sit
 *  inside — no cropping, no cross-bleed from other characters. */
export function Mascot({ name, pose = "default", size = 96, className, alt }: Props) {
  const m = MASCOTS[name];
  const url = m.poses[pose];
  return (
    <img
      src={url}
      alt={alt ?? m.label}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      data-mascot="true"
      className={className}
      style={{ objectFit: "contain", objectPosition: "center" }}
    />
  );
}

/** Horizontal cast strip — perfect for hero banners, empty states, sign-in pages. */
export function MascotCast({
  className,
  pose = "default",
}: {
  className?: string;
  pose?: MascotPose;
}) {
  return (
    <div className={"flex items-end gap-4 flex-wrap pb-2 " + (className ?? "")}>
      {MASCOT_LIST.map((m) => (
        <figure key={m.name} className="flex shrink-0 flex-col items-center">
          <div className="grid h-28 w-28 place-items-center">
            <img
              src={m.poses[pose]}
              alt={m.label}
              width={112}
              height={112}
              loading="lazy"
              decoding="async"
              data-mascot="true"
              className="drop-shadow-[0_4px_0_rgba(0,0,0,0.5)]"
              style={{ objectFit: "contain", objectPosition: "center" }}
            />
          </div>
          <figcaption className="mt-1 font-graphic text-xs tracking-wide text-primary">
            {m.label}
          </figcaption>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {m.role}
          </span>
        </figure>
      ))}
    </div>
  );
}
