/**
 * Platform-wide configuration schema.
 *
 * Admins edit this JSON blob at /platform. All app surfaces should
 * read defaults from getPlatformConfigDefaults() and merge in any overrides
 * from admin_settings.platform_config so we can tune behavior without a
 * deploy.
 */

import {
  PROFILE_SECTION_DEFAULTS,
  mergeProfileSections,
  type ProfileSectionVisibility,
} from "@/lib/profile-visibility";
import {
  STAT_HIGHLIGHT_DEFAULTS,
  normalizeStatHighlights,
  type StatHighlightKey,
} from "@/lib/stat-highlights";

export type PlatformConfig = {
  brand: {
    displayName: string;
    tagline: string;
    supportEmail: string;
    supportUrl: string;
    marketingUrl: string;
  };
  rating: {
    /** How many rounds we keep for the rolling PDGA-style average. */
    windowSize: number;
    /** Drop the N worst rounds before averaging. */
    dropWorst: number;
    /** Minimum rounds before we surface a confident rating. */
    minConfidentRounds: number;
    /** Recency weight decay (0-1, higher = flatter, lower = recent-heavier). */
    recencyDecay: number;
  };
  xp: {
    /** XP per completed round. */
    perRound: number;
    /** XP per birdie. */
    perBirdie: number;
    /** XP per eagle+. */
    perEagle: number;
    /** XP per ace. */
    perAce: number;
    /** Levels use xp = base * level^curve. */
    levelBase: number;
    levelCurve: number;
  };
  pdga: {
    /** Hours between automatic PDGA rating refresh. */
    ratingRefreshHours: number;
    /** Hours between automatic tournament schedule refresh. */
    scheduleRefreshHours: number;
    /** Only sync ratings when the profile has been touched in the last N days. */
    profileTouchDays: number;
  };
  features: {
    /** Global kill switches — turning off hides the surface everywhere. */
    smartCrew: boolean;
    liveScores: boolean;
    monteCarlo: boolean;
    askAce: boolean;
    ghostCourses: boolean;
  };
  betaMode: boolean;
};

export const PLATFORM_CONFIG_DEFAULTS: PlatformConfig = {
  brand: {
    displayName: "DG Dashboard",
    tagline: "Your Disc Golf. All in One Place.",
    supportEmail: "support@dgdashboard.app",
    supportUrl: "https://dgdashboard.app/help",
    marketingUrl: "https://dgdashboard.app",
  },
  rating: {
    windowSize: 25,
    dropWorst: 2,
    minConfidentRounds: 8,
    recencyDecay: 0.9,
  },
  xp: {
    perRound: 50,
    perBirdie: 5,
    perEagle: 25,
    perAce: 250,
    levelBase: 100,
    levelCurve: 1.5,
  },
  pdga: {
    ratingRefreshHours: 24,
    scheduleRefreshHours: 12,
    profileTouchDays: 60,
  },
  features: {
    smartCrew: true,
    liveScores: true,
    monteCarlo: true,
    askAce: true,
    ghostCourses: true,
  },
  betaMode: true,
};

/**
 * Deep-merge an admin override into the defaults so partial JSON in the DB
 * doesn't wipe missing sections. Missing keys fall back to defaults.
 */
export function mergePlatformConfig(
  overrides: Partial<PlatformConfig> | null | undefined,
): PlatformConfig {
  const base = PLATFORM_CONFIG_DEFAULTS;
  if (!overrides || typeof overrides !== "object") return base;
  return {
    brand: { ...base.brand, ...(overrides.brand ?? {}) },
    rating: { ...base.rating, ...(overrides.rating ?? {}) },
    xp: { ...base.xp, ...(overrides.xp ?? {}) },
    pdga: { ...base.pdga, ...(overrides.pdga ?? {}) },
    features: { ...base.features, ...(overrides.features ?? {}) },
    betaMode: overrides.betaMode ?? base.betaMode,
  };
}

export type NotificationPrefs = {
  channels: {
    push: boolean;
    email: boolean;
    inApp: boolean;
  };
  topics: {
    friendRequests: boolean;
    mentions: boolean;
    comments: boolean;
    likes: boolean;
    tournamentReminders: boolean;
    leagueUpdates: boolean;
    crewCalendarChanges: boolean;
    friendLiveRounds: boolean;
    /** A crew member cards an eagle or better. */
    friendEagles: boolean;
    /** A crew member aces a hole. */
    friendAces: boolean;
    /** A crew member wins or podiums an event. */
    friendWins: boolean;
    /** A crew member registers for a new event. */
    friendEventSignups: boolean;
    pdgaRatingChanges: boolean;
    achievementUnlocks: boolean;
    weeklyRecap: boolean;
  };
  quietHours: {
    enabled: boolean;
    start: string; // "22:00"
    end: string; // "07:00"
    /**
     * Mute non-urgent alerts for the whole tournament day — from your first
     * tee time through the awards ceremony — for events you're registered for.
     */
    duringTournaments: boolean;
    /** Mute non-urgent alerts during league nights you're registered for. */
    duringLeagues: boolean;
    /** Minutes after the final round finishes that awards usually wrap up. */
    tournamentAwardsBufferMinutes: number;
  };
};

export const NOTIFICATION_PREFS_DEFAULTS: NotificationPrefs = {
  channels: { push: true, email: true, inApp: true },
  topics: {
    friendRequests: true,
    mentions: true,
    comments: true,
    likes: false,
    tournamentReminders: true,
    leagueUpdates: true,
    crewCalendarChanges: true,
    friendLiveRounds: true,
    friendEagles: true,
    friendAces: true,
    friendWins: true,
    friendEventSignups: true,
    pdgaRatingChanges: true,
    achievementUnlocks: true,
    weeklyRecap: true,
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "07:00",
    duringTournaments: true,
    duringLeagues: true,
    tournamentAwardsBufferMinutes: 60,
  },
};

export function mergeNotificationPrefs(
  overrides: Partial<NotificationPrefs> | null | undefined,
): NotificationPrefs {
  const base = NOTIFICATION_PREFS_DEFAULTS;
  if (!overrides || typeof overrides !== "object") return base;
  return {
    channels: { ...base.channels, ...(overrides.channels ?? {}) },
    topics: { ...base.topics, ...(overrides.topics ?? {}) },
    quietHours: { ...base.quietHours, ...(overrides.quietHours ?? {}) },
  };
}

/** A tournament day window: first tee time through awards. */
export type TournamentQuietWindow = { startsAt: Date; endsAt: Date; eventName?: string };

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** A committed schedule row that may produce a tournament quiet window. */
export type QuietWindowSource = {
  title?: string | null;
  status?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  starts_at?: string | null;
  /** Where the row came from, e.g. "league", "pdga", "tournament". */
  source?: string | null;
};

/** True when a schedule row represents a league night rather than a tournament. */
export function isLeagueQuietSource(source?: string | null): boolean {
  return (source ?? "").toLowerCase() === "league";
}

/** Statuses that mean the player is actually playing the event. */
const PLAYING_STATUSES = new Set(["registered", "confirmed", "waitlisted"]);

/**
 * Turns committed schedule rows into tournament quiet windows.
 *
 * Tee times are never invented: when PDGA hasn't published one, the whole
 * event day is treated as quiet (local midnight to 23:59) instead of guessing
 * a tee off. When a tee time exists, the window runs from tee off through an
 * estimated round finish, and the awards buffer is applied by quietHoursStatus.
 */
export function buildTournamentQuietWindows(
  rows: QuietWindowSource[],
  opts: { roundHours?: number; includeTournaments?: boolean; includeLeagues?: boolean } = {},
): TournamentQuietWindow[] {
  const roundMs = Math.max(1, opts.roundHours ?? 4) * 60 * 60_000;
  const includeTournaments = opts.includeTournaments ?? true;
  const includeLeagues = opts.includeLeagues ?? true;
  const windows: TournamentQuietWindow[] = [];
  for (const row of rows) {
    if (row.status && !PLAYING_STATUSES.has(row.status)) continue;
    const league = isLeagueQuietSource(row.source);
    if (league ? !includeLeagues : !includeTournaments) continue;
    const name = row.title ?? undefined;
    if (row.starts_at) {
      const start = new Date(row.starts_at);
      if (!Number.isNaN(start.getTime())) {
        windows.push({
          startsAt: start,
          endsAt: new Date(start.getTime() + roundMs),
          eventName: name,
        });
        continue;
      }
    }
    const firstDay = row.starts_on;
    const lastDay = row.ends_on ?? row.starts_on;
    if (!firstDay) continue;
    const start = new Date(`${firstDay}T00:00:00`);
    const end = new Date(`${lastDay}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    windows.push({ startsAt: start, endsAt: end, eventName: name });
  }
  return windows;
}

/**
 * Is the user inside a quiet window right now — either their nightly quiet
 * hours or an active tournament day (tee off → awards)?
 *
 * Returns the reason so callers can log or explain why an alert was held.
 */
export function quietHoursStatus(
  prefs: NotificationPrefs,
  now: Date = new Date(),
  tournamentWindows: TournamentQuietWindow[] = [],
): { quiet: boolean; reason: "nightly" | "tournament" | null; eventName?: string } {
  const qh = prefs.quietHours;

  if (qh.duringTournaments || qh.duringLeagues) {
    const bufferMs = Math.max(0, qh.tournamentAwardsBufferMinutes) * 60_000;
    for (const w of tournamentWindows) {
      if (now >= w.startsAt && now.getTime() <= w.endsAt.getTime() + bufferMs) {
        return { quiet: true, reason: "tournament", eventName: w.eventName };
      }
    }
  }

  if (qh.enabled) {
    const start = minutesOfDay(qh.start);
    const end = minutesOfDay(qh.end);
    if (start != null && end != null) {
      const cur = now.getHours() * 60 + now.getMinutes();
      const inWindow = start <= end ? cur >= start && cur < end : cur >= start || cur < end;
      if (inWindow) return { quiet: true, reason: "nightly" };
    }
  }

  return { quiet: false, reason: null };
}

export type PrivacyPrefs = {
  profileVisibility: "public" | "friends" | "private";
  showInSearch: boolean;
  showRounds: boolean;
  showRatings: boolean;
  showCalendar: boolean;
  allowFriendRequests: boolean;
  allowMessagesFrom: "everyone" | "friends" | "nobody";
  /** Per-section profile audiences. See src/lib/profile-visibility.ts. */
  sections: ProfileSectionVisibility;
  /** StatLink highlights the owner shows on their profile. */
  statHighlights: StatHighlightKey[];
};

export const PRIVACY_PREFS_DEFAULTS: PrivacyPrefs = {
  profileVisibility: "public",
  showInSearch: true,
  showRounds: true,
  showRatings: true,
  showCalendar: true,
  allowFriendRequests: true,
  allowMessagesFrom: "everyone",
  sections: PROFILE_SECTION_DEFAULTS,
  statHighlights: STAT_HIGHLIGHT_DEFAULTS,
};

export function mergePrivacyPrefs(
  overrides: Partial<PrivacyPrefs> | null | undefined,
): PrivacyPrefs {
  if (!overrides || typeof overrides !== "object") return PRIVACY_PREFS_DEFAULTS;
  const merged: PrivacyPrefs = {
    ...PRIVACY_PREFS_DEFAULTS,
    ...overrides,
    sections: mergeProfileSections(
      overrides.sections as Partial<Record<string, unknown>> | null | undefined,
    ),
    statHighlights: normalizeStatHighlights(
      (overrides as { statHighlights?: unknown }).statHighlights,
    ),
  };

  // Legacy single toggles still act as a hard "off" switch for their section
  // when the newer per-section audience has not been narrowed already.
  const hide = (key: keyof ProfileSectionVisibility) => {
    if (merged.sections[key] === "public") merged.sections[key] = "private";
  };
  const hasSections = Boolean(overrides.sections);
  if (!hasSections) {
    if (merged.showRounds === false) hide("rounds");
    if (merged.showRatings === false) {
      hide("ratings");
      hide("pdga");
    }
    if (merged.showCalendar === false) hide("calendar");
  }
  return merged;
}
