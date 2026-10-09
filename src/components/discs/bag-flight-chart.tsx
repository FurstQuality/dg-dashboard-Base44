import { useMemo } from "react";
import { CATEGORY_LABEL, type MoldRow } from "@/lib/disc-catalog";

export type ChartDisc = { id: string; label: string; color: string; mold: MoldRow };

const WIDTH = 640;
const HEIGHT = 300;
const PAD = { top: 18, right: 16, bottom: 34, left: 42 };

const SPEED_MIN = 1;
const SPEED_MAX = 15;
const NET_MIN = -4;
const NET_MAX = 6;

/**
 * Flight map: speed across the bottom, net stability (turn + fade) up the side.
 * Empty regions are real gaps in a bag's shot coverage.
 */
export function BagFlightChart({ discs }: { discs: ChartDisc[] }) {
  const points = useMemo(
    () =>
      discs
        .filter((d) => d.mold.speed !== null && d.mold.turn !== null && d.mold.fade !== null)
        .map((d) => {
          const speed = Number(d.mold.speed);
          const net = Number(d.mold.turn) + Number(d.mold.fade);
          const x =
            PAD.left +
            ((speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * (WIDTH - PAD.left - PAD.right);
          const y =
            HEIGHT -
            PAD.bottom -
            ((net - NET_MIN) / (NET_MAX - NET_MIN)) * (HEIGHT - PAD.top - PAD.bottom);
          return { ...d, x, y, speed, net };
        }),
    [discs],
  );

  if (!points.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a disc with published flight numbers and your flight map appears here.
      </p>
    );
  }

  const speedTicks = [2, 4, 6, 8, 10, 12, 14];
  const netTicks = [-3, -1, 0, 2, 4, 6];

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[300px] w-full min-w-[520px]"
        role="img"
        aria-label="Flight map of your bag by speed and stability"
      >
        <rect
          x={PAD.left}
          y={PAD.top}
          width={WIDTH - PAD.left - PAD.right}
          height={HEIGHT - PAD.top - PAD.bottom}
          className="fill-muted/20"
          rx={8}
        />
        {speedTicks.map((t) => {
          const x =
            PAD.left + ((t - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * (WIDTH - PAD.left - PAD.right);
          return (
            <g key={`s${t}`}>
              <line
                x1={x}
                y1={PAD.top}
                x2={x}
                y2={HEIGHT - PAD.bottom}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={x}
                y={HEIGHT - PAD.bottom + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {t}
              </text>
            </g>
          );
        })}
        {netTicks.map((t) => {
          const y =
            HEIGHT -
            PAD.bottom -
            ((t - NET_MIN) / (NET_MAX - NET_MIN)) * (HEIGHT - PAD.top - PAD.bottom);
          return (
            <g key={`n${t}`}>
              <line
                x1={PAD.left}
                y1={y}
                x2={WIDTH - PAD.right}
                y2={y}
                className={t === 0 ? "stroke-primary/50" : "stroke-border"}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {t > 0 ? `+${t}` : t}
              </text>
            </g>
          );
        })}
        <text
          x={WIDTH / 2}
          y={HEIGHT - 4}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          Speed
        </text>
        <text x={12} y={PAD.top + 6} className="fill-muted-foreground text-[10px]">
          Overstable
        </text>
        <text x={12} y={HEIGHT - PAD.bottom - 2} className="fill-muted-foreground text-[10px]">
          Understable
        </text>

        {points.map((p) => (
          <g key={p.id}>
            <circle
              cx={p.x}
              cy={p.y}
              r={9}
              fill={p.color}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1.5}
            >
              <title>
                {`${p.label} · ${CATEGORY_LABEL[p.mold.category] ?? "Specialty"} · speed ${p.speed}, net ${p.net > 0 ? "+" : ""}${p.net}`}
              </title>
            </circle>
            <text x={p.x} y={p.y - 13} textAnchor="middle" className="fill-foreground text-[9px]">
              {p.label.length > 12 ? `${p.label.slice(0, 11)}…` : p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
