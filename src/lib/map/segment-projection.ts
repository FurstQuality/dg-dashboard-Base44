export type ScreenPoint = { x: number; y: number };
/** Work in the map's rendered coordinate space so placement survives zoom/pan. */
export function projectToScreenSegment(probe: ScreenPoint, start: ScreenPoint, end: ScreenPoint): ScreenPoint {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((probe.x - start.x) * dx + (probe.y - start.y) * dy) / length));
  return { x: start.x + t * dx, y: start.y + t * dy };
}
