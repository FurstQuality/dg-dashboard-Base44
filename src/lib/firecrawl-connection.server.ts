type Environment = Record<string, string | undefined>;

/** Server-only connection metadata. Never expose the returned headers to a client. */
export function firecrawlConnection(env: Environment = process.env) {
  const key = env.FIRECRAWL_API_KEY?.trim();
  if (!key) return null;
  if (key.startsWith("lovc_")) {
    const legacy = env.LOVABLE_API_KEY?.trim();
    if (env.DGD_HOSTED_RUNTIME === "base44" || !legacy) return null;
    return {
      baseUrl: "https://connector-gateway.lovable.dev/firecrawl/v2",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${legacy}`, "X-Connection-Api-Key": key } as Record<string, string>,
    };
  }
  return {
    baseUrl: "https://api.firecrawl.dev/v2",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` } as Record<string, string>,
  };
}