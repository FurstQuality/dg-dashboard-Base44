/**
 * Course map emblems — single source of truth.
 *
 * Every course surface (builder, course detail map, features map, tee signs,
 * caddy guide) draws the same symbol for the same thing. Emblems are layered
 * inline SVG (fill + shading + outline) so they stay crisp and legible on
 * satellite imagery at any zoom — no emoji, no bitmap sprites.
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

/**
 * Layered SVG glyphs on a 24×24 grid. `currentColor` carries the feature
 * color so one glyph works on light chips and dark map badges alike.
 */
export const FEATURE_GLYPHS: Record<CourseFeatureType, string> = {
  woods: `
<circle cx="8" cy="10" r="5" fill="currentColor" opacity=".7"/>
<circle cx="15.5" cy="9" r="5.5" fill="currentColor"/>
<circle cx="12" cy="15" r="5" fill="currentColor" opacity=".85"/>`,
  tree_line: `
<circle cx="5" cy="12" r="3.5" fill="currentColor"/>
<circle cx="12" cy="12" r="3.5" fill="currentColor" opacity=".85"/>
<circle cx="19" cy="12" r="3.5" fill="currentColor"/>`,
  tall_grass: `
<path d="M5 20 L6 9 M8 20 L10 6 M12 20 L12 8 M15 20 L14 5 M18 20 L19 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/>`,
  hazard: `
<path d="M12 3 L22 20 H2 Z" fill="currentColor"/>
<path d="M12 9 V14 M12 16.5 V17" stroke="#111" stroke-width="2" stroke-linecap="round"/>`,
  bench: `
<path d="M3.5 9.5h17l-.8 2.2H4.3z" fill="currentColor" opacity=".9"/>
<path d="M4.6 12.4h14.8l-.7 2h-13.4z" fill="currentColor" opacity=".65"/>
<path d="M5.4 14.4v5M18.6 14.4v5M4 9.5v5M20 9.5v5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  gazebo: `
<path d="M12 3.2 21 10H3z" fill="currentColor" opacity=".9"/>
<path d="M12 5.6 17.8 10H6.2z" fill="#0b1a10" opacity=".25"/>
<path d="M5.6 10.4v9.4M18.4 10.4v9.4M8.8 12.4v7.4M15.2 12.4v7.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
<path d="M4.4 19.8h15.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  tree: `
<path d="M12 2.4c2.4 2.1 4 4.3 4.6 6.3H7.4C8 6.7 9.6 4.5 12 2.4z" fill="currentColor"/>
<path d="M12 6.4c2.7 2.6 4.5 5.1 5.3 7.4H6.7c.8-2.3 2.6-4.8 5.3-7.4z" fill="currentColor" opacity=".85"/>
<path d="M12 10.6c3 2.9 5 5.6 5.9 8.1H6.1c.9-2.5 2.9-5.2 5.9-8.1z" fill="currentColor" opacity=".7"/>
<path d="M11 18.6h2v3.2h-2z" fill="#6b3f1d"/>`,
  water: `
<path d="M12 2.6s7 7.9 7 13a7 7 0 1 1-14 0c0-5.1 7-13 7-13z" fill="currentColor"/>
<path d="M9.4 15.4a2.6 2.6 0 0 0 2.6 2.6" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".8" fill="none"/>
<path d="M12 5.6c-2.6 3.4-4.6 6.9-4.6 9.4" stroke="#ffffff" stroke-width="1.2" opacity=".35" fill="none"/>`,
  fence: `
<path d="M4.2 6.4l1.6-1.6 1.6 1.6V20H4.2zM11 6.4l1.6-1.6 1.6 1.6V20H11zM17.8 6.4l1.6-1.6L21 6.4V20h-3.2z" fill="currentColor" opacity=".9"/>
<path d="M3 10.4h18M3 15h18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>`,
  path: `
<path d="M6 21c2.4-2.6 2-6.6 5-9s3.6-6.4 6-9.6" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" fill="none" opacity=".35"/>
<path d="M6 21c2.4-2.6 2-6.6 5-9s3.6-6.4 6-9.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2.6 3.2" fill="none"/>`,
  ob_line: `
<path d="M3 12h18" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
<path d="M4.5 12h3M10.5 12h3M16.5 12h3" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>
<path d="M6 5.4v13.2M18 5.4v13.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`,
  ob_area: `
<circle cx="12" cy="12" r="9" fill="currentColor" opacity=".18"/>
<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.6"/>
<path d="M6.4 6.4l11.2 11.2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>`,
  ob_reference: `
<path d="M3 12h18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3.4 3"/>
<circle cx="4.6" cy="12" r="2.3" fill="currentColor"/>
<circle cx="19.4" cy="12" r="2.3" fill="currentColor"/>`,
  mando: `
<path d="M4.4 4.6h9.2l5.6 7.4-5.6 7.4H4.4z" fill="currentColor"/>
<path d="M7.6 12h6.2M11.4 9.2 14.4 12l-3 2.8" stroke="#0b1a10" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  dropzone: `
<circle cx="12" cy="12" r="8.6" fill="currentColor" opacity=".18"/>
<circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 2.6"/>
<circle cx="12" cy="12" r="3.6" fill="currentColor"/>
<path d="M12 5.2v2.4M12 16.4v2.4M5.2 12h2.4M16.4 12h2.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  restroom: `
<circle cx="7.6" cy="5" r="2.1" fill="currentColor"/>
<path d="M5.4 20.6v-6H3.6l2.2-5.6h3.6l2.2 5.6h-1.8v6z" fill="currentColor"/>
<circle cx="16.4" cy="5" r="2.1" fill="currentColor" opacity=".85"/>
<path d="M13.6 9h5.6l1.6 5.4h-1.9l-.7 6.2h-3.6l-.7-6.2h-1.9z" fill="currentColor" opacity=".85"/>`,
  trash: `
<path d="M5.4 7.6h13.2l-1.1 12.8H6.5z" fill="currentColor" opacity=".9"/>
<path d="M9.6 10.6v6.6M12 10.6v6.6M14.4 10.6v6.6" stroke="#0b1a10" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
<path d="M3.6 7.6h16.8M9.4 5h5.2l.6 2.6H8.8z" fill="currentColor"/>`,
  parking: `
<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4" fill="currentColor"/>
<path d="M9.4 18V6.4h3.9a3.6 3.6 0 0 1 0 7.2H9.4" stroke="#0b1a10" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  entrance: `
<path d="M4 20.6V8.2L12 3.4l8 4.8v12.4z" fill="currentColor"/>
<path d="M9.4 20.6v-6.4h5.2v6.4" fill="#0b1a10" opacity=".55"/>
<path d="M12 8.4v3.4M10.4 10.2 12 11.8l1.6-1.6" stroke="#0b1a10" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  tee_sign: `
<rect x="3.6" y="3.4" width="16.8" height="11.4" rx="1.8" fill="currentColor"/>
<path d="M6.4 6.8h11M6.4 9.4h8.4M6.4 12h6" stroke="#0b1a10" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
<path d="M12 14.8v6M9 20.8h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  note: `
<path d="M5.4 3.4h9.2l4 4v13.2H5.4z" fill="currentColor"/>
<path d="M14.6 3.4v4h4z" fill="#0b1a10" opacity=".3"/>
<path d="M8 11h8M8 14h8M8 17h5" stroke="#0b1a10" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>`,
  course_boundary: `
<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2" fill="currentColor" opacity=".14"/>
<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.4 2.4"/>
<path d="M8.4 3.4v17.2M15.6 3.4v17.2M3.4 8.4h17.2M3.4 15.6h17.2" stroke="currentColor" stroke-width=".9" opacity=".45"/>`,
  island_green: `
<circle cx="12" cy="12" r="10" fill="#38bdf8" opacity=".35"/>
<circle cx="12" cy="12" r="6.4" fill="currentColor"/>
<path d="M12 8v6.4" stroke="#0b1a10" stroke-width="1.6" stroke-linecap="round"/>
<ellipse cx="12" cy="8" rx="3" ry=".9" fill="#0b1a10" opacity=".55"/>`,
};

export const FEATURE_CONFIG: Record<
  CourseFeatureType,
  { label: string; geom: FeatureGeom; color: string; hint: string }
> = {
  woods: { label: "Woods", geom: "polygon", color: "#15803d", hint: "Wooded area drawn on tee signs" },
  tree_line: { label: "Tree line", geom: "line", color: "#16a34a", hint: "Edge of the woods or a row of trees" },
  tall_grass: { label: "Tall grass", geom: "polygon", color: "#a3a635", hint: "Rough, brush or tall grass" },
  hazard: { label: "Hazard", geom: "polygon", color: "#f59e0b", hint: "Hazard area (penalty or caution)" },
  bench: { label: "Bench", geom: "point", color: "#e5e7eb", hint: "Seating shown on caddy guides" },
  gazebo: { label: "Gazebo", geom: "point", color: "#e5e7eb", hint: "Shelter / meeting point" },
  tree: { label: "Tree", geom: "point", color: "#22c55e", hint: "Landmark tree for shot shaping" },
  water: { label: "Water", geom: "polygon", color: "#38bdf8", hint: "Marks the hole as a water carry" },
  fence: { label: "Fence", geom: "line", color: "#a1a1aa", hint: "Physical boundary, not OB" },
  path: { label: "Path", geom: "line", color: "#facc15", hint: "Walking route between holes" },
  ob_line: { label: "OB line", geom: "line", color: "#ef4444", hint: "Counted as OB footage on the hole" },
  ob_area: { label: "OB area", geom: "polygon", color: "#ef4444", hint: "Closed OB zone for scoring" },
  ob_reference: { label: "OB ref", geom: "line", color: "#ef4444", hint: "Extends another OB line" },
  mando: { label: "Mando", geom: "point", color: "#f97316", hint: "Mandatory — tracked by the app" },
  dropzone: { label: "Drop zone", geom: "point", color: "#f97316", hint: "Used after OB or missed mando" },
  restroom: { label: "Restroom", geom: "point", color: "#e5e7eb", hint: "Amenity for course pages" },
  trash: { label: "Trash", geom: "point", color: "#e5e7eb", hint: "Amenity for course pages" },
  parking: { label: "Parking", geom: "point", color: "#60a5fa", hint: "Drives directions & first tee" },
  entrance: { label: "Course entrance", geom: "point", color: "#22c55e", hint: "Where players arrive — used for directions" },
  tee_sign: { label: "Tee sign", geom: "point", color: "#a3e635", hint: "Printed tee sign location" },
  note: { label: "Note", geom: "point", color: "#e2e8f0", hint: "Free-form designer note" },
  course_boundary: {
    label: "Property line",
    geom: "polygon",
    color: "#facc15",
    hint: "Outer property used for validation",
  },
  island_green: {
    label: "Island green",
    geom: "polygon",
    color: "#22c55e",
    hint: "Flags the hole as an island green",
  },
};

/** Raw markup for a feature emblem — used by Leaflet div icons. */
export function featureGlyphSvg(type: CourseFeatureType, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${FEATURE_GLYPHS[type] ?? ""}</svg>`;
}

/** React emblem for palettes, legends, lists and chips. */
export function FeatureGlyph({
  type,
  size = 16,
  className,
  color,
}: {
  type: CourseFeatureType;
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={{ color: color ?? FEATURE_CONFIG[type].color, flex: "0 0 auto" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: FEATURE_GLYPHS[type] ?? "" }}
    />
  );
}
