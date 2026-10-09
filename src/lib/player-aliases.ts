/**
 * UDisc scorecards are group cards, and people rarely use one spelling of their
 * name: "Michael Furst", "Furst", "furst93", or even their PDGA number can all
 * show up in the player column. These helpers let the importer take a list of
 * names/handles/numbers and decide whether a CSV row belongs to the player.
 */

/** Lowercase, drop accents and punctuation so "Furst_93" and "furst 93" agree. */
export function normalizeAlias(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Splits a typed field ("michael furst, furst93, 236190") into clean aliases. */
export function parseAliases(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input) ? input : (input ?? "").split(/[,;\n|]/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const trimmed = (part ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeAlias(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Alias with its normalized form, tokens and digits precomputed. */
type PreparedAlias = {
  normalized: string;
  tokens: string[];
  digits: string;
  /** Letters only — lets "furst93" match "Furst". */
  letters: string;
};

function prepare(alias: string): PreparedAlias {
  const normalized = normalizeAlias(alias);
  return {
    normalized,
    tokens: normalized.split(" ").filter(Boolean),
    digits: normalized.replace(/\D/g, ""),
    letters: normalized.replace(/[^a-z]/g, ""),
  };
}

/**
 * Builds a matcher for one player across many spellings. Returns a function
 * that takes the CSV player-column value and says whether it's them.
 */
export function makeAliasMatcher(aliases: string[]): (playerName: string) => boolean {
  const prepared = parseAliases(aliases)
    .map(prepare)
    .filter((a) => a.normalized.length > 0);
  if (prepared.length === 0) return () => true;

  return (playerName: string) => {
    const row = prepare(playerName ?? "");
    if (!row.normalized) return false;

    for (const alias of prepared) {
      // Exact, after normalizing punctuation and case.
      if (alias.normalized === row.normalized) return true;

      // Pure-number alias (PDGA number) appearing anywhere in the row value.
      if (alias.digits.length >= 4 && alias.letters.length === 0) {
        if (row.digits.includes(alias.digits)) return true;
        continue;
      }

      // Handle vs. name: "furst93" ↔ "Furst", "michaelfurst" ↔ "Michael Furst".
      const aliasLetters = alias.letters;
      const rowLetters = row.letters;
      if (aliasLetters.length >= 3 && rowLetters.length >= 3) {
        if (aliasLetters === rowLetters) return true;
        if (aliasLetters.length >= 4 && rowLetters.includes(aliasLetters)) return true;
        if (rowLetters.length >= 4 && aliasLetters.includes(rowLetters)) return true;
      }

      // Every word of the alias shows up as a word in the row value:
      // "furst" matches "Michael Furst", "michael furst" matches "Furst, Michael".
      if (
        alias.tokens.length > 0 &&
        alias.tokens.every((t) => t.length >= 3 && row.tokens.includes(t))
      ) {
        return true;
      }
    }
    return false;
  };
}

/** True when any alias in the list identifies this CSV player value. */
export function aliasMatchesPlayer(aliases: string[], playerName: string): boolean {
  return makeAliasMatcher(aliases)(playerName);
}

/** Exact confirmation check used after a player selects names from the CSV. */
export function isConfirmedPlayerName(confirmedNames: string[], playerName: string): boolean {
  const confirmed = new Set(parseAliases(confirmedNames).map(normalizeAlias));
  return confirmed.has(normalizeAlias(playerName));
}

/** Multiple loose matches need confirmation; multiple exact confirmations do not. */
export function shouldRejectAmbiguousPlayerNames(
  matchedPlayerNames: string[],
  confirmedPlayerNames: string[],
): boolean {
  const distinctMatches = new Set(matchedPlayerNames.map(normalizeAlias).filter(Boolean));
  return confirmedPlayerNames.length === 0 && distinctMatches.size > 1;
}
