/**
 * Matching a freshly exported UDisc row against UDisc records we already hold.
 * A new export is an enrichment source: confident matches add evidence to the
 * existing record, uncertain ones are held back so no duplicate is created.
 */
export type MergeConfidence = "EXACT" | "HIGH_CONFIDENCE" | "POSSIBLE" | "UNMATCHED";

export type UdiscRecordKey = {
  played_on: string;
  course_name: string | null;
  layout_name: string | null;
  score: number | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function matchUdiscRecord<T extends UdiscRecordKey>(
  row: UdiscRecordKey,
  existing: T[],
): { confidence: MergeConfidence; match: T | null } {
  const sameDayCourse = existing.filter(
    (e) => e.played_on === row.played_on && norm(e.course_name) === norm(row.course_name),
  );
  if (!sameDayCourse.length) return { confidence: "UNMATCHED", match: null };
  const exact = sameDayCourse.filter((e) => norm(e.layout_name) === norm(row.layout_name) && e.score === row.score);
  if (exact.length === 1) return { confidence: "EXACT", match: exact[0]! };
  if (exact.length > 1) return { confidence: "POSSIBLE", match: null };
  // Layout missing on one side, score identical, single candidate.
  const high = sameDayCourse.filter(
    (e) => e.score === row.score && row.score != null && (!norm(e.layout_name) || !norm(row.layout_name)),
  );
  if (high.length === 1) return { confidence: "HIGH_CONFIDENCE", match: high[0]! };
  if (high.length > 1) return { confidence: "POSSIBLE", match: null };
  // Same day and course but a different score/layout is a different round.
  return { confidence: "UNMATCHED", match: null };
}

export type EnrichableFields = {
  round_format_class?: string | null;
  participant_count?: number | null;
  participant_count_source?: string | null;
  event_context?: string | null;
  rating_exclusion_reason?: string | null;
  round_rating?: number | null;
};

/**
 * Patch for an existing record. Known values are never replaced by unknown
 * ones, and a stored native UDisc rating is never overwritten.
 */
export function enrichmentPatch(prev: EnrichableFields, next: EnrichableFields): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const prevUnknown = !prev.round_format_class || prev.round_format_class === "UNKNOWN_FORMAT";
  if (prevUnknown && next.round_format_class && next.round_format_class !== "UNKNOWN_FORMAT") {
    patch.round_format_class = next.round_format_class;
    patch.participant_count = next.participant_count ?? null;
    patch.participant_count_source = next.participant_count_source ?? "UNKNOWN";
    patch.event_context = next.event_context ?? null;
    patch.rating_exclusion_reason = next.rating_exclusion_reason ?? null;
  }
  if (prev.round_rating == null && next.round_rating != null) patch.round_rating = next.round_rating;
  return patch;
}
