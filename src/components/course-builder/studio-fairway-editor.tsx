import { PairScoreFields } from "./pair-score-fields";
import { pairSummary, formatPairScore } from "@/lib/course-builder/pair-scoring";
import type { PairScoring } from "@/lib/course-builder/studio-fairways";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Marker, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { studioFairways, type StudioHole } from "@/lib/course-builder/studio-fairways";
import { distanceFt, type LatLng } from "@/lib/course-builder/geometry";
import {createFairwayGeometry} from "@/lib/course-builder/fairway-curves";
import {automaticBendPoints,connectNewFairways,nearbyFairway,snapFairwayBend} from "@/lib/course-builder/automatic-fairways";
import { fairwayPolygon } from "@/lib/course-builder/fairway";
import { teeColor } from "@/lib/course-builder/tee-colors";
import {
  nearestFairwaySegment,
  type FairwayDraft,
  type FairwayNetwork,
  fairwayEdges,
  pointFor,
  insertFairwayPoint,
  moveFairwayPoint,
  detachFairwayPoint,
  removeFairwayPoint,
  joinFairwayPoint,
  shareFairwaySection,
  detachFairwaySection,
  separateFairway,
  straightenFairway,
  validateFairwayDraft,
  joinFairwayApproach,
} from "@/lib/course-builder/pairing-fairways";

const uid = () => `point:${crypto.randomUUID()}`;
type Mode = "adjust" | "draw" | "join" | "link" | "split" | "approach";
export type EndpointPreview = { group: "tees" | "baskets"; id: string; point: LatLng };
const handles = new Map<string, L.DivIcon>();
const handle = (shared: boolean, picked: boolean) => {
  const key = `${shared}:${picked}`;
  if (!handles.has(key))
    handles.set(
      key,
      L.divIcon({
        className: "",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border:3px solid white;border-radius:50%;background:${picked ? "#f59e0b" : shared ? "#7c3aed" : "#047857"};box-shadow:0 1px 5px #0009"></div>`,
      }),
    );
  // Replacing an icon during a drag recreates Leaflet's draggable and loses dragend.
  return handles.get(key)!;
};

/** A layer and a compact inspector in the EXISTING course map. No second map,
 * draft store, save flow, or endpoint inventory. Commits use Studio's undo/save. */
export function StudioFairwayEditor({
  hole,
  active,
  editable,
  selectedRoute,
  onSelect,
  onChange,
  endpointPreview,
  onScoringChange,
}: {
  hole: StudioHole;
  onScoringChange?: (tee:string,basket:string,patch:Partial<PairScoring>)=>void;
  active: boolean;
  editable: boolean;
  selectedRoute: string | null;
  onSelect: (route: string | null) => void;
  onChange: (draft: FairwayDraft) => void;
  endpointPreview?: EndpointPreview | null;
}) {
  const map = useMap(),
    panel = useRef<HTMLDivElement>(null);
  const data = useMemo(() => {
    try {
      return { draft: studioFairways(hole), error: "" };
    } catch (error) {
      return { draft: null, error: (error as Error).message };
    }
  }, [hole]);
  const [work, setWork] = useState<{ base: FairwayDraft; draft: FairwayDraft } | null>(null);
  const [mode, setMode] = useState<Mode>("adjust"),
    [picked, setPicked] = useState<string[]>([]),
    [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [autoSnap,setAutoSnap]=useState(true);
  const [snapRadius,setSnapRadius]=useState(6);
  const [snapHint,setSnapHint]=useState<LatLng|null>(null);
  const [dragging, setDragging] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const base = data.draft;
  const stored = work?.base === base ? work.draft : base;
  const draft =
    stored && endpointPreview
      ? {
          ...stored,
          [endpointPreview.group]: stored[endpointPreview.group].map((p) =>
            p.id === endpointPreview.id ? { ...p, point: endpointPreview.point } : p,
          ),
        }
      : stored;
  const route =
    draft && selectedRoute && draft.network.routes[selectedRoute] ? selectedRoute : null;
  const geometry = useMemo(() => draft ? createFairwayGeometry(draft) : null, [draft]);
  const summaries = useMemo(() => draft && geometry
    ? Object.fromEntries(Object.keys(draft.network.routes).map(key => [key, pairSummary(hole,draft,key,geometry)]))
    : {}, [hole, draft, geometry]);
  const scoreLabel = (key: string) => formatPairScore(summaries[key], !!draft?.network.routes[key].startBasketId);
  const isOpen = active && editable && !!route;
  useEffect(() => {
    setWork(null);
    setMode("adjust");
    setPicked([]);
    setError("");
    setDragging(false);
  }, [base, selectedRoute, editable]);
  useEffect(() => {
    if (!panel.current) return;
    L.DomEvent.disableClickPropagation(panel.current);
    L.DomEvent.disableScrollPropagation(panel.current);
  }, [isOpen]);
  const attempt = (action: () => void) => {
    try {
      action();
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const preview = (next: FairwayDraft) => {
    if (base) setWork({ base, draft: next });
  };
  function commit(network: FairwayNetwork) {
    if (!base) return;
    const next = { ...base, network },
      errors = validateFairwayDraft(next);
    if (errors.length) throw new Error(errors.join(" "));
    const shaped=automaticBendPoints(next);
    onChange(mode==="draw"&&autoSnap&&route?connectNewFairways(shaped,new Set([route])):shaped);
    setWork(null);
    setMode("adjust");
    setPicked([]);
  }
  function choose(next: Mode) {
    setWork(null);
    setPicked([]);
    setError("");
    setMode(next);
    setTarget(Object.keys(base?.network.routes ?? {}).find((k) => k !== route) ?? "");
    if (next === "draw" && base && route)
      preview({ ...base, network: straightenFairway(base.network, route) });
  }
  const expected = mode === "link" && picked.length >= 2 ? target : route;
  function pick(key: string, id: string, next: FairwayDraft) {
    if (!route) return;
    if (mode === "join") {
      if (!picked.length) {
        if (key !== route) throw new Error("First choose a bend on the selected fairway.");
        setPicked([id]);
        preview(next);
      } else {
        if (key === route) throw new Error("Now choose a point on a different fairway.");
        commit(joinFairwayPoint(next.network, route, picked[0], id));
      }
      return;
    }
    if (key !== expected) throw new Error("Choose points on the highlighted fairway.");
    const nodes = [...picked, id];
    if (
      nodes.length % 2 === 0 &&
      next.network.routes[key].nodes.indexOf(id) <=
        next.network.routes[key].nodes.indexOf(nodes.at(-2)!)
    )
      throw new Error("Choose the end farther toward the basket.");
    if (mode === "split" && nodes.length === 2) {
      commit(detachFairwaySection(next, route, nodes[0], nodes[1], uid));
      return;
    }
    if (mode === "link" && nodes.length === 4) {
      commit(
        shareFairwaySection(next.network, route, nodes[0], nodes[1], target, nodes[2], nodes[3]),
      );
      return;
    }
    setPicked(nodes);
    preview(next);
  }
  function lineClick(key: string, a: string, b: string, p: LatLng) {
    if (!active || !editable || !draft || mode === "draw" || dragging) return;
    if (!route || (mode === "adjust" && key !== route)) {
      onSelect(key);
      return;
    }
    attempt(() => {
      if (mode !== "adjust" && mode !== "join" && mode !== "approach" && key !== expected)
        throw new Error("Choose the highlighted fairway, or change Share with.");
      const nodes = draft.network.routes[key].nodes;
      const edge = nodes.findIndex(
        (n, i) => (n === a && nodes[i + 1] === b) || (n === b && nodes[i + 1] === a),
      );
      const point=nearestFairwaySegment(geometry!.edge(a,b),p).point;
      const ll={lat:point[0],lng:point[1]},id=uid();
      if(mode === "approach") {
        commit(joinFairwayApproach(draft,route,key,edge,[ll.lat,ll.lng],id));
        return;
      }
      const next = {
        ...draft,
        network: insertFairwayPoint(draft.network, key, edge, [ll.lat, ll.lng], id),
      };
      if (mode === "adjust") commit(next.network);
      else pick(key, id, next);
    });
  }
  useMapEvents({
    click: (e) => {
      if (!isOpen || mode !== "draw" || !draft || !route) return;
      attempt(() =>
        preview({
          ...draft,
          network: insertFairwayPoint(
            draft.network,
            route,
            draft.network.routes[route].nodes.length - 2,
            [e.latlng.lat, e.latlng.lng],
            uid(),
          ),
        }),
      );
    },
  });
  if (!draft)
    return active
      ? createPortal(
          <div
            className="absolute bottom-24 right-3 z-[650] max-w-sm rounded-lg bg-background p-3 text-sm text-destructive"
            role="alert"
          >
            {data.error}
          </div>,
          map.getContainer().parentElement ?? map.getContainer(),
        )
      : null;
  const keys = Object.keys(draft.network.routes);
  const label = (key: string) => {
    const r = draft.network.routes[key];
    const start = r.startBasketId ? `Basket ${draft.baskets.find(b=>b.id===r.startBasketId)?.name}` : draft.tees.find((t) => t.id === r.teeId)?.name;
    return `${start} → ${draft.baskets.find((b) => b.id === r.basketId)?.name}`;
  };
  const color = (key: string) => {
    if(draft.network.routes[key].startBasketId) return "#a855f7";
    const t = draft.tees.find((t) => t.id === draft.network.routes[key].teeId);
    return teeColor(t?.name ?? "", t?.color);
  };
  const edges = fairwayEdges(draft.network).sort(
    (a, b) => Number(a.routes.includes(expected ?? "")) - Number(b.routes.includes(expected ?? "")),
  );
  const visibleKeys =
    !isOpen || mode === "draw" || mode === "approach"
      ? []
      : mode === "join" && picked.length
        ? keys
        : mode === "link"
          ? [route!, target].filter(Boolean)
          : [route!];
  const points = [
    ...new Set(
      visibleKeys.flatMap(
        (key) => draft.network.routes[key]?.nodes.filter((id) => draft.network.points[id]) ?? [],
      ),
    ),
  ];
  const activeNodes = route ? draft.network.routes[route].nodes : [];
  const guidance =
    mode === "approach" ? "Click another fairway to this basket where you want to join. This route will follow its remaining bends. Drag the shared junction to adjust it; Undo restores the previous path." : mode === "draw"
      ? "Click the ground to trace the route from tee pad toward basket. Finish drawing keeps the new path; Cancel restores the previous path."
      : mode === "join"
        ? !picked.length
          ? "Choose a bend (or click a segment) on this fairway."
          : "Choose a point or segment on another fairway. Only the chosen bend moves to that junction."
        : mode === "link"
          ? [
              "Choose where this fairway starts sharing.",
              "Choose where this fairway stops sharing, toward the basket.",
              "On Share with, choose the start of the shared section.",
              "On Share with, choose the end of the shared section.",
            ][picked.length]
          : mode === "split"
            ? !picked.length
              ? "Choose where this route leaves the shared section."
              : "Choose where it rejoins. Then drag the independent bends away."
            : "Click this route to add bends. Drag green points to shape it; purple points move every route sharing them. Nearby bends snap into shared junctions on release. Turn off Auto-join to keep a branch separate.";
  return (
    <>
      {edges.map((edge) => {
        const selected = edge.routes.includes(expected ?? ""),
          key = mode === "approach" ? (edge.routes.find(k=>k!==route && draft.network.routes[k].basketId===draft.network.routes[route!]?.basketId) ?? edge.routes[0]) : selected ? expected! : edge.routes[0];
        const positions = geometry!.edge(edge.a,edge.b);
        const colors = [...new Set(edge.routes.map(color))];
        return (
          <Fragment key={`${edge.a}|${edge.b}`}>
            <Polygon
              positions={fairwayPolygon(positions, 8, 8)}
              interactive={false}
              pathOptions={{
                stroke: false,
                fillColor: "#a8c98b",
                fillOpacity: active ? 0.18 : 0.06,
              }}
            />
            <Polyline
              key={active && editable ? "select" : "display"}
              positions={positions}
              bubblingMouseEvents={false}
              interactive={active && editable}
              pathOptions={{
                color: color(key),
                weight: selected ? 6 : 3,
                lineCap:"round",lineJoin:"round",
                opacity: active ? (selected ? 1 : 0.55) : 0.25,
              }}
              eventHandlers={{
                click: (e) => lineClick(key, edge.a, edge.b, [e.latlng.lat, e.latlng.lng]),
              }}
            >
              <Tooltip sticky>
                {edge.routes.map((k) => `${label(k)} · ${scoreLabel(k)}`).join(" / ")}
                {edge.routes.length > 1 ? " · shared section" : ""}
              </Tooltip>
            </Polyline>
            {colors.length > 1 &&
              colors.map((c, i) => (
                <Polyline
                  key={c}
                  positions={positions}
                  interactive={false}
                  pathOptions={{
                    color: c,
                    weight: selected ? 4 : 2,
                    dashArray: `6 ${8 * colors.length - 6}`,
                    dashOffset: String(i * 8),
                    lineCap: "round",lineJoin:"round",
                  }}
                />
              ))}
          </Fragment>
        );
      })}
      {snapHint && <Marker position={snapHint} icon={handle(true,true)} interactive={false} zIndexOffset={1600}><Tooltip permanent>Release to join fairways</Tooltip></Marker>}
      {points.map((id) => {
        const routes = keys.filter((k) => draft.network.routes[k].nodes.includes(id));
        const key = routes.includes(expected ?? "") ? expected! : routes[0];
        const count = routes.length;
        return (
          <Marker
            key={id}
            title="Drag fairway bend"
            position={pointFor(draft, id)}
            icon={handle(count > 1, picked.includes(id))}
            zIndexOffset={1500}
            draggable={mode === "adjust"}
            bubblingMouseEvents={false}
            eventHandlers={{
              dragstart: () => {
                setDragging(true);
                map.closePopup();
              },
              drag: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                const next={ ...draft, network: moveFairwayPoint(draft.network, id, [p.lat, p.lng]) };
                preview(next);
                setSnapHint(autoSnap ? nearbyFairway(next,key,id,snapRadius)?.point ?? null : null);
              },
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                setDragging(false);
                setSnapHint(null);
                attempt(() => {
                  const next={...draft,network:moveFairwayPoint(draft.network,id,[p.lat,p.lng])};
                  commit((autoSnap && !((e as {originalEvent?:MouseEvent}).originalEvent)?.altKey ? snapFairwayBend(next,key,id,uid,snapRadius) : next).network);
                });
              },
              click: () => {
                if (mode !== "adjust") attempt(() => pick(key, id, draft));
              },
            }}
          >
            <Tooltip>
              {" "}
              {count > 1 ? `Shared junction · ${count} routes` : "Independent bend"}
            </Tooltip>
            {mode === "adjust" && route && (
              <Popup>
                <div className="space-y-2 text-xs">
                  <p>
                    {count > 1
                      ? `Dragging updates ${count} routes. Detach to move only ${label(route)}.`
                      : `Bend on ${label(route)}.`}
                  </p>
                  {count > 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        attempt(() => commit(detachFairwayPoint(draft.network, route, id, uid())))
                      }
                    >
                      Detach this bend
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      choose("join");
                      setPicked([id]);
                      preview(draft);
                      map.closePopup();
                    }}
                  >
                    Join this bend
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      attempt(() => commit(removeFairwayPoint(draft.network, route, id)))
                    }
                  >
                    Remove bend
                  </Button>
                </div>
              </Popup>
            )}
          </Marker>
        );
      })}
      {isOpen &&
        route &&
        createPortal(
          <div
            ref={panel}
            data-testid="inline-fairway-inspector"
            className="absolute bottom-24 right-2 z-[650] max-h-[40%] w-[min(22rem,calc(100%-1rem))] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 shadow-xl backdrop-blur md:bottom-auto md:top-28 md:max-h-[calc(100%-12rem)]"
          >
            <div className="flex items-center justify-between gap-2">
              <strong className="text-sm">Fairway · {label(route)}</strong>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Close fairway controls"
                disabled={mode !== "adjust" || dragging}
                onClick={() => onSelect(null)}
              >
                ×
              </Button>
            </div>
            <Button
              className="w-full md:hidden"
              size="sm"
              variant="outline"
              aria-expanded={!compact}
              onClick={() => setCompact(!compact)}
            >
              {compact
                ? `${summaries[route].distance} ft · ${summaries[route].par == null ? "Set par" : `Par ${summaries[route].par}`} · Show fairway tools`
                : "Hide tools to see the map"}
            </Button>
            {compact && mode !== "adjust" && (
              <div className="space-y-1 pt-2 md:hidden">
                <p className="text-xs">{guidance}</p>
                {mode === "draw" && (
                  <Button size="sm" onClick={() => attempt(() => commit(draft.network))}>
                    Finish drawing
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => choose("adjust")}>
                  Cancel
                </Button>
              </div>
            )}
            <div className={compact ? "hidden md:block" : ""}>
              <label className="mt-2 block text-xs">
                Starting point → basket
                <select
                  aria-label="Fairway"
                  className="mt-1 w-full rounded-md border bg-background p-2"
                  value={route}
                  disabled={mode !== "adjust" || dragging}
                  onChange={(e) => onSelect(e.target.value)}
                >
                  {keys.map((key) => (
                    <option key={key} value={key}>
                      {label(key)} · {scoreLabel(key)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="my-2 flex items-baseline justify-between">
                <strong data-testid="fairway-distance" className="text-xl tabular-nums">
                  {summaries[route].distance} ft
                </strong>
                <span className="text-xs text-muted-foreground">
                  {activeNodes.length - 2} bends ·{" "}
                  {Math.round(
                    distanceFt(
                      pointFor(draft, activeNodes[0]),
                      pointFor(draft, activeNodes.at(-1)!),
                    ),
                  )}{" "}
                  ft direct
                </span>
              </div>
              {onScoringChange && !draft.network.routes[route].startBasketId && <div className="my-3 rounded border p-2">
                <PairScoreFields label={label(route)} score={summaries[route]} mappedDistance={summaries[route].mappedDistance} main={draft.network.routes[route].teeId==="main-tee"&&draft.network.routes[route].basketId==="main-basket"} onChange={patch=>onScoringChange(draft.network.routes[route].teeId,draft.network.routes[route].basketId,patch)}/>
              </div>}
              <p className="text-[11px] text-muted-foreground">
                Rounded fairways · automatic bend handles. Distance follows the visible curve and updates as you drag. Changes use the course
                builder’s Undo and Save changes.
              </p>
              <div className="my-2 flex items-center gap-2 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={autoSnap} onChange={e=>setAutoSnap(e.target.checked)}/>Auto-join nearby fairways</label>
                <select aria-label="Fairway snap distance" value={snapRadius} onChange={e=>setSnapRadius(Number(e.target.value))} className="rounded border bg-background p-1">{[3,6,10,20].map(n=><option key={n} value={n}>{n} ft</option>)}</select>
              </div>
              <div className="my-2 grid grid-cols-2 gap-1">
                {(
                  [
                    ["approach", "Join approach"],
                    ["draw", "Redraw route"],
                    ["join", "Join point"],
                    ["link", "Share section"],
                    ["split", "Split section"],
                  ] as const
                ).map(([value, text]) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={mode === value ? "default" : "outline"}
                    disabled={
                      dragging ||
                      (mode !== "adjust" && mode !== value) ||
                      ((value === "join" || value === "link") && keys.length < 2) ||
                      (value === "approach" && !keys.some(k=>k!==route && draft.network.routes[k].basketId===draft.network.routes[route].basketId))
                    }
                    onClick={() => choose(value)}
                  >
                    {text}
                  </Button>
                ))}
              </div>
              {mode === "link" && (
                <label className="block text-xs">
                  Share with
                  <select
                    aria-label="Share with"
                    className="my-1 w-full rounded-md border bg-background p-2"
                    value={target}
                    disabled={picked.length > 2}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {keys
                      .filter((k) => k !== route)
                      .map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p role="status" className="rounded-md bg-muted p-2 text-xs">
                {guidance}
              </p>
              {error && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {error}
                </p>
              )}
              {mode !== "adjust" ? (
                <div className="mt-2 flex gap-2">
                  {mode === "draw" && (
                    <Button size="sm" onClick={() => attempt(() => commit(draft.network))}>
                      Finish drawing
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => choose("adjust")}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer py-1">Repair this route</summary>
                  <div className="flex flex-wrap gap-1 py-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        attempt(() => commit(separateFairway(draft.network, route, uid)))
                      }
                    >
                      Separate whole route
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => attempt(() => commit(straightenFairway(draft.network, route)))}
                    >
                      Reset to straight
                    </Button>
                  </div>
                  <p className="text-muted-foreground">
                    Separate keeps its shape. Reset creates a straight line with fresh bend handles. Other routes keep
                    their geometry. Use Undo to restore.
                  </p>
                </details>
              )}
            </div>
          </div>,
          map.getContainer().parentElement ?? map.getContainer(),
        )}
    </>
  );
}
