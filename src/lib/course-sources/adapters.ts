/**
 * One interface for every course listing source. Pure and browser-safe:
 * adapters only turn a fetched page into a normalized listing; writing is
 * done by listing-sync.server.ts.
 */
import { parseSceneCoursePage, parseUdiscCoursePage } from "@/lib/scene-parser";

export type ListingHole = { number: number; par: number | null; distance_ft: number | null };
export type ListingLayout = { name: string; holes: number | null; par: number | null; length_ft: number | null };

export type NormalizedCourseListing = {
  source: "udisc" | "disc_golf_scene";
  externalId: string;
  url: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  holeCount: number | null;
  layouts: ListingLayout[];
  /** Hole-by-hole rows for the listing's main layout, when the page shows them. */
  holes: ListingHole[];
};

export type CourseSourceAdapter = {
  source: NormalizedCourseListing["source"];
  parserVersion: string;
  canHandle(url: string): boolean;
  parse(html: string, url: string): NormalizedCourseListing | null;
};

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export const udiscAdapter: CourseSourceAdapter = {
  source: "udisc",
  parserVersion: "udisc-course@1",
  canHandle: (url) => host(url) === "udisc.com" && /\/courses\//.test(url),
  parse(html, url) {
    const p = parseUdiscCoursePage(html, url);
    if (!p) return null;
    return {
      source: "udisc",
      externalId: p.slug,
      url: p.url,
      name: p.name,
      city: p.city,
      state: p.state,
      latitude: p.latitude,
      longitude: p.longitude,
      holeCount: p.holes,
      layouts: p.layouts.map((l) => ({ name: l.name, holes: l.holes, par: l.par, length_ft: l.length_ft })),
      holes: p.holes_detail.map((h) => ({ number: h.hole, par: h.par, distance_ft: h.distance_ft })),
    };
  },
};

export const sceneAdapter: CourseSourceAdapter = {
  source: "disc_golf_scene",
  parserVersion: "scene-course@1",
  canHandle: (url) => host(url) === "discgolfscene.com" && /\/courses?\/\d+\//.test(url),
  parse(html, url) {
    const p = parseSceneCoursePage(html, url);
    if (!p) return null;
    return {
      source: "disc_golf_scene",
      externalId: p.id,
      url: p.url,
      name: p.name,
      city: p.city,
      state: p.state,
      latitude: null,
      longitude: null,
      holeCount: p.holes,
      layouts: p.layouts.map((name) => ({ name, holes: null, par: null, length_ft: null })),
      holes: [],
    };
  },
};

export const COURSE_ADAPTERS: CourseSourceAdapter[] = [udiscAdapter, sceneAdapter];

export function adapterFor(url: string): CourseSourceAdapter | null {
  return COURSE_ADAPTERS.find((a) => a.canHandle(url)) ?? null;
}

/** A listing par is trusted only when it is a real disc golf par. */
export function isPlausiblePar(par: number | null): par is number {
  return par != null && Number.isInteger(par) && par >= 2 && par <= 6;
}

/**
 * Decide which hole pars to fill from a listing. Only fills holes whose par
 * is not confirmed and has no source yet, and only when the listing's hole
 * count matches the layout exactly — otherwise holes could be mismatched.
 */
export function planParFill(
  layoutHoles: { id: string; number: number; par_confirmed: boolean | null; par_source: string | null }[],
  listing: ListingHole[],
): { id: string; par: number }[] {
  if (!listing.length || listing.length !== layoutHoles.length) return [];
  const byNum = new Map(listing.map((h) => [h.number, h.par]));
  const out: { id: string; par: number }[] = [];
  for (const h of layoutHoles) {
    if (h.par_confirmed || h.par_source) continue;
    const par = byNum.get(h.number) ?? null;
    if (isPlausiblePar(par)) out.push({ id: h.id, par });
  }
  return out;
}

const NAME_STOP = new Set(["disc", "golf", "course", "dgc", "park", "the", "at", "of", "and", "dg"]);
function nameTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t && !NAME_STOP.has(t)),
  );
}
/** Token overlap (0–1) between two course names, ignoring generic words. */
export function nameMatchScore(a: string, b: string): number {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
