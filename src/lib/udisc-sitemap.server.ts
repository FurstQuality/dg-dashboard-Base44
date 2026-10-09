/**
 * UDisc course discovery via their public sitemap.
 *
 * UDisc's on-site search renders client-side, so scraping `/search?q=` never
 * returned course links. The sitemap at `https://udisc.com/sitemap/courses.xml`
 * lists every public course URL (~20k) as `/courses/<slug>-<shortId>`, which is
 * both crawler-friendly (explicitly advertised in robots.txt) and enough to
 * resolve a course by name. We cache the parsed slug index in module memory for
 * the life of the server instance.
 */

const SITEMAP_URL = "https://udisc.com/sitemap/courses.xml";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export type UdiscSitemapEntry = {
  url: string;
  /** Full slug including the short id suffix. */
  slug: string;
  /** Tokenized slug words, minus the trailing short id. */
  tokens: string[];
};

let cache: { at: number; entries: UdiscSitemapEntry[] } | null = null;
let inflight: Promise<UdiscSitemapEntry[]> | null = null;

const STOP_WORDS = new Set([
  "disc",
  "golf",
  "course",
  "courses",
  "dgc",
  "the",
  "at",
  "of",
  "and",
  "park",
]);

export function tokenizeCourseName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1);
}

function parseSitemap(xml: string): UdiscSitemapEntry[] {
  const entries: UdiscSitemapEntry[] = [];
  const re = /<loc>(https:\/\/udisc\.com\/courses\/([^<]+))<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const url = m[1];
    const slug = m[2];
    if (slug.includes("/")) continue;
    const withoutShortId = slug.replace(/-[A-Za-z0-9]{2,6}$/, "");
    entries.push({ url, slug, tokens: tokenizeCourseName(withoutShortId) });
  }
  return entries;
}

export async function loadUdiscCourseIndex(): Promise<UdiscSitemapEntry[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch(SITEMAP_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
          Accept: "application/xml,text/xml",
        },
      });
      if (!res.ok) throw new Error(`UDisc sitemap fetch failed (${res.status})`);
      const entries = parseSitemap(await res.text());
      cache = { at: Date.now(), entries };
      return entries;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export type UdiscMatch = {
  url: string;
  slug: string;
  score: number;
};

/**
 * Rank sitemap slugs against a course name (and optional city) with token
 * overlap. Returns the best candidate plus runners-up so callers can verify
 * against the fetched page before trusting a low-confidence match.
 */
export async function findUdiscCourseUrls(
  courseName: string,
  city?: string | null,
  limit = 3,
): Promise<UdiscMatch[]> {
  const entries = await loadUdiscCourseIndex();
  const wanted = tokenizeCourseName(courseName);
  const strong = wanted.filter((w) => !STOP_WORDS.has(w));
  if (!wanted.length) return [];
  const cityTokens = city ? tokenizeCourseName(city) : [];

  const ranked: UdiscMatch[] = [];
  for (const entry of entries) {
    let score = 0;
    for (const token of wanted) {
      if (!entry.tokens.includes(token)) continue;
      score += STOP_WORDS.has(token) ? 2 : 12;
    }
    if (!strong.some((w) => entry.tokens.includes(w))) continue;
    // Penalize noisy slugs that carry many unrelated words.
    const extra = entry.tokens.filter((t) => !wanted.includes(t) && !STOP_WORDS.has(t)).length;
    score -= extra * 3;
    for (const token of cityTokens) if (entry.tokens.includes(token)) score += 5;
    if (score <= 0) continue;
    ranked.push({ url: entry.url, slug: entry.slug, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}
