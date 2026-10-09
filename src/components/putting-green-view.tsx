// Immersive top-down putting green view.
// Renders as a manicured circular green with mowed radial stripes, fringe/rough,
// a chain-link basket at center, station puttout mats at each ring, wind ribbon,
// and putts plotted as makes (green) or misses (red). Interactive: click a
// station to select it, or click any ring in build mode to add/remove a station.

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wind, Target, Hammer, MousePointerClick } from "lucide-react";
import { COMPASS_8, type Compass } from "@/lib/wind-helpers";

export type GreenMarker = { distance_ft: number; latitude: number; longitude: number };
export type GreenPutt = {
  id: string;
  distance_ft: number;
  made: boolean;
  landed_latitude?: number | null;
  landed_longitude?: number | null;
  created_at?: string;
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

const RINGS = [10, 15, 20, 25, 33, 40];
// Station pad positions (angle around basket in degrees). Alternates around the
// clock so the pads don't overlap. Angles measured clockwise from "down" (player side).
const STATION_ANGLES: Record<number, number> = {
  10: 0,
  15: -35,
  20: 35,
  25: -70,
  33: 70,
  40: 0,
};

export function PuttingGreenView({
  basketLat,
  basketLon,
  markers,
  putts,
  playerLat,
  playerLon,
  windDeg,
  windMph,
  windFrom,
  gustMph,
  selectedDistance,
  onSelectStation,
  onAddStation,
  onRemoveStation,
  onQuickMake,
  onQuickMiss,
}: {
  basketLat: number | null;
  basketLon: number | null;
  markers: GreenMarker[];
  putts: GreenPutt[];
  playerLat?: number | null;
  playerLon?: number | null;
  windDeg?: number | null;
  windMph?: number | null;
  windFrom?: Compass | null;
  gustMph?: number | null;
  selectedDistance?: number;
  onSelectStation?: (distance_ft: number) => void;
  onAddStation?: (distance_ft: number) => void;
  onRemoveStation?: (distance_ft: number) => void;
  onQuickMake?: () => void;
  onQuickMiss?: () => void;
}) {
  const [mode, setMode] = useState<"practice" | "build">("practice");

  const W = 460,
    H = 460;
  const CX = W / 2,
    CY = H / 2;
  const MAX_FT = 44;
  const PX_PER_FT = (Math.min(W, H) / 2 - 32) / MAX_FT;

  const facingDeg = useMemo(() => {
    if (basketLat == null || basketLon == null || playerLat == null || playerLon == null) return 0;
    return bearingDeg(basketLat, basketLon, playerLat, playerLon);
  }, [basketLat, basketLon, playerLat, playerLon]);

  const orient = (absBearing: number) => ((absBearing - facingDeg + 540) % 360) - 180;
  const polar = (distFt: number, degFromFacing: number) => {
    const rad = (degFromFacing * Math.PI) / 180;
    const r = Math.min(distFt, MAX_FT) * PX_PER_FT;
    return { x: CX + r * Math.sin(rad), y: CY + r * Math.cos(rad) };
  };

  const stationPos = (dist: number) => polar(dist, STATION_ANGLES[dist] ?? 0);
  const isStationSet = (d: number) => markers.some((m) => Math.abs(m.distance_ft - d) <= 2);
  const windArrowRel = windDeg != null ? orient((windDeg + 180) % 360) : null;

  // Rendering makes/misses — fan them out around basket for readability.
  const recent = putts.slice(-40);
  const makes = recent.filter((p) => p.made).length;
  const total = recent.length;
  const pct = total ? Math.round((makes / total) * 100) : 0;

  const handleRingClick = (d: number) => {
    if (mode === "build") {
      if (isStationSet(d)) onRemoveStation?.(d);
      else onAddStation?.(d);
    } else {
      if (isStationSet(d)) onSelectStation?.(d);
    }
  };

  return (
    <Card className="overflow-hidden border-emerald-900/40">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Putting green
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {windMph != null && (
              <Badge variant="secondary" className="gap-1">
                <Wind className="h-3 w-3" /> {windMph}
                {gustMph ? `–${gustMph}` : ""} mph
                {windFrom ? ` · ${windFrom}` : ""}
              </Badge>
            )}
            <Badge variant="outline">
              {total} · {pct}%
            </Badge>
            {(onAddStation || onRemoveStation) && (
              <Button
                size="sm"
                variant={mode === "build" ? "default" : "outline"}
                className="h-6 px-2 text-xs"
                onClick={() => setMode(mode === "build" ? "practice" : "build")}
              >
                {mode === "build" ? (
                  <>
                    <Hammer className="h-3 w-3 mr-1" /> Building
                  </>
                ) : (
                  <>
                    <MousePointerClick className="h-3 w-3 mr-1" /> Build green
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full overflow-hidden rounded-xl border border-emerald-800/40 shadow-inner">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            role="img"
            aria-label="Putting green"
          >
            <defs>
              {/* Radial mowed stripes emanating from basket */}
              <radialGradient id="greenBase" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#15803d" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#052e16" stopOpacity="1" />
              </radialGradient>
              <radialGradient id="stripeBlend" cx="50%" cy="50%" r="55%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
              </radialGradient>
              <filter id="glowGreen" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Dark rough background */}
            <rect x={0} y={0} width={W} height={H} fill="#0b1220" />

            {/* Green disc (fringe → green) */}
            <circle cx={CX} cy={CY} r={MAX_FT * PX_PER_FT + 20} fill="#166534" opacity={0.6} />
            <circle cx={CX} cy={CY} r={MAX_FT * PX_PER_FT + 8} fill="url(#greenBase)" />

            {/* Mowed radial wedges — 12 slices, alternating brightness */}
            {Array.from({ length: 12 }).map((_, i) => {
              const a1 = (i / 12) * 2 * Math.PI - Math.PI / 2;
              const a2 = ((i + 1) / 12) * 2 * Math.PI - Math.PI / 2;
              const r = MAX_FT * PX_PER_FT + 6;
              const x1 = CX + r * Math.cos(a1),
                y1 = CY + r * Math.sin(a1);
              const x2 = CX + r * Math.cos(a2),
                y2 = CY + r * Math.sin(a2);
              return (
                <path
                  key={i}
                  d={`M ${CX} ${CY} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
                  fill={i % 2 === 0 ? "#166534" : "#15803d"}
                  opacity={i % 2 === 0 ? 0.35 : 0.15}
                />
              );
            })}
            <circle cx={CX} cy={CY} r={MAX_FT * PX_PER_FT + 8} fill="url(#stripeBlend)" />

            {/* Distance rings — clickable */}
            {RINGS.map((d) => {
              const r = d * PX_PER_FT;
              const set = isStationSet(d);
              const active = selectedDistance === d;
              return (
                <g key={d}>
                  <circle
                    cx={CX}
                    cy={CY}
                    r={r}
                    fill="none"
                    stroke={active ? "#fbbf24" : set ? "#a7f3d0" : "rgba(255,255,255,0.18)"}
                    strokeWidth={active ? 2 : set ? 1.4 : 1}
                    strokeDasharray={set || active ? "none" : "3 5"}
                  />
                  <text
                    x={CX + r + 4}
                    y={CY - 2}
                    fontSize={9}
                    fill={set ? "#a7f3d0" : "rgba(255,255,255,0.55)"}
                    fontWeight={set ? 700 : 500}
                  >
                    {d} ft
                  </text>
                </g>
              );
            })}

            {/* Station puttout pads — clickable in both modes */}
            {RINGS.map((d) => {
              const p = stationPos(d);
              const set = isStationSet(d);
              const active = selectedDistance === d;
              const showable = set || mode === "build";
              if (!showable) return null;
              return (
                <g key={`st-${d}`} style={{ cursor: "pointer" }} onClick={() => handleRingClick(d)}>
                  {/* Shadow */}
                  <ellipse cx={p.x} cy={p.y + 5} rx={14} ry={3} fill="rgba(0,0,0,0.45)" />
                  {/* Mat */}
                  <rect
                    x={p.x - 14}
                    y={p.y - 8}
                    width={28}
                    height={14}
                    rx={3}
                    fill={active ? "#fbbf24" : set ? "#1c1917" : "rgba(28,25,23,0.4)"}
                    stroke={active ? "#a16207" : "#e7e5e4"}
                    strokeWidth={active ? 1.4 : 0.9}
                    strokeDasharray={set ? "none" : "3 3"}
                  />
                  <text
                    x={p.x}
                    y={p.y + 2}
                    textAnchor="middle"
                    fontSize={9}
                    fill={active ? "#1c1917" : "#fef3c7"}
                    fontWeight={700}
                  >
                    {d}′
                  </text>
                </g>
              );
            })}

            {/* Putts */}
            {recent.map((p, i) => {
              let rel: number;
              if (
                basketLat != null &&
                basketLon != null &&
                p.landed_latitude != null &&
                p.landed_longitude != null
              ) {
                rel = orient(
                  bearingDeg(basketLat, basketLon, p.landed_latitude, p.landed_longitude),
                );
              } else {
                // Fan around the station angle for this distance if we have one
                const stAng = STATION_ANGLES[Math.round(p.distance_ft / 5) * 5];
                const base = stAng ?? -60 + (120 * i) / Math.max(1, recent.length - 1);
                rel = base + ((i % 5) - 2) * 5;
              }
              const pt = polar(p.distance_ft, rel);
              return p.made ? (
                <g key={p.id}>
                  <path
                    d={`M ${pt.x} ${pt.y} Q ${(pt.x + CX) / 2} ${(pt.y + CY) / 2 - 12} ${CX} ${CY}`}
                    stroke="#22c55e"
                    strokeOpacity={0.28}
                    strokeWidth={1}
                    fill="none"
                  />
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={4.5}
                    fill="#22c55e"
                    stroke="#052e16"
                    strokeWidth={0.8}
                    filter={i === recent.length - 1 ? "url(#glowGreen)" : undefined}
                  />
                </g>
              ) : (
                <g key={p.id} transform={`translate(${pt.x} ${pt.y})`}>
                  <line x1={-4} y1={-4} x2={4} y2={4} stroke="#f87171" strokeWidth={1.6} />
                  <line x1={4} y1={-4} x2={-4} y2={4} stroke="#f87171" strokeWidth={1.6} />
                </g>
              );
            })}

            {/* Player dot */}
            {basketLat != null &&
              basketLon != null &&
              playerLat != null &&
              playerLon != null &&
              (() => {
                const brng = bearingDeg(basketLat, basketLon, playerLat, playerLon);
                const rad = (orient(brng) * Math.PI) / 180;
                const ftGuess = 22;
                const r = ftGuess * PX_PER_FT;
                const x = CX + r * Math.sin(rad);
                const y = CY + r * Math.cos(rad);
                return (
                  <g>
                    <circle cx={x} cy={y} r={9} fill="rgba(56,189,248,0.2)" />
                    <circle cx={x} cy={y} r={4} fill="#38bdf8" stroke="#0f172a" strokeWidth={0.8} />
                    <text x={x + 8} y={y + 3} fontSize={9} fill="#e0f2fe" fontWeight={600}>
                      You
                    </text>
                  </g>
                );
              })()}

            {/* Chain-link basket at center */}
            <g>
              {/* Pole */}
              <line x1={CX} y1={CY} x2={CX} y2={CY - 34} stroke="#71717a" strokeWidth={2} />
              {/* Chain support hoop */}
              <ellipse
                cx={CX}
                cy={CY - 32}
                rx={16}
                ry={4}
                fill="none"
                stroke="#a1a1aa"
                strokeWidth={1.4}
              />
              {/* Chains — vertical lines with slight droop */}
              {Array.from({ length: 8 }).map((_, i) => {
                const a = (i / 8) * Math.PI * 2;
                const px = CX + Math.cos(a) * 14;
                return (
                  <line
                    key={i}
                    x1={px}
                    y1={CY - 30}
                    x2={CX}
                    y2={CY - 6}
                    stroke="#d4d4d8"
                    strokeWidth={0.9}
                    opacity={0.85}
                  />
                );
              })}
              {/* Cage rim */}
              <ellipse
                cx={CX}
                cy={CY - 4}
                rx={18}
                ry={5}
                fill="#1c1917"
                stroke="#e7e5e4"
                strokeWidth={1.2}
              />
              {/* Basket body */}
              <path
                d={`M ${CX - 18} ${CY - 4} Q ${CX} ${CY + 14} ${CX + 18} ${CY - 4}`}
                fill="#292524"
                stroke="#e7e5e4"
                strokeWidth={1.2}
              />
              {/* Base */}
              <ellipse cx={CX} cy={CY + 12} rx={12} ry={3} fill="rgba(0,0,0,0.5)" />
            </g>

            {/* Wind ribbon */}
            {windArrowRel != null && windMph != null && (
              <g transform={`translate(46 46)`}>
                <circle r={24} fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.35)" />
                <g transform={`rotate(${windArrowRel})`}>
                  <line x1={0} y1={14} x2={0} y2={-12} stroke="#38bdf8" strokeWidth={2} />
                  <polygon points="0,-18 -5,-8 5,-8" fill="#38bdf8" />
                </g>
                <text y={36} textAnchor="middle" fontSize={8} fill="#e2e8f0" fontWeight={600}>
                  {windMph}
                  {gustMph ? `–${gustMph}` : ""} {windFrom ?? ""}
                </text>
              </g>
            )}

            {/* Compass */}
            <g transform={`translate(${W - 34} ${H - 34})`}>
              <circle r={20} fill="rgba(15,23,42,0.7)" stroke="rgba(255,255,255,0.3)" />
              {COMPASS_8.map((label, i) => {
                const rel = orient(i * 45);
                const rad = (rel * Math.PI) / 180;
                const rr = 14;
                return (
                  <text
                    key={label}
                    x={rr * Math.sin(rad)}
                    y={-rr * Math.cos(rad) + 3}
                    textAnchor="middle"
                    fontSize={7}
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

        {/* Quick-fire make/miss buttons — writes to existing putting_putts table */}
        {(onQuickMake || onQuickMiss) && selectedDistance != null && (
          <div className="mt-3 flex items-center gap-2">
            <div className="text-xs text-muted-foreground flex-1">
              Station <span className="font-semibold text-foreground">{selectedDistance} ft</span> ·
              quick log
            </div>
            <Button size="sm" variant="destructive" className="h-8" onClick={onQuickMiss}>
              Miss
            </Button>
            <Button
              size="sm"
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onQuickMake}
            >
              Made
            </Button>
          </div>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          {mode === "build"
            ? "Tap a ring or station to add/remove a distance station."
            : "Tap any station pad to select it. Green dots are makes, red Xs are misses."}
        </p>
      </CardContent>
    </Card>
  );
}
