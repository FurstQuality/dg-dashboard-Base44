// Immersive top-down driving range view.
// Renders as a manicured field with mowed stripes, tee mat, numbered
// yardage flags, curved flight arcs for each throw, wind ribbon, and
// an optional click-to-aim target.

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wind, Map as MapIcon, Crosshair, X } from "lucide-react";
import { COMPASS_8, type Compass } from "@/lib/wind-helpers";

export type FieldCone = { distance_ft: number; latitude: number; longitude: number };
export type FieldThrow = {
  id: string;
  distance_ft: number;
  landed_latitude: number;
  landed_longitude: number;
  disc_label?: string | null;
  disc_color?: string | null;
  shape?: string | null;
};

function bearingDeg(fromLat: number, fromLon: number, toLat: number, toLon: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(fromLat),
    φ2 = toRad(toLat);
  const λ1 = toRad(fromLon),
    λ2 = toRad(toLon);
  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const CONE_TARGETS = [100, 200, 300, 400];
// Hyzer/anhyzer bias for flight arc curvature.
const SHAPE_BIAS: Record<string, number> = {
  hyzer: -0.35,
  spike_hyzer: -0.5,
  skip: -0.2,
  anhyzer: 0.35,
  turnover: 0.5,
  roller: 0.15,
  flat: 0,
  flex: 0.08,
  s_curve: 0.1,
  hyzer_flip: -0.05,
  tomahawk: 0,
  thumber: 0,
  scoober: -0.15,
};

export function RangeFieldView({
  teeLat,
  teeLon,
  cones,
  throws,
  windDeg,
  windMph,
  windFrom,
  gustMph,
}: {
  teeLat: number | null;
  teeLon: number | null;
  cones: FieldCone[];
  throws: FieldThrow[];
  windDeg?: number | null;
  windMph?: number | null;
  windFrom?: Compass | null;
  gustMph?: number | null;
}) {
  const [aim, setAim] = useState<{ x: number; y: number } | null>(null);

  const facingDeg = useMemo(() => {
    if (teeLat == null || teeLon == null || throws.length === 0) return 0;
    const sorted = [...throws].sort((a, b) => b.distance_ft - a.distance_ft).slice(0, 3);
    let sx = 0,
      sy = 0;
    for (const t of sorted) {
      const b = bearingDeg(teeLat, teeLon, t.landed_latitude, t.landed_longitude);
      sx += Math.sin((b * Math.PI) / 180);
      sy += Math.cos((b * Math.PI) / 180);
    }
    return ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
  }, [teeLat, teeLon, throws]);

  // Layout
  const W = 480,
    H = 620;
  const TEE_X = W / 2;
  const TEE_Y = H - 60;
  const MAX_FT = 460;
  const PX_PER_FT = (TEE_Y - 40) / MAX_FT;

  const polar = (distFt: number, degFromFacing: number) => {
    const rad = (degFromFacing * Math.PI) / 180;
    const r = distFt * PX_PER_FT;
    return { x: TEE_X + r * Math.sin(rad), y: TEE_Y - r * Math.cos(rad) };
  };
  const orient = (absBearing: number) => ((absBearing - facingDeg + 540) % 360) - 180;
  const windArrowRel = windDeg != null ? orient((windDeg + 180) % 360) : null;

  // Curved flight path from tee to landing based on shape bias.
  const flightPath = (landing: { x: number; y: number }, shape: string | null | undefined) => {
    const bias = SHAPE_BIAS[shape ?? "flat"] ?? 0;
    const midX = (TEE_X + landing.x) / 2;
    const midY = (TEE_Y + landing.y) / 2;
    // Perpendicular offset for curvature
    const dx = landing.x - TEE_X;
    const dy = landing.y - TEE_Y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = bias * len * 0.35;
    return `M ${TEE_X} ${TEE_Y} Q ${midX + nx * offset} ${midY + ny * offset} ${landing.x} ${landing.y}`;
  };

  return (
    <Card className="overflow-hidden border-emerald-900/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <MapIcon className="h-4 w-4" /> Driving range
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {windMph != null && (
              <Badge variant="secondary" className="gap-1">
                <Wind className="h-3 w-3" /> {windMph}
                {gustMph ? `–${gustMph}` : ""} mph
                {windFrom ? ` · ${windFrom}` : ""}
              </Badge>
            )}
            <Badge variant="outline">{throws.length} throws</Badge>
            {aim ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs"
                onClick={() => setAim(null)}
              >
                <X className="h-3 w-3 mr-1" /> Clear aim
              </Button>
            ) : (
              <Badge variant="outline" className="gap-1 border-dashed">
                <Crosshair className="h-3 w-3" /> Tap field to aim
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-hidden rounded-xl border border-emerald-800/40 shadow-inner">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full cursor-crosshair"
            role="img"
            aria-label="Driving range field"
            onClick={(e) => {
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const vx = ((e.clientX - rect.left) / rect.width) * W;
              const vy = ((e.clientY - rect.top) / rect.height) * H;
              if (vy < TEE_Y - 5) setAim({ x: vx, y: vy });
            }}
          >
            <defs>
              {/* Sky gradient at the horizon (far end of fairway) */}
              <linearGradient id="rangeSky" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b1220" />
                <stop offset="45%" stopColor="#1e3a2f" />
                <stop offset="100%" stopColor="#14532d" />
              </linearGradient>
              {/* Mowed fairway pattern — alternating light/dark stripes */}
              <pattern
                id="mowed"
                x="0"
                y="0"
                width="100%"
                height="24"
                patternUnits="userSpaceOnUse"
              >
                <rect x="0" y="0" width={W} height="12" fill="#166534" opacity="0.55" />
                <rect x="0" y="12" width={W} height="12" fill="#15803d" opacity="0.45" />
              </pattern>
              {/* Radial vignette to darken edges (rough) */}
              <radialGradient id="fairwayFocus" cx="50%" cy="90%" r="80%">
                <stop offset="0%" stopColor="rgba(0,0,0,0)" />
                <stop offset="70%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
              </radialGradient>
              {/* Tee mat rubber texture */}
              <pattern id="teeMat" width="4" height="4" patternUnits="userSpaceOnUse">
                <rect width="4" height="4" fill="#1c1917" />
                <circle cx="2" cy="2" r="0.6" fill="#57534e" />
              </pattern>
              <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Horizon sky at the top */}
            <rect x={0} y={0} width={W} height={90} fill="url(#rangeSky)" />
            {/* Tree line silhouette */}
            <path
              d={`M 0 90 ${Array.from({ length: 20 })
                .map((_, i) => {
                  const x = (i / 19) * W;
                  const y = 90 - (8 + Math.sin(i * 1.3) * 6 + (i % 3) * 4);
                  return `L ${x} ${y}`;
                })
                .join(" ")} L ${W} 90 Z`}
              fill="#052e16"
            />

            {/* Fairway grass */}
            <rect x={0} y={90} width={W} height={H - 90} fill="url(#mowed)" />
            <rect x={0} y={90} width={W} height={H - 90} fill="url(#fairwayFocus)" />

            {/* Rough on the left/right edges */}
            <rect x={0} y={90} width={26} height={H - 90} fill="#052e16" opacity="0.55" />
            <rect x={W - 26} y={90} width={26} height={H - 90} fill="#052e16" opacity="0.55" />

            {/* Distance arcs */}
            {CONE_TARGETS.map((d) => {
              const r = d * PX_PER_FT;
              const isSet = cones.some((c) => c.distance_ft === d);
              return (
                <g key={d}>
                  <path
                    d={`M ${TEE_X - r} ${TEE_Y} A ${r} ${r} 0 0 1 ${TEE_X + r} ${TEE_Y}`}
                    fill="none"
                    stroke={isSet ? "#fbbf24" : "rgba(255,255,255,0.22)"}
                    strokeWidth={isSet ? 1.6 : 1}
                    strokeDasharray={isSet ? "none" : "5 6"}
                  />
                  {/* Yardage stake on the right side */}
                  <g transform={`translate(${TEE_X + r * 0.78} ${TEE_Y - r * 0.62})`}>
                    <line x1={0} y1={0} x2={0} y2={14} stroke="#e7e5e4" strokeWidth={1.2} />
                    <rect
                      x={2}
                      y={-8}
                      width={30}
                      height={12}
                      rx={2}
                      fill={isSet ? "#fbbf24" : "rgba(15,23,42,0.7)"}
                      stroke={isSet ? "#a16207" : "rgba(255,255,255,0.35)"}
                      strokeWidth={0.8}
                    />
                    <text
                      x={17}
                      y={1}
                      textAnchor="middle"
                      fontSize={9}
                      fill={isSet ? "#1c1917" : "#e2e8f0"}
                      fontWeight={700}
                    >
                      {d}′
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Placed cones — as bright orange traffic cones with base */}
            {teeLat != null &&
              teeLon != null &&
              cones.map((c) => {
                const b = bearingDeg(teeLat, teeLon, c.latitude, c.longitude);
                const p = polar(c.distance_ft, orient(b));
                return (
                  <g key={`cone-${c.distance_ft}`}>
                    <ellipse cx={p.x} cy={p.y + 5} rx={7} ry={2} fill="rgba(0,0,0,0.4)" />
                    <polygon
                      points={`${p.x},${p.y - 10} ${p.x - 6},${p.y + 4} ${p.x + 6},${p.y + 4}`}
                      fill="#f97316"
                      stroke="#7c2d12"
                      strokeWidth={0.8}
                    />
                    <rect x={p.x - 6} y={p.y - 1} width={12} height={2} fill="#fef3c7" />
                    <text
                      x={p.x}
                      y={p.y + 16}
                      textAnchor="middle"
                      fontSize={9}
                      fill="#fed7aa"
                      fontWeight={600}
                    >
                      {c.distance_ft}′
                    </text>
                  </g>
                );
              })}

            {/* Aim target flag (user-clicked) */}
            {aim && (
              <g transform={`translate(${aim.x} ${aim.y})`}>
                <circle
                  r={14}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
                <circle r={6} fill="none" stroke="#fbbf24" strokeWidth={1.4} />
                <line x1={-10} y1={0} x2={10} y2={0} stroke="#fbbf24" strokeWidth={1} />
                <line x1={0} y1={-10} x2={0} y2={10} stroke="#fbbf24" strokeWidth={1} />
                {/* Flagstick */}
                <line x1={0} y1={0} x2={0} y2={-22} stroke="#fef3c7" strokeWidth={1.2} />
                <polygon
                  points="0,-22 12,-18 0,-14"
                  fill="#fbbf24"
                  stroke="#a16207"
                  strokeWidth={0.6}
                />
                <text y={26} textAnchor="middle" fontSize={9} fill="#fde68a" fontWeight={600}>
                  Aim
                </text>
              </g>
            )}

            {/* Throw flight arcs */}
            {teeLat != null &&
              teeLon != null &&
              throws.map((t, i) => {
                const b = bearingDeg(teeLat, teeLon, t.landed_latitude, t.landed_longitude);
                const landing = polar(t.distance_ft, orient(b));
                const color = t.disc_color || "#38bdf8";
                const latest = i === throws.length - 1;
                return (
                  <g key={t.id}>
                    <path
                      d={flightPath(landing, t.shape)}
                      fill="none"
                      stroke={color}
                      strokeOpacity={latest ? 0.9 : 0.4}
                      strokeWidth={latest ? 2 : 1.2}
                      strokeLinecap="round"
                      filter={latest ? "url(#softGlow)" : undefined}
                    />
                    <circle
                      cx={landing.x}
                      cy={landing.y}
                      r={latest ? 5.5 : 4}
                      fill={color}
                      stroke="#0f172a"
                      strokeWidth={0.8}
                    />
                    {latest && (
                      <text
                        x={landing.x}
                        y={landing.y - 8}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#e2e8f0"
                        fontWeight={700}
                      >
                        {t.distance_ft}′
                      </text>
                    )}
                  </g>
                );
              })}

            {/* Tee mat + tee box outline */}
            <g>
              <rect
                x={TEE_X - 32}
                y={TEE_Y - 8}
                width={64}
                height={18}
                rx={2}
                fill="url(#teeMat)"
                stroke="#e7e5e4"
                strokeWidth={1.2}
              />
              <line
                x1={TEE_X - 24}
                y1={TEE_Y + 1}
                x2={TEE_X + 24}
                y2={TEE_Y + 1}
                stroke="#a3a3a3"
                strokeWidth={0.6}
                strokeDasharray="2 3"
              />
              <text
                x={TEE_X}
                y={TEE_Y + 28}
                textAnchor="middle"
                fontSize={10}
                fill="#fef3c7"
                fontWeight={700}
              >
                TEE PAD
              </text>
            </g>

            {/* Wind ribbon (top-left) */}
            {windArrowRel != null && windMph != null && (
              <g transform={`translate(46 130)`}>
                <circle r={26} fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.35)" />
                <g transform={`rotate(${windArrowRel})`}>
                  <line x1={0} y1={16} x2={0} y2={-14} stroke="#38bdf8" strokeWidth={2.2} />
                  <polygon points="0,-20 -6,-10 6,-10" fill="#38bdf8" />
                  {/* Streamer */}
                  <path
                    d="M 0 16 Q 4 22 0 28"
                    stroke="#38bdf8"
                    strokeWidth={1.5}
                    fill="none"
                    opacity={0.7}
                  />
                </g>
                <text y={40} textAnchor="middle" fontSize={9} fill="#e2e8f0" fontWeight={600}>
                  {windMph}
                  {gustMph ? `–${gustMph}` : ""} mph {windFrom ?? ""}
                </text>
              </g>
            )}

            {/* Compass rose */}
            <g transform={`translate(${W - 40} ${H - 40})`}>
              <circle r={22} fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" />
              {COMPASS_8.map((label, i) => {
                const rel = orient(i * 45);
                const rad = (rel * Math.PI) / 180;
                const rr = 15;
                return (
                  <text
                    key={label}
                    x={rr * Math.sin(rad)}
                    y={-rr * Math.cos(rad) + 3}
                    textAnchor="middle"
                    fontSize={8}
                    fill={label === "N" ? "#f87171" : "#cbd5e1"}
                    fontWeight={label === "N" ? 700 : 500}
                  >
                    {label}
                  </text>
                );
              })}
            </g>
          </svg>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Field rotates to face your longest throws. Tap the fairway to drop an aim flag. Curved
          arcs show shot shape — hyzers fade left, anhyzers turn right.
        </p>
      </CardContent>
    </Card>
  );
}
