/**
 * Server-only place geocoding used to resolve venue and player locations into
 * coordinates. Results are cached in-process because venue strings repeat
 * heavily across a tour schedule.
 */

type GeocodeHit = { latitude: number; longitude: number; name: string | null };

const cache = new Map<string, GeocodeHit | null>();

export async function geocodePlace(query: string): Promise<GeocodeHit | null> {
  const raw = query.trim();
  if (raw.length < 2) return null;
  const key = raw.toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  let hit: GeocodeHit | null = null;
  try {
    const zip = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zip) {
      const r = await fetch(`https://api.zippopotam.us/us/${zip[1]}`);
      if (r.ok) {
        const j = (await r.json()) as {
          places?: Array<{
            latitude: string;
            longitude: string;
            "place name": string;
            "state abbreviation": string;
          }>;
        };
        const p = j.places?.[0];
        if (p)
          hit = {
            latitude: Number(p.latitude),
            longitude: Number(p.longitude),
            name: `${p["place name"]}, ${p["state abbreviation"]}`,
          };
      }
    }

    if (!hit) {
      // Resolve the state token (if any) so "Valparaiso, IN" prefers Indiana
      // over same-named cities abroad.
      const { normalizeStateCode, stateName: stateNameFromCode } = await import("@/lib/us-states");
      const parts = raw
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      const stateCode = parts.length > 1 ? normalizeStateCode(parts[parts.length - 1]) : null;
      const stateName = stateCode ? stateNameFromCode(stateCode) : null;
      const cityQuery = stateCode && parts.length > 1 ? parts.slice(0, -1).join(", ") : raw;

      const params = new URLSearchParams({
        name: cityQuery,
        count: stateCode ? "10" : "5",
        language: "en",
        format: "json",
      });
      const { fetchJsonCached } = await import("@/lib/weather-fetch.server");
      const j = (await fetchJsonCached(
        `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
        { label: "Location search" },
      )) as {
        results?: Array<{
          latitude: number;
          longitude: number;
          name: string;
          admin1?: string;
          country_code?: string;
        }>;
      };
      const results = j.results ?? [];
      const inState = stateName
        ? results.find((r) => (r.admin1 ?? "").toLowerCase() === stateName.toLowerCase())
        : null;
      const inUs = results.find((r) => (r.country_code ?? "").toUpperCase() === "US");
      const r = inState ?? (stateCode ? inUs : null) ?? results[0];
      if (r)
        hit = {
          latitude: r.latitude,
          longitude: r.longitude,
          name: [r.name, r.admin1].filter(Boolean).join(", ") || null,
        };
    }

  } catch {
    hit = null;
  }

  cache.set(key, hit);
  return hit;
}
