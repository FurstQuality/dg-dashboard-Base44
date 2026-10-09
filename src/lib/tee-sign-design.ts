/** Tee sign artwork model. Positions/sizes are % of the sign's picture area so signs print at any size. */

export type SignElement = {
  id: string;
  kind: "text" | "image";
  x: number; // left, % of width
  y: number; // top, % of height
  w: number; // % of width
  h: number; // % of height
  text?: string;
  fontSize?: number; // % of picture-area width (scales with the sign)
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  background?: string | null;
  path?: string; // storage path for images
};

export type SignSections = {
  tees: boolean;
  baskets: boolean;
  distances: boolean;
  chips: boolean;
  caddy: boolean;
  designer: boolean;
};

export type SignSponsor = { id: string; name: string; logoPath?: string | null };

export type SignDesign = {
  title?: string;
  subtitle?: string;
  notes?: string;
  photoPath?: string | null;
  photoFit?: "cover" | "contain";
  accent?: string;
  hide?: Partial<SignSections>;
  elements?: SignElement[];
  /** "pro" = printed hole map with info panel (default); "photo" = picture with boxes. */
  style?: "pro" | "photo";
  panelColour?: string;
  units?: "ft" | "m" | "both";
  /** Course-wide sponsor list (shared design only). */
  sponsors?: SignSponsor[];
  /** Sponsors printed on this hole's panel, in order. */
  holeSponsorIds?: string[];
  /** Course-wide: print every sponsor along the bottom. */
  sponsorStrip?: boolean;
  showQr?: boolean;
  /** Print short rule lines (OB, mando, DZ) written from the hole map. */
  showRules?: boolean;
  /** Lettering set for the whole sign (see SIGN_FONTS). */
  font?: SignFontId;
  /** How the hole map is drawn. */
  mapStyle?: SignMapStyle;
  /** Course logo printed at the top of the info panel instead of the course name. */
  logoPath?: string | null;
};

export type SignMapStyle = "illustrated" | "satellite" | "flat";
export const SIGN_MAP_STYLES: { id: SignMapStyle; label: string; hint: string }[] = [
  { id: "illustrated", label: "Illustrated", hint: "Drawn trees, grass and water" },
  { id: "satellite", label: "Aerial photo", hint: "Real aerial photo with the hole drawn on top" },
  { id: "flat", label: "Clean print", hint: "Flat colours, crisp from far away" },
];

export type SignFontId = "bebas" | "oswald" | "anton" | "barlow" | "archivo" | "slab";
/** Lettering sets: a tall display face for numbers/headings plus a readable face for small text. */
export const SIGN_FONTS: { id: SignFontId; label: string; display: string; body: string }[] = [
  { id: "bebas", label: "Bebas Neue — classic sign", display: "'Bebas Neue','Oswald','Arial Narrow',sans-serif", body: "'Barlow','Arial',sans-serif" },
  { id: "oswald", label: "Oswald — park signage", display: "'Oswald','Arial Narrow',sans-serif", body: "'Barlow','Arial',sans-serif" },
  { id: "anton", label: "Anton — extra bold", display: "'Anton','Impact',sans-serif", body: "'Barlow','Arial',sans-serif" },
  { id: "barlow", label: "Barlow Condensed — modern", display: "'Barlow Condensed','Arial Narrow',sans-serif", body: "'Barlow','Arial',sans-serif" },
  { id: "archivo", label: "Archivo Black — athletic", display: "'Archivo Black','Arial Black',sans-serif", body: "'Archivo','Arial',sans-serif" },
  { id: "slab", label: "Roboto Slab — trail marker", display: "'Roboto Slab','Rockwell',serif", body: "'Roboto Slab','Georgia',serif" },
];
export const SIGN_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Anton&family=Archivo+Black&family=Archivo:wght@400;600&family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;600;700&family=Bebas+Neue&family=Oswald:wght@500;700&family=Roboto+Slab:wght@500;700&display=swap";
export function signFont(id?: SignFontId) {
  return SIGN_FONTS.find((f) => f.id === id) ?? SIGN_FONTS[0];
}

export const SECTION_LABELS: Record<keyof SignSections, string> = {
  tees: "Tees",
  baskets: "Baskets",
  distances: "Distance table",
  chips: "Shot shape & hazards",
  caddy: "Caddy notes",
  designer: "Designer notes",
};

export function newElement(kind: SignElement["kind"], extra: Partial<SignElement> = {}): SignElement {
  return {
    id: Math.random().toString(36).slice(2, 10),
    kind,
    x: 10,
    y: 10,
    w: kind === "text" ? 60 : 30,
    h: kind === "text" ? 12 : 20,
    text: kind === "text" ? "New text" : undefined,
    fontSize: 6,
    color: "#ffffff",
    bold: true,
    align: "center",
    background: kind === "text" ? "rgba(0,0,0,0.45)" : null,
    ...extra,
  };
}

export function clampElement(e: SignElement): SignElement {
  const w = Math.min(100, Math.max(4, e.w));
  const h = Math.min(100, Math.max(3, e.h));
  return { ...e, w, h, x: Math.min(100 - w, Math.max(0, e.x)), y: Math.min(100 - h, Math.max(0, e.y)) };
}

/** Hole-level values win over the shared design; shared elements (logos) sit underneath hole elements. */
export function mergeDesigns(shared: SignDesign | null, hole: SignDesign | null): SignDesign {
  const s = shared ?? {};
  const h = hole ?? {};
  return {
    ...s,
    ...h,
    hide: { ...(s.hide ?? {}), ...(h.hide ?? {}) },
    elements: [...(s.elements ?? []), ...(h.elements ?? [])],
  };
}

export function imagePaths(d: SignDesign | null | undefined): string[] {
  if (!d) return [];
  return [d.photoPath, d.logoPath, ...(d.elements ?? []).map((e) => e.path), ...(d.sponsors ?? []).map((s) => s.logoPath)].filter(
    (p): p is string => !!p,
  );
}
