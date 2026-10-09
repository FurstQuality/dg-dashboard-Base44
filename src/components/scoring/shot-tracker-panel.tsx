import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { bagDiscsQueryOptions, bagDiscLabel } from "@/lib/entities/bag";
import { C1_FT, C2_FT, zoneForDistanceFt, zoneLabel } from "@/lib/putting-zones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Target,
  Disc,
  Ruler,
  Check,
  X as XIcon,
  Crosshair,
  TriangleAlert,
  Flag,
} from "lucide-react";

export interface ShotTrackerPanelProps {
  roundId: string | null;
  roundPlayerId: string | null;
  userId: string | null;
  holeNumber: number;
  par: number;
  strokes: number | null;
  distanceFt?: number | null;
  /** Auto-derived drive distance from the GPS shot tracker (feet). */
  gpsDriveFt?: number | null;
  /** Auto-derived longest throw from the GPS shot tracker (feet). */
  gpsLongestFt?: number | null;
  /** Make distance from outside C1, measured by GPS (feet). */
  gpsThrowInFt?: number | null;
  /** Putts attempted from inside 33 ft, counted by GPS. */
  gpsC1Putts?: number | null;
  /** Putts attempted from 33–66 ft, counted by GPS. */
  gpsC2Putts?: number | null;
  /** Throws flagged out of bounds in the GPS shot log. */
  gpsObStrokes?: number | null;
  /** GPS says the drive finished inside 33 ft. */
  gpsParked?: boolean | null;
  /** Throws marked in the GPS shot log on this hole. */
  gpsThrows?: number | null;
}

type DiscOption = { id: string; label: string };

type ShotRow = {
  c1_in_reg: boolean | null;
  c2_in_reg: boolean | null;
  drive_distance_ft: number | null;
  drive_disc_id: string | null;
  putt_disc_id: string | null;
  c1_putts_made: number | null;
  c1_putts_missed: number | null;
  c2_putts_made: number | null;
  c2_putts_missed: number | null;
  fairway_hit: boolean | null;
  scramble: boolean | null;
  longest_throw_ft: number | null;
  throw_in_ft: number | null;
  ob_strokes: number | null;
  penalties: number | null;
  putts: number | null;
};

const EMPTY: ShotRow = {
  c1_in_reg: null,
  c2_in_reg: null,
  drive_distance_ft: null,
  drive_disc_id: null,
  putt_disc_id: null,
  c1_putts_made: null,
  c1_putts_missed: null,
  c2_putts_made: null,
  c2_putts_missed: null,
  fairway_hit: null,
  scramble: null,
  longest_throw_ft: null,
  throw_in_ft: null,
  ob_strokes: null,
  penalties: null,
  putts: null,
};

export function ShotTrackerPanel({
  roundId,
  roundPlayerId,
  userId,
  holeNumber,
  par,
  strokes,
  distanceFt,
  gpsDriveFt,
  gpsLongestFt,
  gpsThrowInFt,
  gpsC1Putts,
  gpsC2Putts,
  gpsObStrokes,
  gpsParked,
  gpsThrows,
}: ShotTrackerPanelProps) {

  const [row, setRow] = useState<ShotRow>(EMPTY);

  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Player's active discs come from the shared bag entity.
  const { data: bag } = useQuery(bagDiscsQueryOptions(userId));
  const discs: DiscOption[] = useMemo(
    () => (bag ?? []).map((d) => ({ id: d.id, label: bagDiscLabel(d) })),
    [bag],
  );

  // Load existing per-hole shot row
  useEffect(() => {
    let cancelled = false;
    if (!roundId || !roundPlayerId) {
      setRow(EMPTY);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    (async () => {
      const { data } = await supabase
        .from("round_scores")
        .select(
          "c1_in_reg, c2_in_reg, drive_distance_ft, drive_disc_id, putt_disc_id, c1_putts_made, c1_putts_missed, c2_putts_made, c2_putts_missed, fairway_hit, scramble, longest_throw_ft, throw_in_ft, ob_strokes, penalties, putts",
        )

        .eq("round_id", roundId)
        .eq("round_player_id", roundPlayerId)
        .eq("hole_number", holeNumber)
        .maybeSingle();
      if (cancelled) return;
      setRow(data ? { ...EMPTY, ...(data as any) } : EMPTY);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, roundPlayerId, holeNumber]);

  // Auto-fill from GPS when we don't have a manual value yet. Anything the
  // player typed by hand always wins.
  useEffect(() => {
    if (!loaded) return;
    setRow((r) => {
      const next = { ...r };
      let changed = false;
      if (next.drive_distance_ft == null && gpsDriveFt && gpsDriveFt > 0) {
        next.drive_distance_ft = gpsDriveFt;
        changed = true;
      }
      if (next.longest_throw_ft == null && gpsLongestFt && gpsLongestFt > 0) {
        next.longest_throw_ft = gpsLongestFt;
        changed = true;
      }
      if (next.throw_in_ft == null && gpsThrowInFt && gpsThrowInFt > 0) {
        next.throw_in_ft = gpsThrowInFt;
        changed = true;
      }
      if (next.ob_strokes == null && gpsObStrokes) {
        next.ob_strokes = gpsObStrokes;
        next.penalties = next.penalties ?? gpsObStrokes;
        changed = true;
      }
      return changed ? next : r;
    });
  }, [loaded, gpsDriveFt, gpsLongestFt, gpsThrowInFt, gpsObStrokes]);

  const patch = (p: Partial<ShotRow>) => setRow((r) => ({ ...r, ...p }));

  // Putt distance entry — the zone (C1 / C2 / upshot) is derived, never typed.
  const [puttFt, setPuttFt] = useState("");
  const puttZone = useMemo(
    () => zoneForDistanceFt(puttFt ? Number(puttFt) : null),
    [puttFt],
  );

  /** File a make/miss at the entered distance into the right zone counter. */
  const logPutt = (made: boolean) => {
    const ft = Number(puttFt);
    if (!puttZone || !Number.isFinite(ft)) return;
    if (puttZone === "outside") {
      if (!made) {
        toast.info(`Outside ${C2_FT} ft is an upshot, not a putt — logged the distance only.`);
        patch({ longest_throw_ft: Math.max(row.longest_throw_ft ?? 0, ft) });
      } else {
        patch({
          throw_in_ft: Math.max(row.throw_in_ft ?? 0, ft),
          longest_throw_ft: Math.max(row.longest_throw_ft ?? 0, ft),
        });
        toast.success(`Throw-in from ${ft} ft`);
      }
      setPuttFt("");
      return;
    }
    if (puttZone === "c1") {
      patch(
        made
          ? { c1_putts_made: (row.c1_putts_made ?? 0) + 1, putts: (row.putts ?? 0) + 1 }
          : { c1_putts_missed: (row.c1_putts_missed ?? 0) + 1, putts: (row.putts ?? 0) + 1 },
      );
    } else {
      patch({
        ...(made
          ? {
              c2_putts_made: (row.c2_putts_made ?? 0) + 1,
              throw_in_ft: Math.max(row.throw_in_ft ?? 0, ft),
            }
          : { c2_putts_missed: (row.c2_putts_missed ?? 0) + 1 }),
        putts: (row.putts ?? 0) + 1,
      });
    }
    toast.success(`${puttZone.toUpperCase()} putt ${made ? "made" : "missed"} from ${ft} ft`);
    setPuttFt("");
  };


  const gpsAvailable =
    !!(gpsThrows && gpsThrows > 0) ||
    !!(gpsDriveFt && gpsDriveFt > 0) ||
    !!(gpsLongestFt && gpsLongestFt > 0);

  /** Overwrite every measurable field with what the GPS shot log recorded. */
  const applyGps = () => {
    const c1 = gpsC1Putts ?? 0;
    const c2 = gpsC2Putts ?? 0;
    patch({
      ...(gpsDriveFt && gpsDriveFt > 0 ? { drive_distance_ft: gpsDriveFt } : {}),
      ...(gpsLongestFt && gpsLongestFt > 0 ? { longest_throw_ft: gpsLongestFt } : {}),
      ...(gpsThrowInFt && gpsThrowInFt > 0 ? { throw_in_ft: gpsThrowInFt } : {}),
      ob_strokes: gpsObStrokes ?? 0,
      penalties: gpsObStrokes ?? 0,
      putts: c1 + c2 || null,
      ...(gpsParked ? { c1_in_reg: true } : {}),
    });
    toast.success("Filled from your GPS shot log");
  };

  const save = async () => {
    if (!roundId || !roundPlayerId) {
      toast.error("Score the hole first, then log shots.");
      return;
    }
    setSaving(true);
    const payload = {
      round_id: roundId,
      round_player_id: roundPlayerId,
      hole_number: holeNumber,
      strokes: strokes ?? par,
      ...row,
    };
    const { error } = await supabase
      .from("round_scores")
      .upsert(payload, { onConflict: "round_id,round_player_id,hole_number" });
    setSaving(false);
    if (error) {
      // Fallback: update if unique constraint name differs
      const { error: upErr } = await supabase
        .from("round_scores")
        .update(row as any)
        .eq("round_id", roundId)
        .eq("round_player_id", roundPlayerId)
        .eq("hole_number", holeNumber);
      if (upErr) {
        toast.error("Could not save shots.");
        return;
      }
    }
    toast.success("Shots logged");
  };

  const drivePar = par >= 4;
  const summary = useMemo(() => {
    const parts: string[] = [];
    if (row.fairway_hit === true) parts.push("Fairway");
    else if (row.fairway_hit === false) parts.push("Off fairway");
    if (row.c1_in_reg) parts.push("C1 in reg");
    else if (row.c2_in_reg) parts.push("C2 in reg");
    if (row.drive_distance_ft) parts.push(`${row.drive_distance_ft} ft drive`);
    if (row.longest_throw_ft) parts.push(`${row.longest_throw_ft} ft long`);
    if (row.throw_in_ft) parts.push(`${row.throw_in_ft} ft throw-in`);
    if (row.ob_strokes) parts.push(`${row.ob_strokes} OB`);
    if (row.scramble) parts.push("Scramble");
    return parts.join(" · ");
  }, [row]);


  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="flex items-center gap-1">
          <Target className="h-3 w-3" /> Shot tracker · Hole {holeNumber}
        </span>
        <span className="normal-case tracking-normal text-muted-foreground/80 truncate max-w-[60%] text-right">
          {summary || "—"}
        </span>
      </div>

      <div className="space-y-2.5 p-3 text-sm">
        {/* GPS bridge — one tap to copy everything the shot log measured. */}
        {gpsAvailable ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/10 px-2 py-1.5">
            <div className="min-w-0 text-[11px] text-muted-foreground">
              <span className="font-medium text-primary">GPS shot log</span>{" "}
              {gpsThrows ? `${gpsThrows} ${gpsThrows === 1 ? "throw" : "throws"}` : "ready"}
              {gpsDriveFt ? ` · ${gpsDriveFt} ft drive` : ""}
              {gpsLongestFt ? ` · ${gpsLongestFt} ft long` : ""}
              {gpsObStrokes ? ` · ${gpsObStrokes} OB` : ""}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 text-[11px]"
              onClick={applyGps}
            >
              <Crosshair className="mr-1 h-3 w-3" /> Fill from GPS
            </Button>
          </div>
        ) : null}

        {/* Drive section */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Drive</div>

          <div className="flex items-center gap-1">
            <YesNo
              label="Fairway"
              value={row.fairway_hit}
              onChange={(v) => patch({ fairway_hit: v })}
            />
            {drivePar ? (
              <YesNo
                label="C2 in reg"
                value={row.c2_in_reg}
                onChange={(v) => patch({ c2_in_reg: v })}
              />
            ) : null}
            <YesNo
              label="C1 in reg"
              value={row.c1_in_reg}
              onChange={(v) => patch({ c1_in_reg: v })}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Ruler className="h-3 w-3" /> Dist
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder={distanceFt ? `${distanceFt}` : "ft"}
              className="h-7 w-20 text-xs"
              value={row.drive_distance_ft ?? ""}
              onChange={(e) =>
                patch({ drive_distance_ft: e.target.value ? Number(e.target.value) : null })
              }
            />
            {gpsDriveFt && gpsDriveFt > 0 && row.drive_distance_ft !== gpsDriveFt ? (
              <button
                type="button"
                onClick={() => patch({ drive_distance_ft: gpsDriveFt })}
                className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                title="Use GPS-measured drive distance"
              >
                <Crosshair className="h-3 w-3" />
                GPS {gpsDriveFt}ft
              </button>
            ) : null}
            <select
              className="h-7 flex-1 rounded-md border border-input bg-background px-1.5 text-xs"
              value={row.drive_disc_id ?? ""}
              onChange={(e) => patch({ drive_disc_id: e.target.value || null })}
            >
              <option value="">Drive disc…</option>
              {discs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Distances — longest throw and the make from outside the circle */}
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Distances
          </div>
          <div className="flex items-center gap-2">
            <label className="flex w-20 items-center gap-1 text-xs text-muted-foreground">
              <Flag className="h-3 w-3" /> Longest
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="ft"
              className="h-7 w-20 text-xs"
              value={row.longest_throw_ft ?? ""}
              onChange={(e) =>
                patch({ longest_throw_ft: e.target.value ? Number(e.target.value) : null })
              }
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" /> Throw-in
            </label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="ft"
              className="h-7 w-20 text-xs"
              value={row.throw_in_ft ?? ""}
              onChange={(e) =>
                patch({ throw_in_ft: e.target.value ? Number(e.target.value) : null })
              }
            />
          </div>
        </div>



        {/* Putting — enter the distance, we file it as C1, C2 or an upshot */}
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Putts</div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <Ruler className="h-3 w-3" /> Putt dist
            </label>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={400}
              placeholder="ft"
              className="h-7 w-20 text-xs"
              value={puttFt}
              onChange={(e) => setPuttFt(e.target.value)}
            />
            <span
              className={
                "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                (puttZone === "c1"
                  ? "bg-primary/15 text-primary"
                  : puttZone === "c2"
                    ? "bg-accent text-accent-foreground"
                    : puttZone === "outside"
                      ? "bg-muted text-muted-foreground"
                      : "text-muted-foreground/70")
              }
            >
              {puttZone ? zoneLabel(puttZone) : `C1 ≤${C1_FT} · C2 ≤${C2_FT} · then upshot`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              disabled={!puttZone}
              onClick={() => logPutt(true)}
            >
              <Check className="mr-1 h-3 w-3" /> Made
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              disabled={!puttZone}
              onClick={() => logPutt(false)}
            >
              <XIcon className="mr-1 h-3 w-3" /> Missed
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <PuttStepper
              label="C1 made"
              value={row.c1_putts_made ?? 0}
              onChange={(v) => patch({ c1_putts_made: v })}
              tone="ok"
            />
            <PuttStepper
              label="C1 miss"
              value={row.c1_putts_missed ?? 0}
              onChange={(v) => patch({ c1_putts_missed: v })}
              tone="bad"
            />
            <PuttStepper
              label="C2 made"
              value={row.c2_putts_made ?? 0}
              onChange={(v) => patch({ c2_putts_made: v })}
              tone="ok"
            />
            <PuttStepper
              label="C2 miss"
              value={row.c2_putts_missed ?? 0}
              onChange={(v) => patch({ c2_putts_missed: v })}
              tone="bad"
            />
          </div>

          <div className="flex items-center gap-2">
            <Disc className="h-3 w-3 text-muted-foreground" />
            <select
              className="h-7 flex-1 rounded-md border border-input bg-background px-1.5 text-xs"
              value={row.putt_disc_id ?? ""}
              onChange={(e) => patch({ putt_disc_id: e.target.value || null })}
            >
              <option value="">Putter used…</option>
              {discs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Penalties — OB and any other added strokes, plus total putts */}
        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <TriangleAlert className="h-3 w-3" /> Penalties
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <PuttStepper
              label="OB"
              value={row.ob_strokes ?? 0}
              onChange={(v) => patch({ ob_strokes: v })}
              tone="bad"
            />
            <PuttStepper
              label="Penalty"
              value={row.penalties ?? 0}
              onChange={(v) => patch({ penalties: v })}
              tone="bad"
            />
            <PuttStepper
              label="Putts"
              value={row.putts ?? 0}
              onChange={(v) => patch({ putts: v })}
              tone="ok"
            />
          </div>
        </div>



        {/* Scramble + save */}
        <div className="flex items-center justify-between border-t border-border/60 pt-2">
          <YesNo label="Scramble" value={row.scramble} onChange={(v) => patch({ scramble: v })} />
          <Button size="sm" onClick={save} disabled={saving || !loaded} className="h-7 text-xs">
            {saving ? "Saving…" : "Save shots"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-between rounded-md border border-border px-1.5 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          className={
            "rounded p-0.5 " +
            (value === true
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted")
          }
          aria-label={`${label} yes`}
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          className={
            "rounded p-0.5 " +
            (value === false
              ? "bg-destructive text-destructive-foreground"
              : "text-muted-foreground hover:bg-muted")
          }
          aria-label={`${label} no`}
        >
          <XIcon className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function PuttStepper({
  label,
  value,
  onChange,
  tone,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  tone: "ok" | "bad";
}) {
  const color = tone === "ok" ? "text-primary" : "text-destructive";
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-1.5 py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded bg-muted px-1.5 text-xs"
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <span className={"w-4 text-center tabular-nums text-xs font-semibold " + color}>
          {value}
        </span>
        <button
          type="button"
          className="rounded bg-muted px-1.5 text-xs"
          onClick={() => onChange(Math.min(20, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
