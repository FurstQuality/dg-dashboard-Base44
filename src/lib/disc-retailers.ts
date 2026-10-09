export type DiscRetailer = {id:string; name:string; lat:number; lng:number; address:string; website:string|null; sourceUrl:string};
export function parseDiscRetailers(payload: unknown): DiscRetailer[] {
 const raw = payload as {elements?: {type:string; id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}[]};
 const seen=new Set<string>();
 return (raw.elements ?? []).flatMap(e => {
  const t=e.tags ?? {}, lat=e.lat ?? e.center?.lat, lng=e.lon ?? e.center?.lon;
  if (!t.shop || /^(no|vacant|closed)$/.test(t.shop) || t.disused==='yes' || t['disused:shop'] || t['abandoned:shop']) return [];
  if (!((t.sport??'').split(';').includes('disc_golf') || t.shop==='disc_golf' || t.disc_golf==='yes' || /disc\s*golf/i.test(t.name??''))) return [];
  if (!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat!)>90||Math.abs(lng!)>180) return [];
  const id=`${e.type}/${e.id}`; if(seen.has(id)) return [];seen.add(id);
  const url=t.website??t['contact:website'];
  return [{id,name:t.name || 'Disc golf shop',lat:lat!,lng:lng!,address:[t['addr:housenumber'],t['addr:street'],t['addr:city'],t['addr:state']].filter(Boolean).join(' '),website:url&&/^https?:\/\//i.test(url)?url:null,sourceUrl:`https://www.openstreetmap.org/${id}`}];
 });
}
