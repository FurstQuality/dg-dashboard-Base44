import { z } from "zod";
import { fetchAllowedUrl } from "./safe-fetch.server";
import { readBoundedBody, readBoundedText } from "./http-safety";

/**
 * Server-only helpers for profile photo / UDisc account imports.
 * Kept out of the *.functions.ts wrapper so server-function splitting cannot
 * strip them at build time.
 */
export const photoInputSchema = z.object({
  source: z.enum(["pdga", "scene", "udisc", "url"]),
  // For pdga: a PDGA number OR profile URL; for scene/udisc/url: profile URL.
  value: z.string().min(1).max(500),
});

// Allowlist of hosts we're willing to fetch profile pages/images from.
// Keep tight — this endpoint runs server-side and would otherwise let an
// authenticated user probe internal/link-local/metadata addresses (SSRF).
const ALLOWED_HOSTS = new Set<string>([
  "www.pdga.com",
  "pdga.com",
  "www.discgolfscene.com",
  "discgolfscene.com",
  "udisc.com",
  "www.udisc.com",
  "app.udisc.com",
]);

/**
 * UDisc serves member avatars from its CloudFront image CDN, which is not on
 * a udisc.com domain. Only these exact hosts are allowed — never all of
 * cloudfront.net.
 */
const UDISC_IMAGE_HOSTS = new Set<string>([
  "d22ksth68ujgu2.cloudfront.net",
  "images.udisc.com",
]);

function isHostAllowed(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(h) || UDISC_IMAGE_HOSTS.has(h)) return true;
  // Allow subdomains of listed apex domains (e.g. images.pdga.com, cdn.udisc.com).
  return ["pdga.com", "discgolfscene.com", "udisc.com"].some(
    (apex) => h === apex || h.endsWith("." + apex),
  );
}

export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) {
    throw new Error("Use an HTTPS profile URL without credentials or a custom port");
  }
  const host = u.hostname.toLowerCase();
  // Block obvious private / link-local / metadata / loopback targets by name.
  // (Full IP-range checks aren't reliable here without DNS resolution; the
  // host allowlist below is what actually enforces safety.)
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host.endsWith(".internal") ||
    host.endsWith(".local") ||
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    /^\[?(::1|fc00|fd|fe80)/i.test(host) ||
    host === "169.254.169.254"
  ) {
    throw new Error("Host is not allowed");
  }
  if (!isHostAllowed(host)) {
    throw new Error("Only PDGA, Disc Golf Scene, and UDisc profile URLs are supported");
  }
  return u;
}

export async function fetchHtml(url: string): Promise<string> {
  assertSafeUrl(url);
  const res = await fetchAllowedUrl(url, assertSafeUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`Could not load profile (${res.status})`);
  return await readBoundedText(res, 4 * 1024 * 1024);
}

export function absolutize(src: string, pageUrl: string): string {
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  try {
    const u = new URL(pageUrl);
    if (src.startsWith("/")) return `${u.protocol}//${u.host}${src}`;
    return new URL(src, pageUrl).toString();
  } catch {
    return src;
  }
}

function parsePdgaPhoto(html: string): string | null {
  const patterns = [
    /<img[^>]+src="([^"]+\/player-photos\/[^"]+)"/i,
    /<img[^>]+src="([^"]+scaled_and_cropped[^"]+)"/i,
    /<img[^>]+typeof="foaf:Image"[^>]+src="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1] && !/logo|icon|placeholder|avatar-default/i.test(m[1])) {
      return m[1].replace(/&amp;/g, "&");
    }
  }
  return null;
}

function parseScenePhoto(html: string): string | null {
  // DGS uses /images/players/... uploads
  const patterns = [
    /<img[^>]+src="([^"]+\/images\/players\/[^"]+)"/i,
    /<img[^>]+class="[^"]*player-photo[^"]*"[^>]+src="([^"]+)"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1] && !/logo|icon|placeholder|silhouette/i.test(m[1])) {
      return m[1].replace(/&amp;/g, "&");
    }
  }
  return null;
}

/**
 * UDisc share links (app.udisc.com/applink/community/profile?profileId=…) do
 * not set og:image, but the rendered page contains the member's avatar from
 * the UDisc image CDN plus their display name and @username.
 */
export function parseUdiscPhoto(html: string): string | null {
  const patterns = [
    /<img[^>]+class="[^"]*rounded-full[^"]*"[^>]+src="(https?:\/\/[^"]+)"/i,
    /<img[^>]+src="(https?:\/\/[^"]*cloudfront\.net\/[^"]+_player_[^"]+)"/i,
    /<img[^>]+src="(https?:\/\/[^"]*cloudfront\.net\/[^"]+\.(?:jpg|jpeg|png|webp))"/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1] && !/logo|badge|icon|placeholder|app-store|google-play/i.test(m[1])) {
      return m[1].replace(/&amp;/g, "&");
    }
  }
  return null;
}

export type UdiscIdentity = { displayName: string | null; username: string | null };

export function parseUdiscIdentity(html: string): UdiscIdentity {
  // og:title looks like: "Furst (@furst93) | UDisc Community"
  const title = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  )?.[1];
  const decoded = title ? title.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'") : null;
  const m = decoded?.match(/^\s*(.+?)\s*\(@([^)]+)\)/);
  if (m) return { displayName: m[1].trim(), username: m[2].trim() };
  const handle = html.match(/>@<!--\s*-->([A-Za-z0-9._-]+)</)?.[1] ?? null;
  return { displayName: decoded?.split("(")[0].trim() || null, username: handle };
}

export function parseOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  return m?.[1] ? m[1].replace(/&amp;/g, "&") : null;
}

export async function resolvePhotoUrl(
  source: string,
  value: string,
): Promise<{ photoUrl: string; pageUrl: string }> {
  let pageUrl = value.trim();

  if (source === "pdga") {
    const num = pageUrl.match(/\d{3,7}/)?.[0];
    if (!num) throw new Error("Enter a PDGA number or PDGA player URL");
    pageUrl = `https://www.pdga.com/player/${num}`;
    const html = await fetchHtml(pageUrl);
    const found = parsePdgaPhoto(html) ?? parseOgImage(html);
    if (!found) throw new Error("No PDGA photo found for this player");
    return { photoUrl: absolutize(found, pageUrl), pageUrl };
  }

  if (!/^https?:\/\//i.test(pageUrl)) throw new Error("Paste a full profile URL (https://…)");
  const html = await fetchHtml(pageUrl);

  let found: string | null = null;
  if (source === "scene" || /discgolfscene\.com/i.test(pageUrl)) {
    found = parseScenePhoto(html);
  }
  if (source === "udisc" || /udisc\.com/i.test(pageUrl)) {
    found = found ?? parseUdiscPhoto(html);
  }
  // Generic URLs — fall back to og:image.
  found = found ?? parseOgImage(html);
  if (!found) throw new Error("No profile photo found on that page");

  return { photoUrl: absolutize(found, pageUrl), pageUrl };
}


type StorageClient = {
  storage: {
    from: (b: string) => {
      upload: (
        p: string,
        body: Uint8Array,
        opts: { upsert: boolean; contentType: string },
      ) => Promise<{ error: { message: string } | null }>;
      createSignedUrl: (
        p: string,
        expires: number,
      ) => Promise<{ data: { signedUrl: string } | null }>;
    };
  };
};

/** Download a remote image and store it as the user's avatar; returns a signed URL. */
export async function storeAvatarFromUrl(
  supabase: unknown,
  userId: string,
  photoUrl: string,
  pageUrl: string,
  source: string,
): Promise<string> {
  assertSafeUrl(photoUrl);
  const imgRes = await fetchAllowedUrl(photoUrl, assertSafeUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      Referer: pageUrl,
    },
  });
  if (!imgRes.ok) throw new Error(`Could not download photo (${imgRes.status})`);
  const contentType = (imgRes.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    await imgRes.body?.cancel();
    throw new Error("Use a JPEG, PNG or WebP photo");
  }
  const buf = await readBoundedBody(imgRes, 8 * 1024 * 1024);
  if (!isRasterPhoto(buf, contentType)) throw new Error("The photo content does not match its image type");
  if (buf.byteLength < 500) throw new Error("Photo looks empty");
  if (buf.byteLength > 8 * 1024 * 1024) throw new Error("Photo is too large (>8MB)");

  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const path = `${userId}/avatar-${source}-${Date.now()}.${ext}`;
  const store = (supabase as StorageClient).storage.from("avatars");
  const { error: upErr } = await store.upload(path, buf, { upsert: false, contentType });
  if (upErr) throw new Error(upErr.message);
  const { data: signed } = await store.createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (!signed?.signedUrl) throw new Error("Could not sign photo URL");
  return signed.signedUrl;
}


export function isRasterPhoto(bytes: Uint8Array, type: string): boolean {
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  if (type === "image/webp") return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  return false;
}

export const udiscInput = z.object({ url: z.string().min(1).max(500) });
