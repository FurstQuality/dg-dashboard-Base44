/** Play rules a layout can opt in/out of. Everything else on the map is shared ground. */
export const RULE_FEATURE_TYPES = new Set([
  "ob_line",
  "ob_area",
  "ob_reference",
  "mando",
  "dropzone",
  "hazard",
  "island_green",
]);

type RuleLike = { id: string; type: string; layout_id: string | null };

/** Does this layout play this feature? `played` null = its own rules plus course-wide rules. */
export function layoutPlaysFeature(
  f: RuleLike,
  layoutId: string,
  played: string[] | null,
): boolean {
  if (!RULE_FEATURE_TYPES.has(f.type)) return true;
  if (played) return played.includes(f.id);
  return f.layout_id == null || f.layout_id === layoutId;
}

/** Normal signs share course ground but only play their selected rules. Keep
 * distinct rule records visible; collapse identical copied ground features. */
export function courseFeaturesForLayout<
  T extends RuleLike & { layer?: string | null; geometry?: unknown; label?: string | null },
>(features: T[], layoutId: string, played: string[] | null): T[] {
  const ground = new Set<string>();
  return features
    .filter((feature) => feature.layer !== "event" && layoutPlaysFeature(feature, layoutId, played))
    .sort((a, b) => Number(b.layout_id === layoutId) - Number(a.layout_id === layoutId))
    .filter((feature) => {
      if (RULE_FEATURE_TYPES.has(feature.type)) return true;
      const key = JSON.stringify([feature.type, feature.geometry, feature.label ?? null]);
      if (ground.has(key)) return false;
      ground.add(key);
      return true;
    });
}
