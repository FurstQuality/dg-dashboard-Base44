/**
 * Disc Golf Scene profile URLs all hang off one base:
 *   https://www.discgolfscene.com/profile/235173          (about)
 *   https://www.discgolfscene.com/profile/235173/scores
 *   …/aces, …/achievements, …/series, …/friends, …/comments
 *
 * So a player only needs to give us the profile address once — every tab is
 * derived from it. Handle-style URLs (/players/<handle>) work the same way.
 */

export const SCENE_PROFILE_TABS = [
  "about",
  "scores",
  "aces",
  "achievements",
  "series",
  "friends",
  "comments",
] as const;

export type SceneProfileTab = (typeof SCENE_PROFILE_TABS)[number];

const HOST = "https://www.discgolfscene.com";

/**
 * Reduce any DGS profile address to its base, dropping a trailing tab segment,
 * query string or hash. Accepts a bare profile id ("235173") or handle.
 * Returns null when the input isn't a Disc Golf Scene profile address.
 */
export function sceneProfileBase(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // Bare numeric id → profile path.
  if (/^\d{2,9}$/.test(raw)) return `${HOST}/profile/${raw}`;

  let path = raw;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("www.") || raw.includes("discgolfscene.com")) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    if (!/(^|\.)discgolfscene\.com$/i.test(url.hostname)) return null;
    path = url.pathname;
  } else if (!raw.startsWith("/")) {
    // A bare handle such as "furst93".
    path = `/players/${raw}`;
  }

  const parts = path.split("/").filter(Boolean);
  const kindIndex = parts.findIndex((p) => p === "profile" || p === "players");
  if (kindIndex === -1) return null;
  const kind = parts[kindIndex];
  const slug = parts[kindIndex + 1];
  if (!slug) return null;

  return `${HOST}/${kind}/${slug}`;
}

/** All tab URLs for a profile address, or null when the address isn't usable. */
export function sceneProfileTabUrls(input: string): Record<SceneProfileTab, string> | null {
  const base = sceneProfileBase(input);
  if (!base) return null;
  return SCENE_PROFILE_TABS.reduce(
    (acc, tab) => {
      acc[tab] = tab === "about" ? base : `${base}/${tab}`;
      return acc;
    },
    {} as Record<SceneProfileTab, string>,
  );
}

/** Friendly label for each tab, used in the import UI. */
export const SCENE_TAB_LABELS: Record<SceneProfileTab, string> = {
  about: "Profile details",
  scores: "Round history",
  aces: "Aces",
  achievements: "Achievements",
  series: "Series & leagues",
  friends: "Friends",
  comments: "Comments",
};
