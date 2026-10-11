import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const archive = vi.hoisted(() => vi.fn());
vi.mock("../data-intel/snapshots.server", () => ({ recordSnapshot: archive }));
import { firecrawlRequest, isFirecrawlConfigured } from "../firecrawl.server";
import { sendSms, isSmsConfigured } from "../sms.server";
import { connectorReadiness } from "../admin-operations";

const request = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", request); request.mockReset(); archive.mockReset().mockResolvedValue("snapshot-id");
  for (const name of ["FIRECRAWL_API_KEY", "LOVABLE_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_API_KEY", "TWILIO_API_SECRET", "TWILIO_FROM_NUMBER", "TWILIO_MESSAGING_SERVICE_SID"]) vi.stubEnv(name, "");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Firecrawl source transport", () => {
  it("uses the direct key even when a legacy credential exists and archives the original response", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-direct"); vi.stubEnv("LOVABLE_API_KEY", "legacy-test");
    const payload = { success: true, data: { html: "<h1>Course</h1>", metadata: { sourceURL: "https://www.pdga.com/course" } } };
    request.mockResolvedValue(Response.json(payload));
    const response = await firecrawlRequest("/scrape", { url: "https://www.pdga.com/course", formats: ["html"] });
    expect(await response.json()).toEqual(payload);
    expect(request).toHaveBeenCalledWith("https://api.firecrawl.dev/v2/scrape", expect.objectContaining({ headers: { "Content-Type": "application/json", Authorization: "Bearer fc-test-direct" }, redirect: "error", signal: expect.any(AbortSignal) }));
    expect(archive).toHaveBeenCalledWith(expect.objectContaining({ payload, source: "firecrawl", sourceUrl: "https://www.pdga.com/course" }));
    expect(JSON.stringify(archive.mock.calls)).not.toMatch(/fc-test-direct|legacy-test/);
  });
  it("does not retry provider failures against the legacy gateway", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-direct"); vi.stubEnv("LOVABLE_API_KEY", "legacy-test");
    request.mockResolvedValue(new Response("private-provider-error", { status: 429 }));
    expect((await firecrawlRequest("/search", { query: "disc golf" })).status).toBe(429);
    expect(request).toHaveBeenCalledTimes(1); expect(archive).not.toHaveBeenCalled();
  });
  it("preserves explicitly configured legacy connection keys", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "lovc_test"); vi.stubEnv("LOVABLE_API_KEY", "legacy-test");
    request.mockResolvedValue(Response.json({ data: { html: "course" } }));
    await firecrawlRequest("/scrape", { url: "https://www.pdga.com/course" });
    expect(request.mock.calls[0][0]).toContain("connector-gateway.lovable.dev");
    expect(request.mock.calls[0][1].headers["X-Connection-Api-Key"]).toBe("lovc_test");
  });
  it("blocks incomplete legacy configuration before any network call", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "lovc_test");
    expect(isFirecrawlConfigured()).toBe(false);
    await expect(firecrawlRequest("/scrape", {})).rejects.toThrow("not configured");
    expect(request).not.toHaveBeenCalled();
  });
  it("fails closed when the source cannot be archived", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-direct"); archive.mockResolvedValue(null);
    request.mockResolvedValue(Response.json({ data: { html: "course" } }));
    await expect(firecrawlRequest("/scrape", { url: "https://www.pdga.com/course" })).rejects.toThrow("could not complete");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("returns safe timeout errors", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fc-test-direct"); request.mockRejectedValue(new Error("private-token"));
    await expect(firecrawlRequest("/scrape", {})).rejects.toThrow("could not complete");
  });
});

function twilio() {
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC" + "1".repeat(32)); vi.stubEnv("TWILIO_API_KEY", "SK-test"); vi.stubEnv("TWILIO_API_SECRET", "test-api-secret"); vi.stubEnv("TWILIO_FROM_NUMBER", "+15555550123");
}
describe("Twilio delivery", () => {
  it("uses direct Basic authentication and normalizes the recipient", async () => {
    twilio(); vi.stubEnv("LOVABLE_API_KEY", "legacy-test"); request.mockResolvedValue(Response.json({ sid: "SM-test" }));
    expect(await sendSms("555-555-0124", "Round starts at noon")).toEqual({ sent: true, sid: "SM-test" });
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC" + "1".repeat(32) + "/Messages.json");
    expect(init.headers.Authorization).toBe("Basic " + Buffer.from("SK-test:test-api-secret").toString("base64"));
    expect(new URLSearchParams(init.body).get("To")).toBe("+15555550124");
    expect(init.headers["X-Connection-Api-Key"]).toBeUndefined();
  });
  it("accepts a Messaging Service in place of a sender", async () => {
    twilio(); vi.stubEnv("TWILIO_FROM_NUMBER", " "); vi.stubEnv("TWILIO_MESSAGING_SERVICE_SID", "MG-test"); request.mockResolvedValue(Response.json({ sid: "SM-test" }));
    expect(isSmsConfigured()).toBe(true); await sendSms("+15555550124", "test");
    const body = new URLSearchParams(request.mock.calls[0][1].body);
    expect(body.get("MessagingServiceSid")).toBe("MG-test"); expect(body.has("From")).toBe(false);
    expect(connectorReadiness(process.env).find(c => c.id === "sms")?.configured).toBe(true);
  });
  it("does not fall back to the gateway with partial direct credentials", async () => {
    twilio(); vi.stubEnv("TWILIO_API_SECRET", ""); vi.stubEnv("LOVABLE_API_KEY", "legacy-test");
    expect(await sendSms("+15555550124", "test")).toEqual({ sent: false, reason: "not_configured" });
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects invalid numbers and malformed account paths before sending", async () => {
    twilio(); expect(await sendSms("no number", "test")).toMatchObject({ sent: false, reason: "invalid_number" });
    vi.stubEnv("TWILIO_ACCOUNT_SID", "../../attacker"); expect(await sendSms("+15555550124", "test")).toMatchObject({ sent: false, reason: "not_configured" });
    expect(request).not.toHaveBeenCalled();
  });
  it.each(["decline", "network", "empty receipt"])("does not expose private errors or report success for %s", async (kind) => {
    twilio();
    if (kind === "network") request.mockRejectedValue(new Error("test-api-secret"));
    else request.mockResolvedValue(kind === "decline" ? new Response("test-api-secret", { status: 401 }) : Response.json({}));
    const result = await sendSms("+15555550124", "test");
    expect(result).toMatchObject({ sent: false, reason: "provider_error" }); expect(JSON.stringify(result)).not.toContain("test-api-secret"); expect(request).toHaveBeenCalledTimes(1);
  });
});
