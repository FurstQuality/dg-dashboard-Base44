/**
 * Per-section profile visibility.
 *
 * Every profile surface (bio, ratings, rounds, events, …) has its own
 * audience: everyone, crew only, or nobody. The server is the enforcement
 * point — `getPlayerProfile` strips hidden sections before they leave the
 * worker, and the UI hides the matching cards/tabs using the returned
 * `hidden` list.
 */

export type ProfileAudience = "public" | "friends" | "private";

export type ProfileSectionKey =
  | "bio"
  | "location"
  | "homeCourse"
  | "ratings"
  | "pdga"
  | "stats"
  | "scoring"
  | "form"
  | "divisions"
  | "rounds"
  | "events"
  | "achievements"
  | "posts"
  | "photos"
  | "bag"
  | "friends"
  | "followCounts"
  | "calendar"
  | "progress";

export type ProfileSectionVisibility = Record<ProfileSectionKey, ProfileAudience>;

export const PROFILE_SECTIONS: Array<{
  key: ProfileSectionKey;
  label: string;
  hint: string;
  group: "Identity" | "Performance" | "Activity" | "Social";
}> = [
  { key: "bio", label: "Bio", hint: "Your about text.", group: "Identity" },
  { key: "location", label: "City & state", hint: "Where you play out of.", group: "Identity" },
  { key: "homeCourse", label: "Home course", hint: "Your listed home course.", group: "Identity" },
  { key: "progress", label: "Level & XP", hint: "Level, title, and streak.", group: "Identity" },
  {
    key: "ratings",
    label: "Ratings",
    hint: "DGD, average, and best round ratings.",
    group: "Performance",
  },
  { key: "pdga", label: "PDGA card", hint: "PDGA number and member details.", group: "Performance" },
  {
    key: "stats",
    label: "Stat strip",
    hint: "Rounds, wins, aces, and events counters.",
    group: "Performance",
  },
  {
    key: "scoring",
    label: "Scoring breakdown",
    hint: "Birdie, par, and bogey rates.",
    group: "Performance",
  },
  { key: "form", label: "Recent form", hint: "Trend line and hot stretches.", group: "Performance" },
  {
    key: "divisions",
    label: "Division history",
    hint: "Divisions you've competed in.",
    group: "Performance",
  },
  { key: "rounds", label: "Rounds", hint: "Your round history list.", group: "Activity" },
  { key: "events", label: "Events played", hint: "Tournament results.", group: "Activity" },
  {
    key: "achievements",
    label: "Achievements",
    hint: "Badges you've earned.",
    group: "Activity",
  },
  {
    key: "calendar",
    label: "Upcoming schedule",
    hint: "Events you're registered for.",
    group: "Activity",
  },
  {
    key: "bag",
    label: "My Bag",
    hint: "The discs you carry, so others can compare bags.",
    group: "Activity",
  },
  { key: "posts", label: "Posts", hint: "Your feed posts on your profile.", group: "Social" },
  { key: "photos", label: "Photos", hint: "Photos pulled from your posts.", group: "Social" },
  { key: "friends", label: "Crew list", hint: "Who is in your Crew.", group: "Social" },
  {
    key: "followCounts",
    label: "Follower counts",
    hint: "Followers and following totals.",
    group: "Social",
  },
];

export const PROFILE_SECTION_KEYS: ProfileSectionKey[] = PROFILE_SECTIONS.map((s) => s.key);

export const PROFILE_SECTION_DEFAULTS: ProfileSectionVisibility = PROFILE_SECTION_KEYS.reduce(
  (acc, key) => {
    acc[key] = "public";
    return acc;
  },
  {} as ProfileSectionVisibility,
);

const AUDIENCES: ProfileAudience[] = ["public", "friends", "private"];

export function mergeProfileSections(
  overrides: Partial<Record<string, unknown>> | null | undefined,
): ProfileSectionVisibility {
  const merged = { ...PROFILE_SECTION_DEFAULTS };
  if (!overrides || typeof overrides !== "object") return merged;
  for (const key of PROFILE_SECTION_KEYS) {
    const value = overrides[key];
    if (typeof value === "string" && (AUDIENCES as string[]).includes(value)) {
      merged[key] = value as ProfileAudience;
    }
  }
  return merged;
}

export type ProfileViewer = "self" | "friend" | "public";

export function resolveProfileViewer(isSelf: boolean, isFriend: boolean): ProfileViewer {
  if (isSelf) return "self";
  return isFriend ? "friend" : "public";
}

/** Whether `viewer` may see a section set to `audience`. */
export function canViewAudience(audience: ProfileAudience, viewer: ProfileViewer): boolean {
  if (viewer === "self") return true;
  if (audience === "public") return true;
  if (audience === "friends") return viewer === "friend";
  return false;
}

/**
 * Combines the account-level profile visibility with per-section audiences.
 * A `friends`/`private` account tightens every section; it never loosens one.
 */
export function effectiveSectionVisibility(
  accountVisibility: ProfileAudience,
  sections: ProfileSectionVisibility,
): ProfileSectionVisibility {
  const rank: Record<ProfileAudience, number> = { public: 0, friends: 1, private: 2 };
  const out = { ...sections };
  for (const key of PROFILE_SECTION_KEYS) {
    out[key] = rank[accountVisibility] > rank[out[key]] ? accountVisibility : out[key];
  }
  return out;
}

/** Section keys the viewer is NOT allowed to see. */
export function hiddenSectionsFor(
  accountVisibility: ProfileAudience,
  sections: ProfileSectionVisibility,
  viewer: ProfileViewer,
): ProfileSectionKey[] {
  const effective = effectiveSectionVisibility(accountVisibility, sections);
  return PROFILE_SECTION_KEYS.filter((key) => !canViewAudience(effective[key], viewer));
}
