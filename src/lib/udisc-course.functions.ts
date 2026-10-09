/**
 * Fetch and parse a UDisc course page. UDisc surfaces the richest public
 * course metadata anywhere online — layout list with per-layout par and
 * length in feet, elevation profile, estimated round time, awards — which
 * complements PDGA (ratings) and Disc Golf Scene (registration) data.
 *
 * This is a read-only server function: it just fetches the URL and returns
 * the parsed shape. Nothing is written to the database. The caller decides
 * what to store or display.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { parseUdiscCoursePage, type UdiscCourseParsed } from "@/lib/scene-parser";
import { assertAllowedFetchUrl } from "@/lib/safe-fetch-url";

const Input = z.object({
  // Hostname is parsed and allowlisted (never substring-matched) so this
  // importer can't be used as an SSRF proxy to internal addresses.
  url: z
    .string()
    .url()
    .refine(
      (u) => {
        try {
          assertAllowedFetchUrl(u, ["udisc.com"], "Paste a udisc.com/courses/... URL");
          return /^\/courses\//i.test(new URL(u).pathname);
        } catch {
          return false;
        }
      },
      { message: "Paste a udisc.com/courses/... URL" },
    ),
});

export async function fetchUdiscHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DGDashboard/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`UDisc fetch failed (${res.status})`);
  return await res.text();
}

/**
 * Best-effort UDisc course discovery by name. UDisc's public search UI
 * `https://udisc.com/search?q=...` returns HTML with course result cards
 * that link to `/courses/<slug>-<shortId>`. We rank matches by name overlap
 * and (when available) state.
 */
export async function searchUdiscCourse(
  courseName: string,
  state?: string | null,
): Promise<{ url: string; slug: string; label: string } | null> {
  const q = encodeURIComponent(courseName.trim());
  if (!q) return null;
  const searchUrl = `https://udisc.com/search?q=${q}`;
  let html: string;
  try {
    html = await fetchUdiscHtml(searchUrl);
  } catch {
    return null;
  }
  const hits = new Map<string, { label: string; score: number }>();
  const rx = /<a[^>]+href="(\/courses\/[^"?#]+)"[^>]*>([\s\S]{0,400}?)<\/a>/gi;
  const nameLower = courseName.toLowerCase();
  const stateLower = (state ?? "").toLowerCase();
  let m: RegExpExecArray | null;
  while ((m = rx.exec(html))) {
    const href = m[1];
    if (/\/courses\/[^/]+\/(?:photos|tee-times|passes|v2|reviews)/i.test(href)) continue;
    const text = m[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!text) continue;
    let score = 0;
    if (text.includes(nameLower)) score += 40;
    for (const w of nameLower.split(/\s+/)) if (w.length > 2 && text.includes(w)) score += 6;
    if (stateLower && text.includes(stateLower)) score += 15;
    const prev = hits.get(href);
    if (!prev || prev.score < score) hits.set(href, { label: text.slice(0, 120), score });
  }
  const ranked = [...hits.entries()].sort((a, b) => b[1].score - a[1].score);
  const top = ranked[0];
  if (!top || top[1].score < 25) return null;
  const path = top[0];
  const slug = path.replace(/^\/courses\//, "");
  return {
    url: `https://udisc.com${path}`,
    slug,
    label: top[1].label,
  };
}

export type UdiscCourseLookup = {
  url: string;
  course: UdiscCourseParsed | null;
  error?: string;
};

export const fetchUdiscCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }): Promise<UdiscCourseLookup> => {
    // Normalize: strip anything past /courses/<slug> so the /details, /reviews,
    // /photos, or /v2/layouts sub-pages all resolve to the same course page.
    // Rebuilt from the parsed, allowlisted URL — never from the raw string.
    const parsed = new URL(data.url);
    const slug = parsed.pathname.split("/").filter(Boolean)[1] ?? "";
    if (!slug) throw new Error("Paste a udisc.com/courses/... URL");
    const canonical = `https://${parsed.hostname}/courses/${slug}`;
    try {
      const html = await fetchUdiscHtml(canonical);
      const course = parseUdiscCoursePage(html, canonical);
      if (!course || !course.layouts.length) {
        return {
          url: canonical,
          course,
          error: course ? undefined : "Could not parse UDisc course page.",
        };
      }
      return { url: canonical, course };
    } catch (e) {
      return {
        url: canonical,
        course: null,
        error: e instanceof Error ? e.message : "UDisc fetch failed.",
      };
    }
  });
