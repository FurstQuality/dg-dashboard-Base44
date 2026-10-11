import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("../app-user-connections.server", () => ({
  getConnectionKeyForUser: async (user: string, connector: string) => storage.get(`${user}:${connector}`) ?? null,
  saveConnectionKeyForUser: async (user: string, connector: string, value: string) => { storage.set(`${user}:${connector}`, value); },
  deleteConnectionKeyForUser: async (user: string, connector: string) => { storage.delete(`${user}:${connector}`); },
  consumeConnectionKeyForUser: async (user: string, connector: string) => { const key = `${user}:${connector}`, value = storage.get(key) ?? null; storage.delete(key); return value; },
  replaceConnectionKeyForUser: async (user: string, connector: string, expected: string, value: string) => { const key = `${user}:${connector}`; if (storage.get(key) !== expected) throw new Error("Calendar connection changed."); storage.set(key, value); },
}));
import { startDirectCalendar, completeDirectCalendar, directCalendarRequest, disconnectDirectCalendar, DIRECT_CALENDAR, CALENDAR_SCOPES } from "../google-calendar.server";
import { connectorReadiness } from "../admin-operations";
import { secureResponse } from "../security-headers";

const request = vi.fn(), origin = "https://dashboard.example", user = "alice";
beforeEach(() => {
  storage.clear(); request.mockReset(); vi.stubGlobal("fetch", request);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "private-test-secret"); vi.stubEnv("GOOGLE_REDIRECT_URI", origin + "/google-calendar-callback"); vi.stubEnv("APP_USER_CONNECTION_KEY_SECRET", Buffer.alloc(32, 1).toString("base64"));
  vi.stubEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY", "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const grant = () => Response.json({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, scope: CALENDAR_SCOPES.join(" ") });
async function connect() { const auth = await startDirectCalendar(user, origin); request.mockResolvedValueOnce(grant()); await completeDirectCalendar(user, "code", auth.state, origin); return auth; }

describe("direct Google Calendar authorization", () => {
  it("uses offline authorization, PKCE and a server-only verifier", async () => {
    const auth = await startDirectCalendar(user, origin), url = new URL(auth.authorizationUrl);
    expect(url.hostname).toBe("accounts.google.com"); expect(url.searchParams.get("access_type")).toBe("offline"); expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    const attempt = JSON.parse(storage.get(user + ":google_calendar_oauth")!);
    expect(attempt.verifier.length).toBeGreaterThanOrEqual(43); expect(JSON.stringify(auth)).not.toContain(attempt.verifier); expect(JSON.stringify(auth)).not.toContain("private-test-secret");
    request.mockResolvedValueOnce(grant());
    expect(await completeDirectCalendar(user, "code", auth.state, origin)).toEqual({ ok: true });
    const body = new URLSearchParams(request.mock.calls[0][1].body);
    expect(body.get("code_verifier")).toBe(attempt.verifier); expect(body.get("client_secret")).toBe("private-test-secret");
    expect(storage.has(user + ":google_calendar_oauth")).toBe(false);
    expect(JSON.parse(storage.get(user + ":" + DIRECT_CALENDAR)!).refreshToken).toBe("test-refresh");
  });
  it("cannot complete another user's attempt", async () => {
    const auth = await startDirectCalendar(user, origin);
    await expect(completeDirectCalendar("bob", "code", auth.state, origin)).rejects.toThrow("expired"); expect(request).not.toHaveBeenCalled();
    expect(storage.has(user + ":google_calendar_oauth")).toBe(true);
  });
  it("rejects replay and allows only one concurrent exchange", async () => {
    const auth = await startDirectCalendar(user, origin); request.mockResolvedValueOnce(grant());
    const results = await Promise.allSettled([completeDirectCalendar(user, "code", auth.state, origin), completeDirectCalendar(user, "code", auth.state, origin)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(request).toHaveBeenCalledTimes(1);
    await expect(completeDirectCalendar(user, "code", auth.state, origin)).rejects.toThrow("expired");
  });
  it.each(["state", "origin", "expiry"])("rejects an invalid %s before token exchange", async kind => {
    const auth = await startDirectCalendar(user, origin);
    if (kind === "expiry") { const key = user + ":google_calendar_oauth", attempt = JSON.parse(storage.get(key)!); storage.set(key, JSON.stringify({ ...attempt, expiresAt: 0 })); }
    await expect(completeDirectCalendar(user, "code", kind === "state" ? "wrong" : auth.state, kind === "origin" ? "https://other.example" : origin)).rejects.toThrow("expired"); expect(request).not.toHaveBeenCalled();
  });
  it.each(["scope", "refresh token", "malformed token"])("does not save an incomplete %s grant", async kind => {
    const auth = await startDirectCalendar(user, origin);
    request.mockResolvedValueOnce(Response.json({ access_token: kind === "malformed token" ? null : "test-access", refresh_token: kind === "refresh token" ? undefined : "test-refresh", scope: kind === "scope" ? CALENDAR_SCOPES[0] : CALENDAR_SCOPES.join(" "), expires_in: 3600 }));
    await expect(completeDirectCalendar(user, "code", auth.state, origin)).rejects.toThrow(); expect(storage.has(user + ":" + DIRECT_CALENDAR)).toBe(false);
  });
  it("blocks callbacks with a different origin and partial configuration", async () => {
    await expect(startDirectCalendar(user, "https://other.example")).rejects.toThrow("different app origin");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", ""); vi.stubEnv("GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY", "legacy-key");
    await expect(startDirectCalendar(user, origin)).rejects.toThrow("not configured");
    const status = connectorReadiness(process.env).find(c => c.id === "calendar")!;
    expect(status.mode).toBe("Google Calendar · Direct"); expect(status.missing).toContain("GOOGLE_CLIENT_SECRET");
  });
  it("blocks invalid encryption keys before storing any authorization state", async () => {
    vi.stubEnv("APP_USER_CONNECTION_KEY_SECRET", "short");
    await expect(startDirectCalendar(user, origin)).rejects.toThrow("encryption"); expect(storage.size).toBe(0);
  });
});

describe("calendar API and disconnection", () => {
  it("refreshes expired tokens and keeps the existing refresh token", async () => {
    await connect(); const key = user + ":" + DIRECT_CALENDAR, old = JSON.parse(storage.get(key)!); storage.set(key, JSON.stringify({ ...old, expiresAt: 0 }));
    request.mockResolvedValueOnce(Response.json({ access_token: "refreshed", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ items: [] }));
    await directCalendarRequest(user, "/calendar/v3/calendars/primary/events?maxResults=250");
    const init = request.mock.calls[2][1]; expect(init.headers.get("Authorization")).toBe("Bearer refreshed");
    expect(JSON.parse(storage.get(key)!).refreshToken).toBe("test-refresh");
  });
  it("does not recreate a disconnected connection during refresh", async () => {
    await connect(); const key = user + ":" + DIRECT_CALENDAR; storage.set(key, JSON.stringify({ ...JSON.parse(storage.get(key)!), expiresAt: 0 }));
    request.mockImplementationOnce(async () => { storage.delete(key); return Response.json({ access_token: "new", expires_in: 3600 }); });
    await expect(directCalendarRequest(user, "/calendar/v3/calendars/primary/events")).rejects.toThrow("changed"); expect(storage.has(key)).toBe(false); expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not leak provider error bodies or fall back after a failed exchange", async () => {
    const auth = await startDirectCalendar(user, origin); request.mockResolvedValueOnce(new Response("private-test-secret", { status: 401 }));
    await expect(completeDirectCalendar(user, "code", auth.state, origin)).rejects.toThrow("authorization failed"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("revokes the Google grant before deleting the encrypted credentials", async () => {
    await connect(); request.mockResolvedValueOnce(new Response("", { status: 200 })); await disconnectDirectCalendar(user);
    expect(request.mock.calls[1][0]).toBe("https://oauth2.googleapis.com/revoke"); expect(storage.has(user + ":" + DIRECT_CALENDAR)).toBe(false);
  });
  it("keeps credentials when revocation cannot be confirmed", async () => {
    await connect(); request.mockRejectedValueOnce(new Error("private-test-secret"));
    await expect(disconnectDirectCalendar(user)).rejects.toThrow("could not confirm"); expect(storage.has(user + ":" + DIRECT_CALENDAR)).toBe(true);
  });
  it("rejects foreign endpoints before making authenticated requests", async () => {
    await expect(directCalendarRequest(user, "//other.example")).rejects.toThrow("Invalid calendar request"); expect(request).not.toHaveBeenCalled();
  });
  it("keeps OAuth callback codes out of caches and referrers", () => {
    const response = secureResponse(new Response(""), new Request(origin + "/google-calendar-callback?code=private"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store"); expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
