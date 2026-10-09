import {
  DEFAULT_IMAGERY_NATIVE_ZOOM,
  ESRI_CLARITY_URL,
  IMAGERY_ATTRIBUTION,
  MAP_DISPLAY_MAX_ZOOM,
  OSM_ATTRIBUTION,
  OSM_URL,
  STREET_NATIVE_ZOOM,
} from "@/lib/map/basemaps";
/**
 * Planner map — plots every matching league night, tournament, and community
 * round, color-coded by kind and clustered in dense areas.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "@/components/leaflet-icon-fix";
import { Button } from "@/components/ui/button";
import { Layers, Loader2, LocateFixed, Maximize2 } from "lucide-react";
import {
  DOW_LONG,
  KIND_LABEL,
  KIND_PIN_COLOR,
  formatOccurrenceDate,
  formatTime,
  type PlannerOccurrence,
} from "@/lib/planner";

const US_CENTER: [number, number] = [39.8283, -98.5795];

type Basemap = "streets" | "satellite";

const BASEMAPS: Record<Basemap, { url: string; attribution: string; native: number }> = {
  streets: { url: OSM_URL, attribution: OSM_ATTRIBUTION, native: STREET_NATIVE_ZOOM },
  satellite: {
    url: ESRI_CLARITY_URL,
    attribution: IMAGERY_ATTRIBUTION,
    native: DEFAULT_IMAGERY_NATIVE_ZOOM,
  },
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

/** One pin per venue+event, listing every date that venue hosts it. */
type Pin = {
  key: string;
  lat: number;
  lng: number;
  occ: PlannerOccurrence;
  dates: string[];
};

function buildPins(list: PlannerOccurrence[]): Pin[] {
  const map = new Map<string, Pin>();
  for (const occ of list) {
    if (occ.latitude == null || occ.longitude == null) continue;
    const key = `${occ.eventId}@${occ.latitude.toFixed(4)},${occ.longitude.toFixed(4)}`;
    const existing = map.get(key);
    if (existing) {
      existing.dates.push(occ.date);
      continue;
    }
    map.set(key, {
      key,
      lat: occ.latitude,
      lng: occ.longitude,
      occ,
      dates: [occ.date],
    });
  }
  return Array.from(map.values());
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "dg-planner-pin",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid rgba(255,255,255,.9);box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function PlannerMarkers({
  pins,
  fitKey,
  focus,
  onSelect,
}: {
  pins: Pin[];
  fitKey: string;
  focus?: { lat: number; lng: number } | null;
  onSelect?: (occ: PlannerOccurrence) => void;
}) {
  const map = useMap();
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const appliedFocus = useRef<string | null>(null);

  useEffect(() => {
    const group = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 50,
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

    const markers = pins.map((pin) => {
      const { occ } = pin;
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon(KIND_PIN_COLOR[occ.kind]) });
      const place =
        occ.courseName ??
        occ.location ??
        [occ.city, occ.state].filter(Boolean).join(", ") ??
        "Location unlisted";
      const when = occ.recurring
        ? `${DOW_LONG[occ.dow]}s${formatTime(occ.startTime) ? ` · ${formatTime(occ.startTime)}` : ""} · ${pin.dates.length} night${pin.dates.length === 1 ? "" : "s"} in view`
        : formatOccurrenceDate(occ.date);
      const meta = [KIND_LABEL[occ.kind], occ.sanctioned ? "PDGA sanctioned" : null, occ.tier]
        .filter(Boolean)
        .join(" · ");

      const body = `<div style="min-width:190px;line-height:1.35">
          <div style="font-weight:600">${escapeHtml(occ.title)}</div>
          <div style="opacity:.75;font-size:12px">${escapeHtml(place)}</div>
          <div style="opacity:.75;font-size:12px">${escapeHtml(when)}</div>
          <div style="font-size:12px;margin-top:2px">${escapeHtml(meta)}</div>
        </div>`;

      marker.bindTooltip(body, {
        direction: "top",
        offset: L.point(0, -10),
        opacity: 1,
      });
      marker.bindPopup(body);
      marker.on("click", () => selectRef.current?.(occ));
      return marker;
    });

    group.addLayers(markers);
  }, [pins]);

  useEffect(() => {
    if (focus) {
      const key = `${focus.lat.toFixed(4)},${focus.lng.toFixed(4)}`;
      if (appliedFocus.current !== key) {
        appliedFocus.current = key;
        map.setView([focus.lat, focus.lng], 10, { animate: true });
      }
      return;
    }
    const coords = pins.map((p) => [p.lat, p.lng] as [number, number]);
    if (!coords.length) {
      map.setView(US_CENTER, 4);
      return;
    }
    if (coords.length === 1) {
      map.setView(coords[0], 12);
      return;
    }
    map.fitBounds(L.latLngBounds(coords).pad(0.15), { animate: true, maxZoom: 13 });
  }, [map, pins, fitKey, focus]);

  return null;
}

export function PlannerMap({
  occurrences,
  loading,
  filterKey,
  focus,
  unmapped,
  onLocate,
  onSelect,
}: {
  occurrences: PlannerOccurrence[];
  loading?: boolean;
  filterKey: string;
  focus?: { lat: number; lng: number } | null;
  unmapped?: number;
  onLocate?: (coords: { lat: number; lng: number }) => void;
  onSelect?: (occ: PlannerOccurrence) => void;
}) {
  const [basemap, setBasemap] = useState<Basemap>("streets");
  const [locating, setLocating] = useState(false);
  const [map, setMap] = useState<L.Map | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const pins = useMemo(() => buildPins(occurrences), [occurrences]);

  function locateMe() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map?.setView([latitude, longitude], 10, { animate: true });
        onLocate?.({ lat: latitude, lng: longitude });
      },
      () => setLocating(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }

  return (
    <div className="relative isolate z-0 overflow-hidden rounded-xl border border-border">
      <div className="h-[460px] w-full sm:h-[600px] lg:h-[680px]">
        <MapContainer
          center={US_CENTER}
          zoom={4}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
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
          <PlannerMarkers
            pins={pins}
            fitKey={`${filterKey}:${fitNonce}`}
            focus={focus ?? null}
            onSelect={onSelect}
          />
        </MapContainer>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-[500] flex gap-2">
        <div className="pointer-events-auto flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="shadow"
            onClick={() => setBasemap((b) => (b === "streets" ? "satellite" : "streets"))}
          >
            <Layers className="mr-1 h-4 w-4" />
            {basemap === "streets" ? "Satellite" : "Street map"}
          </Button>
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
            disabled={!pins.length}
          >
            <Maximize2 className="mr-1 h-4 w-4" /> Fit results
          </Button>
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[85%] rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow">
        {loading ? (
          "Plotting events…"
        ) : (
          <>
            {pins.length.toLocaleString()} mapped venue{pins.length === 1 ? "" : "s"}
            {unmapped ? ` · ${unmapped} event${unmapped === 1 ? "" : "s"} without a mapped course` : ""}
          </>
        )}
      </div>

      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] flex gap-2 rounded-md bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow">
        {(["league", "tournament", "casual"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: KIND_PIN_COLOR[k] }}
            />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>
    </div>
  );
}
