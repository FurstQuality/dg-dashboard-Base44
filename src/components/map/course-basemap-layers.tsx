import { useEffect, useRef, useState } from "react";
import { LayerGroup, LayersControl, TileLayer, useMap } from "react-leaflet";
import {
  DEFAULT_IMAGERY_NATIVE_ZOOM,
  ESRI_CLARITY_URL,
  ESRI_IMAGERY_URL,
  ESRI_LABELS_URL,
  ESRI_ROADS_URL,
  IMAGERY_ATTRIBUTION,
  MAP_DISPLAY_MAX_ZOOM,
  OSM_ATTRIBUTION,
  OSM_URL,
  REFERENCE_NATIVE_ZOOM,
  STREET_NATIVE_ZOOM,
  TERRAIN_ATTRIBUTION,
  TERRAIN_NATIVE_ZOOM,
  TERRAIN_URL,
  probeImageryNativeZoom,
  recordTileIssue,
} from "@/lib/map/basemaps";

/** Leaflet must recalculate its viewport when panels or phone orientation change. */
function useMapViewportResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ pan: false, debounceMoveend: true }));
    });
    observer.observe(map.getContainer());
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [map]);
}

/** Re-checks imagery coverage whenever the map settles somewhere new. */
function useNativeImageryZoom(): number {
  const map = useMap();
  const [native, setNative] = useState(DEFAULT_IMAGERY_NATIVE_ZOOM);
  useEffect(() => {
    let alive = true;
    const run = () => {
      const c = map.getCenter();
      void probeImageryNativeZoom(c.lat, c.lng).then((z) => alive && setNative(z));
    };
    run();
    map.on("moveend", run);
    return () => {
      alive = false;
      map.off("moveend", run);
    };
  }, [map]);
  return native;
}

function ImageryFallbackNotice({ failing }: { failing: boolean }) {
  if (!failing) return null;
  return (
    <div className="pointer-events-none absolute bottom-8 left-1/2 z-[500] -translate-x-1/2 rounded-md border border-border bg-background/90 px-3 py-1.5 text-sm text-foreground shadow">
      Aerial imagery isn't loading here. Switch to Street in Layers.
    </div>
  );
}

/**
 * Satellite (default), Hybrid and Street basemaps shared by course maps.
 * Imagery never requests zoom levels the provider doesn't have, so zooming in
 * past real coverage scales the sharpest tile instead of going blank.
 */
export function CourseBasemapLayers({
  position = "topright",
}: {
  position?: "topright" | "topleft" | "bottomright" | "bottomleft";
}) {
  useMapViewportResize();
  const native = useNativeImageryZoom();
  const errors = useRef(0);
  const [failing, setFailing] = useState(false);

  const handlers = {
    tileerror: (e: { coords?: { z: number } }) => {
      errors.current += 1;
      recordTileIssue({
        provider: "esri-imagery",
        zoom: e.coords?.z ?? -1,
        category: navigator.onLine ? "other" : "network",
        at: new Date().toISOString(),
      });
      if (errors.current >= 6) setFailing(true);
    },
    tileload: () => {
      errors.current = 0;
      setFailing(false);
    },
  };

  return (
    <>
      <LayersControl position={position}>
        <LayersControl.BaseLayer checked name="Satellite">
          <TileLayer
            key={`sat-${native}`}
            attribution={IMAGERY_ATTRIBUTION}
            url={ESRI_CLARITY_URL}
            maxNativeZoom={native}
            maxZoom={MAP_DISPLAY_MAX_ZOOM}
            crossOrigin=""
            eventHandlers={handlers}
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Hybrid">
          <LayerGroup>
            <TileLayer
              key={`hyb-${native}`}
              attribution={IMAGERY_ATTRIBUTION}
              url={ESRI_CLARITY_URL}
              maxNativeZoom={native}
              maxZoom={MAP_DISPLAY_MAX_ZOOM}
              crossOrigin=""
              eventHandlers={handlers}
            />
            <TileLayer
              attribution="Labels &copy; Esri"
              url={ESRI_LABELS_URL}
              maxNativeZoom={REFERENCE_NATIVE_ZOOM}
              maxZoom={MAP_DISPLAY_MAX_ZOOM}
              opacity={0.9}
              crossOrigin=""
            />
            <TileLayer
              attribution="Roads &copy; Esri"
              url={ESRI_ROADS_URL}
              maxNativeZoom={REFERENCE_NATIVE_ZOOM}
              maxZoom={MAP_DISPLAY_MAX_ZOOM}
              crossOrigin=""
            />
          </LayerGroup>
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite (older captures)">
          <TileLayer
            key={`old-${native}`}
            attribution={IMAGERY_ATTRIBUTION}
            url={ESRI_IMAGERY_URL}
            maxNativeZoom={Math.min(native, 19)}
            maxZoom={MAP_DISPLAY_MAX_ZOOM}
            crossOrigin=""
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Street">
          <TileLayer
            attribution={OSM_ATTRIBUTION}
            url={OSM_URL}
            maxNativeZoom={STREET_NATIVE_ZOOM}
            maxZoom={MAP_DISPLAY_MAX_ZOOM}
            crossOrigin=""
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Terrain">
          <TileLayer
            attribution={TERRAIN_ATTRIBUTION}
            url={TERRAIN_URL}
            maxNativeZoom={TERRAIN_NATIVE_ZOOM}
            maxZoom={MAP_DISPLAY_MAX_ZOOM}
            crossOrigin=""
          />
        </LayersControl.BaseLayer>
      </LayersControl>
      <ImageryFallbackNotice failing={failing} />
    </>
  );
}
