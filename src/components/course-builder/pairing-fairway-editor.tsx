import { combineFairwayCrossings } from "@/lib/course-builder/fairway-crossings";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { CourseBasemapLayers } from "@/components/map/course-basemap-layers";
import { type LatLng } from "@/lib/course-builder/geometry";
import { projectToScreenSegment } from "@/lib/map/segment-projection";
import { teeColor } from "@/lib/course-builder/tee-colors";
import {
  type FairwayDraft, type FairwayNetwork, type FairwayPin, syncPairings, pointFor, routePoints, routeDistance,
  fairwayEdges, insertFairwayPoint, moveFairwayPoint, detachFairwayPoint, removeFairwayPoint,
  shareFairwaySection, detachFairwaySection, nearestFairwaySegment, validateFairwayDraft,
} from "@/lib/course-builder/pairing-fairways";

const pointId = () => `point:${crypto.randomUUID()}`;
type Mode = "adjust" | "tee" | "basket" | "link" | "split";
type Selection = { source: string; target: string; nodes: string[]; draft: FairwayDraft };
const icon = (kind: "tee" | "basket" | "point", shared = false, color = "#2563eb") => L.divIcon({
  className: "", iconSize: kind === "point" ? [22, 22] : [32, 32], iconAnchor: kind === "point" ? [11, 11] : [16, 16],
  html: `<div style="width:100%;height:100%;display:grid;place-items:center;border:3px solid white;border-radius:${kind === "tee" ? "5px" : "50%"};background:${kind === "tee" ? teeColor("", color) : kind === "basket" ? "#d97706" : shared ? "#7c3aed" : "#047857"};color:white;box-shadow:0 1px 5px #0009;font:700 15px sans-serif">${kind === "tee" ? "T" : kind === "basket" ? "B" : ""}</div>`,
});
function MapInput({ onDrop }: { onDrop: (p: LatLng) => void }) {
  useMapEvents({ click: e => onDrop([e.latlng.lat, e.latlng.lng]) }); return null;
}
function FitPins({ initial }: { initial: FairwayDraft }) {
  const map = useMap();
  useEffect(() => {
    const points = [...initial.tees, ...initial.baskets].flatMap(p => p.point ? [p.point] : []).concat(Object.values(initial.network.points));
    if (points.length) map.fitBounds(L.latLngBounds(points).pad(.35), { maxZoom: 19 });
  }, [map, initial]); return null;
}

/** One editor for all physical tee/basket pairings. Endpoints remain canonical assets. */
export function PairingFairwayEditor({ initial, center, title, storageKey, onSave, onClose, notice, pathsOnly = false, initialRoute }: {
  initial: FairwayDraft; center: LatLng; title: string; storageKey: string;
  onSave: (draft: FairwayDraft) => Promise<void>; onClose: (saved: boolean) => void; notice?: string; pathsOnly?: boolean; initialRoute?: string;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const [history, setHistory] = useState<FairwayDraft[]>(()=>[combineFairwayCrossings(initial)]);
  const [cursor, setCursor] = useState(0), [saved, setSaved] = useState(JSON.stringify(initial));
  const [didSave, setDidSave] = useState(false), [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Mode>("adjust"), [route, setRoute] = useState(initialRoute && initial.network.routes[initialRoute] ? initialRoute : Object.keys(initial.network.routes)[0] ?? "");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState(""), [recovery, setRecovery] = useState<FairwayDraft | null>(null);
  const current = history[cursor], draft = selection?.draft ?? current;
  const keys = Object.keys(draft.network.routes);
  const active = mode === "link" && selection && selection.nodes.length >= 2 ? selection.target : route;
  const dirty = JSON.stringify(current) !== saved;
  const edges = useMemo(() => fairwayEdges(draft.network), [draft.network]);
  const label = (key: string) => {
    const r = draft.network.routes[key];
    return r ? `${draft.tees.find(t => t.id === r.teeId)?.name} → ${draft.baskets.find(b => b.id === r.basketId)?.name}` : "Choose fairway";
  };
  const routeColor = (key: string) => {
    const tee = draft.tees.find(pin => pin.id === draft.network.routes[key]?.teeId);
    return teeColor(tee?.name ?? "", tee?.color);
  };
  useEffect(() => {
    if (saving) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const stored = JSON.parse(raw);
        // A stale draft must never silently replace server changes.
        if (stored.baseline === JSON.stringify(initial) && validateFairwayDraft(stored.draft).length === 0) setRecovery(stored.draft);
        else setError("A draft from an older course revision is still on this device. It has not replaced the current course.");
      }
    } catch { setError("The saved device draft could not be read. Current course data is unchanged."); }
  }, [initial, storageKey, saving]);
  useEffect(() => {
    if (!dirty) return;
    try { localStorage.setItem(storageKey, JSON.stringify({ baseline: saved, draft: current })); }
    catch { setError("Device draft storage is unavailable. Keep this editor open until you save."); }
  }, [current, dirty, saved, storageKey]);
  useEffect(() => {
    if (!dirty && !selection) return;
    const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, selection]);
  function commit(next: FairwayDraft) {
    const errors = validateFairwayDraft(next); if (errors.length) throw new Error(errors.join(" "));
    setHistory(h => [...h.slice(0, cursor + 1).slice(-100), next]); setCursor(Math.min(cursor + 1, 100));
    setError("");
    if (!next.network.routes[route]) setRoute(Object.keys(next.network.routes)[0] ?? "");
  }
  function attempt(action: () => void) { try { action(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to edit this fairway."); } }
  const networkEdit = (network: FairwayNetwork, combine=true) => commit(combine ? combineFairwayCrossings({ ...current, network }) : { ...current, network });
  function chooseMode(next: Mode) {
    setError(""); setSelection(null); setMode(next);
    if (next === "link" || next === "split") setSelection({ source: route, target: keys.find(k => k !== route) ?? "", nodes: [], draft: current });
  }
  function pickPoint(key: string, node: string, next: FairwayDraft) {
    if (!selection) return;
    const nodes = [...selection.nodes, node];
    if (mode === "split" && nodes.length === 2) {
      const network = detachFairwaySection(next, selection.source, nodes[0], nodes[1], pointId);
      commit({ ...next, network }); setSelection(null); setMode("adjust"); return;
    }
    if (mode === "link" && nodes.length === 4) {
      const network = shareFairwaySection(next.network, selection.source, nodes[0], nodes[1], selection.target, nodes[2], nodes[3]);
      commit(combineFairwayCrossings({ ...next, network })); setSelection(null); setMode("adjust"); return;
    }
    const previous = nodes.length === 2 ? nodes[0] : nodes.length === 4 ? nodes[2] : null;
    if (previous && next.network.routes[key].nodes.indexOf(node) <= next.network.routes[key].nodes.indexOf(previous)) throw new Error("Choose the end farther along toward the basket.");
    if (mode === "link" && !next.network.points[node]) throw new Error("Choose a point on the fairway, just beyond the tee pad or before the basket.");
    setSelection({ ...selection, nodes, draft: next });
  }
  function onLine(key: string, p: LatLng, edgeA: string, edgeB: string) {
    if (saving || !["adjust", "link", "split"].includes(mode)) return;
    if (key !== active) { if (mode === "adjust") setRoute(key); return; }
    attempt(() => {
      const nodes = draft.network.routes[key].nodes;
      const edge = nodes.findIndex((node, i) => (node === edgeA && nodes[i + 1] === edgeB) || (node === edgeB && nodes[i + 1] === edgeA));
      const map = mapRef.current;
      const projected = map && projectToScreenSegment(map.latLngToContainerPoint(p), map.latLngToContainerPoint(pointFor(draft, edgeA)), map.latLngToContainerPoint(pointFor(draft, edgeB)));
      const latlng = projected && map!.containerPointToLatLng(L.point(projected.x, projected.y));
      // Use the clicked edge identity, even where another fairway crosses it.
      const nearest = latlng ? { edge, point: [latlng.lat, latlng.lng] as LatLng } : nearestFairwaySegment(routePoints(draft, key), p), id = pointId();
      const network = insertFairwayPoint(draft.network, key, nearest.edge, nearest.point, id);
      if (selection) pickPoint(key, id, { ...draft, network }); else networkEdit(network);
    });
  }
  function drop(p: LatLng) {
    if (saving || (mode !== "tee" && mode !== "basket")) return;
    const group = mode === "tee" ? "tees" : "baskets";
    const unplaced = current[group].find(pin => !pin.point);
    const pin: FairwayPin = { id: crypto.randomUUID(), name: `${mode === "tee" ? "Tee" : "Basket"} ${current[group].length + 1}`, point: p };
    const next = { ...current, [group]: unplaced ? current[group].map(pin => pin.id === unplaced.id ? { ...pin, point: p } : pin) : [...current[group], pin] };
    next.network = syncPairings(next.network, next.tees, next.baskets); attempt(() => commit(next));
  }
  function movePin(group: "tees" | "baskets", id: string, patch: Partial<FairwayPin>) {
    const next = { ...current, [group]: current[group].map(pin => pin.id === id ? { ...pin, ...patch } : pin) };
    next.network = syncPairings(next.network, next.tees, next.baskets); attempt(() => commit(next));
  }
  const guidance = mode === "tee" ? "Click the map to drop tee pads. Each gets a fairway to every basket."
    : mode === "basket" ? "Click the map to drop baskets. Each gets a fairway from every tee pad."
    : mode === "link" ? ["On this fairway, click where sharing starts.", "Click where sharing ends, toward the basket.", "On the other fairway, click the start of the section to share.", "Click the end of the shared section, toward the basket."][selection?.nodes.length ?? 0]
    : mode === "split" ? (selection?.nodes.length ? "Click where this fairway rejoins. Then drag its independent points." : "Click where this fairway leaves the shared section.")
    : "Select a fairway. Click its line to add points; drag points to shape it. Crossings combine automatically; purple points are shared junctions.";
  return <div className="fixed inset-0 z-[1100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Tee pads, baskets and fairways">
    <header className="flex flex-wrap items-center gap-2 border-b p-3">
      <div className="mr-auto"><h2 className="font-semibold">Tee pads, baskets & fairways · {title}</h2><p className="text-xs text-muted-foreground" aria-live="polite">{draft.tees.filter(p => p.point).length} tee pads · {draft.baskets.filter(p => p.point).length} baskets · {keys.length} fairways{dirty ? " · Unsaved changes" : ""}</p></div>
      <Button size="sm" variant="outline" disabled={saving || !!selection || cursor === 0} onClick={() => { setCursor(cursor - 1); setRoute(Object.keys(history[cursor - 1].network.routes)[0] ?? ""); }}>Undo</Button>
      <Button size="sm" variant="outline" disabled={saving || !!selection || cursor === history.length - 1} onClick={() => { setCursor(cursor + 1); setRoute(Object.keys(history[cursor + 1].network.routes)[0] ?? ""); }}>Redo</Button>
      <Button size="sm" disabled={saving || !!selection || !dirty} onClick={async () => {
        setSaving(true); setError("");
        try { await onSave(current); setSaved(JSON.stringify(current)); setDidSave(true); localStorage.removeItem(storageKey); }
        catch (e) { setError(e instanceof Error ? e.message : "Save failed. Your draft is still here."); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : pathsOnly ? "Apply paths to Studio" : "Save fairways"}</Button>
      <Button size="sm" variant="ghost" disabled={saving} onClick={() => {
        if ((dirty || selection) && !window.confirm("Close with unsaved changes? Completed edits remain in your device draft. An unfinished link or split will be cancelled.")) return;
        onClose(didSave);
      }}>Back to Studio</Button>
    </header>
    {notice && <p className="border-b bg-muted px-3 py-2 text-sm">{notice}</p>}
    {error && <p role="alert" className="border-b bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
    {recovery && <div className="flex items-center gap-2 border-b p-2 text-sm">An unsaved fairway draft is available.<Button size="sm" onClick={() => { attempt(() => commit(recovery)); setRecovery(null); }}>Restore draft</Button><Button size="sm" variant="ghost" onClick={() => { localStorage.removeItem(storageKey); setRecovery(null); }}>Dismiss draft</Button></div>}
    <div className="flex flex-wrap items-center gap-2 border-b p-2">
      {([['basket', 'Drop baskets'], ['tee', 'Drop tee pads'], ['adjust', 'Adjust fairways'], ['link', 'Link section'], ['split', 'Split section']] as const).filter(([value]) => !pathsOnly || (value !== "tee" && value !== "basket")).map(([value, text]) => <Button key={value} size="sm" variant={mode === value ? "default" : "outline"} disabled={saving || (value === "link" && keys.length < 2) || (value === "split" && !active)} onClick={() => chooseMode(value)}>{text}</Button>)}
      <label className="flex min-w-0 items-center gap-2 text-sm">Fairway<select aria-label="Fairway" className="min-w-0 max-w-64 rounded border bg-background p-2" disabled={!!selection || saving || !keys.length} value={route} onChange={e => setRoute(e.target.value)}>{!keys.length && <option value="">Drop tees and baskets</option>}{keys.map(key => <option key={key} value={key}>{label(key)} · {routeDistance(draft, key)} ft</option>)}</select></label>
      {mode === "link" && selection && <label className="flex min-w-0 items-center gap-2 text-sm">Share with<select aria-label="Share with" className="min-w-0 max-w-64 rounded border bg-background p-2" disabled={selection.nodes.length > 2} value={selection.target} onChange={e => setSelection({ ...selection, target: e.target.value })}>{keys.filter(k => k !== route).map(k => <option key={k} value={k}>{label(k)}</option>)}</select></label>}
      {selection && <Button size="sm" variant="ghost" onClick={() => chooseMode("adjust")}>Cancel selection</Button>}
    </div>
    <p className="border-b px-3 py-2 text-sm" role="status">{guidance}</p>
    <div className="relative min-h-0 flex-1">
      <MapContainer ref={mapRef} center={center} zoom={18} maxZoom={22} className="h-full w-full" doubleClickZoom={false}>
        <CourseBasemapLayers /><FitPins initial={initial} /><MapInput onDrop={drop} />
        {edges.sort((a, b) => Number(a.routes.includes(active)) - Number(b.routes.includes(active))).map(edge => {
          const selected = edge.routes.includes(active), key = selected ? active : edge.routes[0];
          const colors = [...new Set(edge.routes.map(routeColor))];
          const positions = [pointFor(draft, edge.a), pointFor(draft, edge.b)];
          return <Fragment key={`${edge.a}|${edge.b}`}><Polyline positions={positions} bubblingMouseEvents={false}
            pathOptions={{ color: routeColor(key), weight: selected ? 7 : 4, opacity: selected ? 1 : .65 }}
            eventHandlers={{ click: e => onLine(key, [e.latlng.lat, e.latlng.lng], edge.a, edge.b) }}><Tooltip sticky>{edge.routes.length > 1 ? `Shared by ${edge.routes.length} fairways` : label(key)}</Tooltip></Polyline>
            {colors.length > 1 && colors.map((color, index) => <Polyline key={color} positions={positions} interactive={false}
              pathOptions={{ color, weight: selected ? 5 : 3, opacity: selected ? 1 : .65, dashArray: `6 ${8 * colors.length - 6}`, dashOffset: String(index * 8), lineCap: "butt" }} />)}</Fragment>;
        })}
        {(["tees", "baskets"] as const).flatMap(group => draft[group].filter(pin => pin.point).map(pin => <Marker key={pin.id} position={pin.point!} icon={icon(group === "tees" ? "tee" : "basket", false, teeColor(pin.name, pin.color))} draggable={!pathsOnly && !selection && !saving && mode === "adjust"} bubblingMouseEvents={false} eventHandlers={{
          dragend: e => { const p = (e.target as L.Marker).getLatLng(); movePin(group, pin.id, { point: [p.lat, p.lng] }); },
          click: () => { if (selection && mode === "split") attempt(() => pickPoint(active, `${group === "tees" ? "tee" : "basket"}:${pin.id}`, draft)); },
        }}><Tooltip direction="top" offset={[0, -15]} permanent>{pin.name}</Tooltip>{!selection && !pathsOnly && <Popup><label className="block text-sm">{group === "tees" ? "Tee pad" : "Basket"} name<input aria-label={`${pin.name} name`} className="mt-1 block w-40 rounded border p-2" defaultValue={pin.name} key={pin.name} maxLength={80} onBlur={e => { const name = e.target.value.trim(); if (name && name !== pin.name) movePin(group, pin.id, { name }); }} /></label><p className="mt-2 text-xs">Drag in Adjust fairways to move this starting point or destination.</p></Popup>}</Marker>))}
        {(draft.network.routes[active]?.nodes ?? []).filter(id => draft.network.points[id]).map((id, index) => {
          const count = Object.values(draft.network.routes).filter(r => r.nodes.includes(id)).length;
          return <Marker key={id} title="Drag fairway point" position={pointFor(draft, id)} icon={icon("point", count > 1)} draggable={!selection && !saving && mode === "adjust"} bubblingMouseEvents={false} eventHandlers={{
            dragend: e => { const p = (e.target as L.Marker).getLatLng(); attempt(() => networkEdit(moveFairwayPoint(current.network, id, [p.lat, p.lng]))); },
            click: () => { if (selection) attempt(() => pickPoint(active, id, draft)); },
          }}><Tooltip>Point {index + 1}{count > 1 ? ` · shared by ${count} fairways` : " · independent"}</Tooltip>{!selection && <Popup><div className="space-y-2 text-sm"><p>{count > 1 ? `Moving this point updates ${count} fairways.` : "This point belongs to the selected fairway."}</p>{count > 1 && <Button size="sm" variant="outline" onClick={() => attempt(() => networkEdit(detachFairwayPoint(current.network, active, id, pointId()), false))}>Make independent</Button>}<Button size="sm" variant="outline" onClick={() => attempt(() => networkEdit(removeFairwayPoint(current.network, active, id)))}>Remove from this fairway</Button></div></Popup>}</Marker>;
        })}
      </MapContainer>
    </div>
  </div>;
}
