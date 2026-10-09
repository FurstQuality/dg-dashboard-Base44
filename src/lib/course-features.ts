/**
 * Browser-safe course feature contracts.
 *
 * Kept free of Leaflet imports so non-map pages (tee signs, course detail
 * metadata) can share these types and helpers without shipping the mapping
 * libraries in their bundle.
 */

export type CourseFeatureType =
  | "bench"
  | "gazebo"
  | "tree"
  | "water"
  | "fence"
  | "path"
  | "ob_line"
  | "ob_area"
  | "ob_reference"
  | "course_boundary"
  | "island_green"
  | "mando"
  | "dropzone"
  | "restroom"
  | "trash"
  | "parking"
  | "entrance"
  | "tee_sign"
  | "note"
  | "woods"
  | "tree_line"
  | "tall_grass"
  | "hazard";

export type FeatureGeom = "point" | "line" | "polygon";

export type DbFeature = {
  id: string;
  type: CourseFeatureType;
  geometry: { points: [number, number][]; bearing?: number };
  ob_side: "left" | "right" | "past" | "behind" | "none";
  label: string | null;
  hole_number: number | null;
  hole_numbers?: number[] | null;
  ref_feature_id?: string | null;
};

type HoleScope = Pick<DbFeature, "hole_number" | "hole_numbers">;

export function featureAppliesToHole(f: HoleScope, holeNumber: number): boolean {
  if (Array.isArray(f.hole_numbers) && f.hole_numbers.length)
    return f.hole_numbers.includes(holeNumber);
  if (f.hole_number != null) return f.hole_number === holeNumber;
  return true; // course-wide
}

export function featureIsCourseWide(f: HoleScope): boolean {
  if (Array.isArray(f.hole_numbers) && f.hole_numbers.length) return false;
  return f.hole_number == null;
}
