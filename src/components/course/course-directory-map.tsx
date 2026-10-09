import {DiscRetailerLayer} from "./disc-retailer-layer";
import {
  DEFAULT_IMAGERY_NATIVE_ZOOM,
  ESRI_CLARITY_URL,
  IMAGERY_ATTRIBUTION,
  MAP_DISPLAY_MAX_ZOOM,
  OSM_ATTRIBUTION,
  OSM_URL,
  STREET_NATIVE_ZOOM,
  ESRI_LABELS_URL,
  ESRI_ROADS_URL,
  REFERENCE_NATIVE_ZOOM,
  TERRAIN_ATTRIBUTION,
  TERRAIN_NATIVE_ZOOM,
  TERRAIN_URL,
} from "@/lib/map/basemaps";
/**
 * Directory map: plots every course that matches the active filters (not just
 * the visible page), clusters dense areas, and keeps the viewport framed on the
 * current results.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "@/components/leaflet-icon-fix";
import { Button } from "@/components/ui/button";
import { Layers, Loader2, LocateFixed, Maximize2 } from "lucide-react";
import type { DirectoryCourse, MapCluster } from "@/lib/course-directory.functions";

const US_CENTER: [number, number] = [39.8283, -98.5795];

type Basemap = "streets" | "satellite" | "hybrid" | "terrain";
const BASEMAP_LABEL: Record<Basemap, string> = { streets: "Street", satellite: "Satellite", hybrid: "Hybrid", terrain: "Terrain" };

const BASEMAPS: Record<Basemap, { url: string; attribution: string; native: number }> = {
  streets: { url: OSM_URL, attribution: OSM_ATTRIBUTION, native: STREET_NATIVE_ZOOM },
  satellite: {
    url: ESRI_CLARITY_URL,
    attribution: IMAGERY_ATTRIBUTION,
    native: DEFAULT_IMAGERY_NATIVE_ZOOM,
  },
  hybrid: {
    url: ESRI_CLARITY_URL,
    attribution: IMAGERY_ATTRIBUTION,
    native: DEFAULT_IMAGERY_NATIVE_ZOOM,
  },
  terrain: { url: TERRAIN_URL, attribution: TERRAIN_ATTRIBUTION, native: TERRAIN_NATIVE_ZOOM },
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

/** Renders the pin set into a marker cluster group and frames the results. */
function CourseMarkers({
  pins,
  autoFitKey,
  focus,
  onSelect,
  fitBox,
  clusters,
}: {
  pins: DirectoryCourse[];
  autoFitKey: string;
  /** Bounding box of every match [s, w, n, e]; frames results without loading them all. */
  fitBox?: [number, number, number, number] | null;
  /** Server-grouped counts for dense, zoomed-out views. */
  clusters?: MapCluster[] | null;
  /** When set, the map opens zoomed to this point instead of framing every pin. */
  focus?: { lat: number; lng: number } | null;
  onSelect?: (course: DirectoryCourse) => void;
}) {

  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  // Applying a focus point once keeps later pin loads from yanking the map
  // back after the player has panned or zoomed.
  const appliedFocusRef = useRef<string | null>(null);
  // Tracks the result set the map has already been framed to.
  const appliedFitRef = useRef<string | null>(null);


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

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();

    const markers = pins
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => {
        const marker = L.marker([c.latitude as number, c.longitude as number]);
        const place = [c.city, c.state].filter(Boolean).join(", ") || "Location unlisted";
        const rating =
          c.pdga_rating != null
            ? `${c.pdga_rating.toFixed(1)}★${c.pdga_rating_votes ? ` (${c.pdga_rating_votes} ratings)` : ""}`
            : "No player ratings yet";
        const est = c.year_established ? `Est. ${c.year_established}` : null;
        const details = [`${c.hole_count} holes`, est].filter(Boolean).join(" · ");

        // Tooltip and popup markup is built the moment it is needed. Building
        // it up front for every course held thousands of HTML strings in
        // memory at once, which is what pushed the directory over the edge.
        marker.bindTooltip(
          () =>
            `<div style="min-width:170px;line-height:1.35">
             <div style="font-weight:600">${escapeHtml(c.name)}</div>
             <div style="opacity:.75;font-size:12px">${escapeHtml(place)}</div>
             <div style="opacity:.75;font-size:12px">${escapeHtml(details)}</div>
             <div style="font-size:12px;margin-top:2px">${escapeHtml(rating)}</div>
           </div>`,
          { direction: "top", offset: L.point(0, -12), opacity: 1, className: "dg-course-tip" },
        );

        marker.bindPopup(
          () =>
            `<div style="min-width:190px">
             <div style="font-weight:600">${escapeHtml(c.name)}</div>
             <div style="opacity:.7;font-size:12px">${escapeHtml(place)} · ${escapeHtml(details)}</div>
             ${c.location_quality === "city_approximate" ? '<div style="font-size:12px;margin-top:2px">Approximate location: town centre</div>' : ""}
             <div style="font-size:12px;margin-top:2px">${escapeHtml(rating)}</div>
             <div style="display:flex;gap:12px;margin-top:8px">
             <button type="button" data-course-id="${escapeHtml(c.id)}" style="text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit">Open course</button>
             <button type="button" data-editor-id="${escapeHtml(c.id)}" style="text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;color:inherit;font:inherit">Open map editor</button>
             </div>
           </div>`,
        );
        marker.on("click", () => selectRef.current?.(c));
        // Popup content is raw HTML, so route the internal link through the
        // client router rather than forcing a full page load.
        marker.on("popupopen", (ev: { popup: { getElement: () => HTMLElement | undefined } }) => {
          const el = ev.popup.getElement()?.querySelector<HTMLButtonElement>("[data-course-id]");
          el?.addEventListener("click", () => {
            void navigateRef.current({ to: "/courses/$courseId", params: { courseId: c.id } });
          });
          ev.popup.getElement()?.querySelector<HTMLButtonElement>("[data-editor-id]")?.addEventListener("click", () => {
            void navigateRef.current({to: "/courses/$courseId/edit", params: {courseId: c.id}});
          });
        });
        return marker;
      });

    group.addLayers(markers);
  }, [pins]);

  // Server clusters: one counted bubble per area; tapping zooms in on it.
  useEffect(() => {
    if (!clusters?.length) return;
    const layer = L.layerGroup();
    for (const c of clusters) {
      const size = c.n >= 1000 ? "large" : c.n >= 100 ? "medium" : "small";
      const icon = L.divIcon({
        html: `<div><span>${c.n.toLocaleString()}</span></div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: L.point(44, 44),
      });
      const m = L.marker([c.lat, c.lng], { icon, title: `${c.n} courses` });
      m.on("click", () => map.setView([c.lat, c.lng], Math.min(map.getZoom() + 2, 12)));
      layer.addLayer(m);
    }
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [clusters, map]);

  useEffect(() => {
    // Frame the results once per result set. Re-framing on every pin update
    // moved the map, which reported a new window, which reloaded the pins —
    // an endless loop that eventually took the whole page down.
    const fitKey = fitBox !== undefined ? `${autoFitKey}|box` : `${autoFitKey}|${pins.length}`;
    // A newly requested location wins once. A previous location must never
    // suppress a later search/filter result. Wait for fresh result bounds.
    const focusKey = focus ? `${focus.lat.toFixed(5)},${focus.lng.toFixed(5)}` : null;
    if (focus && appliedFocusRef.current !== focusKey) {
      appliedFocusRef.current = focusKey;
      appliedFitRef.current = fitKey;
      map.setView([focus.lat, focus.lng], 11, {animate: true});
      return;
    }
    if (fitBox === null || appliedFitRef.current === fitKey) return;
    appliedFitRef.current = fitKey;


    if (fitBox) {
      const [s0, w0, n0, e0] = fitBox;
      if (s0 === n0 && w0 === e0) map.setView([s0, w0], 13);
      else map.fitBounds(L.latLngBounds([s0, w0], [n0, e0]).pad(0.12), { animate: true, maxZoom: 14 });
      return;
    }
    const coords = pins
      .filter((c) => c.latitude != null && c.longitude != null)
      .map((c) => [c.latitude as number, c.longitude as number] as [number, number]);

    if (!coords.length) {
      map.setView(US_CENTER, 4);
      return;
    }
    if (coords.length === 1) {
      map.setView(coords[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(coords).pad(0.12), { animate: true, maxZoom: 14 });
    // autoFitKey changes whenever the filter set changes, re-framing the map.
  }, [map, autoFitKey, pins, focus, fitBox]);


  return null;
}

function PickHandler({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) {
  // A pick from a zoomed-out map would be miles off, so the first clicks zoom
  // in on the spot and only a close-up click places the course.
  const map = useMapEvents({
    click: (e) => {
      if (map.getZoom() < 13) map.setView(e.latlng, map.getZoom() < 8 ? 11 : 16);
      else onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export type MapViewport = { north: number; south: number; east: number; west: number };

/** Publishes the visible map window so the tiles below can mirror it. */
function ViewportReporter({ onChange }: { onChange: (v: MapViewport) => void }) {
  const map = useMap();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastRef = useRef<string | null>(null);

  useEffect(() => {
    const emit = () => {
      const b = map.getBounds();
      const next = {
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      };
      const key = [next.north, next.south, next.east, next.west]
        .map((v) => v.toFixed(5))
        .join(",");
      if (lastRef.current === key) return;
      lastRef.current = key;
      onChangeRef.current(next);
    };
    emit();
    map.on("moveend", emit);
    map.on("zoomend", emit);
    return () => {
      map.off("moveend", emit);
      map.off("zoomend", emit);
    };
  }, [map]);

  return null;
}


export function CourseDirectoryMap({
  pins,
  loading,
  filterKey,
  focus,
  onLocate,
  onViewportChange,
  visibleCount,
  className,
  onPick,
  picked,
  onMapReady,
  fitBox,
  clusters,
  totalMatches,
}: {
  fitBox?: [number, number, number, number] | null;
  clusters?: MapCluster[] | null;
  /** Every match of the filters, not just those in view. */
  totalMatches?: number;
  /** When set, clicking the map picks a location (Add course mode). */
  onPick?: (p: { lat: number; lng: number }) => void;
  picked?: { lat: number; lng: number } | null;
  onMapReady?: (map: L.Map) => void;
  pins: DirectoryCourse[];
  loading?: boolean;
  filterKey: string;
  /** Opens the map zoomed to the player's area instead of the whole result set. */
  focus?: { lat: number; lng: number } | null;
  onLocate?: (coords: { lat: number; lng: number }) => void;
  onViewportChange?: (viewport: MapViewport) => void;

  visibleCount?: number;
  className?: string;
}) {
  const [basemap, setBasemap] = useState<Basemap>("streets");
  const [locating, setLocating] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  useEffect(() => {
    if (map) onMapReady?.(map);
  }, [map, onMapReady]);

  const mapped = useMemo(
    () => pins.filter((c) => c.latitude != null && c.longitude != null),
    [pins],
  );

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map?.setView([latitude, longitude], 11, { animate: true });
        onLocate?.({ lat: latitude, lng: longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className={className}>
      <div className="relative isolate z-0 overflow-hidden rounded-xl border border-border">
        <div className="h-[320px] w-full sm:h-[380px] lg:h-[420px]">
          <MapContainer
            center={US_CENTER}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
            // Gentler wheel zoom so scrolling over the map does not jump
            // several zoom levels at once.
            wheelPxPerZoomLevel={320}
            wheelDebounceTime={60}

            zoomSnap={0.5}
            zoomDelta={0.5}
            worldCopyJump
            ref={setMap}
          >
            <TileLayer
              key={basemap}
              url={BASEMAPS[basemap].url}
              attribution={BASEMAPS[basemap].attribution}
              maxNativeZoom={BASEMAPS[basemap].native}
              maxZoom={MAP_DISPLAY_MAX_ZOOM}
            />
            {basemap === "hybrid" ? (
              <>
                <TileLayer url={ESRI_ROADS_URL} attribution="Roads &copy; Esri" maxNativeZoom={REFERENCE_NATIVE_ZOOM} maxZoom={MAP_DISPLAY_MAX_ZOOM} />
                <TileLayer url={ESRI_LABELS_URL} attribution="Labels &copy; Esri" maxNativeZoom={REFERENCE_NATIVE_ZOOM} maxZoom={MAP_DISPLAY_MAX_ZOOM} />
              </>
            ) : null}
            <CourseMarkers
              pins={mapped}
              autoFitKey={`${filterKey}:${fitNonce}`}
              focus={focus ?? null}
              fitBox={fitBox}
              clusters={clusters}
            />

            <DiscRetailerLayer />
            {onPick ? <PickHandler onPick={onPick} /> : null}
            {picked ? (
              <CircleMarker
                center={[picked.lat, picked.lng]}
                radius={10}
                pathOptions={{ color: "var(--primary)", fillOpacity: 0.5, weight: 3 }}
              />
            ) : null}
            {onViewportChange ? <ViewportReporter onChange={onViewportChange} /> : null}
          </MapContainer>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex gap-2">
            <label className="flex items-center gap-1 rounded-md bg-secondary px-2 text-sm text-secondary-foreground shadow">
              <Layers className="h-4 w-4" aria-hidden />
              <span className="sr-only">Map style</span>
              <select
                aria-label="Map style"
                className="h-8 bg-transparent text-sm outline-none"
                value={basemap}
                onChange={(e) => setBasemap(e.target.value as Basemap)}
              >
                {(Object.keys(BASEMAP_LABEL) as Basemap[]).map((b) => (
                  <option key={b} value={b}>{BASEMAP_LABEL[b]}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              className="shadow"
              onClick={locateMe}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="mr-1 h-4 w-4" />
              )}
              Near me
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="shadow"
              onClick={() => setFitNonce((n) => n + 1)}
              disabled={!mapped.length && !fitBox}
            >
              <Maximize2 className="mr-1 h-4 w-4" /> Fit results
            </Button>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow">
          {loading
            ? "Plotting courses…"
            : `${(visibleCount ?? mapped.length).toLocaleString()} course${(visibleCount ?? mapped.length) === 1 ? "" : "s"} in view · ${(totalMatches ?? mapped.length).toLocaleString()} mapped match${(totalMatches ?? mapped.length) === 1 ? "" : "es"}`}
        </div>
      </div>
    </div>
  );
}
