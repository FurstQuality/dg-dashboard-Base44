import { StudioEndpointMarker } from "@/components/course-builder/studio-endpoint-marker";
import { Fragment, type ReactElement, useMemo } from "react";
import { Marker, Polyline, Polygon, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import polygonClipping from "polygon-clipping";
import { FEATURE_CONFIG, featureIcon } from "@/components/leaflet-icon-fix";
import {
  type CourseFeatureType,
  type DbFeature,
  featureAppliesToHole,
  featureIsCourseWide,
} from "@/lib/course-features";
import { extractSubPath, projectOnPolyline, type LatLng } from "@/lib/ob-reference-geo";

// Clip a band polygon (lat/lng) against a boundary polygon (lat/lng).
// Returns one or more rings inside the boundary. Falls back to the original band on failure.
function clipBandToBoundary(
  band: [number, number][],
  boundary: [number, number][] | null | undefined,
): [number, number][][] {
  if (!boundary || boundary.length < 3 || band.length < 3) return [band];
  try {
    const toXY = (p: [number, number]): [number, number] => [p[1], p[0]];
    const bandRing: [number, number][] = band.map(toXY);
    if (
      bandRing[0][0] !== bandRing[bandRing.length - 1][0] ||
      bandRing[0][1] !== bandRing[bandRing.length - 1][1]
    ) {
      bandRing.push(bandRing[0]);
    }
    const bRing: [number, number][] = boundary.map(toXY);
    if (bRing[0][0] !== bRing[bRing.length - 1][0] || bRing[0][1] !== bRing[bRing.length - 1][1]) {
      bRing.push(bRing[0]);
    }
    const res = polygonClipping.intersection([bandRing] as any, [bRing] as any);
    const out: [number, number][][] = [];
    for (const mp of res) {
      for (const ring of mp) {
        out.push(ring.map(([x, y]) => [y, x] as [number, number]));
      }
    }
    return out.length ? out : [band];
  } catch {
    return [band];
  }
}

export { featureAppliesToHole, featureIsCourseWide };
export type { DbFeature, CourseFeatureType };

function scopeLabel(f: Pick<DbFeature, "hole_number" | "hole_numbers">): string {
  if (Array.isArray(f.hole_numbers) && f.hole_numbers.length) {
    return f.hole_numbers.length === 1
      ? ` · Hole ${f.hole_numbers[0]}`
      : ` · Holes ${f.hole_numbers.join(", ")}`;
  }
  if (f.hole_number != null) return ` · Hole ${f.hole_number}`;
  return "";
}

// Offset a polyline perpendicularly (in metres) to the left or right of its
// direction of travel. Used to shade the OB side of an OB line.
function offsetPolyline(
  pts: [number, number][],
  side: "left" | "right",
  meters: number,
): [number, number][] {
  if (pts.length < 2) return pts.slice();
  const latRad = (pts[0][0] * Math.PI) / 180;
  const mPerLat = 111132;
  const mPerLng = 111320 * Math.cos(latRad);
  const sign = side === "left" ? 1 : -1;
  const off: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[i - 1] ?? pts[i];
    const next = pts[i + 1] ?? pts[i];
    const dxM = (next[1] - prev[1]) * mPerLng;
    const dyM = (next[0] - prev[0]) * mPerLat;
    const len = Math.hypot(dxM, dyM) || 1;
    // Perpendicular (left of travel = rotate 90° CCW in screen space where
    // north = +y). In leaflet the y axis points north, so we flip.
    const nx = dyM / len;
    const ny = -dxM / len;
    const offXm = nx * meters * sign;
    const offYm = ny * meters * sign;
    off.push([pts[i][0] + offYm / mPerLat, pts[i][1] + offXm / mPerLng]);
  }
  return off;
}

function arrowIcon(
  color: string,
  rotationDeg: number,
  size = 26,
  anchor: "center" | "tail" = "center",
) {
  const s = size;
  const sw = Math.max(2, s * 0.135);
  // Anchor at the arrow's tail (left edge, x=4/26) so it extends outward from the anchor point.
  const anchorX = anchor === "tail" ? s * (4 / 26) : s / 2;
  return L.divIcon({
    className: "dg-ob-arrow",
    html: `<div style="transform:rotate(${rotationDeg}deg);transform-origin:${anchorX}px ${s / 2}px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6));pointer-events:none;">
<svg width="${s}" height="${s}" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 13 L18 13 M18 7 L24 13 L18 19" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 13 L18 13 M18 7 L24 13 L18 19" fill="none" stroke="#0b1a10" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
</svg></div>`,
    iconSize: [s, s],
    iconAnchor: [anchorX, s / 2],
  });
}

export type HoleAxis = { tee: [number, number]; basket: [number, number] };

// Effective OB side. We no longer reinterpret authored left/right against a
// hole's tee→basket direction — the authored value is the visible side of
// the line, and the user flips it manually if the arrows point the wrong way.
export function resolveEffectiveObSide(
  _pts: [number, number][],
  side: DbFeature["ob_side"],
  _axis?: HoleAxis | null,
): DbFeature["ob_side"] {
  return side;
}

export function obSideLabel(side: DbFeature["ob_side"]): string {
  if (side === "left") return "On/over the line — left is OB";
  if (side === "right") return "On/over the line — right is OB";
  if (side === "past") return "On/over past the end of the line is OB";
  if (side === "behind") return "On/over behind the start of the line is OB";
  return "Line only";
}

export function renderObHighlight(
  pts: [number, number][],
  side: DbFeature["ob_side"],
  color: string,
  axis?: HoleAxis | null,
  boundary?: [number, number][] | null,
  avoidPoints?: Array<[number, number]> | null,
): ReactElement[] {
  const effective = resolveEffectiveObSide(pts, side, axis);
  const out: ReactElement[] = [
    <Polyline
      key="halo"
      positions={pts}
      pathOptions={{ color, weight: 14, opacity: 0.22, lineCap: "round", lineJoin: "round" }}
    />,
  ];
  side = effective;

  if (side === "left" || side === "right") {
    // Perpendicular offset direction (in metres) per segment.
    const obSign = side === "left" ? 1 : -1;
    const latRad0 = (pts[0][0] * Math.PI) / 180;
    const mPerLat = 111132;
    const mPerLng = 111320 * Math.cos(latRad0);

    const avoid = avoidPoints ?? [];
    const isNear = (lat: number, lng: number, thresholdM: number) => {
      for (const [alat, alng] of avoid) {
        const dyM = (lat - alat) * mPerLat;
        const dxM = (lng - alng) * mPerLng;
        if (Math.hypot(dxM, dyM) < thresholdM) return true;
      }
      return false;
    };

    // OB text labels + arrows along each segment. No band fill.
    const obLabelIcon = L.divIcon({
      className: "dg-ob-label",
      html: `<div style="font:800 11px/1 system-ui,sans-serif;color:#fff;background:${color};padding:2px 5px;border-radius:3px;letter-spacing:.5px;box-shadow:0 1px 2px rgba(0,0,0,.5);pointer-events:none;">OB</div>`,
      iconSize: [22, 16],
      iconAnchor: [11, 8],
    });

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dxM = (b[1] - a[1]) * mPerLng;
      const dyM = (b[0] - a[0]) * mPerLat;
      const segLenM = Math.hypot(dxM, dyM) || 1;
      // Unit perpendicular pointing to the OB side of this segment.
      // Convention: for a segment traveling east (dx=+, dy=0), obSign=+1 ("left"
      // of line direction) should point NORTH on screen — i.e. the player's
      // left when standing at pts[0] and looking toward pts[1]. That gives
      // perp = (-dy, dx) * obSign in (east, north) metre coords.
      const perpXm = (-dyM / segLenM) * obSign;
      const perpYm = (dxM / segLenM) * obSign;

      // Screen bearing of travel (0° = north/up, +cw).
      const travelDeg = (Math.atan2(dxM, dyM) * 180) / Math.PI;
      // SVG arrow points east at rotation=0, so rotating by (compassBearing - 90)
      // aims it at that compass bearing. The OB side compass bearing is
      // (travelDeg - 90*obSign), so rotation = travelDeg - 90*obSign - 90.
      const obArrowDeg = travelDeg - 90 * obSign - 90;
      const fairwayArrowDeg = obArrowDeg + 180;

      // Arrows anchored by their tail at the line midpoint, pointing outward.
      const midLat = (a[0] + b[0]) / 2;
      const midLng = (a[1] + b[1]) / 2;
      // Arrow tail sits at the line midpoint; the head extends ~14m outward
      // on each side. Skip if that footprint would sit on a tee/basket emblem.
      const ARROW_REACH_M = 18;
      const obHeadLat = midLat + (perpYm * ARROW_REACH_M) / mPerLat;
      const obHeadLng = midLng + (perpXm * ARROW_REACH_M) / mPerLng;
      const fwHeadLat = midLat - (perpYm * ARROW_REACH_M) / mPerLat;
      const fwHeadLng = midLng - (perpXm * ARROW_REACH_M) / mPerLng;
      const AVOID_ARROW_M = 14;
      if (!isNear(midLat, midLng, AVOID_ARROW_M) && !isNear(obHeadLat, obHeadLng, AVOID_ARROW_M)) {
        out.push(
          <Marker
            key={`ob-arrow-${i}`}
            position={[midLat, midLng]}
            icon={arrowIcon(color, obArrowDeg, 32, "tail")}
            interactive={false}
            keyboard={false}
            // leaflet-rotate: rotate with map bearing so arrow stays perpendicular
            // to the line even when the user spins the map for a screenshot.
            {...({ rotateWithView: true } as unknown as Record<string, unknown>)}
          />,
        );
      }
      if (!isNear(midLat, midLng, AVOID_ARROW_M) && !isNear(fwHeadLat, fwHeadLng, AVOID_ARROW_M)) {
        out.push(
          <Marker
            key={`fw-arrow-${i}`}
            position={[midLat, midLng]}
            icon={arrowIcon("#22c55e", fairwayArrowDeg, 32, "tail")}
            interactive={false}
            keyboard={false}
            {...({ rotateWithView: true } as unknown as Record<string, unknown>)}
          />,
        );
      }

      // Repeating "OB" text labels along the OB side of the segment.
      const SPACING_M = 25;
      const OFFSET_M = 10;
      const count = Math.max(1, Math.floor(segLenM / SPACING_M));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        const lat = a[0] + (b[0] - a[0]) * t + (perpYm * OFFSET_M) / mPerLat;
        const lng = a[1] + (b[1] - a[1]) * t + (perpXm * OFFSET_M) / mPerLng;
        if (isNear(lat, lng, 12)) continue;
        out.push(
          <Marker
            key={`ob-txt-${i}-${k}`}
            position={[lat, lng]}
            icon={obLabelIcon}
            interactive={false}
            keyboard={false}
          />,
        );
      }
    }
  } else if (side === "past" || side === "behind") {
    const endpoint = side === "past" ? pts[pts.length - 1] : pts[0];
    out.push(
      <Circle
        key="cap"
        center={endpoint}
        radius={18}
        pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.24, opacity: 0.6 }}
      />,
    );
    // Arrow at endpoint indicating the OB direction (continuing past / behind).
    const ref = side === "past" ? (pts[pts.length - 2] ?? pts[0]) : (pts[1] ?? pts[pts.length - 1]);
    const latRad = (endpoint[0] * Math.PI) / 180;
    const mPerLat = 111132;
    const mPerLng = 111320 * Math.cos(latRad);
    const dxM = (endpoint[1] - ref[1]) * mPerLng;
    const dyM = (endpoint[0] - ref[0]) * mPerLat;
    const travelDeg = (Math.atan2(dxM, dyM) * 180) / Math.PI;
    // Arrow SVG points east (+x = 90°), rotate so it aligns with travel direction.
    const arrowDeg = travelDeg - 90;
    out.push(
      <Marker
        key="arrow-end"
        position={endpoint}
        icon={arrowIcon(color, arrowDeg)}
        interactive={false}
        keyboard={false}
        {...({ rotateWithView: true } as unknown as Record<string, unknown>)}
      />,
    );
  }
  return out;
}

// Resolve an ob_reference feature to a concrete polyline segment along its
// source (ob_line polyline or ob_area polygon edge). Returns null when the
// source is missing or malformed.
export function resolveObReferencePath(
  ref: DbFeature,
  sourceById: Map<string, DbFeature>,
): [number, number][] | null {
  if (!ref.ref_feature_id) return null;
  const src = sourceById.get(ref.ref_feature_id);
  if (!src) return null;
  const srcPts = (src.geometry?.points ?? []) as [number, number][];
  const picks = (ref.geometry?.points ?? []) as [number, number][];
  if (srcPts.length < 2 || picks.length < 2) return null;
  const closed = src.type === "ob_area" || src.type === "course_boundary";
  // Re-project each stored pick onto the current source so the reference
  // follows if the source moves (live reference).
  // projectOnPolyline is imported at the top.
  const a = projectOnPolyline(picks[0] as LatLng, srcPts as LatLng[], closed);
  const b = projectOnPolyline(picks[picks.length - 1] as LatLng, srcPts as LatLng[], closed);
  if (!a || !b) return null;
  return extractSubPath(srcPts as LatLng[], closed, a, b) as [number, number][];
}

export function CourseFeatureLayer({
  features,
  holes,
  activeHole,
}: {
  features: DbFeature[];
  holes?: Array<{ number: number; tee: [number, number] | null; basket: [number, number] | null }>;
  activeHole?: number;
}) {
  const sourceById = useMemo(() => {
    const m = new Map<string, DbFeature>();
    for (const f of features)
      if (f.type === "ob_line" || f.type === "ob_area" || f.type === "course_boundary")
        m.set(f.id, f);
    return m;
  }, [features]);

  const axisByHole = useMemo(() => {
    const m = new Map<number, HoleAxis>();
    for (const h of holes ?? []) {
      if (h.tee && h.basket) m.set(h.number, { tee: h.tee, basket: h.basket });
    }
    return m;
  }, [holes]);

  const axisFor = (f: DbFeature): HoleAxis | null => {
    const nums =
      Array.isArray(f.hole_numbers) && f.hole_numbers.length
        ? f.hole_numbers
        : f.hole_number != null
          ? [f.hole_number]
          : [];
    // Prefer the active hole's axis when the feature applies to it, so
    // multi-hole OB orients arrows/labels relative to the hole being viewed.
    const ordered =
      activeHole != null && nums.includes(activeHole)
        ? [activeHole, ...nums.filter((n) => n !== activeHole)]
        : nums;
    for (const n of ordered) {
      const a = axisByHole.get(n);
      if (a) return a;
    }
    if (activeHole != null) {
      const a = axisByHole.get(activeHole);
      if (a) return a;
    }
    return null;
  };

  const boundaryPts = useMemo<[number, number][] | null>(() => {
    const b = features.find((f) => f.type === "course_boundary");
    const pts = (b?.geometry?.points ?? []) as [number, number][];
    return pts.length >= 3 ? pts : null;
  }, [features]);

  const avoidPts = useMemo<Array<[number, number]>>(() => {
    const arr: Array<[number, number]> = [];
    for (const h of holes ?? []) {
      if (h.tee) arr.push(h.tee);
      if (h.basket) arr.push(h.basket);
    }
    return arr;
  }, [holes]);

  return (
    <>
      {features.map((f) => {
        const cfg = FEATURE_CONFIG[f.type];
        const pts = f.geometry?.points ?? [];
        if (!cfg || pts.length === 0) return null;

        if (f.type === "course_boundary" && pts.length >= 3) {
          // World-covering ring with the boundary as a hole. Everything
          // outside the property is OB.
          const world: [number, number][] = [
            [-85, -180],
            [-85, 180],
            [85, 180],
            [85, -180],
          ];
          return (
            <Fragment key={f.id}>
              <Polygon
                positions={[world, pts]}
                pathOptions={{
                  color: "#ef4444",
                  weight: 0,
                  fillColor: "#ef4444",
                  fillOpacity: 0.18,
                  fillRule: "evenodd",
                }}
              />
              <Polygon
                positions={pts}
                pathOptions={{
                  color: cfg.color,
                  weight: 3,
                  dashArray: "6 4",
                  fillOpacity: 0,
                  opacity: 0.95,
                }}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold text-yellow-600">Course property line</div>
                    <div className="text-muted-foreground">Anything outside is OB.</div>
                    {f.label ? <div>{f.label}</div> : null}
                  </div>
                </Popup>
              </Polygon>
            </Fragment>
          );
        }

        if (f.type === "island_green" && pts.length >= 3) {
          return (
            <Polygon
              key={f.id}
              positions={pts}
              pathOptions={{
                color: cfg.color,
                weight: 3,
                fillColor: cfg.color,
                fillOpacity: 0.28,
                opacity: 1,
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-green-500">Island green{scopeLabel(f)}</div>
                  <div className="text-muted-foreground">Everything outside the island is OB.</div>
                  {f.label ? <div>{f.label}</div> : null}
                </div>
              </Popup>
            </Polygon>
          );
        }

        if (f.type === "ob_reference") {
          const path = resolveObReferencePath(f, sourceById);
          if (!path || path.length < 2) return null;
          const src = f.ref_feature_id ? sourceById.get(f.ref_feature_id) : null;
          return (
            <Fragment key={f.id}>
              {renderObHighlight(path, f.ob_side, cfg.color, axisFor(f), boundaryPts, avoidPts)}
              <Polyline
                positions={path}
                pathOptions={{ color: cfg.color, weight: 4, dashArray: "2 6", opacity: 0.95 }}
              />
              <Marker
                position={path[Math.floor(path.length / 2)]}
                icon={featureIcon("ob_reference")}
              >
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold text-red-500">
                      {obSideLabel(resolveEffectiveObSide(path, f.ob_side, axisFor(f)))}
                      {scopeLabel(f)}
                    </div>

                    {src ? (
                      <div className="text-muted-foreground">
                        from {src.type === "ob_area" ? "OB area" : "OB line"}
                      </div>
                    ) : null}
                    {f.label ? <div>{f.label}</div> : null}
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          );
        }

        if (cfg.geom === "point") {
          return (
            <StudioEndpointMarker key={f.id} position={pts[0]} icon={featureIcon(f.type, {
              mandoSide: f.ob_side === "left" || f.ob_side === "right" || f.ob_side === "past" ? f.ob_side : "none",
              mandoBearing: f.geometry.bearing ?? null,
            })}>
              {f.label || !featureIsCourseWide(f) ? (
                <Popup>
                  <div className="text-xs">
                    <div className="font-semibold">
                      {cfg.label}
                      {scopeLabel(f)}
                    </div>
                    {f.label ? <div>{f.label}</div> : null}
                  </div>
                </Popup>
              ) : null}
            </StudioEndpointMarker>
          );
        }
        if (cfg.geom === "line") {
          const isOb = f.type === "ob_line";
          const pathOpts = isOb
            ? { color: cfg.color, weight: 4, dashArray: "8 6", opacity: 0.95 }
            : f.type === "fence"
              ? { color: cfg.color, weight: 3, dashArray: "2 6", opacity: 0.9 }
              : f.type === "path"
                ? { color: cfg.color, weight: 3, dashArray: "10 6", opacity: 0.85 }
                : { color: cfg.color, weight: 3 };

          return (
            <Fragment key={f.id}>
              {isOb
                ? renderObHighlight(pts, f.ob_side, cfg.color, axisFor(f), boundaryPts, avoidPts)
                : null}
              <Polyline positions={pts} pathOptions={pathOpts} />
              {isOb && f.ob_side !== "none" ? (
                <Marker position={pts[Math.floor(pts.length / 2)]} icon={featureIcon("ob_line")}>
                  <Popup>
                    <div className="text-xs">
                      <div className="font-semibold text-red-500">
                        {obSideLabel(resolveEffectiveObSide(pts, f.ob_side, axisFor(f)))}
                        {scopeLabel(f)}
                      </div>

                      {f.label ? <div>{f.label}</div> : null}
                    </div>
                  </Popup>
                </Marker>
              ) : null}
            </Fragment>
          );
        }
        // polygon
        return (
          <Polygon
            key={f.id}
            positions={pts}
            pathOptions={{
              color: cfg.color,
              weight: 2,
              fillOpacity: f.type === "ob_area" ? 0.28 : 0.18,
            }}
          >
            {f.label || !featureIsCourseWide(f) ? (
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold">
                    {cfg.label}
                    {scopeLabel(f)}
                  </div>
                  {f.label ? <div>{f.label}</div> : null}
                </div>
              </Popup>
            ) : null}
          </Polygon>
        );
      })}
    </>
  );
}
