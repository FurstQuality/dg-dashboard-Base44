/**
 * One shared shape for event details imported from an outside source (PDGA or
 * UDisc) into the tournament/league setup wizard. The import only prefills the
 * wizard — nothing is submitted or created.
 */
export type ImportSource = "pdga" | "udisc" | "scene";

export type ImportedEventDraft = {
  source: ImportSource;
  source_url: string | null;
  name: string | null;
  description: string | null;
  cover_url: string | null;
  time_zone: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  course_name: string | null;
  pdga_event_number: string | null;
  pdga_tier: string | null;
};

export type ImportGroup = "basics" | "dates" | "location" | "sanctioning";

export const IMPORT_GROUP_LABELS: Record<ImportGroup, string> = {
  basics: "Name, description, cover image, time zone",
  dates: "Start and end date",
  location: "Course and location",
  sanctioning: "PDGA event number, tier, sanctioned flag",
};

const GROUP_FIELDS: Record<ImportGroup, (keyof ImportedEventDraft)[]> = {
  basics: ["name", "description", "cover_url", "time_zone"],
  dates: ["start_date", "end_date"],
  location: ["location", "city", "state", "course_name"],
  sanctioning: ["pdga_event_number", "pdga_tier"],
};

export function emptyDraft(source: ImportSource, url: string | null): ImportedEventDraft {
  return {
    source,
    source_url: url,
    name: null,
    description: null,
    cover_url: null,
    time_zone: null,
    start_date: null,
    end_date: null,
    location: null,
    city: null,
    state: null,
    course_name: null,
    pdga_event_number: null,
    pdga_tier: null,
  };
}

/** Which groups the source actually gave us something for. */
export function availableGroups(draft: ImportedEventDraft): ImportGroup[] {
  return (Object.keys(GROUP_FIELDS) as ImportGroup[]).filter((g) =>
    GROUP_FIELDS[g].some((f) => {
      const v = draft[f];
      return typeof v === "string" && v.trim().length > 0;
    }),
  );
}

/** Blank out every field outside the selected groups so nothing else changes. */
export function pickGroups(
  draft: ImportedEventDraft,
  groups: ImportGroup[],
): ImportedEventDraft {
  const keep = new Set(groups.flatMap((g) => GROUP_FIELDS[g]));
  const out = emptyDraft(draft.source, draft.source_url);
  for (const field of Object.keys(GROUP_FIELDS).flatMap((g) => GROUP_FIELDS[g as ImportGroup])) {
    if (keep.has(field)) (out as Record<string, unknown>)[field] = draft[field];
  }
  return out;
}

/** Human summary of what a draft will fill in. */
export function describeDraft(draft: ImportedEventDraft): string[] {
  const lines: string[] = [];
  if (draft.name) lines.push(`Name: ${draft.name}`);
  if (draft.start_date)
    lines.push(`Dates: ${draft.start_date}${draft.end_date && draft.end_date !== draft.start_date ? ` – ${draft.end_date}` : ""}`);
  if (draft.location) lines.push(`Location: ${draft.location}`);
  if (draft.course_name) lines.push(`Course: ${draft.course_name}`);
  if (draft.pdga_event_number) lines.push(`PDGA event #${draft.pdga_event_number}`);
  if (draft.pdga_tier) lines.push(`Tier: ${draft.pdga_tier}`);
  if (draft.time_zone) lines.push(`Time zone: ${draft.time_zone}`);
  return lines;
}

/**
 * Rough US state → IANA time zone mapping so an imported event lands in the
 * right zone without asking. Unknown states leave the wizard value alone.
 */
const STATE_TIME_ZONES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Denver", IL: "America/Chicago", IN: "America/New_York", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/New_York", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver",
};

export function timeZoneForState(state: string | null | undefined): string | null {
  if (!state) return null;
  const key = state.trim().toUpperCase().slice(0, 2);
  return STATE_TIME_ZONES[key] ?? null;
}

/** Split a "City, ST" style location string. */
export function splitLocation(location: string | null | undefined): {
  city: string | null;
  state: string | null;
} {
  if (!location) return { city: null, state: null };
  const parts = location.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return { city: parts[0] ?? null, state: null };
  return { city: parts[0], state: parts[1] };
}

/**
 * PDGA pages spell tiers many ways ("C-tier", "Xc", "A"). Normalize to the
 * TierCode set the sanctioning rules use; unknown values return null.
 */
export function normalizeTierCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim().toUpperCase().replace(/[\s-]*TIER\b/g, "").replace(/[^A-Z]/g, "");
  const known = ["ES", "XA", "XB", "XC", "M", "A", "B", "C", "L"];
  if (known.includes(raw)) return raw;
  const two = raw.slice(0, 2);
  if (known.includes(two)) return two;
  const one = raw.slice(0, 1);
  return known.includes(one) ? one : null;
}
