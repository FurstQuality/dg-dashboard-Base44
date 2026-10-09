/**
 * Build-out areas, ordered so the work starts in northwest Indiana and moves
 * outward. Client-safe: the admin screen lists these and the server functions
 * validate against the same keys.
 */
export type BuildoutArea = {
  key: string;
  label: string;
  blurb: string;
  /** Bounding box in degrees. */
  box: { south: number; west: number; north: number; east: number };
};

export const BUILDOUT_AREAS: BuildoutArea[] = [
  {
    key: "nwi",
    label: "Northwest Indiana",
    blurb: "Lake, Porter, LaPorte, St. Joseph and Marshall counties.",
    box: { south: 41.05, west: -87.75, north: 41.95, east: -86.2 },
  },
  {
    key: "indiana",
    label: "Rest of Indiana",
    blurb: "Everything south and east of the northwest corner.",
    box: { south: 37.7, west: -88.15, north: 41.8, east: -84.75 },
  },
  {
    key: "chicagoland",
    label: "Chicagoland",
    blurb: "Chicago, the south suburbs and the Illinois side of the state line.",
    box: { south: 41.2, west: -88.5, north: 42.5, east: -87.5 },
  },
  {
    key: "michiana",
    label: "Southwest Michigan",
    blurb: "Berrien, Cass, Van Buren and Kalamazoo counties.",
    box: { south: 41.7, west: -86.9, north: 42.6, east: -85.3 },
  },
  {
    key: "midwest",
    label: "Wider Midwest",
    blurb: "Illinois, Indiana, Michigan, Ohio, Wisconsin and eastern Iowa.",
    box: { south: 36.8, west: -93.0, north: 46.5, east: -80.5 },
  },
];

export function findBuildoutArea(key: string): BuildoutArea | null {
  return BUILDOUT_AREAS.find((a) => a.key === key) ?? null;
}

export const BUILDOUT_AREA_KEYS = BUILDOUT_AREAS.map((a) => a.key);
