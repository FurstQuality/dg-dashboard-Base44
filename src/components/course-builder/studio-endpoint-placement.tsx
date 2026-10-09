import {useId, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import type {StudioHole} from "@/lib/course-builder/studio-fairways";
import {endpointRoleLabel, type EndpointKind, type EndpointRole, type EndpointIdentity} from "@/lib/course-builder/endpoint-identity";

/** Role, name and color are independent choices. Existing endpoints are never
 * moved or renamed by placing another endpoint. */
export function StudioEndpointPlacement({hole, holeNumber, teeNames, onAdd}: {
  hole?: StudioHole;
  holeNumber: number;
  teeNames: {name: string; color: string}[];
  onAdd: (kind: EndpointKind, identity: EndpointIdentity) => void;
}) {
  const namesId = useId();
  const [kind, setKind] = useState<EndpointKind>("tee");
  const [drafts, setDrafts] = useState({
    tee: {role: null as EndpointRole | null, name: "", color: "#2563eb"},
    basket: {role: null as EndpointRole | null, name: "", color: "#a3e635"},
  });
  const draft = drafts[kind];
  const hasMain = !!hole?.[kind];
  const role = draft.role === "main" && hasMain ? "alternate" : draft.role ?? (hasMain ? "alternate" : "main");
  const patch = (values: Partial<typeof draft>) => setDrafts(previous => ({...previous, [kind]: {...previous[kind], ...values}}));
  const suggestions = [...new Set(kind === "tee"
    ? [...teeNames.map(t => t.name), hole?.tee_name, ...(hole?.extra_tees.map(t => t.name) ?? [])]
    : [hole?.basket_name, ...(hole?.extra_baskets.map(b => b.name) ?? [])])].filter(Boolean) as string[];
  return <fieldset className="space-y-2 rounded-lg border p-2">
    <legend className="px-1 text-xs font-semibold">Place on Hole {holeNumber}</legend>
    <div className="grid grid-cols-2 gap-1">
      <Button size="sm" variant={kind === "tee" ? "default" : "outline"} aria-pressed={kind === "tee"} onClick={() => setKind("tee")}>Tee pad</Button>
      <Button size="sm" variant={kind === "basket" ? "default" : "outline"} aria-pressed={kind === "basket"} onClick={() => setKind("basket")}>Basket</Button>
    </div>
    <label className="block text-xs">{kind === "tee" ? "Tee type" : "Basket type"}
      <select aria-label={kind === "tee" ? "Tee type to place" : "Basket type to place"} className="mt-1 w-full rounded border bg-background p-2" value={role} onChange={e => patch({role: e.target.value as EndpointRole})}>
        <option value="main" disabled={hasMain}>{endpointRoleLabel(kind, "main")}{hasMain ? " · already placed" : ""}</option>
        <option value="alternate">{endpointRoleLabel(kind, "alternate")}</option>
        {kind === "tee" && <option value="drop_zone">Drop zone</option>}
      </select>
    </label>
    <label className="block text-xs">Name (optional)
      <Input aria-label="New endpoint name" placeholder="Elite, Short, Blues, Reds…" list={namesId} value={draft.name} onChange={e => {
        const name = e.target.value;
        const group = kind === "tee" ? teeNames.find(t => t.name.trim().toLowerCase() === name.trim().toLowerCase()) : undefined;
        patch({name, ...(group ? {color: group.color} : {})});
      }} />
      <datalist id={namesId}>{suggestions.map(name => <option key={name} value={name}/>)}</datalist>
    </label>
    <label className="flex items-center gap-2 text-xs">Color
      <input type="color" aria-label="New endpoint color" value={draft.color} onChange={e => patch({color: e.target.value})} className="h-8 w-12 rounded border bg-background"/>
      <span className="font-mono">{draft.color}</span>
    </label>
    <p className="text-[11px] text-muted-foreground">Type describes its role. Name and color identify it on the map.</p>
    <Button size="sm" className="w-full" onClick={() => onAdd(kind, {role, name: draft.name.trim() || endpointRoleLabel(kind, role), color: draft.color})}>Place {kind === "tee" ? "tee pad" : "basket"}</Button>
  </fieldset>;
}
