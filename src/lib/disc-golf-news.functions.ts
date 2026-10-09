import { createServerFn } from "@tanstack/react-start";
import { XMLParser } from "fast-xml-parser";

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  thumbnail: string | null;
  publishedAt: string;
  kind: "article" | "video";
  summary: string | null;
};

type Source = {
  name: string;
  url: string;
  kind: "article" | "video";
};

// Public RSS feeds — no keys required. YouTube channel feeds are the safest
// video source; article feeds cover the major disc golf outlets.
const SOURCES: Source[] = [
  { name: "Ultiworld Disc Golf", url: "https://discgolf.ultiworld.com/feed/", kind: "article" },
  { name: "PDGA", url: "https://www.pdga.com/news/rss.xml", kind: "article" },
  { name: "Disc Golf Pro Tour", url: "https://www.dgpt.com/feed/", kind: "article" },
  // JomezPro (post-round coverage)
  {
    name: "JomezPro",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCmGyCEbHfY91NFwHgioNLMQ",
    kind: "video",
  },
  // Central Coast Disc Golf
  {
    name: "Central Coast Disc Golf",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCy1Rr-GkiL8vlPApKsw6SuA",
    kind: "video",
  },
  // Disc Golf Pro Tour (official)
  {
    name: "Disc Golf Pro Tour",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCw0WzNn6m2Na6ZW7rKqWI3g",
    kind: "video",
  },
  // SmashBoxxTV
  {
    name: "SmashBoxxTV",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UC_foEGzIXdjzVw1rSxAlKCA",
    kind: "video",
  },
  // IDGT
  {
    name: "IDGT",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCSbDx6O2RhJxIBklAI94_Eg",
    kind: "video",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
});

function firstString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"] as string;
    if (typeof obj.href === "string") return obj.href as string;
    if (typeof obj.url === "string") return obj.url as string;
  }
  return "";
}

function stripHtml(s: string, max = 240): string {
  const clean = s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

function parseFeed(xml: string, src: Source): NewsItem[] {
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }

  const items: NewsItem[] = [];

  // RSS 2.0
  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    const list = Array.isArray(rssItems) ? rssItems : [rssItems];
    for (const it of list) {
      const title = firstString(it.title);
      const link = firstString(it.link);
      const date =
        firstString(it.pubDate) || firstString(it["dc:date"]) || new Date().toISOString();
      const summary = stripHtml(
        firstString(it.description) || firstString(it["content:encoded"]) || "",
      );
      let thumb: string | null = null;
      const media = it["media:thumbnail"] ?? it["media:content"] ?? it.enclosure;
      if (media) {
        const m = Array.isArray(media) ? media[0] : media;
        thumb = firstString(m) || null;
      }
      if (!thumb) {
        const body = firstString(it["content:encoded"]) || firstString(it.description) || "";
        const m = body.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) thumb = m[1];
      }
      if (title && link) {
        items.push({
          id: `${src.name}:${link}`,
          title,
          url: link,
          source: src.name,
          thumbnail: thumb,
          publishedAt: new Date(date).toISOString(),
          kind: src.kind,
          summary: summary || null,
        });
      }
    }
    return items;
  }

  // Atom (YouTube)
  const entries = doc?.feed?.entry;
  if (entries) {
    const list = Array.isArray(entries) ? entries : [entries];
    for (const e of list) {
      const title = firstString(e.title);
      const linkNode = e.link;
      let link = "";
      if (Array.isArray(linkNode)) {
        const alt = linkNode.find((l: any) => l.rel === "alternate") ?? linkNode[0];
        link = firstString(alt);
      } else {
        link = firstString(linkNode);
      }
      const date = firstString(e.published) || firstString(e.updated) || new Date().toISOString();
      const group = e["media:group"];
      let thumb: string | null = null;
      let summary: string | null = null;
      if (group) {
        const t = group["media:thumbnail"];
        if (t) thumb = firstString(Array.isArray(t) ? t[0] : t);
        const d = group["media:description"];
        if (d) summary = stripHtml(firstString(d));
      }
      if (title && link) {
        items.push({
          id: `${src.name}:${link}`,
          title,
          url: link,
          source: src.name,
          thumbnail: thumb,
          publishedAt: new Date(date).toISOString(),
          kind: src.kind,
          summary,
        });
      }
    }
  }
  return items;
}

const UAS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

async function fetchOnce(url: string, ua: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": ua,
        Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchSource(src: Source): Promise<NewsItem[]> {
  // YouTube feeds occasionally 429/403 from Worker egress. Retry with rotating UAs.
  for (const ua of UAS) {
    const xml = await fetchOnce(src.url, ua, 8000);
    if (xml) {
      const items = parseFeed(xml, src);
      if (items.length > 0) return items.slice(0, 8);
    }
  }
  return [];
}

async function isVideoPlayable(url: string): Promise<boolean> {
  // Use YouTube oEmbed to confirm the video is public and playable.
  // Non-2xx means removed / private / age-restricted / geo-blocked — drop it.
  try {
    const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const res = await fetch(oembed, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

export const getDiscGolfNews = createServerFn({ method: "GET" }).handler(async () => {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const merged = results.flat();
  merged.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  // Validate video links so only live, playable videos ship to the client.
  const videoCandidates = merged.filter((i) => i.kind === "video").slice(0, 24);
  const articles = merged.filter((i) => i.kind === "article");
  const playable = await Promise.all(
    videoCandidates.map(async (i) => ((await isVideoPlayable(i.url)) ? i : null)),
  );
  const liveVideos = playable.filter((i): i is NewsItem => i !== null);

  // Re-merge and sort so ordering by recency is preserved.
  const out = [...articles, ...liveVideos].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
  return out.slice(0, 40);
});
