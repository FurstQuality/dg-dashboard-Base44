// DGD quick throw tracking — pure rules. Versioned so derived stats stay reproducible.
export const THROW_STATS_VERSION = "dgd-throw-stats-v1";

export type ThrowType = "tee" | "approach" | "putt" | "other";
export type DistanceZone = "parked" | "c1" | "c2" | "outside" | "unknown";
export type LieArea = "fairway" | "rough" | "ob" | "hazard" | "other" | "unknown";

export interface ThrowRow {
  throw_number: number;
  throw_type: ThrowType;
  distance_zone: DistanceZone | null;
  lie_area: LieArea | null;
  start_zone: DistanceZone | null;
  made: boolean | null;
  holed_out: boolean;
}

const PUTT_RANGE: DistanceZone[] = ["parked", "c1", "c2"];

/** First throw = tee; after a landing inside C2 = putt; otherwise approach. */
export function inferThrowType(prev: ThrowRow[]): ThrowType {
  if (prev.length === 0) return "tee";
  const last = prev[prev.length - 1];
  const zone = last.throw_type === "putt" && last.made === false ? last.start_zone : last.distance_zone;
  return zone && PUTT_RANGE.includes(zone) ? "putt" : "approach";
}

/** Zone the next putt starts from, as known from the previous throw. */
export function knownStartZone(prev: ThrowRow[]): DistanceZone | null {
  const last = prev[prev.length - 1];
  if (!last) return null;
  if (last.throw_type === "putt" && last.made === false) return last.start_zone === "c2" ? null : last.start_zone;
  return last.distance_zone && last.distance_zone !== "unknown" ? last.distance_zone : null;
}

export interface DerivedHoleStats {
  fairway_hit: boolean | null;
  c1_in_reg: boolean | null;
  c2_in_reg: boolean | null;
  c1_putts_made: number;
  c1_putts_missed: number;
  c2_putts_made: number;
  c2_putts_missed: number;
}

/** Regulation = reaching the zone in (par − 2) throws or fewer. Parked counts as C1. */
export function deriveHoleStats(throws: ThrowRow[], par: number | null): DerivedHoleStats {
  const sorted = [...throws].sort((a, b) => a.throw_number - b.throw_number);
  const tee = sorted.find((t) => t.throw_type === "tee");
  const regThrows = par != null ? par - 2 : null;
  let c1: boolean | null = null;
  let c2: boolean | null = null;
  if (regThrows != null && regThrows >= 1 && sorted.length) {
    const inReg = sorted.filter((t) => t.throw_number <= regThrows && t.throw_type !== "putt");
    const zones = inReg.map((t) => t.distance_zone);
    const holedEarly = sorted.some((t) => t.holed_out && t.throw_number <= regThrows);
    c1 = holedEarly || zones.some((z) => z === "parked" || z === "c1");
    c2 = c1 || zones.some((z) => z === "c2");
  }
  const out = { c1_putts_made: 0, c1_putts_missed: 0, c2_putts_made: 0, c2_putts_missed: 0 };
  for (const t of sorted) {
    if (t.throw_type !== "putt" || t.made == null) continue;
    const z = t.start_zone === "c2" ? "c2" : t.start_zone === "c1" ? "c1" : null;
    if (!z) continue;
    out[`${z}_putts_${t.made ? "made" : "missed"}` as keyof typeof out] += 1;
  }
  return {
    fairway_hit: tee?.lie_area && tee.lie_area !== "unknown" ? tee.lie_area === "fairway" : null,
    c1_in_reg: c1,
    c2_in_reg: c2,
    ...out,
  };
}

export const ZONE_LABEL: Record<DistanceZone, string> = {
  parked: "Parked", c1: "C1", c2: "C2", outside: "Outside C2", unknown: "Unknown",
};
export const TYPE_LABEL: Record<ThrowType, string> = {
  tee: "Tee shot", approach: "Upshot", putt: "Putt", other: "Other",
};

export interface ThrowSummary {
  teeShots: number;
  tee: Record<"parked" | "c1" | "c2" | "fairway" | "ob", number>;
  approaches: number;
  approachInC1: number;
  putts: Record<"tapin" | "c1" | "c2" | "outside", { made: number; att: number }>;
  obThrows: number;
  holesTracked: number;
}

/** Career/round aggregates from canonical throw rows (never from stored percentages). */
export function summarizeThrows(rows: (ThrowRow & { hole_key: string })[]): ThrowSummary {
  const s: ThrowSummary = {
    teeShots: 0, tee: { parked: 0, c1: 0, c2: 0, fairway: 0, ob: 0 }, approaches: 0, approachInC1: 0,
    putts: { tapin: { made: 0, att: 0 }, c1: { made: 0, att: 0 }, c2: { made: 0, att: 0 }, outside: { made: 0, att: 0 } },
    obThrows: 0, holesTracked: new Set(rows.map((r) => r.hole_key)).size,
  };
  for (const r of rows) {
    if (r.lie_area === "ob") s.obThrows++;
    const inC1 = r.distance_zone === "parked" || r.distance_zone === "c1" || (r.holed_out && r.throw_type !== "putt");
    if (r.throw_type === "tee") {
      s.teeShots++;
      if (r.distance_zone === "parked") s.tee.parked++;
      if (inC1) s.tee.c1++;
      if (inC1 || r.distance_zone === "c2") s.tee.c2++;
      if (r.lie_area === "fairway") s.tee.fairway++;
      if (r.lie_area === "ob") s.tee.ob++;
    } else if (r.throw_type === "approach") {
      s.approaches++;
      if (inC1) s.approachInC1++;
    } else if (r.throw_type === "putt" && r.made != null) {
      const z = r.start_zone === "parked" ? "tapin" : r.start_zone === "c1" ? "c1" : r.start_zone === "c2" ? "c2" : r.start_zone === "outside" ? "outside" : null;
      if (!z) continue;
      s.putts[z].att++;
      if (r.made) s.putts[z].made++;
    }
  }
  return s;
}

export interface ScrambleTally { chances: number; saves: number }

/**
 * Scramble: a hole where a throw finished in the rough, OB or a hazard, and the
 * player still made par or better. Needs the played layout's exact par; holes
 * with unknown par are skipped, never guessed.
 */
export function scrambleTally(
  holes: { throws: ThrowRow[]; strokes: number | null; par: number | null }[],
): ScrambleTally {
  const t: ScrambleTally = { chances: 0, saves: 0 };
  for (const h of holes) {
    if (h.par == null || h.strokes == null) continue;
    const offLine = h.throws.some((r) => r.lie_area === "rough" || r.lie_area === "ob" || r.lie_area === "hazard");
    if (!offLine) continue;
    t.chances++;
    if (h.strokes <= h.par) t.saves++;
  }
  return t;
}
