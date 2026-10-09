import { useMemo, useState } from "react";
import { Wind } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MoldRow } from "@/lib/disc-catalog";
import {
  SHOT_SHAPES,
  baseDistanceFt,
  estimateFlightPath,
  resolvePowerBand,
  type ShotShapeKey,
  type ThrowingProfile,
} from "@/lib/throwing-profile";

export type PathDisc = { id: string; label: string; color: string; mold: MoldRow };

const WIDTH = 620;
const HEIGHT = 420;
const PAD = { top: 16, right: 16, bottom: 30, left: 16 };

const WIND_OPTIONS = [
  { value: 0, label: "Calm" },
  { value: 8, label: "8 mph headwind" },
  { value: 16, label: "16 mph headwind" },
];

/**
 * Top-down flight paths for the bag, estimated at the player's own power for a
 * chosen throwing style, release shape and wind. Every line is an estimate from
 * published flight numbers plus the player's throwing profile.
 */
export function FlightPathMap({
  discs,
  profile,
}: {
  discs: PathDisc[];
  profile: ThrowingProfile | null;
}) {
  const band = resolvePowerBand(profile);
  const [style, setStyle] = useState<"backhand" | "forehand">(
    profile?.primary_style === "forehand" ? "forehand" : "backhand",
  );
  const [shape, setShape] = useState<ShotShapeKey>("flat");
  const [wind, setWind] = useState(0);
  const [powerPct, setPowerPct] = useState(100);

  const base = Math.round((baseDistanceFt(profile) * powerPct) / 100);

  const paths = useMemo(() => {
    return discs
      .filter((d) => d.mold.speed !== null && d.mold.turn !== null && d.mold.fade !== null)
      .map((d) => ({
        disc: d,
        flight: estimateFlightPath(
          {
            speed: Number(d.mold.speed),
            glide: Number(d.mold.glide ?? 4),
            turn: Number(d.mold.turn),
            fade: Number(d.mold.fade),
          },
          {
            baseDistanceFt: base,
            maxUsefulSpeed: band.maxUsefulSpeed,
            shape,
            style,
            handedness: profile?.handedness ?? "right",
            windMph: wind,
          },
        ),
      }));
  }, [discs, base, band.maxUsefulSpeed, shape, style, profile?.handedness, wind]);

  const maxDistance = Math.max(200, ...paths.map((p) => p.flight.distanceFt));
  const maxLateral = Math.max(60, ...paths.map((p) => Math.abs(p.flight.lateralFt) + 20));

  const px = (lateral: number) =>
    PAD.left + ((lateral + maxLateral) / (maxLateral * 2)) * (WIDTH - PAD.left - PAD.right);
  const py = (distance: number) =>
    HEIGHT - PAD.bottom - (distance / maxDistance) * (HEIGHT - PAD.top - PAD.bottom);

  const activeShape = SHOT_SHAPES.find((s) => s.key === shape);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border p-0.5">
          {(["backhand", "forehand"] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={style === option ? "secondary" : "ghost"}
              className="h-8 px-3 capitalize"
              onClick={() => setStyle(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <select
          value={shape}
          onChange={(e) => setShape(e.target.value as ShotShapeKey)}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Release shape"
        >
          {SHOT_SHAPES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={wind}
          onChange={(e) => setWind(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          aria-label="Wind"
        >
          {WIND_OPTIONS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label htmlFor="power" className="text-xs text-muted-foreground">
            Effort
          </label>
          <input
            id="power"
            type="range"
            min={60}
            max={100}
            step={5}
            value={powerPct}
            onChange={(e) => setPowerPct(Number(e.target.value))}
            className="w-28"
          />
          <span className="text-xs tabular-nums text-muted-foreground">{powerPct}%</span>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {band.label} · about {base} ft full power
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        {activeShape?.hint} Lines are estimates from published flight numbers and your throwing
        profile — treat them as a starting point, then trust your field work.
      </p>

      {paths.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a disc with published flight numbers and your flight lines appear here.
        </p>
      ) : (
        <>
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="h-[420px] w-full min-w-[520px]"
              role="img"
              aria-label="Estimated flight paths for the discs in your bag"
            >
              <rect
                x={PAD.left}
                y={PAD.top}
                width={WIDTH - PAD.left - PAD.right}
                height={HEIGHT - PAD.top - PAD.bottom}
                className="fill-muted/20"
                rx={10}
              />
              {[0.25, 0.5, 0.75, 1].map((frac) => {
                const dist = Math.round(maxDistance * frac);
                return (
                  <g key={frac}>
                    <line
                      x1={PAD.left}
                      y1={py(dist)}
                      x2={WIDTH - PAD.right}
                      y2={py(dist)}
                      className="stroke-border"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left + 6}
                      y={py(dist) - 4}
                      className="fill-muted-foreground text-[10px]"
                    >
                      {dist} ft
                    </text>
                  </g>
                );
              })}
              <line
                x1={px(0)}
                y1={PAD.top}
                x2={px(0)}
                y2={HEIGHT - PAD.bottom}
                className="stroke-primary/40"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <circle cx={px(0)} cy={HEIGHT - PAD.bottom} r={4} className="fill-primary" />
              <text
                x={px(0)}
                y={HEIGHT - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                Tee
              </text>

              {paths.map(({ disc, flight }) => {
                const d = flight.points
                  .map(([dist, lat], i) => `${i === 0 ? "M" : "L"}${px(lat)},${py(dist)}`)
                  .join(" ");
                const end = flight.points[flight.points.length - 1]!;
                return (
                  <g key={disc.id}>
                    <path
                      d={d}
                      fill="none"
                      stroke={disc.color}
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      opacity={flight.overpowered ? 0.55 : 0.95}
                      strokeDasharray={flight.overpowered ? "6 4" : undefined}
                    >
                      <title>{`${disc.label} · ${flight.distanceFt} ft · ${flight.note}`}</title>
                    </path>
                    <circle cx={px(end[1])} cy={py(end[0])} r={5} fill={disc.color} />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {paths
              .slice()
              .sort((a, b) => b.flight.distanceFt - a.flight.distanceFt)
              .map(({ disc, flight }) => (
                <div
                  key={disc.id}
                  className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs"
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: disc.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{disc.label}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {flight.distanceFt} ft ·{" "}
                    {flight.lateralFt === 0
                      ? "straight"
                      : `${Math.abs(flight.lateralFt)} ft ${flight.lateralFt > 0 ? "right" : "left"}`}
                  </span>
                  {flight.overpowered ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      Too fast
                    </Badge>
                  ) : null}
                </div>
              ))}
          </div>

          {wind > 0 ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Wind className="h-3.5 w-3.5" /> Headwind pushes every line earlier into its fade and
              trims distance.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
