/**
 * Map view for the round-start course picker: plots the courses that match the
 * current search/radius, clusters dense areas, and starts a round straight from
 * a pin. Browser-only (Leaflet) — render behind ClientOnly.
 */
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "@/components/leaflet-icon-fix";
import type { PickableCourse } from "@/lib/play.functions";

const US_CENTER: [number, number] = [39.8283, -98.5795];

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

type Coords = { lat: number; lng: number };

const MILES_TO_METERS = 1609.34;

function PickMarkers({
  courses,
  origin,
  radiusMi,
  onSelect,
}: {
  courses: PickableCourse[];
  origin: Coords | null;
  radiusMi: number;
  onSelect: (course: PickableCourse) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const originLayerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const framedRef = useRef(false);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 55,
      spiderfyOnMaxZoom: true,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
      groupRef.current = null;
    };
  }, [map]);

  // "You are here" dot plus the search-radius ring, so the default framing
  // reads as "courses within N miles of me".
  useEffect(() => {
    if (originLayerRef.current) {
      map.removeLayer(originLayerRef.current);
      originLayerRef.current = null;
    }
    if (!origin) return;
    const layer = L.layerGroup([
      L.circle([origin.lat, origin.lng], {
        radius: radiusMi * MILES_TO_METERS,
        color: "#22d3ee",
        weight: 1.5,
        fillColor: "#22d3ee",
        fillOpacity: 0.06,
        interactive: false,
      }),
      L.circleMarker([origin.lat, origin.lng], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: "#22d3ee",
        fillOpacity: 1,
      }).bindTooltip("You're here", { direction: "top", offset: L.point(0, -8) }),
    ]);
    layer.addTo(map);
    originLayerRef.current = layer;
    return () => {
      layer.remove();
      originLayerRef.current = null;
    };
  }, [map, origin, radiusMi]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();

    const pins = courses.filter((c) => c.latitude != null && c.longitude != null);
    for (const course of pins) {
      const marker = L.marker([course.latitude as number, course.longitude as number]);
      const place = [course.city, course.state].filter(Boolean).join(", ") || "Location unlisted";
      const details = [
        course.holeCount ? `${course.holeCount} holes` : null,
        course.distanceMi !== null ? `${course.distanceMi} mi away` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      marker.bindTooltip(
        `<div style="min-width:160px;line-height:1.35">
           <div style="font-weight:600">${escapeHtml(course.name)}</div>
           <div style="opacity:.75;font-size:12px">${escapeHtml(place)}</div>
           ${details ? `<div style="opacity:.75;font-size:12px">${escapeHtml(details)}</div>` : ""}
         </div>`,
        { direction: "top", offset: L.point(0, -12), opacity: 1 },
      );
      marker.bindPopup(
        `<div style="min-width:180px">
           <div style="font-weight:600">${escapeHtml(course.name)}</div>
           <div style="opacity:.7;font-size:12px">${escapeHtml(place)}</div>
           ${details ? `<div style="opacity:.7;font-size:12px">${escapeHtml(details)}</div>` : ""}
           <button type="button" data-start-course="${course.id}" style="margin-top:6px;text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit">Start a round here</button>
         </div>`,
      );
      marker.on("popupopen", (ev: { popup: { getElement: () => HTMLElement | undefined } }) => {
        const el = ev.popup.getElement()?.querySelector<HTMLButtonElement>("[data-start-course]");
        el?.addEventListener("click", () => selectRef.current(course), { once: true });
      });
      group.addLayer(marker);
    }

    if (framedRef.current) return;
    if (origin) {
      // Frame exactly the radius ring around the player.
      map.fitBounds(L.latLng(origin.lat, origin.lng).toBounds(radiusMi * MILES_TO_METERS * 2), {
        padding: [16, 16],
      });
      framedRef.current = true;
    } else if (pins.length > 0) {
      map.fitBounds(
        L.latLngBounds(
          pins.map((c) => [c.latitude as number, c.longitude as number] as [number, number]),
        ),
        { padding: [32, 32], maxZoom: 12 },
      );
      framedRef.current = true;
    }
  }, [courses, map, origin, radiusMi]);

  return null;
}

export function PickCourseMap({
  courses,
  origin,
  radiusMi = 5,
  onSelect,
}: {
  courses: PickableCourse[];
  origin: Coords | null;
  radiusMi?: number;
  onSelect: (course: PickableCourse) => void;
}) {
  const center = useMemo<[number, number]>(
    () => (origin ? [origin.lat, origin.lng] : US_CENTER),
    [origin],
  );

  return (
    <div className="h-[420px] overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={center}
        zoom={origin ? 12 : 4}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <PickMarkers courses={courses} origin={origin} radiusMi={radiusMi} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}

export default PickCourseMap;
