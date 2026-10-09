import { afterEach, describe, expect, it, vi } from "vitest";
import { readBoundedBody } from "../http-safety";
import { assertAllowedFetchUrl } from "../safe-fetch-url";
import { fetchAllowedUrl } from "../safe-fetch.server";
import { assertSafeUrl, isRasterPhoto } from "../profile-photo.server";
import { assertPushEndpoint, safeNotificationPath } from "../push-safety";
import { secureResponse } from "../security-headers";
import { assertBrowserSupabaseKey } from "../public-supabase-key";
import { markerBearing, markerColor } from "../map/marker-safety";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("outbound URL and streaming boundaries", () => {
  it("blocks a trusted site's redirect to internal infrastructure before the second request", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchAllowedUrl("https://www.pdga.com/player/12345", assertSafeUrl)).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual(expect.arrayContaining([expect.any(String), expect.objectContaining({ redirect: "manual", signal: expect.any(AbortSignal) })]));
  });
  it("follows allowed relative redirects with a finite redirect budget", async () => {
    const fn = vi.fn().mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: "/new" } })).mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fn);
    expect(await (await fetchAllowedUrl("https://pdga.com/old", assertSafeUrl)).text()).toBe("ok");
    expect(fn.mock.calls[1][0]).toBe("https://pdga.com/new");
    fn.mockReset().mockImplementation(async () => new Response(null, { status: 302, headers: { location: "/loop" } }));
    await expect(fetchAllowedUrl("https://pdga.com/old", assertSafeUrl)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(5);
  });
  it("blocks credentials, alternate ports, lookalike domains and SVG photos", () => {
    for (const url of ["https://pdga.com.evil.example", "https://user:secret@pdga.com", "https://pdga.com:8080", "http://pdga.com"]) expect(() => assertSafeUrl(url)).toThrow();
    expect(() => assertAllowedFetchUrl("https://pdga.com:8443", ["pdga.com"])).toThrow();
    expect(isRasterPhoto(new TextEncoder().encode("<svg onload='alert(1)'/>"), "image/jpeg")).toBe(false);
    expect(isRasterPhoto(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).toBe(true);
  });
  it("enforces actual byte limits with missing or dishonest Content-Length", async () => {
    let canceled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(8)); }, cancel() { canceled = true; } });
    await expect(readBoundedBody(new Response(stream, { headers: { "content-length": "1" } }), 10)).rejects.toThrow("payload_too_large");
    expect(canceled).toBe(true);
    await expect(readBoundedBody(new Response("ééé"), 5)).rejects.toThrow("payload_too_large");
  });
});
describe("browser and push boundaries", () => {
  it("allows known browser push hosts and rejects arbitrary destinations", () => {
    for (const url of ["https://fcm.googleapis.com/fcm/send/token", "https://updates.push.services.mozilla.com/wpush/v2/token", "https://web.push.apple.com/token"]) expect(assertPushEndpoint(url)).toBe(url);
    for (const url of ["http://fcm.googleapis.com/token", "https://localhost/x", "https://fcm.googleapis.com.evil.example/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:444/x"]) expect(() => assertPushEndpoint(url)).toThrow();
    for (const url of ["//evil.example", "/\\evil.example", "javascript:alert(1)", "https://evil.example"]) expect(safeNotificationPath(url)).toBe("/");
    expect(safeNotificationPath("/events?q=a")).toBe("/events?q=a");
  });
  it("rejects privileged or malformed keys without echoing them", () => {
    const jwt = (role: string) => "x." + btoa(JSON.stringify({ role })) + ".y";
    expect(() => assertBrowserSupabaseKey(jwt("anon"))).not.toThrow();
    expect(() => assertBrowserSupabaseKey("sb_publishable_fixture")).not.toThrow();
    for (const key of [jwt("service_role"), "sb_secret_sensitive", "invalid"]) expect(() => assertBrowserSupabaseKey(key)).toThrow("browser requires");
  });
  it("keeps legitimate marker bearings and colors, strips markup and non-finite rotation", () => {
    expect(markerColor("#ff0000")).toBe("#ff0000"); expect(markerBearing(450)).toBe(90);
    expect(markerColor('\"><img src=x onerror=alert(1)>')).toBe("#a3e635");
    for (const value of [NaN, Infinity, '0)\"><script>']) expect(markerBearing(value)).toBe(0);
  });
  it("protects authenticated responses from shared caches and limits embedding", async () => {
    vi.stubEnv("PREVIEW_FRAME_ORIGINS", "https://studio.example,https://user:pw@evil.example,javascript:alert(1)");
    const response = secureResponse(new Response("private", { headers: { "cache-control": "public,max-age=3600" } }), new Request("https://dgdashboard.app/billing", { headers: { authorization: "Bearer fixture" } }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://studio.example");
    expect(response.headers.get("content-security-policy")).not.toContain("localhost");
    expect(response.headers.get("content-security-policy")).not.toContain("evil");
    expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
    expect(await response.text()).toBe("private");
  });
});
