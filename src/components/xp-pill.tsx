import { Link } from "@tanstack/react-router";
import { Flame, Sparkles } from "lucide-react";
import { useSession } from "@/lib/current-user";
import { useUserProgress, useAchievementUnlockListener } from "@/hooks/use-progress";
import { levelProgress } from "@/lib/gamification-utils";

/**
 * Player progress capsule.
 * - `compact` (default): fixed-width Lv + streak; XP bar hidden. Fits in the header at any width.
 * - `full`: adds the XP progress bar; use on wider viewports or inside menus.
 */
export function XpPill({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { user } = useSession();
  const { progress } = useUserProgress(user?.id);
  useAchievementUnlockListener(user?.id);
  if (!user || !progress) return null;
  const { level, pct } = levelProgress(progress.xp);
  return (
    <Link
      to="/challenges"
      className="group inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-xs font-medium hover:bg-muted"
      style={{ maxWidth: variant === "full" ? 150 : 96 }}
      title={`Level ${level} · ${progress.xp} XP · ${progress.title}`}
      aria-label={`Level ${level}, ${progress.xp} XP${progress.streak_days ? `, ${progress.streak_days} day streak` : ""}`}
    >
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Sparkles className="h-3 w-3" />
      </span>
      <span className="tabular-nums">Lv {level}</span>
      {variant === "full" ? (
        <span className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </span>
      ) : null}
      {progress.streak_days > 0 ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 text-orange-500">
          <Flame className="h-3 w-3" />
          <span className="tabular-nums">{progress.streak_days}</span>
        </span>
      ) : null}
    </Link>
  );
}
