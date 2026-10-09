/**
 * Links courses to their Disc Golf Scene listing. Scene tournament pages name
 * their venue's course page; when that venue sits within 2 km of exactly one
 * course with a matching name, the Scene listing is linked to that course.
 * Ambiguous or distant venues are left alone — never a guessed link.
 */
import { extractSceneCourseLink } from "@/lib/scene-parser";
import { nameMatchScore } from "./adapters";

const MAX_KM = 2;
const MIN_SCORE = 0.5;

export async function backfillSceneCourseLinks(limit = 25) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: done } = await supabaseAdmin
    .from("source_snapshots").select("external_id")
    .eq("source", "disc_golf_scene").eq("entity_type", "event_course_link").limit(5000);
  const seen = new Set((done ?? []).map((d) => d.external_id));
  const { data: events } = await supabaseAdmin
    .from("event_directory").select("source_event_id, url, latitude, longitude")
    .eq("source", "disc_golf_scene").not("latitude", "is", null)
    .order("start_date", { ascending: false }).limit(1500);
  const todo = (events ?? []).filter((e) => e.url && !seen.has(e.source_event_id)).slice(0, limit);

  let checked = 0, linked = 0, ambiguous = 0;
  for (const ev of todo) {
    checked++;
    let link: ReturnType<typeof extractSceneCourseLink> = null;
    try {
      const res = await fetch(ev.url as string, { headers: { "User-Agent": "Mozilla/5.0 (DG Dashboard course sync)" } });
      if (res.ok) link = extractSceneCourseLink(await res.text(), ev.url as string);
    } catch { /* recorded as checked below */ }

    let result = "no_course_link";
    if (link && ev.latitude != null && ev.longitude != null) {
      const dLat = MAX_KM / 111;
      const dLng = MAX_KM / (111 * Math.cos((ev.latitude * Math.PI) / 180));
      const { data: near } = await supabaseAdmin
        .from("courses").select("id, name")
        .eq("is_ghost", false).is("merged_into_course_id", null)
        .gte("latitude", ev.latitude - dLat).lte("latitude", ev.latitude + dLat)
        .gte("longitude", ev.longitude - dLng).lte("longitude", ev.longitude + dLng)
        .limit(40);
      const scored = (near ?? [])
        .map((c) => ({ id: c.id, score: nameMatchScore(c.name ?? "", link!.name ?? link!.slug) }))
        .filter((c) => c.score >= MIN_SCORE)
        .sort((a, b) => b.score - a.score);
      if (scored.length === 1 || (scored.length > 1 && scored[0].score - scored[1].score >= 0.25)) {
        const { data: existing } = await supabaseAdmin
          .from("course_sources").select("id").eq("source", "disc_golf_scene")
          .or(`course_id.eq.${scored[0].id},external_id.eq.${link.id}`).limit(1);
        if (!existing?.length) {
          await supabaseAdmin.from("course_sources").insert({
            course_id: scored[0].id, source: "disc_golf_scene", external_id: link.id,
            canonical_url: `https://www.discgolfscene.com/course/${link.id}/${link.slug}`,
            matched_name: link.name, confidence: Math.round(scored[0].score * 100) / 100,
          });
          linked++;
          result = "linked";
        } else result = "already_linked";
      } else if (scored.length > 1) {
        ambiguous++;
        result = "ambiguous";
      } else result = "no_nearby_match";
    }
    await supabaseAdmin.from("source_snapshots").insert({
      source: "disc_golf_scene", entity_type: "event_course_link", external_id: ev.source_event_id,
      source_url: ev.url, payload: { link, result } as never, parser_version: "scene-event-course-link@1",
      content_hash: `${ev.source_event_id}:${result}`,
    });
  }
  return { checked, linked, ambiguous };
}
