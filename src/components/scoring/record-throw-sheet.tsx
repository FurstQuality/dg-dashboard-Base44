import { useEffect, useState } from "react";
import { Crosshair, Undo2, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  deriveHoleStats, inferThrowType, knownStartZone, TYPE_LABEL, ZONE_LABEL,
  type DistanceZone, type LieArea, type ThrowRow, type ThrowType,
} from "@/lib/throw-stats";

function feetBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 20902231; // earth radius in feet
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Outcome = { label: string; zone?: DistanceZone; lie?: LieArea; holed?: boolean };

const TEE: Outcome[] = [
  { label: "Parked", zone: "parked", lie: "fairway" }, { label: "C1", zone: "c1", lie: "fairway" },
  { label: "C2", zone: "c2", lie: "fairway" }, { label: "Fairway", zone: "outside", lie: "fairway" },
  { label: "Rough", lie: "rough" }, { label: "OB", lie: "ob" }, { label: "Hazard", lie: "hazard" },
  { label: "Ace", holed: true }, { label: "Other", lie: "other" },
];
const APPROACH: Outcome[] = [
  { label: "Parked", zone: "parked" }, { label: "C1", zone: "c1" }, { label: "C2", zone: "c2" },
  { label: "Outside", zone: "outside" }, { label: "Rough", lie: "rough" }, { label: "OB", lie: "ob" },
  { label: "Hazard", lie: "hazard" }, { label: "Holed out", holed: true },
];
const PUTT_ZONES: DistanceZone[] = ["parked", "c1", "c2", "outside"];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roundId: string;
  roundPlayerId: string;
  playerName: string;
  holeNumber: number;
  par: number | null;
  /** Called with throws + penalties when the hole is holed out. */
  onHoledOut?: (trackedScore: number) => void;
  /** Tee location, used with GPS to measure drive distance. */
  teePoint?: { latitude: number; longitude: number } | null;
}

export function RecordThrowSheet({ open, onOpenChange, roundId, roundPlayerId, playerName, holeNumber, par, teePoint, onHoledOut }: Props) {
  const [throws, setThrows] = useState<(ThrowRow & { id: string; lat?: number | null; lng?: number | null; penalty_strokes?: number })[]>([]);
  const [type, setType] = useState<ThrowType>("tee");
  const [puttFrom, setPuttFrom] = useState<DistanceZone | null>(null);
  const [busy, setBusy] = useState(false);
  const [useGps, setUseGps] = useState(false);
  const [discs, setDiscs] = useState<{ id: string; label: string }[]>([]);
  const [discId, setDiscId] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [shape, setShape] = useState<string | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = throws.find((t) => t.id === editingId) ?? null;
  useEffect(() => {
    if (!open || discs.length) return;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("user_discs")
        .select("id,nickname,plastic_name,disc_molds(name)").eq("user_id", auth.user.id).is("retired_at", null)
        .order("is_favorite", { ascending: false }).order("slot_order").limit(40);
      setDiscs((data ?? []).map((d: any) => ({ id: d.id, label: d.nickname || d.disc_molds?.name || d.plastic_name || "Disc" })));
    })();
  }, [open]);

  /** Optional fix for the landing spot; ignored when the phone's accuracy is poor. */
  const readGps = () =>
    new Promise<{ lat: number; lng: number; gps_accuracy_m: number } | null>((resolve) => {
      if (!useGps || typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve(pos.coords.accuracy <= 30
            ? { lat: pos.coords.latitude, lng: pos.coords.longitude, gps_accuracy_m: pos.coords.accuracy }
            : null),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 6000 },
      );
    });

  const load = async () => {
    const { data } = await supabase
      .from("round_throws")
      .select("id,throw_number,throw_type,distance_zone,lie_area,start_zone,made,holed_out,lat,lng,penalty_strokes")
      .eq("round_id", roundId).eq("round_player_id", roundPlayerId).eq("hole_number", holeNumber)
      .order("throw_number");
    const rows = (data ?? []) as (ThrowRow & { id: string; lat: number | null; lng: number | null; penalty_strokes: number })[];
    setThrows(rows);
    setType(inferThrowType(rows));
    setPuttFrom(knownStartZone(rows));
  };
  useEffect(() => { if (open) void load(); }, [open, roundPlayerId, holeNumber]);

  const done = throws.some((t) => t.holed_out);

  const syncStats = async (rows: (ThrowRow & { lat?: number | null; lng?: number | null })[]) => {
    const tee = rows.find((r) => r.throw_type === "tee" && r.lat != null && r.lng != null);
    const driveFt = tee && teePoint ? feetBetween(teePoint, { latitude: tee.lat!, longitude: tee.lng! }) : null;
    const d = {
      ...deriveHoleStats(rows, par),
      throw_tracking: rows.length === 0 ? "none" : rows.some((r) => r.holed_out) ? "complete" : "partial",
      ...(driveFt != null && driveFt > 20 && driveFt < 1500 ? { drive_distance_ft: Math.round(driveFt) } : {}),
    };
    await supabase.from("round_scores").update(d)
      .eq("round_id", roundId).eq("round_player_id", roundPlayerId).eq("hole_number", holeNumber);
  };

  const startEdit = (t: (typeof throws)[number]) => {
    setEditingId(t.id);
    setType(t.throw_type);
    if (t.throw_type === "putt") setPuttFrom(t.start_zone ?? null);
  };
  const stopEdit = () => {
    setEditingId(null);
    setType(inferThrowType(throws));
    setPuttFrom(knownStartZone(throws));
  };

  /** Rewrites one earlier throw in place; numbering and later throws stay. */
  const update = async (row: Omit<ThrowRow, "throw_number"> & { penalty_strokes?: number }) => {
    if (!editing) return;
    const isLast = throws[throws.length - 1]?.id === editing.id;
    if (row.holed_out && !isLast) {
      toast.error("Only your last throw can hole out. Undo the throws after it first.");
      return;
    }
    setBusy(true);
    const patch = { penalty_strokes: 0, ...row };
    const { error } = await supabase.from("round_throws").update(patch).eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error("Couldn't update that throw. Try again."); return; }
    const next = throws.map((t) => (t.id === editing.id ? { ...t, ...patch } : t));
    void syncStats(next);
    setThrows(next);
    setEditingId(null);
    setType(inferThrowType(next));
    setPuttFrom(knownStartZone(next));
    toast.success(`Throw ${editing.throw_number} updated`);
    if (patch.holed_out) {
      onHoledOut?.(next.length + next.reduce((n, t) => n + (t.penalty_strokes ?? 0), 0));
    }
  };

  /** Removes any throw; later throws move up one so numbering stays 1..n. */
  const removeThrow = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.from("round_throws").delete().eq("id", editing.id);
    if (error) { setBusy(false); toast.error("Couldn't remove that throw. Try again."); return; }
    const later = throws.filter((t) => t.throw_number > editing.throw_number);
    for (const t of later) {
      await supabase.from("round_throws").update({ throw_number: t.throw_number - 1 }).eq("id", t.id);
    }
    setBusy(false);
    const next = throws
      .filter((t) => t.id !== editing.id)
      .map((t) => (t.throw_number > editing.throw_number ? { ...t, throw_number: t.throw_number - 1 } : t));
    void syncStats(next);
    setThrows(next);
    setEditingId(null);
    setType(inferThrowType(next));
    setPuttFrom(knownStartZone(next));
    toast.success(`Throw ${editing.throw_number} removed`);
  };

  const save = async (row: Omit<ThrowRow, "throw_number"> & { penalty_strokes?: number }) => {
    if (editing) return update(row);
    setBusy(true);
    const throw_number = throws.length + 1;
    const gps = await readGps();
    if (useGps && !gps) toast.message("GPS unavailable — throw saved without a location");
    const { data, error } = await supabase.from("round_throws").insert({
      round_id: roundId, round_player_id: roundPlayerId, hole_number: holeNumber, throw_number, ...row, ...(gps ?? {}),
      disc_id: discId, throw_style: style, shot_shape: shape, miss_direction: miss,
    }).select("id").single();
    setBusy(false);
    if (error || !data) { toast.error("Couldn't save that throw. Try again."); return; }
    const next = [...throws, { ...row, ...(gps ?? {}), throw_number, id: data.id }];
    void syncStats(next);
    setThrows(next);
    setType(inferThrowType(next));
    setPuttFrom(knownStartZone(next));
    setMiss(null);
    if (row.holed_out) {
      // Score stays canonical: suggest throws + penalties, the player still confirms with Submit.
      const tracked = next.length + next.reduce((n, t) => n + (t.penalty_strokes ?? 0), 0);
      onHoledOut?.(tracked);
      toast.success(throw_number === 1 && row.throw_type === "tee" ? "Ace! Score set to 1 — confirm to submit" : `Holed out — score set to ${tracked}. Check it, then submit.`);
    } else toast.success(`Throw ${throw_number} saved`, { action: { label: "Undo", onClick: () => void (async () => {
      await supabase.from("round_throws").delete().eq("id", data.id);
      const rest = next.slice(0, -1);
      void syncStats(rest);
      setThrows(rest); setType(inferThrowType(rest)); setPuttFrom(knownStartZone(rest));
    })() } });
    onOpenChange(false);
  };

  const undo = async () => {
    const last = throws[throws.length - 1];
    if (!last) return;
    await supabase.from("round_throws").delete().eq("id", last.id);
    const next = throws.slice(0, -1);
    void syncStats(next);
    setThrows(next);
    setType(inferThrowType(next));
    setPuttFrom(knownStartZone(next));
  };

  const pick = (o: Outcome) =>
    save({ throw_type: type, distance_zone: o.zone ?? (o.holed ? null : "unknown"), lie_area: o.lie ?? null,
      start_zone: null, made: o.holed ? true : null, holed_out: !!o.holed,
      penalty_strokes: o.lie === "ob" || o.lie === "hazard" ? 1 : 0 });

  const putt = (made: boolean) =>
    save({ throw_type: "putt", start_zone: puttFrom ?? "unknown", distance_zone: null, lie_area: null,
      made, holed_out: made });

  const outcomes = type === "tee" ? TEE : APPROACH;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? `Edit throw ${editing.throw_number}` : `Record throw ${throws.length + 1}`}</SheetTitle>
          <SheetDescription>{playerName} · Hole {holeNumber}{par != null ? ` · Par ${par}` : ""}</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex gap-1 flex-wrap" role="tablist" aria-label="Throw type">
          {(["tee", "approach", "putt", "other"] as ThrowType[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={type === t} onClick={() => setType(t)}
              className={"min-h-10 shrink-0 rounded-full border px-3 text-sm font-medium " +
                (type === t ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {editing ? (
          <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
            <span>Pick a new result for throw {editing.throw_number}, or remove it.</span>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="ghost" size="sm" className="min-h-10 text-destructive" disabled={busy} onClick={removeThrow}>
                <Trash2 className="mr-1 h-4 w-4" /> Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" className="min-h-10" onClick={stopEdit}>Cancel</Button>
            </div>
          </div>
        ) : null}

        {done && !editing ? (
          <p className="mt-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">Holed out — this hole is complete. Undo the last throw to change it.</p>
        ) : type === "putt" ? (
          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-1.5 text-sm text-muted-foreground">Putting from</p>
              <div className="grid grid-cols-4 gap-2">
                {PUTT_ZONES.map((z) => (
                  <Button key={z} type="button" variant={puttFrom === z ? "default" : "outline"} className="min-h-11"
                    onClick={() => setPuttFrom(z)}>{z === "parked" ? "Tap-in" : ZONE_LABEL[z]}</Button>
                ))}
              </div>
            </div>
            <Button type="button" variant="secondary" className="min-h-12 w-full text-base" disabled={busy}
              onClick={() => save({ throw_type: "putt", start_zone: "parked", distance_zone: null, lie_area: null, made: true, holed_out: true })}>
              <Check className="mr-1.5 h-5 w-5" /> Tap-in
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" className="min-h-14 text-base" disabled={busy} onClick={() => putt(true)}>
                <Check className="mr-1.5 h-5 w-5" /> Made
              </Button>
              <Button type="button" variant="outline" className="min-h-14 text-base" disabled={busy} onClick={() => putt(false)}>
                <X className="mr-1.5 h-5 w-5" /> Missed
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(type === "other" ? APPROACH : outcomes).map((o) => (
              <Button key={o.label} type="button" variant="outline" className="min-h-14 text-base font-semibold"
                disabled={busy} onClick={() => pick(o)}>{o.label}</Button>
            ))}
          </div>
        )}

        <details className="mt-4 rounded-lg border border-border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">More</summary>
          <label className="mt-2 flex min-h-11 items-center justify-between gap-3">
            <span>Use GPS to save where each throw landed</span>
            <input type="checkbox" className="h-5 w-5" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
          </label>
          {discs.length ? <ChipRow label="Disc" value={discId} onChange={setDiscId} options={discs.map((d) => [d.id, d.label])} /> : null}
          <ChipRow label="Throw style" value={style} onChange={setStyle}
            options={[["backhand","Backhand"],["forehand","Forehand"],["overhand","Overhand"],["roller","Roller"],["putt","Putt"],["other","Other"]]} />
          <ChipRow label="Shot shape" value={shape} onChange={setShape}
            options={[["hyzer","Hyzer"],["straight","Straight"],["anhyzer","Anhyzer"],["flex","Flex"],["roller","Roller"],["other","Other"]]} />
          <ChipRow label="Miss direction (this throw)" value={miss} onChange={setMiss}
            options={[["left","Left"],["right","Right"],["short","Short"],["long","Long"],["high","High"],["low","Low"]]} />
          <p className="mt-1 text-xs text-muted-foreground">Disc, style and shape stay selected for your next throws.</p>
        </details>

        {throws.length ? (
          <div className="mt-4 flex items-start justify-between gap-2 border-t border-border pt-3">
            <div className="min-w-0">
              <p className="mb-1 text-sm text-muted-foreground">Tap a throw to edit or remove it</p>
              <div className="flex flex-wrap gap-1.5">
                {throws.map((t) => (
                  <button key={t.id} type="button" onClick={() => (editingId === t.id ? stopEdit() : startEdit(t))}
                    aria-pressed={editingId === t.id}
                    className={"min-h-9 rounded-full border px-2.5 text-sm " +
                      (editingId === t.id ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
                    {t.throw_number}. {t.throw_type === "putt"
                      ? `${t.made ? "Made" : "Missed"}${t.start_zone && t.start_zone !== "unknown" ? ` ${ZONE_LABEL[t.start_zone]}` : ""} putt`
                      : t.holed_out ? "Holed" : t.distance_zone && t.distance_zone !== "unknown" ? ZONE_LABEL[t.distance_zone] : t.lie_area ?? "—"}
                  </button>
                ))}
              </div>
            </div>
            <Button type="button" variant="ghost" size="sm" className="min-h-10 shrink-0" onClick={undo}>
              <Undo2 className="mr-1 h-4 w-4" /> Undo
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function RecordThrowButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="secondary" className="min-h-11 rounded-full px-4 font-semibold shadow-sm" onClick={onClick}>
      <Crosshair className="mr-1.5 h-4 w-4" /> Record throw
    </Button>
  );
}

function ChipRow({ label, value, onChange, options }: {
  label: string; value: string | null; onChange: (v: string | null) => void; options: [string, string][];
}) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-sm text-muted-foreground">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(([v, l]) => (
          <button key={v} type="button" onClick={() => onChange(value === v ? null : v)}
            className={"min-h-10 shrink-0 rounded-full border px-3 text-sm " +
              (value === v ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
