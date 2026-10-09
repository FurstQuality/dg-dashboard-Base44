import {isGenericTeeName} from "./endpoint-identity";
import {validPoint} from "./pairing-fairways";
import type {LatLng} from "./geometry";

export const STANDARD_TEE_SETS = [
  {name:"Blue",color:"#2563eb"}, {name:"Red",color:"#dc2626"},
  {name:"White",color:"#ffffff"}, {name:"Gold",color:"#f59e0b"},
  {name:"Green",color:"#16a34a"}, {name:"Black",color:"#111827"},
];
export type InventoryHole = {
  tee:LatLng|null; tee_name:string; tee_color:string;
  extra_tees:{name:string;color:string;lat:number|null;lng:number|null}[];
};
const norm=(s:string)=>s.trim().toLowerCase();
export function teeSetChoices(sets:{name:string;color:string}[]) {
  return [...sets,...STANDARD_TEE_SETS.filter(s=>!sets.some(t=>norm(s.name)===norm(t.name)))];
}
/** Count real mapped endpoints, not labels or empty primary slots. Legacy pads
 * named Main/Tee 2 can still be recognized by their saved marker color. */
export function teeInventory(holes:InventoryHole[],sets:{name:string;color:string}[]) {
  const choices=teeSetChoices(sets);
  const rows=new Map(choices.map(s=>[norm(s.name),{...s,mapped:0,unplaced:0}]));
  for(const h of holes) for(const pad of [{name:h.tee_name,color:h.tee_color,placed:validPoint(h.tee)},...h.extra_tees.map(t=>({...t,placed:validPoint([t.lat,t.lng])}))]) {
    const match=choices.find(s=>norm(s.name)===norm(pad.name)) ?? (isGenericTeeName(pad.name) ? choices.find(s=>norm(s.color)===norm(pad.color)) : undefined);
    const key=norm(match?.name ?? (pad.name||"Unassigned"));
    const row=rows.get(key) ?? {name:pad.name||"Unassigned",color:pad.color,mapped:0,unplaced:0};
    if(pad.placed)row.mapped++;else row.unplaced++;
    rows.set(key,row);
  }
  return [...rows.values()];
}
