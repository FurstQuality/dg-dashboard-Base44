import { endpointRole, endpointRoleLabel } from "@/lib/course-builder/endpoint-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PinFairways } from "./pin-fairways";
import type { StudioHole } from "@/lib/course-builder/studio-fairways";

export type EndpointPatch = {
  name?: string;
  color?: string;
  bearing?: number | null;
  is_drop_zone?: boolean;
};
const colors = [
  ["Red", "#dc2626"],
  ["Blue", "#2563eb"],
  ["White", "#ffffff"],
  ["Gold", "#f59e0b"],
  ["Green", "#16a34a"],
  ["Black", "#111827"],
] as const;
export function StudioEndpointEditor({
  hole,
  kind,
  id,
  name,
  color,
  bearing,
  dropZone,
  sharedColor,
  onChange,
  onDelete,
  onEdit,
  onAssign,
  onConnect,
  allowDropZone = true,
}: {
  hole: StudioHole;
  kind: "tee" | "basket";
  id: string;
  name: string;
  color: string;
  bearing?: number | null;
  dropZone?: boolean;
  sharedColor: boolean;
  onChange: (patch: EndpointPatch) => void;
  onDelete: () => void;
  onEdit: (route: string) => void;
  onAssign: (ids: string[]) => void;
  onConnect: (from:string,to:string,remove?:boolean)=>void;
  allowDropZone?: boolean;
}) {
  return (
    <div className="space-y-3">
      <label className="block text-xs">
        {kind === "tee" ? "Tee type" : "Basket type"}
        {kind === "tee" && allowDropZone ? (
          <select aria-label="Tee type" className="mt-1 w-full rounded border bg-background p-2" value={dropZone ? "drop_zone" : "alternate"} onChange={e => onChange({is_drop_zone: e.target.value === "drop_zone"})}>
            <option value="alternate">Alternate tee</option>
            <option value="drop_zone">Drop zone</option>
          </select>
        ) : (
          <Input aria-label={kind === "tee" ? "Tee type" : "Basket type"} value={endpointRoleLabel(kind, endpointRole(kind, id, dropZone))} readOnly />
        )}
      </label>
      <label className="block text-xs">
        Name
        <Input
          aria-label="Item name"
          placeholder="e.g. Elite, Short, Blues, Reds"
          value={name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs">Color</legend>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Item color"
            value={color}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-9 w-12 rounded border bg-background"
          />
          <span className="font-mono text-xs">{color}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {colors.map(([label, hex]) => (
            <button
              key={hex}
              type="button"
              aria-label={`Set color ${label}`}
              aria-pressed={color.toLowerCase() === hex}
              title={label}
              onClick={() => onChange({ color: hex })}
              className="h-7 w-7 rounded-full border-2 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2"
              style={{ background: hex }}
            />
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {sharedColor
            ? `Shared course color: changing it updates every tee named ${name}.`
            : `Changes this ${kind === "tee" ? "tee pad" : "basket"} only.`}
        </p>
      </fieldset>
      {kind === "tee" && (
        <details className="text-xs">
          <summary className="cursor-pointer">
            Tee direction
          </summary>
          <label className="mt-2 block">
            Facing direction
            <input
              aria-label="Tee direction"
              type="range"
              min="0"
              max="359"
              value={bearing ?? 0}
              onChange={(e) => onChange({ bearing: Number(e.target.value) })}
              className="block w-full"
            />
          </label>
        </details>
      )}
      <PinFairways
        onConnect={onConnect}
        hole={hole}
        teeId={kind === "tee" ? id : undefined}
        basketId={kind === "basket" ? id : undefined}
        onEdit={onEdit}
        onAssign={kind === "tee" ? onAssign : undefined}
      />
      <Button size="sm" variant="outline" className="w-full text-destructive" onClick={onDelete}>
        Remove {kind === "tee" ? "tee pad" : "basket"}
      </Button>
    </div>
  );
}
