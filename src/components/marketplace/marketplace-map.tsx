/**
 * Shared map for marketplace listings and lost/found reports. Optional view —
 * both pages default to the list so they work without location permission.
 */
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "@/components/leaflet-icon-fix";

const US_CENTER: [number, number] = [39.8283, -98.5795];

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  detail?: string | null;
  /** Drives the pin color so lost, found, and for-sale pins read apart. */
  tone?: "sale" | "lost" | "found";
};

const TONE_COLORS: Record<NonNullable<MapPin["tone"]>, string> = {
  sale: "#10b981",
  lost: "#f97316",
  found: "#38bdf8",
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string,
  );
}

function Pins({ pins, onSelect }: { pins: MapPin[]; onSelect?: (id: string) => void }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    layerRef.current = layer;
    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    pins.forEach((pin) => {
      const color = TONE_COLORS[pin.tone ?? "sale"];
      const marker = L.circleMarker([pin.lat, pin.lng], {
        radius: 8,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.65,
      });
      marker.bindPopup(
        `<strong>${escapeHtml(pin.title)}</strong>${
          pin.detail ? `<br/>${escapeHtml(pin.detail)}` : ""
        }`,
      );
      marker.on("click", () => selectRef.current?.(pin.id));
      marker.addTo(layer);
    });

    if (pins.length > 0) {
      const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.25), { maxZoom: 13, animate: false });
    }
  }, [map, pins]);

  return null;
}

export function MarketplaceMap({
  pins,
  onSelect,
  height = 380,
}: {
  pins: MapPin[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const center = useMemo<[number, number]>(
    () => (pins[0] ? [pins[0].lat, pins[0].lng] : US_CENTER),
    [pins],
  );

  return (
    <div className="overflow-hidden rounded-2xl border" style={{ height }}>
      <MapContainer
        center={center}
        zoom={pins.length ? 10 : 4}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Pins pins={pins} onSelect={onSelect} />
      </MapContainer>
    </div>
  );
}
