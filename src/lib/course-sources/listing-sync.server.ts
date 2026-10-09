/**
 * Bounded background pass: re-reads linked course listings through the shared
 * adapters, keeps an immutable snapshot, records field observations, and fills
 * unconfirmed default-layout par from listing hole data (labelled by source).
 */
import { adapterFor, planParFill } from "./adapters";
import { recordObservation, recordSnapshot } from "@/lib/data-intel/snapshots.server";

const REFRESH_DAYS = 30;

export async function syncCourseListings(limit = 40) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stale = new Date(Date.now() - REFRESH_DAYS * 864e5).toISOString();
  // Failed reads retry after a day instead of waiting for the monthly refresh.
  const retry = new Date(Date.now() - 864e5).toISOString();
  const { data: links, error } = await supabaseAdmin
    .from("course_sources")
    .select("id, course_id, source, canonical_url, last_fetched_at")
    .in("source", ["udisc", "disc_golf_scene"])
    .not("canonical_url", "is", null)
    .or(`last_fetched_at.is.null,last_fetched_at.lt.${stale},and(last_error.not.is.null,last_fetched_at.lt.${retry})`)
    .order("last_fetched_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) return { checked: 0, parsed: 0, parFilled: 0, draftLayouts: 0, failed: 0, error: "query failed" };
  return syncLinks(links ?? []);
}

type LinkRow = { id: string; course_id: string; source: string; canonical_url: string | null };

/** Re-read specific listing links now (used by the pass and by Repair). */
export async function syncLinks(links: LinkRow[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let draftLayouts = 0;
  let checked = 0, parsed = 0, parFilled = 0, failed = 0;
  const queue = [...links];
  const worker = async () => {
    for (let link = queue.shift(); link; link = queue.shift()) {
      const url = link.canonical_url as string;
      const adapter = adapterFor(url);
      const now = new Date().toISOString();
      if (!adapter) {
        await supabaseAdmin.from("course_sources").update({ last_fetched_at: now, last_error: "unsupported url" }).eq("id", link.id);
        continue;
      }
      checked++;
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (DG Dashboard course sync)" } });
        if (!res.ok) throw new Error(`http ${res.status}`);
        const listing = adapter.parse(await res.text(), url);
        if (!listing) throw new Error("parse failed");
        parsed++;
        const snapshotId = await recordSnapshot({
          source: adapter.source, entityType: "course", externalId: listing.externalId,
          sourceUrl: url, payload: listing, parserVersion: adapter.parserVersion,
        });
        const obs = (field: string, value: unknown) =>
          value == null || (Array.isArray(value) && !value.length)
            ? Promise.resolve()
            : recordObservation({
                entityType: "course", entityId: link.course_id, field, source: adapter.source,
                value, snapshotId, parserVersion: adapter.parserVersion,
              });
        await Promise.all([
          obs("name", listing.name),
          obs("hole_count", listing.holeCount),
          obs("layouts", listing.layouts),
          obs("hole_pars", listing.holes.length ? listing.holes : null),
        ]);

        if (listing.holes.length) {
          const { data: layout } = await supabaseAdmin
            .from("course_layouts").select("id").eq("course_id", link.course_id).eq("is_default", true).maybeSingle();
          if (layout) {
            const { data: holes } = await supabaseAdmin
              .from("holes").select("id, number, par_confirmed, par_source").eq("layout_id", layout.id);
            const fills = planParFill(holes ?? [], listing.holes);
            const tag = adapter.source === "udisc" ? "udisc_listing" : "disc_golf_scene_listing";
            for (const f of fills) {
              await supabaseAdmin.from("holes").update({ par: f.par, par_source: tag })
                .eq("id", f.id).eq("par_confirmed", false).is("par_source", null);
            }
            parFilled += fills.length;
          }
        }
        draftLayouts += await createDraftLayouts(link.course_id, listing.layouts, adapter.source);
        await supabaseAdmin.from("course_sources").update({ last_fetched_at: now, last_error: null }).eq("id", link.id);
      } catch (e) {
        failed++;
        await supabaseAdmin.from("course_sources")
          .update({ last_fetched_at: now, last_error: String((e as Error).message).slice(0, 120) }).eq("id", link.id);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { checked, parsed, parFilled, draftLayouts, failed };
}

/**
 * When a listing names two or more layouts, any the course doesn't have yet
 * become draft layouts (name, hole count, par, length) for a steward to map.
 * Drafts never show for scoring until someone builds and publishes them.
 */
async function createDraftLayouts(
  courseId: string,
  layouts: { name: string; holes: number | null; par: number | null; length_ft: number | null }[],
  source: string,
): Promise<number> {
  if (layouts.length < 2) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin.from("course_layouts").select("name").eq("course_id", courseId);
  const have = new Set((existing ?? []).map((l) => (l.name ?? "").trim().toLowerCase()));
  const label = source === "udisc" ? "UDisc" : "Disc Golf Scene";
  const rows = layouts
    .filter((l) => l.name && !have.has(l.name.trim().toLowerCase()))
    .slice(0, 12)
    .map((l) => ({
      course_id: courseId,
      name: l.name.trim().slice(0, 80),
      hole_count: l.holes ?? 0,
      par_total: l.par,
      distance_total: l.length_ft,
      status: "draft",
      is_default: false,
      design_summary: `From the ${label} listing. Holes still need to be built and mapped.`,
    }));
  if (!rows.length) return 0;
  const { error } = await supabaseAdmin.from("course_layouts").insert(rows as never);
  return error ? 0 : rows.length;
}

/** Admin repair for one course: re-read its listings, then upgrade its pin. */
export async function repairCourse(courseId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: links } = await supabaseAdmin
    .from("course_sources").select("id, course_id, source, canonical_url")
    .eq("course_id", courseId).in("source", ["udisc", "disc_golf_scene"]).not("canonical_url", "is", null);
  const listings = await syncLinks(links ?? []);
  const { upgradeCoursePin } = await import("@/lib/course-pin-upgrade.server");
  const pin = await upgradeCoursePin(courseId);
  return { ...listings, pin };
}
