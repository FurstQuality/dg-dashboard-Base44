import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPdgaHtml } from "../pdga-fetch.server";

beforeEach(() => {
  vi.stubEnv("DGD_HOSTED_RUNTIME", "base44");
  vi.stubEnv("FIRECRAWL_API_KEY", "fc-test");
  vi.stubEnv("LOVABLE_API_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("PDGA fallback on Base44", () => {
  it("uses direct Firecrawl after a blocked public request", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(Response.json({ data: { html: "<h1>PDGA event</h1>" } }));
    vi.stubGlobal("fetch", request);
    await expect(fetchPdgaHtml("https://www.pdga.com/tour/event/123")).resolves.toContain("PDGA event");
    const [url, options] = request.mock.calls[1];
    expect(url).toBe("https://api.firecrawl.dev/v2/scrape");
    expect(options.headers.Authorization).toBe("Bearer fc-test");
    expect(JSON.parse(options.body).formats).toEqual(["html"]);
  });
  it("preserves ordinary successful reads and missing-page handling", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response("public html"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", request);
    await expect(fetchPdgaHtml("https://www.pdga.com/player/123")).resolves.toBe("public html");
    await expect(fetchPdgaHtml("https://www.pdga.com/player/404")).rejects.toThrow("404");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("reports missing direct configuration without using a legacy gateway", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "lovc_test");
    vi.stubEnv("LOVABLE_API_KEY", "legacy");
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal("fetch", request);
    await expect(fetchPdgaHtml("https://www.pdga.com/player/123")).rejects.toThrow("direct FIRECRAWL_API_KEY");
    expect(request).toHaveBeenCalledTimes(1);
  });
});