import { createHash, randomBytes } from "node:crypto";
import { calendarProvider } from "./service-providers";
import { getConnectionKeyForUser, saveConnectionKeyForUser, deleteConnectionKeyForUser, consumeConnectionKeyForUser, replaceConnectionKeyForUser } from "./app-user-connections.server";

export const DIRECT_CALENDAR = "google_calendar_direct";
const PENDING = "google_calendar_oauth";
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly"];
type Credential = { refreshToken: string; accessToken: string; expiresAt: number };
type Attempt = { state: string; verifier: string; redirectUri: string; expiresAt: number };

function settings() {
  const provider = calendarProvider(process.env);
  if (provider.id !== "google" || provider.keys.some(k => !process.env[k]?.trim())) {
    throw new Error("Google Calendar is not configured.");
  }
  const encryptionKey = Buffer.from(process.env.APP_USER_CONNECTION_KEY_SECRET!, "base64");
  if (encryptionKey.length !== 32) throw new Error("Google Calendar credential encryption is not configured.");
  const redirect = new URL(process.env.GOOGLE_REDIRECT_URI!);
  const local = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  if ((redirect.protocol !== "https:" && !(local && redirect.protocol === "http:")) || redirect.username || redirect.password || redirect.search || redirect.hash || redirect.pathname !== "/google-calendar-callback") {
    throw new Error("Google Calendar callback must use the app's /google-calendar-callback URL.");
  }
  return { clientId: process.env.GOOGLE_CLIENT_ID!.trim(), clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(), redirectUri: redirect.href };
}

async function tokenRequest(params: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number; scope?: string }> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params), signal: AbortSignal.timeout(20_000), redirect: "error",
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (typeof data.access_token !== "string" || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error();
    return data;
  } catch { throw new Error("Google Calendar authorization failed. Please reconnect your calendar."); }
}

export async function startDirectCalendar(userId: string, origin: string) {
  const config = settings();
  if (new URL(config.redirectUri).origin !== origin) throw new Error("Google Calendar callback is configured for a different app origin.");
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  await saveConnectionKeyForUser(userId, PENDING, JSON.stringify({ state, verifier, redirectUri: config.redirectUri, expiresAt: Date.now() + 10 * 60_000 } satisfies Attempt));
  const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: CALENDAR_SCOPES.join(" "), access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" });
  return { provider: "google" as const, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state };
}

export async function completeDirectCalendar(userId: string, code: string, state: string, origin: string) {
  const config = settings();
  const raw = await consumeConnectionKeyForUser(userId, PENDING);
  if (!raw) throw new Error("Calendar authorization expired. Please connect again.");
  const attempt = JSON.parse(raw) as Attempt;
  if (attempt.state !== state || attempt.expiresAt < Date.now() || attempt.redirectUri !== config.redirectUri || new URL(attempt.redirectUri).origin !== origin) throw new Error("Calendar authorization expired. Please connect again.");
  const data = await tokenRequest({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: attempt.redirectUri, grant_type: "authorization_code", code, code_verifier: attempt.verifier });
  const scopes = new Set(data.scope?.split(" ") ?? []);
  if (!CALENDAR_SCOPES.every(s => scopes.has(s))) throw new Error("Allow calendar viewing and event editing to connect.");
  if (!data.refresh_token) throw new Error("Google did not grant offline access. Please connect again.");
  await saveConnectionKeyForUser(userId, DIRECT_CALENDAR, JSON.stringify({ refreshToken: data.refresh_token, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 } satisfies Credential));
  return { ok: true };
}

export async function directCalendarRequest(userId: string, path: string, init: RequestInit = {}): Promise<Response> {
  if (!/^\/calendar\/v3\/calendars\/primary\/events(?:\?|\/|$)/.test(path) || path.includes("..") || path.includes("\\")) throw new Error("Invalid calendar request.");
  const config = settings();
  const raw = await getConnectionKeyForUser(userId, DIRECT_CALENDAR);
  if (!raw) throw new Error("Connect Google Calendar first.");
  let credential = JSON.parse(raw) as Credential;
  if (credential.expiresAt < Date.now() + 60_000) {
    const data = await tokenRequest({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: credential.refreshToken });
    credential = { refreshToken: data.refresh_token ?? credential.refreshToken, accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    await replaceConnectionKeyForUser(userId, DIRECT_CALENDAR, raw, JSON.stringify(credential));
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${credential.accessToken}`);
  try { return await fetch(`https://www.googleapis.com${path}`, { ...init, headers, signal: AbortSignal.timeout(20_000), redirect: "error" }); }
  catch { throw new Error("Google Calendar could not complete the request. Please try again."); }
}

export async function disconnectDirectCalendar(userId: string) {
  const raw = await getConnectionKeyForUser(userId, DIRECT_CALENDAR);
  if (raw) {
    const credential = JSON.parse(raw) as Credential;
    try {
      const res = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: credential.refreshToken }), signal: AbortSignal.timeout(20_000), redirect: "error" });
      if (!res.ok) throw new Error();
    } catch { throw new Error("Google could not confirm disconnection. Please try again."); }
  }
  await deleteConnectionKeyForUser(userId, DIRECT_CALENDAR);
  await deleteConnectionKeyForUser(userId, PENDING);
}
