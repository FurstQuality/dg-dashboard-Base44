/** US state names paired with their postal codes, used across course search. */
export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s.name]));

/**
 * Legacy / informal spellings that must resolve to the same postal code as the
 * canonical name. Keys are lowercase and punctuation-free.
 */
const STATE_ALIASES: Record<string, string> = {
  ala: "AL",
  ariz: "AZ",
  ark: "AR",
  cal: "CA",
  calif: "CA",
  colo: "CO",
  conn: "CT",
  del: "DE",
  "washington dc": "DC",
  "washington d c": "DC",
  dc: "DC",
  fla: "FL",
  ind: "IN",
  kan: "KS",
  kans: "KS",
  ken: "KY",
  mass: "MA",
  mich: "MI",
  minn: "MN",
  miss: "MS",
  mont: "MT",
  neb: "NE",
  nebr: "NE",
  nev: "NV",
  "n h": "NH",
  "n hampshire": "NH",
  "new hampshire": "NH",
  "n j": "NJ",
  "n jersey": "NJ",
  "n mex": "NM",
  "n mexico": "NM",
  "n y": "NY",
  "n york": "NY",
  "n c": "NC",
  "n carolina": "NC",
  "north car": "NC",
  "n d": "ND",
  "n dakota": "ND",
  "s c": "SC",
  "s carolina": "SC",
  "s d": "SD",
  "s dakota": "SD",
  okla: "OK",
  oreg: "OR",
  ore: "OR",
  penn: "PA",
  penna: "PA",
  tenn: "TN",
  tex: "TX",
  vt: "VT",
  va: "VA",
  "w va": "WV",
  "w virginia": "WV",
  wash: "WA",
  wis: "WI",
  wisc: "WI",
  wyo: "WY",
  "puerto rico": "PR",
};

const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

/** Lowercase, strip punctuation, collapse whitespace. */
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[.\u2019'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Canonical US state resolver. Accepts a postal code ("in", "IN."), a full
 * state name ("Indiana"), a common abbreviation ("Ind."), or a location string
 * ("Lakeland, Indiana 46032" / "Emporia, KS"). Returns the postal code, or null
 * when no US state can be identified.
 */
export function normalizeStateCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = normalizeText(String(input));
  if (!text) return null;

  // Direct postal code or exact/aliased name.
  const upper = text.toUpperCase();
  if (upper.length === 2 && BY_CODE.has(upper)) return upper;
  const byName = BY_NAME.get(text);
  if (byName) return byName;
  const alias = STATE_ALIASES[text];
  if (alias) return alias;

  // Location strings: scan comma/space separated segments from the end, so
  // "Carmel, Indiana 46032" and "Carmel, IN 46032" both resolve.
  const segments = String(input)
    .split(",")
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .reverse();
  for (const segment of segments) {
    const withoutZip = segment.replace(/\b\d{5}(?:\s+\d{4})?\b/g, " ").trim();
    if (!withoutZip) continue;
    const segUpper = withoutZip.toUpperCase();
    if (segUpper.length === 2 && BY_CODE.has(segUpper)) return segUpper;
    if (BY_NAME.has(withoutZip)) return BY_NAME.get(withoutZip)!;
    if (STATE_ALIASES[withoutZip]) return STATE_ALIASES[withoutZip];
    // Trailing code, e.g. "emporia ks".
    const tail = withoutZip.match(/\b([a-z]{2})$/);
    if (tail && BY_CODE.has(tail[1].toUpperCase())) return tail[1].toUpperCase();
    // Trailing full name, e.g. "carmel indiana" or "raleigh north carolina".
    for (const [name, code] of BY_NAME) {
      if (withoutZip === name || withoutZip.endsWith(" " + name)) return code;
    }
  }
  return null;
}

/**
 * Every stored spelling that should match a state filter: the postal code plus
 * the full name. Used to build case-insensitive equality filters so rows saved
 * as "IN" and rows saved as "Indiana" land in the same bucket.
 */
export function stateFilterVariants(input: string): string[] {
  const code = normalizeStateCode(input);
  if (!code) return [input.trim()].filter(Boolean);
  const name = BY_CODE.get(code);
  return name ? [code, name] : [code];
}

/** "Illinois" -> "IL". Returns null when the text isn't a state name. */
export function stateCodeFromName(text: string): string | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  if (q.length === 2 && BY_CODE.has(q.toUpperCase())) return q.toUpperCase();
  const exact = US_STATES.find((s) => s.name.toLowerCase() === q);
  if (exact) return exact.code;
  const partial = US_STATES.filter((s) => s.name.toLowerCase().startsWith(q));
  return partial.length === 1 && q.length >= 4 ? partial[0].code : null;
}

/** "IL" -> "Illinois", falling back to the raw code for territories. */
export function stateName(code: string): string {
  return BY_CODE.get(code.trim().toUpperCase()) ?? code;
}
