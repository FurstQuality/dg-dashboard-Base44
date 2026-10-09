/**
 * Bidirectional PDGA ↔ Disc Golf Scene link resolver.
 *
 * Every PDGA-sanctioned event has a matching Disc Golf Scene tournament page,
 * and every DGS tournament links to a DGS course page which carries the
 * richest venue metadata (holes, par, length, layouts, city/state). Tying
 * these together lets the analyzer and event views show the full picture
 * without asking the user to hunt for the correct URLs.
 *
 * Resolutions are cached in pdga_dgs_links (event_ref pk) so we only pay the
 * scrape cost once per event.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertAllowedFetchUrl } from "@/lib/safe-fetch-url";
import {
  extractPdgaEventRefFromScene,
  extractSceneCourseLink,
  extractSceneEventLink,
  parseSceneCoursePage,
  parseSceneSchedule,
  type SceneCourseParsed,
  type SceneScheduleEntry,
} from "@/lib/scene-parser";

const UA = "Mozilla/5.0 (compatible; DGDashboard/1.0)";

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractSceneTitle(html: string): string | null {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i);
  if (og) return og[1].replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "").trim();
  const t = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) return t[1].replace(/\s*[·|-]\s*Disc Golf Scene\s*$/i, "").trim();
  return null;
}

function extractPdgaEventName(html: string): string | null {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!h1) return null;
  return (
    h1[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

export type PdgaDgsResolution = {
  event_ref: string | null;
  pdga_event_name: string | null;
  pdga_event_url: string | null;
  dgs_event_url: string | null;
  dgs_event_slug: string | null;
  dgs_event_title: string | null;
  dgs_course_url: string | null;
  dgs_course_id: string | null;
  dgs_course_slug: string | null;
  dgs_course_name: string | null;
  dgs_course: SceneCourseParsed | null;
  /** Round/day schedule published on the DGS tournament details page. */
  dgs_schedule: SceneScheduleEntry[];
  source: "cache" | "resolved" | "partial" | "none";
};

const Input = z
  .object({
    eventRef: z.string().min(1).optional(),
    dgsUrl: z.string().url().optional(),
  })
  .refine((v) => v.eventRef || v.dgsUrl, {
    message: "Provide eventRef or dgsUrl",
  });

/** DGS slugs end in the event year (e.g. ..._2026) — use it to date schedule rows. */
function yearHintFromSlug(slug: string | null | undefined): number | null {
  const m = (slug ?? "").match(/(20\d{2})$/);
  return m ? Number(m[1]) : null;
}

function sanitizeRef(ref: string): string | null {
  const trimmed = ref.trim().replace(/^pdga:/i, "");
  if (/^\d+$/.test(trimmed)) return trimmed;
  const urlMatch = trimmed.match(
    /pdga\.com\/(?:tour\/event|live\/event|apps\/tournament\/live\/event\?eventId=)\/?(\d+)/i,
  );
  return urlMatch ? urlMatch[1] : null;
}

export const resolvePdgaDgsLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw) => Input.parse(raw))
  .handler(async ({ data }) => {
    const eventRef = data.eventRef ? sanitizeRef(data.eventRef) : null;
    // Only Disc Golf Scene links may be fetched server-side (blocks SSRF).
    const dgsUrl = data.dgsUrl
      ? assertAllowedFetchUrl(
          data.dgsUrl,
          ["discgolfscene.com"],
          "Only Disc Golf Scene links are supported",
        )
      : null;

    // 1) Cache hit by event_ref
    if (eventRef) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: cached } = await supabaseAdmin
        .from("pdga_dgs_links")
        .select("*")
        .eq("event_ref", eventRef)
        .maybeSingle();
      if (cached && cached.dgs_event_url) {
        // Fetch course details fresh (not cached in full) — cheap single GET.
        let course: SceneCourseParsed | null = null;
        if (cached.dgs_course_url) {
          const chtml = await fetchHtml(cached.dgs_course_url);
          if (chtml) course = parseSceneCoursePage(chtml, cached.dgs_course_url);
        }
        // Schedule lives only on the DGS tournament details page, so re-read it
        // (cheap single GET) instead of caching times that TDs still edit.
        let schedule: SceneScheduleEntry[] = [];
        const ehtml = await fetchHtml(cached.dgs_event_url);
        if (ehtml) schedule = parseSceneSchedule(ehtml, yearHintFromSlug(cached.dgs_event_slug));
        return {
          event_ref: eventRef,
          pdga_event_name: null,
          pdga_event_url: `https://www.pdga.com/tour/event/${eventRef}`,
          dgs_event_url: cached.dgs_event_url,
          dgs_event_slug: cached.dgs_event_slug,
          dgs_event_title: null,
          dgs_course_url: cached.dgs_course_url,
          dgs_course_id: cached.dgs_course_id,
          dgs_course_slug: cached.dgs_course_slug,
          dgs_course_name: cached.dgs_course_name,
          dgs_course: course,
          dgs_schedule: schedule,
          source: "cache",
        } satisfies PdgaDgsResolution;
      }
    }

    // 2) Resolve
    let resolvedRef = eventRef;
    let pdgaEventName: string | null = null;
    let dgsEventUrl: string | null = null;
    let dgsEventSlug: string | null = null;
    let dgsEventTitle: string | null = null;
    let sceneHtml: string | null = null;
    let dgsSchedule: SceneScheduleEntry[] = [];

    if (eventRef) {
      const pdgaHtml = await fetchHtml(`https://www.pdga.com/tour/event/${eventRef}`);
      if (pdgaHtml) {
        pdgaEventName = extractPdgaEventName(pdgaHtml);
        const sceneLink = extractSceneEventLink(pdgaHtml);
        if (sceneLink) {
          dgsEventUrl = sceneLink.url;
          dgsEventSlug = sceneLink.slug;
        }
      }
    }

    if (!dgsEventUrl && dgsUrl) {
      dgsEventUrl = dgsUrl;
      const slugMatch = dgsUrl.match(/discgolfscene\.com\/tournaments?\/([A-Za-z0-9_\-]+)/i);
      dgsEventSlug = slugMatch ? slugMatch[1] : null;
    }

    if (dgsEventUrl) {
      sceneHtml = await fetchHtml(dgsEventUrl);
      if (sceneHtml) {
        dgsEventTitle = extractSceneTitle(sceneHtml);
        dgsSchedule = parseSceneSchedule(sceneHtml, yearHintFromSlug(dgsEventSlug));
        if (!resolvedRef) {
          const refFromScene = extractPdgaEventRefFromScene(sceneHtml);
          if (refFromScene) resolvedRef = refFromScene;
        }
      }
    }

    let dgsCourse: SceneCourseParsed | null = null;
    let dgsCourseUrl: string | null = null;
    let dgsCourseId: string | null = null;
    let dgsCourseSlug: string | null = null;
    let dgsCourseName: string | null = null;
    if (sceneHtml && dgsEventUrl) {
      const link = extractSceneCourseLink(sceneHtml, dgsEventUrl);
      if (link) {
        dgsCourseUrl = link.url;
        dgsCourseId = link.id;
        dgsCourseSlug = link.slug;
        dgsCourseName = link.name;
        const chtml = await fetchHtml(link.url);
        if (chtml) dgsCourse = parseSceneCoursePage(chtml, link.url);
        if (dgsCourse) dgsCourseName = dgsCourse.name;
      }
    }

    // 3) Cache result (upsert) when we have an event ref + at least the DGS event url
    if (resolvedRef && dgsEventUrl) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("pdga_dgs_links").upsert(
        {
          event_ref: resolvedRef,
          dgs_event_url: dgsEventUrl,
          dgs_event_slug: dgsEventSlug,
          dgs_course_url: dgsCourseUrl,
          dgs_course_id: dgsCourseId,
          dgs_course_slug: dgsCourseSlug,
          dgs_course_name: dgsCourseName,
          resolved_at: new Date().toISOString(),
        },
        { onConflict: "event_ref" },
      );
    }

    const source: PdgaDgsResolution["source"] = dgsEventUrl
      ? dgsCourseUrl
        ? "resolved"
        : "partial"
      : "none";

    return {
      event_ref: resolvedRef,
      pdga_event_name: pdgaEventName,
      pdga_event_url: resolvedRef ? `https://www.pdga.com/tour/event/${resolvedRef}` : null,
      dgs_event_url: dgsEventUrl,
      dgs_event_slug: dgsEventSlug,
      dgs_event_title: dgsEventTitle,
      dgs_course_url: dgsCourseUrl,
      dgs_course_id: dgsCourseId,
      dgs_course_slug: dgsCourseSlug,
      dgs_course_name: dgsCourseName,
      dgs_course: dgsCourse,
      dgs_schedule: dgsSchedule,
      source,
    } satisfies PdgaDgsResolution;
  });
