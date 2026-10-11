import { describe, expect, it } from "vitest";
import { firecrawlConnection } from "../firecrawl-connection.server";

describe("Firecrawl migration connection", () => {
  it("supports a direct key without a Lovable credential", () => {
    const connection = firecrawlConnection({ FIRECRAWL_API_KEY: " fc-test ", DGD_HOSTED_RUNTIME: "base44" });
    expect(connection?.baseUrl).toBe("https://api.firecrawl.dev/v2");
    expect(connection?.headers.Authorization).toBe("Bearer fc-test");
    expect(connection?.headers).not.toHaveProperty("X-Connection-Api-Key");
  });
  it("never sends a direct key or request through the legacy gateway", () => {
    expect(firecrawlConnection({ FIRECRAWL_API_KEY: "fc-test", LOVABLE_API_KEY: "legacy" })?.baseUrl).toBe("https://api.firecrawl.dev/v2");
  });
  it("requires an independently configured key on Base44", () => {
    expect(firecrawlConnection({})).toBeNull();
    expect(firecrawlConnection({ FIRECRAWL_API_KEY: "lovc_test", LOVABLE_API_KEY: "legacy", DGD_HOSTED_RUNTIME: "base44" })).toBeNull();
  });
  it("preserves an explicitly configured original installation", () => {
    const connection = firecrawlConnection({ FIRECRAWL_API_KEY: "lovc_test", LOVABLE_API_KEY: "legacy" });
    expect(connection?.baseUrl).toContain("connector-gateway.lovable.dev");
    expect(connection?.headers["X-Connection-Api-Key"]).toBe("lovc_test");
    expect(firecrawlConnection({ FIRECRAWL_API_KEY: "lovc_test" })).toBeNull();
  });
});