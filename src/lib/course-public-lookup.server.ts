/**
 * Server-only helpers that gather public course data (PDGA knowledgebase,
 * UDisc, Disc Golf Course Review) so the course builder can prefill a new
 * course instead of typing everything by hand.
 */

export type PublicCourseCandidate = {
  source: "pdga" | "udisc" | "dgcr";
  source_label: string;
  name: string;
  city: string | null;
  state: string | null;
  holes: number | null;
  par: number | null;
  distance_ft: number | null;
  latitude: number | null;
  longitude: number | null;
  designer: string | null;
  difficulty: string | null;
  description: string | null;
  url: string | null;
  confidence: number;
};

export type PublicCourseLookup = {
  candidates: PublicCourseCandidate[];
  notes: { source: "pdga" | "udisc" | "dgcr"; message: string }[];
};

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

/** UDisc course pages: pick the layout that best represents the course. */
function pickUdiscLayout(
  layouts: { name: string; holes: number | null; par: number | null; length_ft: number | null }[],
) {
  if (!layouts.length) return null;
  const withData = layouts.filter((l) => l.par || l.length_ft);
  const pool = withData.length ? withData : layouts;
  return pool.reduce((best, l) => ((l.holes ?? 0) > (best.holes ?? 0) ? l : best), pool[0]);
}

export async function gatherUdiscCandidate(
  name: string,
  city: string | null,
  state: string | null,
): Promise<{ candidate: PublicCourseCandidate | null; note: string | null }> {
  const { resolveUdiscForCourse } = await import("@/lib/course-auto-populate.server");
  const result = await resolveUdiscForCourse(name, state, city);
  if (result.status === "error") return { candidate: null, note: result.error ?? "UDisc lookup failed." };
  const course = result.status === "ok" ? result.course : null;
  if (!course) return { candidate: null, note: "No UDisc match found." };
  const layout = pickUdiscLayout(course.layouts ?? []);
  return {
    candidate: {
      source: "udisc",
      source_label: "UDisc",
      name: course.name,
      city: clean(course.city),
      state: clean(course.state),
      holes: layout?.holes ?? course.holes ?? null,
      par: layout?.par ?? null,
      distance_ft: layout?.length_ft ?? null,
      latitude: course.latitude ?? null,
      longitude: course.longitude ?? null,
      designer: clean(course.designer),
      difficulty: clean(course.difficulty),
      description: clean(course.description),
      url: course.url,
      confidence: result.confidence,
    },
    note: null,
  };
}

export async function gatherDgcrCandidate(
  name: string,
  city: string | null,
  state: string | null,
): Promise<{ candidate: PublicCourseCandidate | null; note: string | null }> {
  try {
    const { searchDgcrCourses, fetchDgcrCourse } = await import("@/lib/dgcr.server");
    const query = [name, city, state].filter(Boolean).join(" ");
    const hits = await searchDgcrCourses(query, 3);
    if (!hits.length) return { candidate: null, note: "No Disc Golf Course Review match found." };
    const record = await fetchDgcrCourse(hits[0].url);
    const par = record.pars.length
      ? record.pars.reduce((sum, p) => sum + (Number.isFinite(p) ? p : 0), 0)
      : null;
    return {
      candidate: {
        source: "dgcr",
        source_label: "Disc Golf Course Review",
        name: record.name,
        city: clean(record.city),
        state: clean(record.state),
        holes: record.hole_count ?? null,
        par: par && par > 0 ? par : null,
        distance_ft: record.length_max_ft ?? record.length_min_ft ?? null,
        latitude: record.latitude ?? null,
        longitude: record.longitude ?? null,
        designer: clean(record.designer),
        difficulty: clean(record.course_type),
        description: clean(record.description),
        url: record.url,
        confidence: 70,
      },
      note: null,
    };
  } catch (e) {
    return {
      candidate: null,
      note: e instanceof Error ? e.message : "Disc Golf Course Review lookup failed.",
    };
  }
}

export function mapPdgaKbRow(row: {
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number | null;
  latitude: number | null;
  longitude: number | null;
  designer: string | null;
  pdga_url: string | null;
}): PublicCourseCandidate {
  return {
    source: "pdga",
    source_label: "PDGA",
    name: row.name,
    city: clean(row.city),
    state: clean(row.state),
    holes: row.hole_count ?? null,
    par: null,
    distance_ft: null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    designer: clean(row.designer),
    difficulty: null,
    description: null,
    url: row.pdga_url ?? null,
    confidence: 80,
  };
}
