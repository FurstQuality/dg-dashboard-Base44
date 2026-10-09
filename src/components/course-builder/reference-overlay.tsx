import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Marker,useMap,useMapEvents} from 'react-leaflet';
import L from 'leaflet';
import {useServerFn} from '@tanstack/react-start';
import {Button} from '@/components/ui/button';
import {detectCourseOverlay,recordCourseOverlay} from '@/lib/course-overlay.functions';
import {overlayPoint,overlayUV,transformOverlay,reviewOverlayCandidates,project,unproject,type OverlayAnchors,type OverlayCandidate} from '@/lib/course-builder/overlay-geometry';
import type {LatLng} from '@/lib/course-builder/geometry';
export type ReferenceImage={url:string;name:string;width:number;height:number;opacity:number;anchors:OverlayAnchors|null;locked:boolean;candidates:OverlayCandidate[];cleanup:'original'|'paper'|'satellite';threshold:number;visible:boolean};
function overlayStore(mode:IDBTransactionMode,key:string,value?:ReferenceImage|null):Promise<ReferenceImage|null>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open('dgd-course-overlays',1);request.onupgradeneeded=()=>request.result.createObjectStore('images');request.onerror=()=>reject(request.error);
 request.onsuccess=()=>{const db=request.result,tx=db.transaction('images',mode),store=tx.objectStore('images');let result:ReferenceImage|null=null;
 if(mode==='readonly'){const get=store.get(key);get.onsuccess=()=>{result=get.result??null;};}else if(value)store.put(value,key);else store.delete(key);
 tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};};
});}
export function useReferenceOverlay(courseId:string){
 const [image,setImage]=useState<ReferenceImage|null>(null),[loaded,setLoaded]=useState(false),[storageError,setStorageError]=useState('');
 useEffect(()=>{let cancelled=false;setLoaded(false);setImage(null);overlayStore('readonly',courseId).then(v=>{if(!cancelled){setImage(v);setLoaded(true);}}).catch(()=>{if(!cancelled){setStorageError('Image recovery storage is unavailable. Keep the original file.');setLoaded(true);}});return()=>{cancelled=true;};},[courseId]);
 useEffect(()=>{if(!loaded)return;const timer=setTimeout(()=>{void overlayStore('readwrite',courseId,image).catch(()=>setStorageError('Image draft could not be saved on this device. Keep the original file.'));},500);return()=>clearTimeout(timer);},[image,loaded,courseId]);
 return {image,setImage,storageError};
}
async function readImage(file:File):Promise<Pick<ReferenceImage,'url'|'width'|'height'>>{
 if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>15*1024*1024)throw new Error('Choose a PNG, JPG or WebP image under 15 MB.');
 const bitmap=await createImageBitmap(file),scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height));
 const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 let url=canvas.toDataURL('image/png');
 while(url.length>7_500_000){const copy=document.createElement('canvas');copy.width=Math.round(canvas.width*.8);copy.height=Math.round(canvas.height*.8);copy.getContext('2d')!.drawImage(canvas,0,0,copy.width,copy.height);canvas.width=copy.width;canvas.height=copy.height;canvas.getContext('2d')!.drawImage(copy,0,0);url=canvas.toDataURL('image/png');}
 return {url,width:canvas.width,height:canvas.height};
}
function useCleanImage(image:ReferenceImage|null){
 const [url,setUrl]=useState<string|null>(null);
 useEffect(()=>{let cancelled=false;if(!image){setUrl(null);return;}if(image.cleanup==='original'){setUrl(image.url);return;}
 const img=new Image();img.onload=()=>{if(cancelled)return;const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),p=pixels.data;
 for(let i=0;i<p.length;i+=4){const low=Math.min(p[i],p[i+1],p[i+2]),high=Math.max(p[i],p[i+1],p[i+2]),light=low>=image.threshold&&high-low<65;if(image.cleanup==='paper'?light:!light)p[i+3]=0;}
 ctx.putImageData(pixels,0,0);setUrl(c.toDataURL());};img.src=image.url;return()=>{cancelled=true;};},[image?.url,image?.cleanup,image?.threshold]);return url??image?.url;
}
const handle=(label:string)=>L.divIcon({className:'',html:`<span style="display:block;background:white;color:#111;border:2px solid #2563eb;border-radius:6px;padding:3px;font:bold 11px sans-serif;white-space:nowrap">${label}</span>`,iconSize:[24,24]});
/** Three geographic anchors allow dragging, resizing, rotating and skew correction. */
export function ReferenceOverlayLayer({image,onChange,mark,onMarked,hole}:{image:ReferenceImage|null;onChange:(i:ReferenceImage)=>void;mark:'tee'|'basket'|null;onMarked:()=>void;hole:number}){
 const map=useMap(),[,redraw]=useState(0),url=useCleanImage(image),dragCleanup=useRef<(()=>void)|null>(null);
 useMapEvents({zoomend:()=>redraw(n=>n+1),moveend:()=>redraw(n=>n+1),click:e=>{if(!image?.locked||!image.anchors||!mark)return;const uv=overlayUV(image.anchors,[e.latlng.lat,e.latlng.lng]);if(!uv||uv.some(v=>v<0||v>1))return;
 onChange({...image,candidates:[...image.candidates,{id:crypto.randomUUID(),kind:mark,hole,name:mark==='tee'?'Main tee':'Main basket',color:mark==='tee'?'#2563eb':'#a3e635',x:uv[0],y:uv[1],selected:true}]});onMarked();}});
 useEffect(()=>()=>dragCleanup.current?.(),[]);
 useEffect(()=>{if(!image||image.anchors)return;const size=map.getSize(),w=size.x*.6,h=Math.min(size.y*.65,w*image.height/image.width),width=h*image.width/image.height,x=(size.x-width)/2,y=(size.y-h)/2;
 const p=(a:number,b:number):LatLng=>{const v=map.containerPointToLatLng([a,b]);return [v.lat,v.lng];};onChange({...image,anchors:[p(x,y),p(x+width,y),p(x,y+h)]});},[image?.url,image?.anchors,map]);
 if(!image?.anchors||!image.visible||!url)return null;
 const anchors=image.anchors,[a,b,c]=anchors.map(p=>map.latLngToLayerPoint(p));
 const stopDrag=()=>{dragCleanup.current?.();dragCleanup.current=null;};
 const startDrag=(e:React.PointerEvent<HTMLImageElement>)=>{
  if(image.locked)return;e.preventDefault();e.stopPropagation();stopDrag();
  const origin=map.mouseEventToContainerPoint(e.nativeEvent),wasDragging=map.dragging.enabled();map.dragging.disable();
  const points=anchors.map(p=>map.latLngToContainerPoint(p));
  const move=(event:PointerEvent)=>{const delta=map.mouseEventToContainerPoint(event).subtract(origin);onChange({...image,anchors:points.map(p=>{const ll=map.containerPointToLatLng(p.add(delta));return [ll.lat,ll.lng];}) as OverlayAnchors});};
  const up=()=>stopDrag();window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  dragCleanup.current=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);if(wasDragging)map.dragging.enable();};
 };
 return <>{createPortal(<img className="course-reference-overlay" alt="Aligned course map overlay" src={url} draggable={false} onPointerDown={startDrag} onClick={e=>e.stopPropagation()} style={{position:'absolute',left:0,top:0,width:1000,height:1000,maxWidth:'none',transformOrigin:'0 0',transform:`matrix(${(b.x-a.x)/1000},${(b.y-a.y)/1000},${(c.x-a.x)/1000},${(c.y-a.y)/1000},${a.x},${a.y})`,opacity:image.opacity,pointerEvents:image.locked?'none':'auto',touchAction:'none',cursor:'move',zIndex:350}}/>,map.getPane('overlayPane')!)}
 {!image.locked&&anchors.map((p,i)=><Marker key={i} position={p} icon={handle(['↖','↗','↙'][i])} draggable eventHandlers={{dragend:e=>{const ll=e.target.getLatLng();const next=[...anchors] as OverlayAnchors;next[i]=[ll.lat,ll.lng];if(overlayUV(next,overlayPoint(next,.5,.5)))onChange({...image,anchors:next});}}}/>)}
 {image.locked&&image.candidates.map(c=><Marker key={c.id} position={overlayPoint(anchors,c.x,c.y)} icon={handle(`${c.hole||'?'} ${c.kind==='tee'?'T':'B'}`)} draggable eventHandlers={{dragend:e=>{const ll=e.target.getLatLng(),uv=overlayUV(anchors,[ll.lat,ll.lng]);if(uv&&uv.every(v=>v>=0&&v<=1))onChange({...image,candidates:image.candidates.map(x=>x.id===c.id?{...x,x:uv[0],y:uv[1]}:x)});}}}/>)}</>;
}
export function ReferenceOverlayControl({image,onChange,onClose,courseId,boundary,boundaryLocked,holes,activeHole,onBuild,mark,onMark,storageError}:{image:ReferenceImage|null;onChange:(v:ReferenceImage|null)=>void;onClose:()=>void;courseId?:string;boundary:LatLng[];boundaryLocked:boolean;holes:number[];activeHole:number;onBuild:(items:(OverlayCandidate&{point:LatLng})[])=>void;mark:'tee'|'basket'|null;onMark:(v:'tee'|'basket'|null)=>void;storageError:string}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),detect=useServerFn(detectCourseOverlay),record=useServerFn(recordCourseOverlay);
 const rows=image?.anchors?reviewOverlayCandidates(image.candidates,image.anchors,boundary,holes):[],valid=rows.filter(c=>!c.error);
 const patch=(p:Partial<ReferenceImage>)=>image&&onChange({...image,...p});
 async function detectItems(){if(!image||!courseId)return;setBusy(true);setError('');try{const result=await detect({data:{courseId,image:image.url}});patch({candidates:[...image.candidates,...result.items.map(c=>({...c,id:crypto.randomUUID(),selected:false}))]});}catch(e){setError(e instanceof Error?e.message:'Detection failed.');}finally{setBusy(false);}}
 async function build(){if(!image?.anchors||!courseId||!boundaryLocked||!valid.length||rows.some(c=>c.error))return;setBusy(true);setError('');try{await record({data:{courseId,image:image.url,name:image.name,anchors:image.anchors,candidates:valid}});onBuild(valid);patch({candidates:image.candidates.filter(c=>!valid.some(v=>v.id===c.id)),visible:false});}catch(e){setError(e instanceof Error?e.message:'Import failed. Your map is unchanged.');}finally{setBusy(false);}}
 return <section aria-label="Map overlay tools" className="absolute left-14 right-2 top-16 z-[1170] max-h-[65%] overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-xl sm:right-auto sm:w-96">
 <div className="flex justify-between"><strong>Place map over aerial</strong><Button size="sm" variant="ghost" disabled={busy} aria-label="Close overlay tools" onClick={onClose}>×</Button></div>
 {storageError&&<p role="alert" className="text-xs">{storageError}</p>}{error&&<p role="alert" className="my-2 text-sm text-destructive">{error}</p>}
 {!image?<label className="my-2 block text-sm">Choose course screenshot or map<input aria-label="Course map image" className="mt-2 w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=await readImage(f);onChange({...data,name:f.name,opacity:.65,anchors:null,locked:false,candidates:[],cleanup:'original',threshold:195,visible:true});setError('');}catch(e){setError((e as Error).message);}}}/></label>:<>
 <p className="my-2 truncate text-sm">{image.name}</p><label className="flex gap-2 text-xs"><input type="checkbox" checked={image.visible} onChange={e=>patch({visible:e.target.checked})}/>Show overlay</label>
 <label className="my-2 block text-xs">Opacity<input aria-label="Overlay opacity" type="range" min="0.1" max="1" step="0.05" value={image.opacity} onChange={e=>patch({opacity:Number(e.target.value)})} className="ml-2"/></label>
 <label className="block text-xs">Background cleanup<select aria-label="Overlay background cleanup" value={image.cleanup} onChange={e=>patch({cleanup:e.target.value as ReferenceImage['cleanup']})} className="my-1 block w-full rounded border bg-background p-2"><option value="original">Original image</option><option value="paper">Remove white paper</option><option value="satellite">Keep light map markings</option></select></label>
 {image.cleanup!=='original'&&<label className="text-xs">Light threshold<input aria-label="Cleanup threshold" type="range" min="100" max="250" value={image.threshold} onChange={e=>patch({threshold:Number(e.target.value)})}/><span className="block">Cleanup is a visual filter. Detection always uses the original image.</span></label>}
 {!image.locked?<><p className="my-2 text-xs">Drag the image to move it. Drag its three corner handles to resize, rotate or correct skew. Match landmarks to the aerial.</p><div className="flex flex-wrap gap-1">{[['Smaller',.95,0],['Larger',1.05,0],['Rotate left',1,2],['Rotate right',1,-2]] .map(([label,scale,angle])=><Button key={label} size="sm" variant="outline" onClick={()=>image.anchors&&patch({anchors:transformOverlay(image.anchors,Number(scale),Number(angle))})}>{label}</Button>)}<Button size="sm" variant="outline" onClick={()=>patch({anchors:null})}>Fit image to view</Button></div><Button className="my-2 w-full" disabled={!image.anchors} onClick={()=>patch({locked:true})}>Lock image alignment</Button></>:<>
 <div className="my-2 flex flex-wrap gap-2"><Button size="sm" disabled={busy} variant="outline" onClick={()=>{patch({locked:false});onMark(null);}}>Unlock image</Button><Button size="sm" disabled={busy||!courseId} onClick={()=>void detectItems()}>{busy?'Working…':'Detect tees & baskets'}</Button></div>
 <p className="text-xs text-muted-foreground">Detection uses Gemini. Review each candidate’s hole, type and location before selecting it. Drag markers to correct locations.</p>
 <div className="my-2 flex gap-2"><Button size="sm" variant={mark==='tee'?'default':'outline'} onClick={()=>onMark(mark==='tee'?null:'tee')}>Mark tee</Button><Button size="sm" variant={mark==='basket'?'default':'outline'} onClick={()=>onMark(mark==='basket'?null:'basket')}>Mark basket</Button></div>{mark&&<p className="text-xs">Click the {mark} symbol on the image for Hole {activeHole}.</p>}
 <div className="max-h-52 space-y-2 overflow-y-auto">{image.candidates.map(c=><div key={c.id} className="rounded border p-2 text-xs"><div className="flex gap-1"><input aria-label={`Select ${c.id}`} type="checkbox" checked={c.selected} onChange={e=>patch({candidates:image.candidates.map(x=>x.id===c.id?{...x,selected:e.target.checked}:x)})}/><select aria-label={`Hole for ${c.id}`} value={c.hole} onChange={e=>patch({candidates:image.candidates.map(x=>x.id===c.id?{...x,hole:Number(e.target.value)}:x)})} className="rounded border bg-background"><option value="0">Choose hole</option>{holes.map(n=><option key={n} value={n}>Hole {n}</option>)}</select><select aria-label={`Type for ${c.id}`} value={c.kind} onChange={e=>patch({candidates:image.candidates.map(x=>x.id===c.id?{...x,kind:e.target.value as 'tee'|'basket'}:x)})} className="rounded border bg-background"><option value="tee">Tee</option><option value="basket">Basket</option></select><button aria-label={`Remove ${c.id}`} onClick={()=>patch({candidates:image.candidates.filter(x=>x.id!==c.id)})}>×</button></div><input aria-label={`Name for ${c.id}`} className="mt-1 w-3/4 rounded border bg-background p-1" value={c.name} onChange={e=>patch({candidates:image.candidates.map(x=>x.id===c.id?{...x,name:e.target.value}:x)})}/><input type="color" aria-label={`Color for ${c.id}`} value={c.color} onChange={e=>patch({candidates:image.candidates.map(x=>x.id===c.id?{...x,color:e.target.value}:x)})} className="h-6 w-8"/>{rows.find(r=>r.id===c.id)?.error&&<p className="text-destructive">{rows.find(r=>r.id===c.id)?.error}</p>}</div>)}</div>
 {!boundaryLocked&&<p className="my-2 text-xs">Draw and lock the property line before building items.</p>}<Button className="my-2 w-full" disabled={busy||!courseId||!boundaryLocked||!valid.length||rows.some(c=>c.error)} onClick={()=>void build()}>Build {valid.length} selected items</Button><p className="text-xs">Existing locations are kept. Empty starting points are filled; additional locations become alternates. Use Save changes to retain the course.</p>
 </>}
 <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{onChange(null);onMark(null);}}>Remove overlay image</Button>
 </>}
 </section>;
}
