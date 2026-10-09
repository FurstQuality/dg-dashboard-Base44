/**
 * Event titles pulled from outside listings often carry the source's own brand
 * ("UDisc League Leaderboard", "PDGA Sanctioned — Fall Fling") or the whole
 * browser-tab title of the page they were scraped from ("League Leaderboard |
 * NWI High Flyers Friday Night Glow! | UDisc Events"). None of that means
 * anything to players inside DG Dashboard, so strip it everywhere a name is
 * saved or displayed.
 */
const BRAND = /\b(u\s?disc|pdga)\b/gi;

/** Page furniture that is never part of the event's real name. */
const CHROME =
  /^(the\s+)?(league\s+|event\s+|tournament\s+)?(leader\s?boards?|results?|standings?|scores?|scorecards?|events?|event\s+details?|registration|sign[\s-]?up|schedule|calendar|home|tour|disc\s*golf\s*(scene|courses?(\s*&\s*events?)?)|u\s?disc(\s+events?)?|pdga(\s+events?)?)$/i;

/**
 * Drops chrome segments from a scraped page title. "League Leaderboard | NWI
 * High Flyers Friday Night Glow! | UDisc Events" becomes "NWI High Flyers
 * Friday Night Glow!".
 */
function stripPageTitleChrome(raw: string): string {
  const bySeparator = raw.split(/\s*[|»]\s*/).filter((s) => s.trim().length > 0);
  if (bySeparator.length > 1) {
    const kept = bySeparator.filter((s) => !CHROME.test(s.trim()));
    if (kept.length > 0) {
      // Keep the most descriptive remaining segment — scraped titles put the
      // event name in one segment and site furniture in the others.
      raw = kept.reduce((best, s) => (s.trim().length > best.trim().length ? s : best)).trim();
    }
  }
  // "League Leaderboard: Friday Night Glow" — same furniture, colon-separated.
  const colon = raw.split(/\s*:\s*/);
  if (colon.length > 1 && CHROME.test(colon[0]!.trim())) {
    const rest = colon.slice(1).join(": ").trim();
    if (rest.length >= 2) raw = rest;
  }
  return raw.trim();
}

export function stripEventSourceBrands(raw: string): string {
  if (!raw) return raw;
  const stripped = stripPageTitleChrome(raw)
    .replace(BRAND, " ")
    // Leftovers like "powered by", "presented on", "sanctioned by" now dangling.
    .replace(/\b(powered|presented|hosted|scored|sanctioned)\s+(by|on|via|with)\b/gi, " ")
    .replace(/\b(via|on|by)\s*(?=[-–—·|,)]|$)/gi, " ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,:;])/g, "$1")
    .replace(/([-–—·|,:])\s*(?=[-–—·|,:])/g, "")
    .replace(/^[-–—·:|,\s]+|[-–—·:|,\s]+$/g, "")
    .trim();
  // Never hand back an empty title — keep the original if nothing survived.
  return stripped.length >= 2 ? stripped : raw.trim();
}
