import { cn } from "@/lib/utils";

type HeatHole = { number: number; par: number };
type HeatScore = { round_player_id: string; hole_number: number; strokes: number };
type HeatPlayer = {
  id: string;
  display?: string;
  guest_name: string | null;
  user_id: string | null;
};

function relClass(rel: number | null) {
  if (rel === null) return "bg-muted/40 text-muted-foreground";
  if (rel <= -2) return "bg-purple-600 text-white"; // eagle/ace
  if (rel === -1) return "bg-primary text-primary-foreground"; // birdie
  if (rel === 0) return "bg-emerald-500/70 text-white"; // par
  if (rel === 1) return "bg-amber-400 text-black"; // bogey
  return "bg-red-500 text-white"; // double+
}

export function HoleHeatmapPanel({
  holes,
  players,
  scores,
  onSelectHole,
}: {
  holes: HeatHole[];
  players: HeatPlayer[];
  scores: HeatScore[];
  onSelectHole?: (hole: number) => void;
}) {
  const parByHole = new Map(holes.map((h) => [h.number, h.par]));
  const scoreMap = new Map<string, number>();
  for (const s of scores) scoreMap.set(`${s.round_player_id}:${s.hole_number}`, s.strokes);

  if (!holes.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
        Layout not loaded — heatmap will appear once holes are set.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Hole heatmap
        </div>
        <div className="flex items-center gap-1.5 text-[10px]">
          <Legend color="bg-purple-600" label="Eagle+" />
          <Legend color="bg-primary" label="Birdie" />
          <Legend color="bg-emerald-500/70" label="Par" />
          <Legend color="bg-amber-400" label="Bogey" />
          <Legend color="bg-red-500" label="Double+" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card px-1 py-1 text-left text-muted-foreground">
                Player
              </th>
              {holes.map((h) => (
                <th
                  key={h.number}
                  className="px-1 py-1 text-center font-medium text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => onSelectHole?.(h.number)}
                    className="rounded px-1 hover:bg-muted"
                  >
                    {h.number}
                  </button>
                </th>
              ))}
              <th className="px-2 py-1 text-right text-muted-foreground">±</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              let total = 0;
              let played = 0;
              let toPar = 0;
              for (const h of holes) {
                const strokes = scoreMap.get(`${p.id}:${h.number}`);
                if (typeof strokes === "number") {
                  total += strokes;
                  played += 1;
                  toPar += strokes - (parByHole.get(h.number) ?? 3);
                }
              }
              return (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 max-w-[110px] truncate bg-card px-1 py-1 text-left font-medium">
                    {p.display ?? p.guest_name ?? "Player"}
                  </td>
                  {holes.map((h) => {
                    const strokes = scoreMap.get(`${p.id}:${h.number}`);
                    const par = parByHole.get(h.number) ?? 3;
                    const rel = typeof strokes === "number" ? strokes - par : null;
                    return (
                      <td key={h.number} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => onSelectHole?.(h.number)}
                          className={cn(
                            "flex h-6 w-full min-w-[22px] items-center justify-center rounded text-[11px] font-semibold tabular-nums transition hover:scale-110",
                            relClass(rel),
                          )}
                          title={
                            typeof strokes === "number"
                              ? `H${h.number} · Par ${par} · ${strokes} (${rel && rel > 0 ? `+${rel}` : rel === 0 ? "E" : rel})`
                              : `H${h.number} · Par ${par} · —`
                          }
                        >
                          {typeof strokes === "number" ? strokes : "·"}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right font-semibold tabular-nums">
                    {played === 0 ? "—" : total}
                    {played > 0 ? (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        {toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("inline-block h-2.5 w-2.5 rounded", color)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
