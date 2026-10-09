/**
 * Pull the long-form "About" copy off a public event page (PDGA, UDisc, Disc
 * Golf Scene). Meta/OpenGraph descriptions on those pages are one-line share
 * blurbs ("See up to date scores for … here."), which is useless as an event
 * description, so importers prefer this text and fall back to the meta blurb.
 */

const HEADINGS = [
  "about",
  "about this event",
  "about the league",
  "about the tournament",
  "event details",
  "tournament details",
  "league details",
  "details",
  "description",
  "tournament information",
  "event information",
];

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)));
}

/** Block-level tags become newlines so paragraphs survive the strip. */
function blockText(html: string): string {
  return decode(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isBoilerplate(text: string): boolean {
  if (text.length < 40) return true;
  return /^see up to date scores|^sign in|^log in|^cookie/i.test(text);
}

/**
 * Find a heading whose text matches an About-style label and return the cleaned
 * text of the markup that follows it, up to the next heading.
 */
export function extractAboutText(html: string, maxLength = 4000): string | null {
  const headingRx = /<(h[1-6]|strong|dt|div|span)[^>]*>([^<]{2,60})<\/\1>/gi;
  let match: RegExpExecArray | null;
  const candidates: string[] = [];

  while ((match = headingRx.exec(html))) {
    const label = decode(match[2]).replace(/[:\s]+$/, "").trim().toLowerCase();
    if (!HEADINGS.includes(label)) continue;
    const after = html.slice(match.index + match[0].length);
    const stop = after.search(/<h[1-6][^>]*>/i);
    const body = stop > 0 ? after.slice(0, stop) : after.slice(0, 20000);
    const text = blockText(body);
    if (text && !isBoilerplate(text)) candidates.push(text);
  }

  if (!candidates.length) return null;
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  return best.length > maxLength ? `${best.slice(0, maxLength).trimEnd()}…` : best;
}
