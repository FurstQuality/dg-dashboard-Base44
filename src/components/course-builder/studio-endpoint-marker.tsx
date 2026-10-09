import { useEffect, useMemo, useRef } from "react";
import { Marker, useMap, type MarkerProps } from "react-leaflet";
import L from "leaflet";

/** Keep Leaflet's native drag alive while the parent previews route distances.
 * Equivalent icon/position props must not reinstall the icon or reset its position. */
export function StudioEndpointMarker({ icon, position, ...props }: MarkerProps) {
  const map = useMap();
  const marker = useRef<L.Marker>(null);
  const iconKey = JSON.stringify(icon?.options);
  // Icon options completely describe the generated tee/basket icon.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableIcon = useMemo(() => icon, [iconKey]);
  const point = L.latLng(position);
  const stablePosition = useMemo<[number, number]>(
    () => [point.lat, point.lng],
    [point.lat, point.lng],
  );
  useEffect(() => {
    // Rotate the pad footprint with the ground; keep labels upright.
    const rotate = () => marker.current?.getElement()?.style.setProperty(
      "--course-map-bearing", `${(map as L.Map & {getBearing?: () => number}).getBearing?.() ?? 0}deg`,
    );
    rotate();
    map.on("rotate", rotate);
    return () => { map.off("rotate", rotate); };
  }, [map, stableIcon, props.interactive]);
  // Leaflet's interactive flag is set when a layer is created. Recreate only
  // when tool modes change; ordinary drag previews keep the native drag alive.
  return <Marker key={props.interactive === false ? "display" : "select"} ref={marker} {...props} icon={stableIcon} position={stablePosition} />;
}
