/** Stored course JSON is untrusted when it reaches an HTML/SVG marker. */
export function markerColor(value: unknown, fallback = "#a3e635"): string {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)
    ? value
    : fallback;
}
export function markerBearing(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? ((value % 360) + 360) % 360 : 0;
}
