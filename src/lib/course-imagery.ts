/**
 * Undistorted satellite stills for course cards and headers.
 * The bbox is sized in metres (so a square stays square at any latitude) and
 * requested in Web Mercator at 2× pixels for sharp retina display.
 */
export function satelliteStillUrl(
  lat: number,
  lng: number,
  opts: { widthM?: number; heightM?: number; px?: number } = {},
): string {
  const widthM = opts.widthM ?? 500;
  const heightM = opts.heightM ?? widthM;
  const pxW = Math.min(2048, Math.round((opts.px ?? 200) * 2));
  const pxH = Math.round((pxW * heightM) / widthM);
  // Web Mercator metres; scale ground metres by 1/cos(lat).
  const R = 6378137;
  const x = (lng * Math.PI * R) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const k = 1 / Math.cos((lat * Math.PI) / 180);
  const hw = (widthM * k) / 2;
  const hh = (heightM * k) / 2;
  return (
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export" +
    `?bbox=${x - hw},${y - hh},${x + hw},${y + hh}&bboxSR=3857&imageSR=3857` +
    `&size=${pxW},${pxH}&format=jpg&f=image`
  );
}
