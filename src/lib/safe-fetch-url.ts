/**
 * Shared guard for server-side fetches of user-supplied URLs.
 *
 * Validates the parsed hostname (never a substring of the raw URL) against an
 * explicit allowlist and blocks loopback, private, link-local and cloud
 * metadata addresses so import features can't be used as an SSRF proxy.
 */

/** Hosts allowed for event-import scraping (PDGA + Disc Golf Scene). */
export const EVENT_SOURCE_HOSTS = ["pdga.com", "discgolfscene.com"];

function isBlockedHost(host: string): boolean {
  return (
    host === "localhost" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    /^\[?(::1|::ffff:|fc00|fd|fe80)/i.test(host)
  );
}

/**
 * Throws unless `raw` is a public http(s) URL whose hostname matches one of
 * `allowedHosts` (exact match or subdomain). Returns the normalized URL string.
 */
export function assertAllowedFetchUrl(
  raw: string,
  allowedHosts: readonly string[],
  message = "That link isn't from a supported site",
): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("That doesn't look like a valid link");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Only http(s) links are supported");
  }
  if (u.username || u.password || u.port) {
    throw new Error("Credentials and custom ports are not supported in source links");
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isBlockedHost(host)) throw new Error("That host isn't allowed");
  const allowed = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
  if (!allowed) throw new Error(message);
  return u.toString();
}

/** Guard for PDGA / Disc Golf Scene event import links. */
export function assertEventSourceUrl(raw: string): string {
  return assertAllowedFetchUrl(
    raw,
    EVENT_SOURCE_HOSTS,
    "Only Disc Golf Scene and PDGA event links are supported",
  );
}
