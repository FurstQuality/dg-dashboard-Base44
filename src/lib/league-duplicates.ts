/**
 * Same league, three listings.
 *
 * A local league is usually posted on PDGA (once it is sanctioned), on UDisc,
 * and sometimes on Disc Golf Scene. Every mirror lands in the directory
 * separately, so the same Tuesday night used to appear two or three times on
 * one day. This collapses those mirrors into a single night and keeps a link to
 * each source, filling in details (venue, coordinates, end date) from whichever
 * listing published them.
 */

export type MirrorSource = "pdga" | "disc_golf_scene" | "udisc" | "chainlink";

export type MirrorListing = {
  id: string;
  name: string;
  source: MirrorSource;
  url: string | null;
  start_date: string;
  end_date: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
};

/** Which listing wins when two describe the same night. Sanctioned first. */
const SOURCE_RANK: Record<MirrorSource, number> = {
  chainlink: 0,
  pdga: 1,
  disc_golf_scene: 2,
  udisc: 3,
};

/** Every source a merged night was found on, with its link. */
export type MirrorRef = { source: MirrorSource; url: string | null };

export type MergedListing<T extends MirrorListing> = T & {
  /** Primary source first, then the other places this night is posted. */
  sources: MirrorRef[];
};

/**
 * Strips the wording that differs between mirrors of the same league: session
 * and week markers, dates, years, tier codes, and the site's own branding.
 */
export function leagueMatchKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, " ")
    .replace(/\b(pdga|udisc|disc\s*golf\s*scene|dgs)\b/g, " ")
    .replace(/\b(week|wk|round|rd|night|day|event)\s*#?\d+\b/g, " ")
    .replace(/#\d+/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(spring|summer|fall|autumn|winter)\b/g, " ")
    .replace(/\b(session|series|league|leagues|presented\s+by)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Two names describe the same league when one reads as the other. */
function sameLeague(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 8 && long.includes(short);
}

/** Same place when the state matches and the city or venue agrees. */
function samePlace(a: MirrorListing, b: MirrorListing): boolean {
  const state = (x: MirrorListing) => (x.state ?? "").trim().toUpperCase();
  if (state(a) && state(b) && state(a) !== state(b)) return false;
  const city = (x: MirrorListing) => (x.city ?? "").trim().toLowerCase();
  if (city(a) && city(b)) return city(a) === city(b);
  // One mirror often omits the city; the state plus the same league name is
  // enough at that point, and a nearby venue name seals it.
  const venue = (x: MirrorListing) => (x.venue_name ?? "").trim().toLowerCase();
  if (venue(a) && venue(b))
    return venue(a) === venue(b) || leagueMatchKey(venue(a)) === leagueMatchKey(venue(b));
  return true;
}

/** True when the two listings cover the same calendar day or overlap. */
function datesTouch(a: MirrorListing, b: MirrorListing): boolean {
  const startA = a.start_date;
  const endA = a.end_date ?? a.start_date;
  const startB = b.start_date;
  const endB = b.end_date ?? b.start_date;
  return startA <= endB && startB <= endA;
}

function pickString(a: string | null, b: string | null): string | null {
  return a && a.trim() ? a : b;
}

/**
 * Merges mirrors of the same league night. Order is preserved: each merged row
 * keeps the position of its best-ranked listing.
 */
export function mergeLeagueMirrors<T extends MirrorListing>(rows: T[]): MergedListing<T>[] {
  const groups: Array<{ best: T; refs: MirrorRef[]; keys: string[] }> = [];

  for (const row of rows) {
    const key = leagueMatchKey(row.name);
    const group = groups.find(
      (g) =>
        g.keys.some((k) => sameLeague(k, key)) && samePlace(g.best, row) && datesTouch(g.best, row),
    );
    if (!group) {
      groups.push({ best: row, refs: [{ source: row.source, url: row.url }], keys: [key] });
      continue;
    }
    group.keys.push(key);
    if (!group.refs.some((r) => r.source === row.source)) {
      group.refs.push({ source: row.source, url: row.url });
    }
    // Keep the higher-ranked listing as the row that gets shown, then top up
    // any detail it is missing from the other mirror.
    const winner = SOURCE_RANK[row.source] < SOURCE_RANK[group.best.source] ? row : group.best;
    const other = winner === row ? group.best : row;
    group.best = {
      ...winner,
      url: pickString(winner.url, other.url),
      end_date: winner.end_date ?? other.end_date,
      venue_name: pickString(winner.venue_name, other.venue_name),
      city: pickString(winner.city, other.city),
      state: pickString(winner.state, other.state),
      latitude: winner.latitude ?? other.latitude,
      longitude: winner.longitude ?? other.longitude,
    };
  }

  return groups.map((g) => ({
    ...g.best,
    sources: [
      ...g.refs.filter((r) => r.source === g.best.source),
      ...g.refs.filter((r) => r.source !== g.best.source),
    ].sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]),
  }));
}

/**
 * Directory-wide version of the merge above: the same event posted by two
 * sources on the same date becomes one entry. Used by the events directory,
 * where rows are already normalized to a title/date/location shape.
 */
export type DirectoryLike = {
  id: string;
  source: string;
  title: string;
  start_date: string | null;
  location: string | null;
  external_url?: string | null;
};

const DIRECTORY_RANK: Record<string, number> = {
  chainlink: 0,
  pdga: 1,
  scene: 2,
  disc_golf_scene: 2,
  udisc: 3,
};

function rankOf(source: string): number {
  return DIRECTORY_RANK[source] ?? 9;
}

/** Rough place key: the city/state tail of a location string. */
function placeKey(location: string | null): string {
  if (!location) return "";
  const parts = location.split(",").map((p) => p.trim().toLowerCase());
  return parts.slice(-2).join(", ");
}

export function mergeDirectoryDuplicates<T extends DirectoryLike>(
  rows: T[],
): Array<T & { alsoOn: string[] }> {
  const groups: Array<{ best: T; sources: string[]; key: string; place: string; date: string }> =
    [];
  for (const row of rows) {
    const key = leagueMatchKey(row.title);
    const place = placeKey(row.location);
    const date = row.start_date ?? "";
    const group =
      key.length >= 8
        ? groups.find(
            (g) =>
              g.date === date &&
              sameLeague(g.key, key) &&
              (!g.place || !place || g.place === place),
          )
        : undefined;
    if (!group) {
      groups.push({ best: row, sources: [row.source], key, place, date });
      continue;
    }
    if (!group.sources.includes(row.source)) group.sources.push(row.source);
    if (rankOf(row.source) < rankOf(group.best.source)) {
      group.best = { ...row, external_url: row.external_url ?? group.best.external_url };
      group.key = key;
      group.place = place || group.place;
    }
  }
  return groups.map((g) => ({
    ...g.best,
    alsoOn: g.sources.filter((s) => s !== g.best.source),
  }));
}
