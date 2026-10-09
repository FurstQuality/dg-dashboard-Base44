/**
 * Client-side contact hashing. Raw emails/phones NEVER leave the browser;
 * we only send SHA-256 hashes to the server for matching.
 */

export type ContactKind = "email" | "phone";
export type NormalizedContact = { kind: ContactKind; value: string; original: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

/** Best-effort E.164-ish normalization. Default region: US. */
export function normalizePhone(raw: string, defaultCountry = "1"): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (raw.trim().startsWith("+") && digits.length >= 8) return "+" + digits;
  if (digits.length === 10) return "+" + defaultCountry + digits;
  if (digits.length === 11 && digits.startsWith(defaultCountry)) return "+" + digits;
  if (digits.length >= 8 && digits.length <= 15) return "+" + digits;
  return null;
}

export function normalizeContact(raw: string): NormalizedContact | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const email = normalizeEmail(trimmed);
  if (email) return { kind: "email", value: email, original: trimmed };
  const phone = normalizePhone(trimmed);
  if (phone) return { kind: "phone", value: phone, original: trimmed };
  return null;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashContact(c: NormalizedContact): Promise<string> {
  // Kind-prefixed so an email that happens to equal a phone can't collide.
  return sha256Hex(`${c.kind}:${c.value}`);
}

export async function hashMany(
  contacts: NormalizedContact[],
): Promise<{ hash: string; contact: NormalizedContact }[]> {
  return Promise.all(contacts.map(async (c) => ({ hash: await hashContact(c), contact: c })));
}

/** Parse a pasted list, CSV column, or vCard-style dump. */
export function extractContacts(text: string): NormalizedContact[] {
  const tokens = text.split(/[\s,;\n\r\t"']+/g);
  const seen = new Set<string>();
  const out: NormalizedContact[] = [];
  for (const t of tokens) {
    const n = normalizeContact(t);
    if (n && !seen.has(`${n.kind}:${n.value}`)) {
      seen.add(`${n.kind}:${n.value}`);
      out.push(n);
    }
  }
  return out;
}
