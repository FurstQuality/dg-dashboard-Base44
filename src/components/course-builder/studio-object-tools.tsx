import { useState, type Dispatch, type SetStateAction, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { CourseTeeSets, type CourseTeeSetsHandle, type TeeSet } from "./tee-sets";
import { StudioItemsPanel, type StudioItem } from "./studio-items-panel";
import { StudioEndpointEditor, type EndpointPatch } from "./studio-endpoint-editor";
import { FEATURE_CONFIG, type CourseFeatureType } from "@/components/leaflet-icon-fix";
import { connectStudioBaskets, type StudioHole, type StudioPad } from "@/lib/course-builder/studio-fairways";

import {teeInventory} from "@/lib/course-builder/tee-inventory";
import { endpointRole, endpointRoleLabel, endpointName, isGenericTeeName, type EndpointIdentity } from "@/lib/course-builder/endpoint-identity";
import { StudioEndpointPlacement } from "./studio-endpoint-placement";

type Hole = StudioHole & {
  number: number;
  basket_color: string;
  tee_bearing?: number | null;
  extra_tees: (StudioPad & { bearing?: number | null })[];
};
type Feature = {
  tempId: string;
  type: CourseFeatureType;
  label: string;
  hole_numbers: number[] | null;
  points: [number, number][];
};
export function StudioObjectTools<T extends Hole>({
  courseId,
  holes,
  setHoles,
  features,
  activeHole,
  selectedPin,
  selectionSerial,
  onSelectPin,
  onSelectFeature,
  onClear,
  onLocate,
  onAssign,
  onEditFairway,
  onAdd,
  fairwayActive,
  paletteRef,
  paletteDraft,
  onPaletteChange,
  placement,
  finish,
  cancel,
  points,
  boundaryLocked,
  onToggleBoundary,
  attachToHole,
  onAttachToHole,
  scope,
  onScopeChange,
  onRemovePin,
}: {
  courseId?: string;
  onRemovePin?: (id:string)=>void;
  holes: T[];
  setHoles: Dispatch<SetStateAction<T[]>>;
  features: Feature[];
  activeHole: number;
  selectedPin: { id: string; serial: number } | null;
  selectionSerial: number;
  onSelectPin: (hole: number, kind: "tee" | "basket", id: string) => void;
  onSelectFeature: (id: string) => void;
  onClear: () => void;
  onLocate: (point: [number, number] | null, kind: "tee" | "basket", id: string) => void;
  onAssign: (hole: T, tee: string, ids: string[]) => void;
  onEditFairway: (hole: T, route: string) => void;
  onAdd: (kind: "tee" | "basket" | "ob-ref" | CourseFeatureType,identity?:EndpointIdentity) => void;
  fairwayActive: boolean;
  paletteRef: RefObject<CourseTeeSetsHandle | null>;
  paletteDraft: TeeSet[] | null;
  onPaletteChange: (sets: TeeSet[]) => void;
  placement: string | null;
  finish: () => void;
  cancel: () => void;
  points: number;
  boundaryLocked: boolean;
  onToggleBoundary: () => void;
  attachToHole: boolean;
  onAttachToHole: (value:boolean) => void;
  scope: "course" | "hole";
  onScopeChange: (scope: "course" | "hole") => void;
}) {
  const [sets, setSets] = useState<TeeSet[]>([]);
  const [colorStatus,setColorStatus] = useState({saving:false,error:""});
  const matchesColor=(pad:{name:string;color:string},name:string,previousColor?:string)=>pad.name.trim().toLowerCase()===name.trim().toLowerCase() || (!!previousColor && isGenericTeeName(pad.name) && pad.color.toLowerCase()===previousColor.toLowerCase() && !sets.some(s=>s.name.trim().toLowerCase()===pad.name.trim().toLowerCase()));
  const items: StudioItem[] = holes.flatMap((h) => [
    {
      id: `${h.number}:tee:main-tee`,
      kind: "Tee pad",
      label: endpointName("tee", "main-tee", h.tee_name),
      role: "Main tee",
      detail: `Hole ${h.number}`,
      hole: h.number,
      color: h.tee_color,
      placed: !!h.tee,
    },
    ...h.extra_tees.map((t) => ({
      id: `${h.number}:tee:${t.tempId}`,
      kind: "Tee pad",
      label: endpointName("tee", t.tempId, t.name, t.is_drop_zone),
      role: endpointRoleLabel("tee", endpointRole("tee", t.tempId, t.is_drop_zone)),
      detail: `Hole ${h.number}`,
      hole: h.number,
      color: t.color,
      placed: t.lat != null && t.lng != null,
    })),
    {
      id: `${h.number}:basket:main-basket`,
      kind: "Basket",
      label: endpointName("basket", "main-basket", h.basket_name),
      role: "Main basket",
      detail: `Hole ${h.number}`,
      hole: h.number,
      color: h.basket_color,
      placed: !!h.basket,
    },
    ...h.extra_baskets.map((b) => ({
      id: `${h.number}:basket:${b.tempId}`,
      kind: "Basket",
      label: endpointName("basket", b.tempId, b.name),
      role: "Alternate basket",
      detail: `Hole ${h.number}`,
      hole: h.number,
      color: b.color,
      placed: b.lat != null && b.lng != null,
    })),
  ]);
  for (const f of features)
    items.push({
      id: `feature:${f.tempId}`,
      kind: FEATURE_CONFIG[f.type].label,
      label: f.label || FEATURE_CONFIG[f.type].label,
      detail: f.hole_numbers?.length ? `Hole ${f.hole_numbers.join(", ")}` : "Course-wide",
      hole: f.hole_numbers?.includes(activeHole) ? activeHole : f.hole_numbers?.[0],
      color: FEATURE_CONFIG[f.type].color,
      placed: !!f.points.length,
    });
  const selected = selectedPin ? `${activeHole}:${selectedPin.id}` : null;
  const current = holes.find((h) => h.number === activeHole);
  function choose(item: StudioItem) {
    if (item.id.startsWith("feature:")) {
      onSelectFeature(item.id.slice(8));
      return;
    }
    const [h, kind, ...ids] = item.id.split(":");
    onSelectPin(Number(h), kind as "tee" | "basket", ids.join(":"));
  }
  function locate(item: StudioItem) {
    const [h, kind, ...parts] = item.id.split(":"),
      id = parts.join(":"),
      hole = holes.find((row) => row.number === Number(h));
    if (!hole) return;
    const pad = (kind === "tee" ? hole.extra_tees : hole.extra_baskets).find(
      (p) => p.tempId === id,
    );
    const point =
      id === "main-tee"
        ? hole.tee
        : id === "main-basket"
          ? hole.basket
          : pad?.lat != null && pad.lng != null
            ? ([pad.lat, pad.lng] as [number, number])
            : null;
    onLocate(point, kind as "tee" | "basket", id);
  }
  const editor = (() => {
    if (!selectedPin || !current) return null;
    const [kind, ...parts] = selectedPin.id.split(":"),
      id = parts.join(":"),
      isTee = kind === "tee",
      main = id === "main-tee" || id === "main-basket";
    const pad = (isTee ? current.extra_tees : current.extra_baskets).find((p) => p.tempId === id);
    if (!main && !pad) return null;
    const name = main ? (isTee ? current.tee_name : current.basket_name) : pad!.name,
      color = main ? (isTee ? current.tee_color : current.basket_color) : pad!.color;
    const shared =
      isTee && sets.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());
    function patch(patch: EndpointPatch) {
      if (shared && patch.color) paletteRef.current?.recolor(name, patch.color);
      setHoles((previous) =>
        previous.map((h) =>
          h.number !== activeHole
            ? h
            : main
              ? {
                  ...h,
                  ...(patch.name !== undefined
                    ? { [isTee ? "tee_name" : "basket_name"]: patch.name }
                    : {}),
                  ...(patch.color ? { [isTee ? "tee_color" : "basket_color"]: patch.color } : {}),
                  ...(patch.bearing !== undefined ? { tee_bearing: patch.bearing } : {}),
                }
              : isTee
                ? {
                    ...h,
                    extra_tees: h.extra_tees.map((t) => (t.tempId === id ? { ...t, ...patch } : t)),
                  }
                : {
                    ...h,
                    extra_baskets: h.extra_baskets.map((b) =>
                      b.tempId === id ? { ...b, ...patch } : b,
                    ),
                  },
        ),
      );
    }
    return (
      <StudioEndpointEditor
        hole={current}
        kind={kind as "tee" | "basket"}
        id={id}
        name={name}
        color={color || "#a3e635"}
        bearing={main ? current.tee_bearing : (pad as StudioPad & { bearing?: number })?.bearing}
        dropZone={pad?.is_drop_zone}
        sharedColor={shared}
        onChange={patch}
        allowDropZone={!main}
        onDelete={() => {
          if(!main) onRemovePin?.(id);
          setHoles((previous) =>
            previous.map((h) =>
              h.number !== activeHole
                ? h
                : main
                  ? { ...h, [isTee ? "tee" : "basket"]: null }
                  : isTee
                    ? { ...h, extra_tees: h.extra_tees.filter((t) => t.tempId !== id) }
                    : { ...h, extra_baskets: h.extra_baskets.filter((b) => b.tempId !== id) },
            ),
          );
          onClear();
        }}
        onEdit={(route) => onEditFairway(current, route)}
        onAssign={(ids) => onAssign(current, id, ids)}
        onConnect={(from,to,remove)=>{
          setHoles(previous=>previous.map(h=>h.number===current.number?connectStudioBaskets(h,from,to,remove):h));
          if(!remove) onEditFairway(current,`basket:${from}/${to}`);
        }}
      />
    );
  })();
  return (
    <StudioItemsPanel
      scope={scope} onScopeChange={onScopeChange}
      items={items}
      activeHole={activeHole}
      selectedId={selected}
      selectionSerial={selectionSerial || selectedPin?.serial || 0}
      onSelect={choose}
      onClear={onClear}
      onFind={locate}
      editor={<>{colorStatus.saving&&<p role="status" className="text-xs">Saving shared tee color…</p>}{colorStatus.error&&<p role="alert" className="text-xs text-destructive">{colorStatus.error} Use Save changes to retry.</p>}{editor}</>}
      fairwayActive={fairwayActive}
      colors={
        courseId ? (
          <CourseTeeSets
            draft={paletteDraft} onDraftChange={onPaletteChange}
            onStatusChange={setColorStatus}
            ref={paletteRef}
            courseId={courseId}
            holes={holes}
            onSetsChange={setSets}
            onApply={(name, color, previousColor) =>
              setHoles((previous) =>
                previous.map((h) => ({
                  ...h,
                  tee_color:
                    matchesColor({name:h.tee_name,color:h.tee_color},name,previousColor)
                      ? color
                      : h.tee_color,
                  extra_tees: h.extra_tees.map((t) =>
                    matchesColor(t,name,previousColor) ? { ...t, color } : t,
                  ),
                })),
              )
            }
          />
        ) : (
          <p className="text-xs">
            Save the course to create shared tee colors. Select any tee or basket to change its
            individual color.
          </p>
        )
      }
      addTools={
        <>
          <p className="text-xs text-muted-foreground">
            Choose an item, then click the map. Lines and areas use several points.
          </p>
          <StudioEndpointPlacement
            key={activeHole}
            hole={current}
            holeNumber={activeHole}
            teeNames={sets}
            onAdd={onAdd}
          />
          <details className="rounded border p-2 text-xs" open>
            <summary>Mapped tee pads · this layout</summary>
            <div className="mt-2 space-y-1" data-testid="tee-inventory">{teeInventory(holes,sets).map(row=><div key={row.name} className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border" style={{background:row.color}}/><span>{row.name}</span><span className="ml-auto">{row.mapped} mapped{row.unplaced ? ` · ${row.unplaced} unplaced` : ""}</span></div>)}</div>
          </details>
          <label className="block text-xs">New feature belongs to
            <select aria-label="New feature assignment" className="mt-1 w-full rounded border bg-background p-2" value={attachToHole ? "hole" : "course"} onChange={e=>onAttachToHole(e.target.value==="hole")}>
              <option value="hole">Hole {activeHole}</option><option value="course">Whole course</option>
            </select>
          </label>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(FEATURE_CONFIG)
              .filter(([type]) => type !== "ob_reference")
              .map(([type, cfg]) => (
                <Button
                  key={type}
                  size="sm"
                  variant="outline"
                  className="justify-start whitespace-normal text-left"
                  onClick={() => onAdd(type as CourseFeatureType)}
                >
                  {cfg.label}
                </Button>
              ))}
          </div>
          <Button size="sm" variant="outline" onClick={()=>onAdd("ob-ref")}>Use existing OB</Button>
          <Button size="sm" variant="outline" onClick={onToggleBoundary}>
            {boundaryLocked ? "Unlock course boundary" : "Lock course boundary"}
          </Button>
          {placement && (
            <div className="space-y-2 rounded border border-primary p-2 text-xs">
              <p>
                {placement}
                {points ? ` · ${points} points` : ""}
              </p>
              {points >= 2 && (
                <Button size="sm" onClick={finish}>
                  Finish shape
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={cancel}>
                Cancel placement · Select
              </Button>
            </div>
          )}
        </>
      }
    />
  );
}
