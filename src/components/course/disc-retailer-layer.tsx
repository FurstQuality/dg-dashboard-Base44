import {useEffect,useRef,useState} from 'react';
import {Marker,Popup,useMap} from 'react-leaflet';
import {useServerFn} from '@tanstack/react-start';
import {useQuery} from '@tanstack/react-query';
import L from 'leaflet';
import {listDiscRetailers} from '@/lib/disc-retailers.functions';
import {createPortal} from 'react-dom';
const icon=L.divIcon({className:'',html:'<span style="display:grid;place-items:center;background:#7c3aed;color:white;border:2px solid white;border-radius:8px;width:26px;height:26px;font-size:17px">🛍</span>',iconSize:[28,28],iconAnchor:[14,14]});
export function DiscRetailerLayer(){
 const map=useMap(),load=useServerFn(listDiscRetailers);
 const [enabled,setEnabled]=useState(false),[query,setQuery]=useState('');
 const result=useQuery({queryKey:['disc-retailers'],queryFn:()=>load(),enabled,staleTime:86400000,retry:false});
 const shops=result.data?.shops??[], matches=shops.filter(s=>`${s.name} ${s.address}`.toLowerCase().includes(query.toLowerCase()));
 const fitKey=useRef('');
 useEffect(()=>{const key=`${query.trim()}|${result.data?.fetchedAt}`;if(!enabled||!query.trim()||!result.data||fitKey.current===key)return;const timer=setTimeout(()=>{fitKey.current=key;if(matches.length===1)map.setView([matches[0].lat,matches[0].lng],16);else if(matches.length)map.fitBounds(matches.map(s=>[s.lat,s.lng] as [number,number]),{padding:[50,50],maxZoom:15});},300);return()=>clearTimeout(timer);},[query,enabled,result.data,map]);
 const container=map.getContainer().parentElement;
 return <>{enabled&&matches.map(s=><Marker key={s.id} position={[s.lat,s.lng]} icon={icon}><Popup><strong>{s.name}</strong><p>{s.address}</p><p>Mapped disc retailer · inventory not verified</p>{s.website&&<a href={s.website} target="_blank" rel="noreferrer">Store website</a>}<br/><a href={s.sourceUrl} target="_blank" rel="noreferrer">OpenStreetMap source</a></Popup></Marker>)}
 {container&&createPortal(<details className="absolute bottom-8 left-3 z-[650] max-w-[min(340px,85vw)] rounded-lg border bg-background/95 p-2 text-sm shadow" onPointerDown={e=>e.stopPropagation()}><summary className="cursor-pointer">Disc shops {enabled ? `(${shops.length})` : ''}</summary><label className="my-2 flex gap-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Show pro shops &amp; disc retailers</label>
 {enabled&&<><p className="text-xs text-muted-foreground">Worldwide stores explicitly tagged for disc golf in OpenStreetMap. Coverage is incomplete; check stock with the store.</p>{result.isPending?<p role="status">Importing mapped retailers…</p>:result.isError?<p role="alert">{result.error instanceof Error ? result.error.message : "Retailer import unavailable."} <button className="underline" onClick={()=>void result.refetch()}>Retry</button></p>:<><p className="text-xs">Updated {new Date(result.data!.fetchedAt).toLocaleDateString()} · © OpenStreetMap contributors</p><input aria-label="Find disc shop" placeholder="Shop name or city" value={query} onChange={e=>setQuery(e.target.value)} className="my-2 w-full rounded border bg-background p-2"/><div className="max-h-44 overflow-y-auto">{matches.slice(0,100).map(s=><button key={s.id} className="block w-full border-b p-2 text-left text-xs" onClick={()=>map.setView([s.lat,s.lng],16)}>{s.name}<span className="block text-muted-foreground">{s.address}</span></button>)}{!matches.length&&<p>No mapped shops match.</p>}</div></>}</>}
 </details>,container)}</>;
}
