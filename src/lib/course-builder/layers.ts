/** The four separated Course Builder layers and which tools belong to which mode. */
import type { CourseFeatureType } from "@/lib/course-features";

export type MapLayer = "base" | "layout" | "event" | "condition";
export type BuilderMode = "course" | "holes" | "conditions";
export type Verification = "UNVERIFIED" | "COMMUNITY_CONFIRMED" | "STEWARD_VERIFIED" | "OFFICIAL";
export type BoundaryConfidence = "OFFICIAL" | "APPROXIMATE" | "UNKNOWN";

export const VERIFICATION_LABEL: Record<Verification, string> = {
  UNVERIFIED: "Not yet checked",
  COMMUNITY_CONFIRMED: "Confirmed by players",
  STEWARD_VERIFIED: "Checked by a steward",
  OFFICIAL: "Official",
};

export type ToolId =
  | "select" | "boundary" | "parking" | "path" | "restroom" | "gazebo" | "bench" | "trash"
  | "water" | "fence" | "tree" | "tee" | "basket" | "flight" | "mando" | "ob_line" | "ob_area"
  | "island_green" | "dropzone" | "report" | "closure" | "hazard";

/** Each tool appears in exactly one mode (plus Select everywhere) — no duplicates. */
export const MODE_TOOLS: Record<BuilderMode, ToolId[]> = {
  course: ["select", "boundary", "parking", "path", "restroom", "gazebo", "bench", "trash", "water", "fence", "tree"],
  holes: ["select", "tee", "basket", "flight", "mando", "ob_line", "ob_area", "island_green", "dropzone"],
  conditions: ["select", "report", "closure", "hazard"],
};

const BASE_TYPES: CourseFeatureType[] = [
  "course_boundary", "entrance", "parking", "path", "restroom", "gazebo", "bench", "trash", "water", "fence", "tree",
];
const LAYOUT_TYPES: CourseFeatureType[] = [
  "ob_line", "ob_area", "ob_reference", "mando", "dropzone", "island_green", "tee_sign",
];

export function defaultLayerFor(type: CourseFeatureType): MapLayer {
  if (LAYOUT_TYPES.includes(type)) return "layout";
  if (BASE_TYPES.includes(type)) return "base";
  return "base";
}

type Classifiable = {
  type: CourseFeatureType;
  layout_id?: string | null;
  hole_number?: number | null;
  hole_numbers?: number[] | null;
  event_overlay_id?: string | null;
};

/** Legacy migration rule: returns the layer and whether it needs a human look. */
export function classifyLegacyFeature(f: Classifiable): { layer: MapLayer; flagged: boolean } {
  if (f.event_overlay_id) return { layer: "event", flagged: false };
  const tied = !!f.layout_id || f.hole_number != null || (f.hole_numbers?.length ?? 0) > 0;
  if (LAYOUT_TYPES.includes(f.type)) {
    return tied ? { layer: "layout", flagged: false } : { layer: "base", flagged: f.type !== "tee_sign" };
  }
  return { layer: "base", flagged: false };
}

/** Features visible when viewing a layout: base + that layout (+ an event overlay if chosen). Conditions never mix in. */
export function featuresForView<T extends Classifiable & { layer: MapLayer; publish_state?: string }>(
  all: T[],
  opts: { layoutId?: string | null; overlayId?: string | null; includeDrafts?: boolean },
): T[] {
  return all.filter((f) => {
    if (!opts.includeDrafts && f.publish_state && f.publish_state !== "published") return false;
    if (f.layer === "base") return true;
    if (f.layer === "layout") return !f.layout_id || f.layout_id === opts.layoutId;
    if (f.layer === "event") return !!opts.overlayId && f.event_overlay_id === opts.overlayId;
    return false;
  });
}
