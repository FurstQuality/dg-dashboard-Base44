/**
 * Shared cleanup for disc names that arrive from outside sources.
 *
 * Survey pages carry a mix of encoding damage, trailing notes in brackets and
 * the occasional blank row, so every name is put through here before it is
 * allowed to become a disc in our library.
 */

/** Characters we allow in a stored disc or brand name. */
const ALLOWED = /[^A-Za-z0-9 '’&./+-]/g;

const SUSPECT = /[ÃÂÅåãâ€™œ¢±ƒ]/;

/**
 * Undo the classic "UTF-8 read as Latin-1" damage (Café -> CafÃ©). Only the
 * repaired text is kept, and only when it looks less damaged than the original.
 */
export function repairMojibake(input: string): string {
  if (!SUSPECT.test(input)) return input;
  if ([...input].some((c) => c.charCodeAt(0) > 0xff)) {
    // Mixed damage we cannot round-trip; leave it to the character filter.
    return input;
  }
  try {
    const bytes = Uint8Array.from([...input].map((c) => c.charCodeAt(0)));
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return SUSPECT.test(decoded) ? input : decoded;
  } catch {
    return input;
  }
}

export type CleanName = {
  /** Storable name, or null when the source text is unusable. */
  name: string | null;
  /** Anything peeled out of brackets, kept as a note for the description. */
  note: string | null;
  /** Plain-language reason the name was refused. */
  skipReason: string | null;
};

/**
 * Turn a raw survey disc name into something we can store, or explain why not.
 */
export function cleanMoldName(raw: string | null | undefined): CleanName {
  const source = String(raw ?? "").trim();
  if (!source) return { name: null, note: null, skipReason: "No disc name given" };

  const repaired = repairMojibake(source);

  // Trailing bracketed text is a note ("Wombat (older run)"), not part of the name.
  const noteParts: string[] = [];
  const withoutBrackets = repaired
    .replace(/[([{]([^)\]}]*)[)\]}]/g, (_m, inner: string) => {
      const text = String(inner).trim();
      if (text) noteParts.push(text);
      return " ";
    })
    .trim();

  const cleaned = withoutBrackets
    .replace(ALLOWED, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-'’&./+]+|[-'’&./+]+$/g, "")
    .trim();

  const letters = cleaned.replace(/[^A-Za-z0-9]/g, "");
  if (!letters) {
    return { name: null, note: null, skipReason: "Name had no readable characters" };
  }
  if (/^\d+$/.test(letters)) {
    return { name: null, note: null, skipReason: "Name was only numbers" };
  }
  if (letters.length < 2) {
    return { name: null, note: null, skipReason: "Name was too short to be a disc" };
  }

  return {
    name: titleCase(cleaned),
    note: noteParts.length ? noteParts.join("; ") : null,
    skipReason: null,
  };
}

/** Brand names get the same character cleanup, without the skip rules. */
export function cleanBrandName(raw: string | null | undefined): string | null {
  const cleaned = repairMojibake(String(raw ?? "").trim())
    .replace(ALLOWED, " ")
    .replace(/\s+/g, " ")
    .trim();
  const letters = cleaned.replace(/[^A-Za-z0-9]/g, "");
  if (letters.length < 2) return null;
  return titleCase(cleaned);
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .map((word) =>
      word.length > 3 && word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** URL-safe key for a name. */
export function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export type DiscCategory =
  | "distance_driver"
  | "fairway_driver"
  | "midrange"
  | "putter"
  | "approach"
  | "specialty";

export type DiscStability =
  | "very_overstable"
  | "overstable"
  | "stable"
  | "understable"
  | "very_understable";

/** Bucket a disc by its speed rating the way players talk about it. */
export function categoryFromSpeed(speed: number | null | undefined): DiscCategory {
  if (speed == null || !Number.isFinite(speed)) return "specialty";
  if (speed <= 4) return "putter";
  if (speed <= 5) return "approach";
  if (speed <= 6) return "midrange";
  if (speed <= 9) return "fairway_driver";
  return "distance_driver";
}

/** Turn plus fade is the usual shorthand for how a disc holds a line. */
export function stabilityFromFlight(
  turn: number | null | undefined,
  fade: number | null | undefined,
): DiscStability | null {
  if (turn == null || fade == null || !Number.isFinite(turn) || !Number.isFinite(fade)) return null;
  const total = Number(turn) + Number(fade);
  if (total >= 3) return "very_overstable";
  if (total >= 1.5) return "overstable";
  if (total >= 0) return "stable";
  if (total >= -2) return "understable";
  return "very_understable";
}
