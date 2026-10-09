/**
 * Serialize structured data for embedding in a <script type="application/ld+json">
 * tag. User-supplied strings (course names, descriptions) must never be able to
 * close the script element, so `<`, `>` and `&` are unicode-escaped.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
