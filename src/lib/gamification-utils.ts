// Client-side helpers for gamification. XP grants happen in DB triggers.
export function calcLevel(xp: number): number {
  if (!xp || xp < 0) return 0;
  return Math.floor(Math.sqrt(xp / 100));
}
export function xpForLevel(level: number): number {
  return level * level * 100;
}
export function levelTitle(level: number): string {
  if (level >= 40) return "Legend";
  if (level >= 25) return "Champion";
  if (level >= 15) return "Pro";
  if (level >= 8) return "Advanced";
  if (level >= 3) return "Amateur";
  return "Rookie";
}
export function levelProgress(xp: number): {
  level: number;
  pct: number;
  into: number;
  span: number;
} {
  const level = calcLevel(xp);
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - base;
  const into = xp - base;
  return { level, pct: span > 0 ? Math.min(100, Math.max(0, (into / span) * 100)) : 0, into, span };
}

export const TIER_STYLES: Record<string, string> = {
  bronze: "bg-amber-700/15 text-amber-700 border-amber-700/30",
  silver: "bg-slate-400/15 text-slate-500 border-slate-400/30",
  gold: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  platinum: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30",
};

export const CATEGORY_LABEL: Record<string, string> = {
  play: "Play",
  build: "Build",
  social: "Social",
  community: "Community",
  tournament: "Competition",
  misc: "Misc",
};

export const EVENT_KIND_LABEL: Record<string, string> = {
  cleanup: "Course Cleanup",
  charity: "Charity",
  group_round: "Group Round",
  meetup: "Meetup",
  clinic: "Clinic",
};

export const EVENT_KIND_STYLE: Record<string, string> = {
  cleanup: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  charity: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  group_round: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  meetup: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  clinic: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};
