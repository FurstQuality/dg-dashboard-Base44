/**
 * Read-only UDisc event lookup. UDisc event pages embed a JSON-LD `Event`
 * payload (and, failing that, OpenGraph tags) with the name, dates, location
 * and description. Nothing is written to the database — the caller decides
 * what to fill into the setup wizard.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractAboutText } from "@/lib/event-about";

const Input = z.object({
  url: z
    .string()
    .url()
    .refine((u) => {
      try {
        return new URL(u).hostname.toLowerCase().replace(/^www\./, "") === "udisc.com";
      } catch {
        return false;
      }
    }, { message: "Paste a udisc.com event link" }),
});

export type UdiscEventParsed = {
  url: string;
  name: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  course_name: string | null;
  cover_url: string | null;
};

function stripTags(s: string) {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function meta(html: string, property: string): string | null {
  const rx = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(rx);
  return m ? stripTags(m[1]) : null;
}

/** Exported for tests: pull the event shape out of a UDisc event page. */
export function parseUdiscEventPage(html: string, url: string): UdiscEventParsed {
  const out: UdiscEventParsed = {
    url,
    name: null,
    description: null,
    start_date: null,
    end_date: null,
    location: null,
    city: null,
    state: null,
    course_name: null,
    cover_url: null,
  };

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    let json: unknown;
    try {
      json = JSON.parse(block[1]);
    } catch {
      continue;
    }
    const nodes = Array.isArray(json) ? json : [json];
    for (const raw of nodes) {
      const node = raw as Record<string, any>;
      const type = String(node?.["@type"] ?? "");
      if (!/event/i.test(type)) continue;
      out.name ??= typeof node.name === "string" ? stripTags(node.name) : null;
      out.description ??=
        typeof node.description === "string" ? stripTags(node.description) : null;
      out.start_date ??= isoDate(node.startDate);
      out.end_date ??= isoDate(node.endDate);
      const loc = node.location as Record<string, any> | undefined;
      if (loc) {
        if (typeof loc.name === "string") out.course_name ??= stripTags(loc.name);
        const addr = loc.address as Record<string, any> | string | undefined;
        if (typeof addr === "string") out.location ??= stripTags(addr);
        else if (addr) {
          out.city ??= typeof addr.addressLocality === "string" ? stripTags(addr.addressLocality) : null;
          out.state ??= typeof addr.addressRegion === "string" ? stripTags(addr.addressRegion) : null;
          const parts = [out.city, out.state].filter(Boolean);
          if (parts.length) out.location ??= parts.join(", ");
        }
      }
      const img = Array.isArray(node.image) ? node.image[0] : node.image;
      if (typeof img === "string") out.cover_url ??= img;
    }
  }

  out.name ??= meta(html, "og:title");
  // The page's own About copy beats the one-line share blurb in the meta tags.
  out.description = extractAboutText(html) ?? out.description
    ?? meta(html, "og:description") ?? meta(html, "description");
  out.cover_url ??= meta(html, "og:image");
  return out;
}

export const fetchUdiscEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }): Promise<UdiscEventParsed> => {
    const res = await fetch(data.url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error("That UDisc link redirects elsewhere — open it in a browser and copy the final URL.");
    }
    if (!res.ok) throw new Error(`Couldn't read that UDisc link (${res.status}).`);
    const parsed = parseUdiscEventPage(await res.text(), data.url);
    if (!parsed.name && !parsed.start_date) {
      throw new Error("Couldn't read event details from that link. Fill the fields in manually.");
    }
    return parsed;
  });
