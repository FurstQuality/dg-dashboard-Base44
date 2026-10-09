import {parseDiscRetailers, type DiscRetailer} from './disc-retailers';
const QUERY='[out:json][timeout:40];(nwr["sport"~"(^|;)disc_golf(;|$)"]["shop"];nwr["shop"="disc_golf"];nwr["disc_golf"="yes"]["shop"];);out center tags;';
type Catalog={shops:DiscRetailer[];fetchedAt:string};
let cached:Catalog|null=null;
let pending:Promise<Catalog>|null=null;
export async function loadDiscRetailers() {
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Retailer imports need the server Supabase service key to archive their sources. Configure it in the app server environment.');
 if(cached && Date.now()-Date.parse(cached.fetchedAt)<86400000) return cached;
 if(pending) return pending;
 pending=(async()=>{
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const {data:snapshot}=await db.from('source_snapshots').select('payload,retrieved_at').eq('source','openstreetmap').eq('entity_type','disc_retailer_catalog').eq('external_id','worldwide-v1').order('retrieved_at',{ascending:false}).limit(1).maybeSingle();
  if(snapshot && Date.now()-Date.parse(snapshot.retrieved_at)<86400000) return cached={shops:parseDiscRetailers(snapshot.payload),fetchedAt:snapshot.retrieved_at};
  let failure:unknown;
  for(const host of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']) {
   try {
    const res=await fetch(host,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:QUERY}),signal:AbortSignal.timeout(45000)});
    if(!res.ok) throw new Error(`Retailer source returned ${res.status}`);
    const payload=await res.json(); if(payload.remark || !Array.isArray(payload.elements)) throw new Error('Retailer source returned incomplete results.');
    const {recordSnapshot,recordObservation}=await import('./data-intel/snapshots.server');
    const snapshotId=await recordSnapshot({source:'openstreetmap',entityType:'disc_retailer_catalog',externalId:'worldwide-v1',sourceUrl:host,payload,parserVersion:'disc-retailers-1'});
    if(!snapshotId) throw new Error('Retailer source could not be archived. Check the source snapshot connection.');
    const shops=parseDiscRetailers(payload);
    await recordObservation({entityType:'disc_retailer_catalog',entityId:'c862db75-5727-4946-8559-10d8166f9e25',field:'shops',source:'openstreetmap',value:shops,snapshotId,parserVersion:'disc-retailers-1'});
    return cached={shops,fetchedAt:new Date().toISOString()};
   } catch(e) {failure=e;}
  }
  if(snapshot) return {shops:parseDiscRetailers(snapshot.payload),fetchedAt:snapshot.retrieved_at};
  throw failure ?? new Error('Retailer source unavailable.');
 })().finally(()=>{pending=null;});
 return pending;
}
