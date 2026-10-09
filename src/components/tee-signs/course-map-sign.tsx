import { forwardRef } from "react";
import { courseRoutePreview } from "@/lib/course-builder/course-route";
import { validPoint } from "@/lib/course-builder/pairing-fairways";

type LL = [number, number];
export type CourseMapHole = { number: number; par: number | null; tee: LL | null; basket: LL | null; flightPath?:LL[]|null;routeCurve?:LL[]|null };
type Shape = { type: string; geometry: { points: LL[] } };

const W = 800;
const H = 600;

/** Whole-course map sign: every hole's tee → basket line, numbered, over water, woods, paths and the boundary. */
export const CourseMapSign = forwardRef<SVGSVGElement, { courseName: string; holes: CourseMapHole[]; features: Shape[]; sponsors?: string[] }>(
  function CourseMapSign({ courseName, holes, features, sponsors = [] }, ref) {
    const routes=holes.map(h=>h.routeCurve===undefined ? courseRoutePreview({tee_lat:h.tee?.[0] ?? null,tee_lng:h.tee?.[1] ?? null,
      basket_lat:h.basket?.[0] ?? null,basket_lng:h.basket?.[1] ?? null,flight_path:h.flightPath}).curve : h.routeCurve);
    const pts = holes.flatMap((h,i) => [...[h.tee,h.basket].filter(validPoint), ...(routes[i] ?? [])]);
    if (pts.length < 2) return null;
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 50, top = 70;
    const s = Math.min((W - pad * 2) / (maxX - minX || 1e-6), (H - top - pad) / (maxY - minY || 1e-6));
    const ox = (W - (maxX - minX) * s) / 2, oy = top + (H - top - pad - (maxY - minY) * s) / 2;
    const P = (p: LL) => [ox + (p[1] * k - minX) * s, oy + (maxY - p[0]) * s] as const;
    const d = (ps: LL[], close = false) => ps.map((p, i) => `${i ? "L" : "M"}${P(p)[0].toFixed(1)} ${P(p)[1].toFixed(1)}`).join(" ") + (close ? " Z" : "");
    const of = (t: string[]) => features.filter((f) => t.includes(f.type) && (f.geometry?.points?.length ?? 0) > 1);
    const par = holes.reduce((a, h) => a + (h.par ?? 0), 0);
    const parKnown = holes.every((h) => h.par != null);
    return (
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg" className="h-auto w-full rounded-lg" role="img" aria-label={`Course map of ${courseName}`}>
        <rect width={W} height={H} fill="#6f9a4f" />
        {of(["woods"]).map((f, i) => <path key={"w" + i} d={d(f.geometry.points, true)} fill="#3f6b2f" opacity={0.85} />)}
        {of(["tall_grass"]).map((f, i) => <path key={"g" + i} d={d(f.geometry.points, true)} fill="#8aa45a" />)}
        {of(["water"]).map((f, i) => <path key={"h" + i} d={d(f.geometry.points, true)} fill="#4f8fc0" stroke="#3a7aa8" />)}
        {of(["ob_area"]).map((f, i) => <path key={"o" + i} d={d(f.geometry.points, true)} fill="#c0392b" opacity={0.25} />)}
        {of(["path"]).map((f, i) => <path key={"p" + i} d={d(f.geometry.points)} fill="none" stroke="#e8dcc0" strokeWidth={3} />)}
        {of(["course_boundary"]).map((f, i) => <path key={"b" + i} d={d(f.geometry.points, true)} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="8 5" />)}
        {holes.map((h,i) => {
          if (!validPoint(h.tee) || !validPoint(h.basket)) return null;
          const [tx, ty] = P(h.tee), [bx, by] = P(h.basket);
          return (
            <g key={h.number}>
              {routes[i] && <path d={d(routes[i]!)} fill="none" stroke="#ffffff" strokeWidth={2.5} strokeDasharray="6 4" />}
              <circle cx={bx} cy={by} r={6} fill="#f2c94c" stroke="#1d2b1a" strokeWidth={1.5} />
              <circle cx={tx} cy={ty} r={12} fill="#1d2b1a" stroke="#ffffff" strokeWidth={2} />
              <text x={tx} y={ty + 4.5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#ffffff" fontFamily="Arial, sans-serif">{h.number}</text>
            </g>
          );
        })}
        <rect width={W} height={56} fill="#1d2b1a" />
        <text x={20} y={36} fontSize={24} fontWeight={700} fill="#ffffff" fontFamily="Arial, sans-serif">{courseName}</text>
        <text x={W - 20} y={36} textAnchor="end" fontSize={16} fill="#f2c94c" fontFamily="Arial, sans-serif">
          {holes.length} holes{parKnown ? ` · Par ${par}` : " · Par not confirmed"}
        </text>
        {sponsors.length ? (
          <g>
            <rect x={0} y={H - 30} width={W - 70} height={30} fill="#1d2b1a" opacity={0.85} />
            <text x={20} y={H - 10} fontSize={13} fill="#ffffff" fontFamily="Arial, sans-serif">
              Supported by {sponsors.join(" · ")}
            </text>
          </g>
        ) : null}
        <g transform={`translate(${W - 40} ${H - 40})`}>
          <path d="M0 -18 L7 6 L0 1 L-7 6 Z" fill="#ffffff" />
          <text y={20} textAnchor="middle" fontSize={11} fill="#ffffff" fontFamily="Arial, sans-serif">N</text>
        </g>
      </svg>
    );
  },
);
