/**
 * Turning everyday place talk ("southern Illinois", "NWI", "Chicagoland") into
 * the state code Ace's knowledge library is filed under.
 */

const STATE_NAMES: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

/** Nicknames players actually type. */
const NICKNAMES: Record<string, string> = {
  nwi: "IN",
  "northwest indiana": "IN",
  chicagoland: "IL",
  "the chi": "IL",
  socal: "CA",
  norcal: "CA",
  "bay area": "CA",
  "twin cities": "MN",
  "dfw: ": "TX",
  "metro detroit": "MI",
  "upstate new york": "NY",
  "u.p.": "MI",
};

const CODES = new Set(Object.values(STATE_NAMES));

/**
 * Best-guess state code mentioned in a question. Handles "southern Illinois",
 * "courses near Valparaiso, IN", and bare "Illinois" alike.
 */
export function detectStateCode(text: string): string | null {
  const lower = ` ${text
    .toLowerCase()
    .replace(/[^a-z., ]/g, " ")
    .replace(/\s+/g, " ")} `;
  for (const [phrase, code] of Object.entries(NICKNAMES)) {
    if (lower.includes(` ${phrase.trim()} `)) return code;
  }
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (lower.includes(` ${name} `)) return code;
  }
  const code = lower.match(/\b([a-z]{2})\b(?=[ .,])/g);
  if (code) {
    for (const raw of code) {
      const upper = raw.trim().toUpperCase();
      if (CODES.has(upper) && upper !== "IN" && upper !== "OR" && upper !== "OK") return upper;
    }
  }
  return null;
}

/** Words worth searching on — drops filler so the text search stays sharp. */
const STOP = new Set([
  "what",
  "which",
  "where",
  "when",
  "who",
  "the",
  "are",
  "and",
  "for",
  "you",
  "your",
  "can",
  "with",
  "near",
  "about",
  "there",
  "have",
  "any",
  "all",
  "how",
  "does",
  "disc",
  "golf",
  "course",
  "courses",
  "tell",
  "know",
  "help",
  "please",
  "some",
  "good",
  "best",
  "list",
  "around",
  "close",
]);

export function searchTerms(text: string, max = 8): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(words)].slice(0, max);
}
