/**
 * DGD Data Intelligence Hub — source capability registry.
 *
 * Pure and browser-safe. A capability is listed only when a parser for it
 * actually exists in the codebase (`parser` names the real module/version);
 * the hub then measures STORED / CANONICALIZED from live table counts, so the
 * matrix reflects what DGD really ingests instead of a hand-written claim.
 */
import { PARSER_VERSIONS } from "@/lib/pdga-intel/parsers";

export type SourceKey = "pdga" | "udisc" | "disc_golf_scene" | "dgd" | "disc_intel";

export type CapabilityKey =
  | "player_identity"
  | "official_rating"
  | "rating_history"
  | "event_results"
  | "round_detail"
  | "course_location"
  | "course_layouts"
  | "event_details"
  | "native_rating"
  | "disc_catalog"
  | "disc_performance";

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  player_identity: "Player identity",
  official_rating: "Official rating",
  rating_history: "Rating history",
  event_results: "Event results",
  round_detail: "Round detail",
  course_location: "Course location",
  course_layouts: "Layouts & par",
  event_details: "Event details",
  native_rating: "Source-native round rating",
  disc_catalog: "Disc catalog",
  disc_performance: "Disc performance",
};

export type Capability = {
  source: SourceKey;
  capability: CapabilityKey;
  /** Real parser that produces this data (module + version). */
  parser: string;
  /** Table holding raw/normalized source observations. */
  storedTable: string;
  /** Table holding the canonical DGD entity this feeds, when linked. */
  canonicalTable: string | null;
  /** Source owns this field (authority is field-specific, never global). */
  authoritative: boolean;
};

export const SOURCES: { key: SourceKey; label: string; access: string }[] = [
  { key: "pdga", label: "PDGA", access: "Public web pages, polite fetcher" },
  { key: "udisc", label: "UDisc", access: "Public course pages and user exports" },
  { key: "disc_golf_scene", label: "Disc Golf Scene", access: "Public event pages" },
  { key: "dgd", label: "DGD native", access: "First-party" },
  { key: "disc_intel", label: "Disc Intelligence", access: "Skill-group surveys" },
];

export const CAPABILITIES: Capability[] = [
  { source: "pdga", capability: "player_identity", parser: PARSER_VERSIONS.player, storedTable: "pdga_src_player_snapshots", canonicalTable: "pdga_players", authoritative: true },
  { source: "pdga", capability: "official_rating", parser: PARSER_VERSIONS.player, storedTable: "pdga_src_player_snapshots", canonicalTable: "pdga_players", authoritative: true },
  { source: "pdga", capability: "rating_history", parser: PARSER_VERSIONS.history, storedTable: "pdga_src_rating_history", canonicalTable: null, authoritative: true },
  { source: "pdga", capability: "event_results", parser: PARSER_VERSIONS.event, storedTable: "pdga_src_events", canonicalTable: "pdga_events", authoritative: true },
  { source: "pdga", capability: "round_detail", parser: PARSER_VERSIONS.details, storedTable: "pdga_src_rounds", canonicalTable: "external_rounds", authoritative: true },
  { source: "pdga", capability: "course_location", parser: "pdga-kb-parsers", storedTable: "pdga_kb_courses", canonicalTable: "course_sources", authoritative: false },
  { source: "pdga", capability: "event_details", parser: "pdga-kb-parsers", storedTable: "pdga_kb_events", canonicalTable: "pdga_tour_events", authoritative: true },
  { source: "udisc", capability: "course_location", parser: "udisc-catalog", storedTable: "udisc_catalog", canonicalTable: "course_sources", authoritative: false },
  { source: "udisc", capability: "course_layouts", parser: "udisc-catalog", storedTable: "udisc_catalog", canonicalTable: "course_layouts", authoritative: false },
  { source: "udisc", capability: "round_detail", parser: "udisc-csv-import", storedTable: "external_round_holes", canonicalTable: "external_rounds", authoritative: false },
  { source: "udisc", capability: "native_rating", parser: "udisc-csv-import", storedTable: "source_round_records", canonicalTable: null, authoritative: true },
  { source: "disc_golf_scene", capability: "event_details", parser: "dgs-event-import", storedTable: "pdga_dgs_links", canonicalTable: "tournaments", authoritative: true },
  { source: "dgd", capability: "course_layouts", parser: "course-builder", storedTable: "course_holes", canonicalTable: "course_layouts", authoritative: true },
  { source: "dgd", capability: "round_detail", parser: "native-scoring", storedTable: "external_rounds", canonicalTable: "external_rounds", authoritative: true },
  { source: "disc_intel", capability: "disc_catalog", parser: "dgp-ingest", storedTable: "disc_molds", canonicalTable: "disc_molds", authoritative: false },
  { source: "disc_intel", capability: "disc_performance", parser: "dgp-ingest", storedTable: "disc_plastics", canonicalTable: null, authoritative: false },
];

export type CapabilityStatus = "parser_built" | "stored" | "canonicalized";

/** Every table the hub counts — single source for the server inventory. */
export const INVENTORY_TABLES: string[] = Array.from(
  new Set(
    [...CAPABILITIES.flatMap((c) => [c.storedTable, c.canonicalTable]), "source_snapshots", "field_observations"].filter(
      (t): t is string => !!t,
    ),
  ),
).sort();

export function capabilityStatus(
  cap: Capability,
  counts: Record<string, number | null>,
): CapabilityStatus {
  const stored = counts[cap.storedTable] ?? 0;
  if (stored <= 0) return "parser_built";
  if (cap.canonicalTable && (counts[cap.canonicalTable] ?? 0) > 0) return "canonicalized";
  return "stored";
}

export function capabilityMatrix(counts: Record<string, number | null>) {
  const caps = Array.from(new Set(CAPABILITIES.map((c) => c.capability)));
  return caps.map((capability) => ({
    capability,
    label: CAPABILITY_LABELS[capability],
    cells: SOURCES.map((s) => {
      const cap = CAPABILITIES.find((c) => c.source === s.key && c.capability === capability);
      return {
        source: s.key,
        cap: cap ?? null,
        status: cap ? capabilityStatus(cap, counts) : null,
      };
    }),
  }));
}
