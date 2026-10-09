import {CourseConditionReports} from "@/components/courses/course-condition-reports";
import {Dialog, DialogContent, DialogTitle, DialogDescription} from "@/components/ui/dialog";
import { Fragment, useMemo, useState } from "react";
import L from "leaflet";
import "leaflet-rotate";
import { useLiveConditions } from "@/lib/course-conditions-live";
import { REPORT_KIND_LABEL, SEVERITY_LABEL } from "@/lib/rewards";
import { Circle, MapContainer, Marker, Polygon, Popup } from "react-leaflet";
import { fairwayPolygon } from "@/lib/course-builder/fairway";
import { courseRoutePreview, type CourseRoutePin } from "@/lib/course-builder/course-route";
import { validPoint } from "@/lib/course-builder/pairing-fairways";
import { CourseBasemapLayers } from "@/components/map/course-basemap-layers";
import { teeIcon, basketIcon } from "@/components/leaflet-icon-fix";
import { CourseFeatureLayer, type DbFeature } from "@/components/course-features-map";

type Hole = {
  number: number;
  par: number | null;
  par_confirmed?:boolean | null;
  distance_ft: number | null;
  tee_lat: number | null;
  tee_lng: number | null;
  basket_lat: number | null;
  basket_lng: number | null;
  caddy_notes: string | null;
  flight_path?: unknown;
  hole_tees?:CourseRoutePin[];
  hole_baskets?:CourseRoutePin[];
};

type Props = {
  center: [number, number];
  holes: Hole[];
  features: DbFeature[];
  courseId?: string;
};

const issueIcon = (blocking: boolean) =>
  L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:15px;border:2px solid var(--background);background:var(${blocking ? "--destructive" : "--warning"});color:var(--background)">!</div>`,
  });

export default function CourseDetailMap({ center, holes, features, courseId }: Props) {
  const routes=useMemo(()=>new Map(holes.map(h=>[h.number,courseRoutePreview(h,h.hole_tees,h.hole_baskets)])),[holes]);
  const [showLive, setShowLive] = useState(true);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const { data: live = [] } = useLiveConditions(courseId ? [courseId] : []);
  // Reports without their own GPS spot sit halfway down the hole they name.
  const placed = live.flatMap((r) => {
    if (r.lat != null && r.lng != null) return [{ r, pos: [r.lat, r.lng] as [number, number] }];
    const h = holes.find((x) => x.number === r.hole_number);
    if (h?.tee_lat != null && h.tee_lng != null && h.basket_lat != null && h.basket_lng != null)
      return [{ r, pos: [(h.tee_lat + h.basket_lat) / 2, (h.tee_lng + h.basket_lng) / 2] as [number, number] }];
    return [];
  });
  // Lock the map to the course: every mapped tee and basket plus a little surrounding ground.
  const pts = holes.flatMap((h) => [
    ...(validPoint([h.tee_lat,h.tee_lng]) ? [[h.tee_lat!, h.tee_lng!] as [number, number]] : []),
    ...(validPoint([h.basket_lat,h.basket_lng]) ? [[h.basket_lat!, h.basket_lng!] as [number, number]] : []),
    ...(routes.get(h.number)?.curve ?? []),
  ]);
  // The frame is the course itself (boundary, else every ground item + holes), so switching layouts never changes the map.
  const boundary = features.find((f) => f.type === "course_boundary")?.geometry?.points as [number, number][] | undefined;
  const groundPts = features
    .filter((f) => !["ob_line", "ob_area", "ob_reference", "mando", "dropzone", "note"].includes(f.type))
    .flatMap((f) => (f.geometry?.points ?? []) as [number, number][]);
  if (boundary && boundary.length > 2) pts.splice(0, pts.length, ...boundary);
  else pts.push(...groundPts);
  const area = pts.length ? L.latLngBounds(pts).pad(0.15) : L.latLng(center).toBounds(800);
  return (
    <div className="relative overflow-hidden rounded-xl border border-border">
      {courseId && <>
        <button type="button" onClick={() => setConditionsOpen(true)} className="absolute bottom-3 right-3 z-[500] rounded-lg border bg-card px-3 py-2 text-sm shadow">Conditions</button>
        <Dialog open={conditionsOpen} onOpenChange={setConditionsOpen}>
          <DialogContent><DialogTitle>Course conditions</DialogTitle><DialogDescription>Current reports and updates from players.</DialogDescription><CourseConditionReports courseId={courseId}/></DialogContent>
        </Dialog>
      </>}
      {live.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowLive((v) => !v)}
          aria-pressed={showLive}
          className="absolute bottom-3 left-3 z-[500] rounded-lg border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium shadow"
        >
          {showLive ? "Hide" : "Show"} live conditions ({live.length})
        </button>
      ) : null}
      <div className="h-[320px] w-full lg:h-[380px]">
        <MapContainer
          center={center}
          zoom={16}
          {...(area ? { bounds: area, maxBounds: area.pad(0.35), maxBoundsViscosity: 1, minZoom: 14 } : { minZoom: 14 })}
          zoomSnap={0.25}
          zoomDelta={0.25}
          wheelPxPerZoomLevel={80}
          maxZoom={22}
          {...({
            rotate: true,
            touchRotate: true,
            bearing: 0,
            rotateControl: { closeOnZeroBearing: false, position: "topleft" },
          } as unknown as Record<string, unknown>)}
          style={{ height: "100%", width: "100%" }}
        >
          <CourseBasemapLayers />
          {holes.map((h) => (
            <Fragment key={h.number}>
              {validPoint([h.tee_lat,h.tee_lng]) ? (
                <Marker
                  position={[h.tee_lat!, h.tee_lng!]}
                  icon={teeIcon({ hole: h.number, name: "Main" })}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">Hole {h.number}</div>
                      <div>
                        Par {h.par_confirmed === false ? "—" : h.par ?? "—"}
                        {routes.get(h.number)?.distance ? ` · ${routes.get(h.number)!.distance} ft` : ""}
                      </div>
                      {h.caddy_notes ? (
                        <div className="mt-1 max-w-[220px] text-xs">{h.caddy_notes}</div>
                      ) : null}
                    </div>
                  </Popup>
                </Marker>
              ) : null}
              {validPoint([h.basket_lat,h.basket_lng]) ? (
                <Marker
                  position={[h.basket_lat!, h.basket_lng!]}
                  icon={basketIcon({ hole: h.number, pin: "A" })}
                />
              ) : null}
              {routes.get(h.number)?.curve && h.tee_lat != null && h.tee_lng != null && h.basket_lat != null && h.basket_lng != null ? (
                <>
                  <Polygon
                    positions={fairwayPolygon(routes.get(h.number)!.curve!,Math.min(24,Math.max(12,L.latLng([h.tee_lat,h.tee_lng]).distanceTo([h.basket_lat,h.basket_lng])*.14)),5)}
                    interactive={false}
                    pathOptions={{ color: "#ffffff", weight: 1, opacity: 0.6, fillColor: "#e9e1cc", fillOpacity: 0.28 }}
                  />
                  <Circle
                    center={[h.basket_lat!, h.basket_lng!]}
                    radius={10}
                    interactive={false}
                    pathOptions={{ color: "#ffffff", weight: 1.5, opacity: 0.75, fillColor: "#ffffff", fillOpacity: 0.1 }}
                  />
                </>
              ) : null}
            </Fragment>
          ))}
          {showLive
            ? placed.map(({ r, pos }) => (
                <Marker key={r.id} position={pos} icon={issueIcon(r.severity === "blocking")}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{REPORT_KIND_LABEL[r.kind] ?? "Course note"}</div>
                      <div>
                        {r.hole_number ? `Hole ${r.hole_number} · ` : ""}
                        {SEVERITY_LABEL[r.severity] ?? r.severity}
                        {r.status === "confirmed" ? " · Confirmed" : ""}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))
            : null}
          <CourseFeatureLayer
            features={features}
            holes={holes.map((h) => ({
              number: h.number,
              tee: h.tee_lat != null && h.tee_lng != null ? [h.tee_lat, h.tee_lng] : null,
              basket:
                h.basket_lat != null && h.basket_lng != null ? [h.basket_lat, h.basket_lng] : null,
            }))}
          />
        </MapContainer>
      </div>
    </div>
  );
}
