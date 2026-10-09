/**
 * Canonical builders for pdga.com deep-links. The PDGA event page is one URL
 * but different anchors surface different data (results, statistics, ratings,
 * registered players). Keeping the URL shapes in one place means every "View
 * on PDGA" affordance across the app opens the same, correct destination.
 *
 * Event ids stored in our schema are sometimes prefixed (e.g. `pdga:104158`)
 * because upstream feeds share a namespaced key. `sanitizeEventRef` strips the
 * prefix so links resolve — pdga.com only accepts the bare numeric id.
 */

const NUMERIC = /^\d+$/;

export function sanitizeEventRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const trimmed = String(ref).trim();
  if (!trimmed) return null;
  // Accept `pdga:12345`, `12345`, or a full URL — extract the id in each case.
  const colonMatch = trimmed.match(/^pdga:(\d+)$/i);
  if (colonMatch) return colonMatch[1];
  const urlMatch = trimmed.match(
    /pdga\.com\/(?:tour\/event|apps\/tournament\/live\/event\?eventId=)\/?(\d+)/i,
  );
  if (urlMatch) return urlMatch[1];
  if (NUMERIC.test(trimmed)) return trimmed;
  return null;
}

export function sanitizePlayerNumber(num: string | number | null | undefined): string | null {
  if (num == null) return null;
  const s = String(num).trim().replace(/^#/, "");
  return NUMERIC.test(s) ? s : null;
}

/* -------------------------------- Events --------------------------------- */

export function pdgaEventUrl(ref: string | null | undefined): string | null {
  const id = sanitizeEventRef(ref);
  return id ? `https://www.pdga.com/tour/event/${id}` : null;
}

export function pdgaEventResultsUrl(ref: string | null | undefined): string | null {
  const id = sanitizeEventRef(ref);
  return id ? `https://www.pdga.com/tour/event/${id}#Results` : null;
}

export function pdgaEventStatsUrl(ref: string | null | undefined): string | null {
  const id = sanitizeEventRef(ref);
  return id ? `https://www.pdga.com/tour/event/${id}#Statistics` : null;
}

/** Live/in-progress scoring for an in-flight tournament. */
export function pdgaLiveScoringUrl(ref: string | null | undefined): string | null {
  const id = sanitizeEventRef(ref);
  return id ? `https://www.pdga.com/apps/tournament/live/event?eventId=${id}` : null;
}

/** Registered players list (PDGA anchors this on the same event page). */
export function pdgaEventRegistrationUrl(ref: string | null | undefined): string | null {
  const id = sanitizeEventRef(ref);
  return id ? `https://www.pdga.com/tour/event/${id}#Registered_Players` : null;
}

/* -------------------------------- Players -------------------------------- */

export function pdgaPlayerUrl(num: string | number | null | undefined): string | null {
  const id = sanitizePlayerNumber(num);
  return id ? `https://www.pdga.com/player/${id}` : null;
}

export function pdgaPlayerStatsUrl(num: string | number | null | undefined): string | null {
  const id = sanitizePlayerNumber(num);
  return id ? `https://www.pdga.com/player/${id}/stats` : null;
}

export function pdgaPlayerRatingsUrl(num: string | number | null | undefined): string | null {
  const id = sanitizePlayerNumber(num);
  return id ? `https://www.pdga.com/player/${id}/details` : null;
}

export function pdgaPlayerHistoryUrl(num: string | number | null | undefined): string | null {
  const id = sanitizePlayerNumber(num);
  return id ? `https://www.pdga.com/player/${id}/history` : null;
}

/** Ranked list of every event a player has entered, useful for tracker sync. */
export function pdgaPlayerCareerUrl(num: string | number | null | undefined): string | null {
  const id = sanitizePlayerNumber(num);
  return id ? `https://www.pdga.com/player/${id}/career-events` : null;
}
