/**
 * Course-wide tee colours (course_tee_sets) and per-tee routes for extra tee pads.
 * A tee pad whose name matches a tee set takes that set's colour, so changing
 * "Blue" once recolours every Blue tee on the course.
 */
import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Marker, Polyline, Polygon, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fairwayPolygon, smoothLine } from "@/lib/course-builder/fairway";
import { toast } from "sonner";
import { StudioPairPaths } from "./studio-pair-paths";
import {teeInventory,type InventoryHole} from "@/lib/course-builder/tee-inventory";
import type { TeePaths, StoredRoute } from "@/lib/course-builder/studio-fairways";

type Pt = [number, number];
export type TeeSet = { id: string; name: string; color: string; display_order: number };
export type CourseTeeSetsHandle = { recolor: (name:string,color:string)=>void; flush:(submitted?: TeeSet[])=>Promise<void> };
type RouteMode = "same" | "joins" | "own";

const DEFAULTS = [
  { name: "Blue", color: "#2563eb" },
  { name: "White", color: "#ffffff" },
  { name: "Red", color: "#dc2626" },
  { name: "Gold", color: "#f59e0b" },
];

export const CourseTeeSets = forwardRef(function CourseTeeSets({
  courseId,
  holes,
  onApply,
  onSetsChange,
  onStatusChange,
  draft,
  onDraftChange,
}: {
  courseId: string;
  draft: TeeSet[] | null;
  onDraftChange: (sets: TeeSet[]) => void;
  holes: InventoryHole[];
  onApply: (name: string, color: string, previousColor?:string) => void;
  onSetsChange?: (sets:TeeSet[])=>void;
  onStatusChange?: (status:{saving:boolean;error:string})=>void;
}, ref:React.ForwardedRef<CourseTeeSetsHandle>) {
  const sets = useMemo(() => draft ?? [], [draft]);
  const baseline = useRef<TeeSet[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError,setLoadError] = useState(false);
  const [loadAttempt,setLoadAttempt] = useState(0);
  const [newName, setNewName] = useState("");
  const running = useRef<Promise<void> | null>(null);
  const [saveError,setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(()=>onStatusChange?.({saving,error:saveError}),[saving,saveError,onStatusChange]);
  useEffect(()=>onSetsChange?.(sets),[sets,onSetsChange]);
  useImperativeHandle(ref,()=>({recolor:(name,color)=>{const set=sets.find(s=>s.name.trim().toLowerCase()===name.trim().toLowerCase());if(set)recolor(set,color);},flush}));

  useEffect(() => {
    let off = false;
    setLoaded(false);
    setLoadError(false);
    baseline.current = null;
    supabase
      .from("course_tee_sets")
      .select("id, name, color, display_order")
      .eq("course_id", courseId)
      .order("display_order")
      .then(({ data, error }) => {
        if (off) return;
        if (error) { setLoadError(true); return; }
        baseline.current = (data as TeeSet[]) ?? [];
        if (draft === null) onDraftChange(baseline.current);
        setLoaded(true);
      });
    return () => {
      off = true;
    };
  }, [courseId, loadAttempt]);

  // Recolor only in response to a user edit. Reapplying colors on every holes
  // render would undo an Undo or overwrite an independent pad color.

  // Names already used on the course that aren't sets yet.
  const suggestions = useMemo(() => {
    const have = new Set(sets.map((s) => s.name.toLowerCase()));
    const used = new Map<string, string>();
    for (const h of holes) {
      for (const t of [{ name: h.tee_name, color: h.tee_color }, ...h.extra_tees]) {
        const nm = t.name.trim();
        if (nm && nm.toLowerCase() !== "main" && !have.has(nm.toLowerCase())) used.set(nm, t.color);
      }
    }
    const list = [...used].map(([name, color]) => ({ name, color }));
    for (const d of DEFAULTS) if (!have.has(d.name.toLowerCase()) && !used.has(d.name)) list.push(d);
    return list.slice(0, 6);
  }, [holes, sets]);

  function add(name: string, color: string) {
    const nm = name.trim().slice(0, 40);
    if (!nm) return;
    if (sets.some(s => s.name.toLowerCase() === nm.toLowerCase())) {
      toast.error("That tee color group already exists."); return;
    }
    const hex = /^#[0-9a-f]{6}$/i.test(color) ? color : "#ffffff";
    onDraftChange([...sets, {id: crypto.randomUUID(), name: nm, color: hex, display_order: sets.length}]);
    onApply(nm, hex);
    setNewName("");
  }

  function recolor(s: TeeSet, color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    onDraftChange(sets.map(x => x.id === s.id ? {...x, color} : x));
    onApply(s.name, color, s.color);
  }

  // The editor's explicit Save changes action is the only caller that persists.
  function flush(submission = sets): Promise<void> {
    if (running.current) return running.current;
    if (!loaded || !baseline.current || draft === null) return Promise.reject(new Error("Wait for course colors to load before saving."));
    const submitted = submission.map(s => ({...s}));
    const before = baseline.current;
    if (JSON.stringify(before) === JSON.stringify(submitted)) return Promise.resolve();
    setSaving(true); setSaveError("");
    const request = (async () => {
      for (const set of submitted) {
        if (before.some(s => JSON.stringify(s) === JSON.stringify(set))) continue;
        const {data, error} = await supabase.from("course_tee_sets")
          .upsert({...set, course_id: courseId, updated_at: new Date().toISOString()}, {onConflict: "id"})
          .select("id").single();
        if (error || !data) throw new Error("Course colors could not be saved. Your edits are retained; use Save changes to retry.");
      }
      const removed = before.filter(s => !submitted.some(next => next.id === s.id));
      if (removed.length) {
        const {error} = await supabase.from("course_tee_sets").delete().eq("course_id", courseId).in("id", removed.map(s => s.id));
        if (error) throw new Error("Course color groups could not be removed. Use Save changes to retry.");
      }
      baseline.current = submitted;
    })();
    running.current = request.catch(error => {setSaveError(error.message); throw error;}).finally(() => {running.current = null; setSaving(false);});
    return running.current;
  }

  function remove(s: TeeSet) {
    onDraftChange(sets.filter(x => x.id !== s.id));
  }

  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground">Tee colours for the whole course</div>
      {loadError && <div role="alert" className="text-xs text-destructive">Course colors could not be loaded.<Button size="sm" variant="outline" onClick={()=>setLoadAttempt(v=>v+1)}>Retry loading colors</Button></div>}
      {!loaded && !loadError && <p role="status" className="text-xs">Loading course colors…</p>}
      {saving && <p role="status" className="text-xs">Saving course colors…</p>}
      {saveError && <div role="alert" className="text-xs text-destructive">{saveError}</div>}
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        Named tee groups share a color. Use any name, such as Elite, Short, Blues or Reds. These names do not change a tee’s type. Generic older labels such as Main can also inherit their saved color group.
      </p>
      <p className="mb-2 text-[11px] text-muted-foreground">Color changes are drafts until you choose Save changes. Counts below are mapped tee pads in this layout. Names such as Main are also recognized by their saved color.</p>
      <datalist id="dgd-tee-sets">
        {sets.map((s) => (
          <option key={s.id} value={s.name} />
        ))}
      </datalist>
      <ul className="space-y-1">
        {sets.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${s.name} colour`}
              value={s.color}
              disabled={!loaded}
              onChange={(e) => recolor(s, e.target.value)}
              className="h-7 w-7 rounded border border-input bg-background"
            />
            <span className="flex-1 truncate text-sm">{s.name}</span>
            <span className="text-[10px] text-muted-foreground">{teeInventory(holes,sets).find(row=>row.name.toLowerCase()===s.name.toLowerCase())?.mapped ?? 0} mapped</span>
            <Button size="sm" variant="ghost" disabled={saving || !loaded} className="h-7 w-7 p-0 text-muted-foreground" aria-label={`Remove ${s.name}`} onClick={() => remove(s)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
        {loaded && !sets.length ? <li className="text-xs text-muted-foreground">No tee colours yet. Add the ones this course uses.</li> : null}
      </ul>
      {suggestions.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {suggestions.map((d) => (
            <button
              key={d.name}
              type="button"
              disabled={saving || !loaded}
              onClick={() => add(d.name, d.color)}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted"
            >
              <span className="h-2.5 w-2.5 rounded-full border border-border" style={{ background: d.color }} />+ {d.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-1.5 flex gap-1">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name, e.g. Elite or Short" className="h-7 text-xs" maxLength={40} />
        <Button size="sm" variant="outline" className="h-7" onClick={() => add(newName, "#ffffff")} disabled={!loaded || saving || !newName.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
});

/** Nearest point on a polyline (by vertex, after smoothing) and its index. */
function nearestOnLine(p: Pt, line: Pt[]): number {
  let best = 0;
  let bd = Infinity;
  const k = Math.cos((p[0] * Math.PI) / 180);
  line.forEach((q, i) => {
    const d = (q[0] - p[0]) ** 2 + ((q[1] - p[1]) * k) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** A single bend offset sideways from the middle of a→b; amount is −1…1 of the throw length × 0.35. */
export function curveBend(a: Pt, b: Pt, amount: number): Pt[] {
  if (!amount) return [];
  const k = Math.cos((a[0] * Math.PI) / 180);
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dy = b[0] - a[0];
  const dx = (b[1] - a[1]) * k;
  const s = amount * 0.35;
  return [[mid[0] - dx * s, mid[1] + (dy * s) / k]];
}

export function TeeRoutePicker({
  value,
  tee,
  basket,
  mainTee,
  mainBends,
  bends,
  onChange,
}: {
  value: RouteMode;
  tee: Pt | null;
  basket: Pt | null;
  mainTee: Pt | null;
  mainBends: Pt[];
  bends?: Pt[];
  onChange: (patch: { route_mode?: RouteMode; bends?: Pt[] }) => void;
}) {
  const [curve, setCurve] = useState(0);
  const mergeFor = (): Pt | null => {
    if (!tee || !basket || !mainTee) return null;
    if (value === "joins" && bends?.length) return bends[bends.length - 1];
    const line = smoothLine([mainTee, ...mainBends, basket]);
    const i = nearestOnLine(tee, line);
    return line[Math.min(line.length - 1, i + Math.round((line.length - i) / 3))];
  };
  const build = (mode: RouteMode, c: number): Pt[] => {
    if (!tee || !basket || mode === "same") return [];
    if (mode === "own") return curveBend(tee, basket, c);
    const m = mergeFor();
    return m ? [...curveBend(tee, m, c), m] : [];
  };
  const opts: { v: RouteMode; l: string; hint: string }[] = [
    { v: "same", l: "Same fairway", hint: "A shorter or longer tee on the main line" },
    { v: "joins", l: "Joins fairway", hint: "Its own throw that merges into the main fairway — drag the merge point on the map" },
    { v: "own", l: "Own shot", hint: "A different shot shape all the way to the basket" },
  ];
  return (
    <div className="mt-2 space-y-1.5">
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Fairway for this tee">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            role="radio"
            aria-checked={value === o.v}
            title={o.hint}
            onClick={() => onChange({ route_mode: o.v, bends: build(o.v, curve) })}
            className={`rounded-md border px-1 py-1 text-[11px] leading-tight ${value === o.v ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}
          >
            {o.l}
          </button>
        ))}
      </div>
      {value !== "same" ? (
        <label className="block text-[11px] text-muted-foreground">
          Shot shape — left ↔ right
          <input
            type="range"
            min={-1}
            max={1}
            step={0.1}
            value={curve}
            disabled={!tee}
            onChange={(e) => {
              const c = Number(e.target.value);
              setCurve(c);
              onChange({ bends: build(value, c) });
            }}
            className="w-full"
          />
        </label>
      ) : null}
      {value !== "own" && tee ? (
        <p className="text-[11px] text-muted-foreground">Drag the white diamond on the map to move where this tee's fairway merges.</p>
      ) : null}
      {!tee ? <p className="text-[11px] text-muted-foreground">Place this tee on the map to see its fairway.</p> : null}
    </div>
  );
}

function lenM(a: Pt, b: Pt) {
  const k = Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * 111132, (b[1] - a[1]) * 111320 * k);
}

const mergeIcon = L.divIcon({
  className: "dg-marker",
  html: `<div style="width:16px;height:16px;transform:rotate(45deg);background:#ffffff;border:2px solid #0b1a10;box-shadow:0 1px 3px rgba(0,0,0,.6);cursor:grab"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const splitIcon = L.divIcon({
  className: "dg-marker",
  html: `<div style="width:16px;height:16px;border-radius:999px;background:#a3e635;border:2px solid #0b1a10;box-shadow:0 1px 3px rgba(0,0,0,.6);cursor:grab"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

type ExtraTee = { tempId: string; name?: string; color: string; lat: number | null; lng: number | null; route_mode?: RouteMode; bends?: Pt[]; is_drop_zone?:boolean; pair_paths?:TeePaths; trunk_path?:StoredRoute; basket_ids?:string[]; main_basket_ids?:string[] };

const mergeHotIcon = L.divIcon({
  className: "dg-marker",
  html: `<div style="width:26px;height:26px;border-radius:999px;border:3px solid #facc15;background:rgba(250,204,21,.25);box-shadow:0 0 0 2px #0b1a10"></div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/** Screen distance (px) at which a dragged fairway point offers to merge. */
/**
 * All fairway corridors draw solid into one shared pane whose opacity is set once,
 * so overlapping corridors blend into a single clean shape instead of stacking seams.
 */
export const FAIRWAY_FILL = { stroke: false, fillColor: "#e9e1cc", fillOpacity: 1 } as const;
export function fairwayPane(map: L.Map, active: boolean): string {
  const name = active ? "fairway-active" : "fairway-idle";
  if (!map.getPane(name)) {
    const el = map.createPane(name);
    el.style.zIndex = active ? "402" : "401";
    el.style.opacity = active ? "0.34" : "0.16";
    el.style.pointerEvents = "none";
  }
  return name;
}

const MERGE_PX = 28;

/**
 * One fairway network per hole. Every tee's route runs only up to the node
 * where it merges; downstream of a merge there is exactly one shared fairway
 * (the main line), dotted in every colour that uses it. Extra baskets split
 * off that shared line at their own split node. The main tee's corridor
 * polygon is drawn by the caller; its centre line is drawn here so it never
 * duplicates a shared stretch.
 */
export function TeeRoutes({
  mainTee,
  basket,
  bends,
  mainColor,
  extras,
  extraBaskets = [],
  active,
  onMergeMove,
  onSplitMove,
}: {
  mainTee: Pt;
  basket: Pt;
  bends: Pt[];
  mainColor: string;
  extras: ExtraTee[];
  extraBaskets?: { tempId: string; name?:string; color: string; lat: number | null; lng: number | null; bends?: Pt[]; main_path?:StoredRoute; trunk_path?:StoredRoute; basket_ids?:string[]; main_basket_ids?:string[] }[];
  active: boolean;
  /** Split point dragged: where an extra basket's fairway leaves the shared fairway. */
  onSplitMove?: (tempId: string, pt: Pt) => void;
  /** Fairway point dropped: "joins" merges at the last bend; "own" keeps it side by side to the basket. */
  onMergeMove?: (tempId: string, bends: Pt[], mode: RouteMode) => void;
}) {
  const map = useMap();
  const [hot, setHot] = useState<{ tempId: string; pt: Pt } | null>(null);
  const main = useMemo(() => smoothLine([mainTee, ...bends, basket]), [mainTee, bends, basket]);
  const width = Math.min(24, Math.max(12, lenM(mainTee, basket) * 0.14));
  const op = active ? 0.95 : 0.45;
  const placed = extras.filter((t) => t.lat != null && t.lng != null);
  const pins = extraBaskets.filter((b) => b.lat != null && b.lng != null);

  if(extras.length || extraBaskets.length) return <StudioPairPaths active={active} pane={fairwayPane(map,active)} hole={{tee:mainTee,basket,tee_name:"Main tee",basket_name:"Main basket",tee_color:mainColor,flight_path:bends,extra_tees:extras.map(t=>({...t,name:t.name ?? "Tee"})),extra_baskets:extraBaskets.map(b=>({...b,name:b.name ?? "Basket"}))}} />;

  type Route = { key: string; tempId: string; line: Pt[]; color: string; merge: Pt | null; shape: Pt[]; via?: Route; j: number };
  const routes: Route[] = [];
  for (const t of placed) {
    const tp: Pt = [t.lat!, t.lng!];
    const mode = t.route_mode ?? "same";
    const b = t.bends ?? [];
    if (mode === "own") {
      routes.push({ key: t.tempId, tempId: t.tempId, line: smoothLine([tp, ...b, basket]), color: t.color, merge: null, shape: b, j: -1 });
      continue;
    }
    const shape = mode === "joins" && b.length ? b.slice(0, -1) : [];
    const probe = mode === "joins" && b.length ? b[b.length - 1] : tp;
    const j = nearestOnLine(probe, main);
    routes.push({ key: t.tempId, tempId: t.tempId, line: smoothLine([tp, ...shape, main[j]]), color: t.color, merge: main[j], shape, j });
  }
  // A tee whose merge node sits on another extra tee's own stretch merges there,
  // then rides that tee's route — it is not drawn again to the main line.
  for (const r of routes) {
    const t = placed.find((x) => x.tempId === r.tempId);
    if (!t || t.route_mode !== "joins" || !t.bends?.length) continue;
    const probe = t.bends[t.bends.length - 1];
    if (lenM(probe, main[nearestOnLine(probe, main)]) < 2) continue;
    for (const o of routes) {
      if (o === r || o.line.length < 2 || o.via === r) continue;
      const k = nearestOnLine(probe, o.line);
      if (lenM(probe, o.line[k]) < 2) {
        r.line = smoothLine([[t.lat!, t.lng!], ...r.shape, o.line[k]]);
        r.merge = o.line[k];
        r.via = o;
        break;
      }
    }
  }
  // Each colour joins the shared line at its own node (following "via" chains).
  const joinIndex = (r: Route, depth = 0): number => (r.via && depth < 5 ? joinIndex(r.via, depth + 1) : r.j);
  const sharers = routes.map((r) => ({ color: r.color, j: joinIndex(r) })).filter((x) => x.j >= 0);
  const firstMerge = sharers.length ? Math.min(...sharers.map((s) => s.j)) : main.length - 1;
  // Upstream stretch of another extra tee that a "via" tee rides on — dotted in both colours.
  const viaTails = routes.filter((r) => r.via && r.merge).map((r) => {
    const o = r.via!;
    const k = nearestOnLine(r.merge!, o.line);
    return { key: r.key, line: o.line.slice(k), colors: [o.color, r.color] };
  });

  // Snap targets for a dragged fairway point: other merge nodes and the main bends first, then any line.
  const nodesFor = (self: string): Pt[] => [
    ...bends,
    ...routes.filter((o) => o.tempId !== self && o.merge).map((o) => o.merge!),
    ...pins.map((b) => b.bends?.[0]).filter((x): x is Pt => !!x),
  ];
  const px = (a: Pt, b: Pt) => map.latLngToContainerPoint(a).distanceTo(map.latLngToContainerPoint(b));
  const resolve = (self: string, q: Pt): { node: Pt | null; line: Pt | null } => {
    let node: Pt | null = null;
    for (const n of nodesFor(self)) if (px(q, n) < MERGE_PX && (!node || px(q, n) < px(q, node))) node = n;
    let line: Pt | null = null;
    for (const l of [main, ...routes.filter((o) => o.tempId !== self && o.line.length > 1).map((o) => o.line)]) {
      const c = l[nearestOnLine(q, l)];
      if (px(q, c) < MERGE_PX && (!line || px(q, c) < px(q, line))) line = c;
    }
    return { node, line };
  };

  const dashed = (colors: string[], key: string, line: Pt[]) =>
    colors.map((c, i) => (
      <Polyline
        key={`${key}-${i}`}
        positions={line}
        interactive={false}
        pathOptions={{ color: c, weight: 4, opacity: op, dashArray: `6 ${6 * (colors.length - 1) + 4}`, dashOffset: String(i * 8), lineCap: "butt" }}
      />
    ));

  // Shared segments: between consecutive join nodes the set of colours grows.
  const joins = [...new Set(sharers.map((s) => s.j))].sort((a, b) => a - b);
  const segments = joins.map((j, idx) => {
    const end = idx + 1 < joins.length ? joins[idx + 1] : main.length - 1;
    const cols = [mainColor, ...new Set(sharers.filter((s) => s.j <= j).map((s) => s.color))];
    return { j, line: main.slice(j, end + 1), cols };
  });

  return (
    <>
      {/* Main tee's own stretch — stops at the first merge so nothing runs twice. */}
      <Polyline positions={main.slice(0, firstMerge + 1)} interactive={false} pathOptions={{ color: mainColor || "#ffffff", weight: 3, opacity: op, dashArray: "6 6" }} />
      {segments.map((s) => dashed(s.cols, `seg-${s.j}`, s.line))}
      {viaTails.map((v) => dashed(v.colors, `via-${v.key}`, v.line))}
      {routes.map((r) => (
        <Fragment key={r.key}>
          {r.line.length > 1 ? (
            <Polygon
              positions={fairwayPolygon(r.line, width, 5)}
              interactive={false}
              pane={fairwayPane(map, active)}
              pathOptions={FAIRWAY_FILL}
            />
          ) : null}
          <Polyline positions={r.line} interactive={false} pathOptions={{ color: r.color, weight: 3, opacity: op, dashArray: "6 6" }} />
          {active && onMergeMove ? (
            <Marker
              position={r.merge ?? r.line[Math.floor(r.line.length / 2)]}
              icon={mergeIcon}
              draggable
              bubblingMouseEvents={false}
              zIndexOffset={1500}
              title={r.merge ? "Drag to move where this fairway merges" : "Drag onto another fairway point to merge"}
              eventHandlers={{
                drag: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  const { node, line } = resolve(r.tempId, [ll.lat, ll.lng]);
                  const pt = node ?? line;
                  setHot(pt ? { tempId: r.tempId, pt } : null);
                },
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  const q: Pt = [ll.lat, ll.lng];
                  const { node, line } = resolve(r.tempId, q);
                  setHot(null);
                  const target = node ?? line;
                  if (target) onMergeMove(r.tempId, [...r.shape, target], "joins");
                  else onMergeMove(r.tempId, [...r.shape, q], "own"); // dropped in open ground: side by side
                },
              }}
            />
          ) : null}
        </Fragment>
      ))}
      {hot ? (
        <Marker position={hot.pt} icon={mergeHotIcon} interactive={false} zIndexOffset={1400}>
          <Tooltip permanent direction="top" offset={[0, -14]}>
            Merge fairways
          </Tooltip>
        </Marker>
      ) : null}
      {pins.map((b) => {
        const bp: Pt = [b.lat!, b.lng!];
        const sp = b.bends?.[0];
        const j = sp ? nearestOnLine(sp, main) : Math.max(0, nearestOnLine(bp, main) - 3);
        const line = smoothLine([main[j], bp]);
        return (
          <Fragment key={`pin-${b.tempId}`}>
            <Polygon
              positions={fairwayPolygon(line, width, width)}
              interactive={false}
              pane={fairwayPane(map, active)}
              pathOptions={FAIRWAY_FILL}
            />
            {dashed([mainColor, ...new Set(sharers.filter((s) => s.j <= j).map((s) => s.color))], `pinl-${b.tempId}`, line)}
            {active && onSplitMove ? (
              <Marker
                position={main[j]}
                icon={splitIcon}
                draggable
                bubblingMouseEvents={false}
                zIndexOffset={1500}
                title="Drag to set where this basket's fairway splits off"
                eventHandlers={{
                  dragend: (e) => {
                    const ll = (e.target as L.Marker).getLatLng();
                    onSplitMove(b.tempId, main[nearestOnLine([ll.lat, ll.lng], main)]);
                  },
                }}
              />
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
