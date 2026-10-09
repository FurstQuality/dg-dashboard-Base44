import { useEffect, useState } from "react";
import L from "leaflet";
import { Marker, useMap } from "react-leaflet";
import { bearingDeg } from "@/components/leaflet-icon-fix";

const HANDLE_PX = 46;

const handleIcon = L.divIcon({
  className: "dg-marker dg-rotate-handle",
  html: `<div title="Drag to turn" style="width:20px;height:20px;border-radius:999px;background:#ffffff;border:3px solid #0ea5e9;box-shadow:0 1px 3px rgba(0,0,0,.6);cursor:grab;display:grid;place-items:center;touch-action:none;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0369a1" stroke-width="3" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

/** Point a fixed screen distance from `center` along a compass bearing, independent of map rotation. */
function offsetPoint(center: [number, number], bearing: number, zoom: number): [number, number] {
  const metersPerPx = (40075016.686 * Math.cos((center[0] * Math.PI) / 180)) / 2 ** (zoom + 8);
  const d = HANDLE_PX * metersPerPx;
  const rad = (bearing * Math.PI) / 180;
  const dLat = (d * Math.cos(rad)) / 111320;
  const dLng = (d * Math.sin(rad)) / (111320 * Math.cos((center[0] * Math.PI) / 180));
  return [center[0] + dLat, center[1] + dLng];
}

/** A round grab handle beside a map item; dragging it around turns the item through a full 360°. */
export function RotateHandle({
  center,
  bearing,
  onChange,
}: {
  center: [number, number];
  bearing: number;
  onChange: (deg: number) => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const z = () => setZoom(map.getZoom());
    map.on("zoomend", z);
    return () => {
      map.off("zoomend", z);
    };
  }, [map]);
  const pos = offsetPoint(center, bearing, zoom);
  return (
    <Marker
      position={pos}
      icon={handleIcon}
      draggable
      bubblingMouseEvents={false}
      zIndexOffset={2000}
      eventHandlers={{
        mousedown: (e) => L.DomEvent.stopPropagation(e as unknown as Event),
        click: (e) => L.DomEvent.stopPropagation(e as unknown as Event),
        dragstart: () => map.dragging.disable(),
        dragend: (e) => {
          map.dragging.enable();
          const marker = e.target as L.Marker;
          const ll = marker.getLatLng();
          const nextBearing = Math.round((bearingDeg(center, [ll.lat, ll.lng]) + 360) % 360);
          onChange(nextBearing);
          marker.setLatLng(offsetPoint(center, nextBearing, map.getZoom()));
        },
      }}
    />
  );
}
