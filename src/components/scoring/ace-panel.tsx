import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Compass, Disc3, Star, Wind } from "lucide-react";
import { bagDiscsQueryOptions, type BagDisc as SharedBagDisc } from "@/lib/entities/bag";

type BagDisc = {
  id: string;
  nickname: string | null;
  is_favorite: boolean;
  color: string;
  mold: {
    name: string;
    speed: number;
    glide: number;
    turn: number;
    fade: number;
    stability: string;
    category: string;
  };
};

/** Only discs with complete flight numbers can be recommended. */
function toCaddyDisc(d: SharedBagDisc): BagDisc | null {
  const m = d.mold;
  if (!m || m.speed == null || m.glide == null || m.turn == null || m.fade == null) return null;
  return {
    id: d.id,
    nickname: d.nickname,
    is_favorite: d.is_favorite,
    color: d.color ?? "#888",
    mold: {
      name: m.name,
      speed: m.speed,
      glide: m.glide,
      turn: m.turn,
      fade: m.fade,
      stability: m.stability ?? "",
      category: m.category ?? "",
    },
  };
}

type Props = {
  userId: string | null;
  holeNumber: number;
  distanceFt: number | null;
  par: number;
  /** Wind- and elevation-adjusted distance the hole is actually playing. */
  playsLikeFt?: number | null;
  /** Glanceable wind summary, e.g. "12 mph headwind · 5 mph pushing right". */
  windNote?: string | null;
  /** Shot-shape guidance for the current wind. */
  shapeNote?: string | null;
  /** Compass direction the tee pad faces toward the basket, e.g. "NE (41°)". */
  facingNote?: string | null;
  /** Where the wind is blowing from, e.g. "Wind out of the SW at 9 mph". */
  windFromNote?: string | null;
  /** Elevation change tee → basket, in feet (positive = uphill). */
  elevationFt?: number | null;
  /** Elevation guidance, including how it combines with the wind. */
  elevationNote?: string | null;
};


// Rough max distance (ft) at moderate power by speed rating.
function estMax(speed: number): number {
  // Empirical curve: putter ~230, mid ~325, fairway ~400, distance ~460+
  return Math.round(60 + speed * 45);
}

function shotShapeHint(turn: number, fade: number): string {
  const net = turn + fade;
  if (net <= -1) return "Turnover / hyzer-flip";
  if (fade >= 3) return "Reliable fade";
  if (turn <= -2) return "Understable";
  if (Math.abs(net) <= 1) return "Straight";
  return "Slight fade";
}

export function AcePanel({
  userId,
  holeNumber,
  distanceFt,
  par,
  playsLikeFt,
  windNote,
  shapeNote,
  facingNote,
  windFromNote,
  elevationFt,
  elevationNote,
}: Props) {

  const { data: rawBag, isLoading: loading } = useQuery(bagDiscsQueryOptions(userId));
  const bag = useMemo(
    () => (rawBag ?? []).map(toCaddyDisc).filter((d): d is BagDisc => d !== null),
    [rawBag],
  );

  const suggestions = useMemo(() => {
    if (bag.length === 0) return [];
    const target = playsLikeFt ?? distanceFt ?? (par >= 4 ? 400 : par === 3 ? 275 : 200);
    // Score each disc by fit: prefer max within 90–110% of target.
    const scored = bag.map((d) => {
      const max = estMax(d.mold.speed);
      const ratio = target / max;
      // Best when ratio ≈ 0.9–1.0 (disc can cover shot without overthrow).
      let score = 0;
      if (ratio > 1.15)
        score = -50; // not enough disc
      else if (ratio >= 0.85 && ratio <= 1.05) score = 100;
      else if (ratio >= 0.7 && ratio < 0.85)
        score = 70; // control shot
      else if (ratio < 0.5)
        score = 20; // way too much disc
      else score = 50;
      if (d.is_favorite) score += 5;
      return { disc: d, max, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3);
  }, [bag, distanceFt, playsLikeFt, par]);

  const playsLikeDelta =
    playsLikeFt != null && distanceFt != null ? playsLikeFt - distanceFt : null;

  return (
    <div className="rounded-xl border border-border bg-background p-2">
      <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Disc3 className="h-3 w-3" /> Ace · Hole {holeNumber}
        </span>
        <span className="tabular-nums">
          {distanceFt ? `${distanceFt} ft` : `~${par >= 4 ? 400 : par === 3 ? 275 : 200} ft`}
        </span>
      </div>

      {playsLikeDelta != null && Math.abs(playsLikeDelta) >= 5 ? (
        <p className="mb-1.5 rounded-md bg-muted/50 px-2 py-1 text-[11px] font-medium tabular-nums">
          Plays like {playsLikeFt} ft ({playsLikeDelta > 0 ? "+" : ""}
          {playsLikeDelta} ft with wind and elevation)
        </p>
      ) : null}
      {facingNote || elevationFt != null ? (
        <p className="mb-1 flex flex-wrap items-center gap-x-2 px-1 text-[11px] text-muted-foreground">
          {facingNote ? (
            <span className="inline-flex items-center gap-1">
              <Compass className="h-3 w-3" /> {facingNote}
            </span>
          ) : null}
          {elevationFt != null && Math.abs(elevationFt) >= 5 ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              {elevationFt > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {elevationFt > 0 ? "+" : ""}
              {Math.round(elevationFt)} ft elevation
            </span>
          ) : null}
        </p>
      ) : null}
      {windFromNote ? (
        <p className="mb-1 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
          <Wind className="h-3 w-3" /> {windFromNote}
        </p>
      ) : null}
      {windNote ? (
        <p className="mb-1 px-1 text-[11px] text-muted-foreground">{windNote}</p>
      ) : null}
      {shapeNote ? <p className="mb-1 px-1 text-[11px] text-foreground">{shapeNote}</p> : null}
      {elevationNote ? (
        <p className="mb-1.5 px-1 text-[11px] text-foreground">{elevationNote}</p>
      ) : null}

      {!userId ? (

        <p className="px-1 py-2 text-xs text-muted-foreground">Sign in to load your bag.</p>
      ) : loading ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">Loading your bag…</p>
      ) : bag.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          Add discs to your bag to get shot recommendations here.
        </p>
      ) : suggestions.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted-foreground">
          No good matches — nothing in the bag reaches this shot.
        </p>
      ) : (
        <ul className="space-y-1">
          {suggestions.map(({ disc, max }) => (
            <li
              key={disc.id}
              className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5"
            >
              <span
                aria-hidden
                className="h-3 w-3 shrink-0 rounded-full border border-border"
                style={{ background: disc.color || "#888" }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 truncate text-sm font-semibold">
                  {disc.nickname || disc.mold.name}
                  {disc.is_favorite ? (
                    <Star className="h-3 w-3 fill-current text-amber-400" />
                  ) : null}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {disc.mold.speed}/{disc.mold.glide}/{disc.mold.turn}/{disc.mold.fade} ·{" "}
                  {shotShapeHint(disc.mold.turn, disc.mold.fade)}
                </div>
              </div>
              <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                <div>~{max} ft</div>
                <div className="capitalize">{disc.mold.category.replace("_", " ")}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
