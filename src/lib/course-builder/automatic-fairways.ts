import {validateFairwayDraft,addFairwayShapeHandles,insertFairwayPoint,joinFairwayPoint,pointFor,nearestFairwaySegment,routePoints,type FairwayDraft} from "./pairing-fairways";
import {createFairwayGeometry} from "./fairway-curves";
import {distanceFt,type LatLng} from "./geometry";

export const FAIRWAY_SNAP_FT=6;
/** Defaults are deterministic and never turn curve samples into stored handles. */
export function automaticBendPoints(draft:FairwayDraft):FairwayDraft {
  let d=draft;
  for(const key of Object.keys(d.network.routes)) {
    const nodes=d.network.routes[key].nodes;
    let n=0;const uid=()=>{let id:string;do{id=`point:auto:${key}:${++n}`;}while(d.network.points[id]);return id;};
    if(nodes.length===2)d={...d,network:addFairwayShapeHandles(d,key,uid)};
    else if(nodes.length===3){
      const p=routePoints(d,key),i=distanceFt(p[0],p[1])>=distanceFt(p[1],p[2])?0:1;
      d={...d,network:insertFairwayPoint(d.network,key,i,[(p[i][0]+p[i+1][0])/2,(p[i][1]+p[i+1][1])/2],uid())};
    }
  }
  return d;
}
export function nearbyFairway(d:FairwayDraft,source:string,id:string,radius=FAIRWAY_SNAP_FT) {
  const p=pointFor(d,id),sourceNodes=d.network.routes[source].nodes;
  const geometry=createFairwayGeometry(d);
  let best:{key:string;edge:number;point:LatLng;node?:string;distance:number}|null=null;
  for(const [key,r] of Object.entries(d.network.routes)){
    if(key===source||r.nodes.includes(id))continue;
    for(let edge=0;edge<r.nodes.length-1;edge++){
      if(sourceNodes.includes(r.nodes[edge])&&sourceNodes.includes(r.nodes[edge+1]))continue;
      const curve=geometry.edge(r.nodes[edge],r.nodes[edge+1]);
      const hit=nearestFairwaySegment(curve,p);
      if(hit.distance>radius || (best&&hit.distance>=best.distance))continue;
      // Never snap a bend onto a tee/basket or collapse a very short end segment.
      if([r.nodes[0],r.nodes.at(-1)!,sourceNodes[0],sourceNodes.at(-1)!].some(n=>distanceFt(pointFor(d,n),hit.point)<3))continue;
      const node=r.nodes.find(n=>d.network.points[n]&&!sourceNodes.includes(n)&&distanceFt(pointFor(d,n),hit.point)<radius && distanceFt(pointFor(d,n),p)<=radius);
      best={key,edge,point:node?pointFor(d,node):hit.point,node,distance:hit.distance};
    }
  }
  return best;
}
export function snapFairwayBend(d:FairwayDraft,source:string,id:string,uid:()=>string,radius=FAIRWAY_SNAP_FT):FairwayDraft {
  const hit=nearbyFairway(d,source,id,radius);
  if(!hit)return d;
  if(hit.node)return {...d,network:joinFairwayPoint(d.network,source,id,hit.node)};
  const node=uid();
  const network=insertFairwayPoint(d.network,hit.key,hit.edge,hit.point,node);
  return {...d,network:joinFairwayPoint(network,source,id,node)};
}


/** Closest points on two short projected segments, including true crossings. */
function closestSegments(a:LatLng,b:LatLng,c:LatLng,e:LatLng) {
  const cross=(x:LatLng,y:LatLng)=>x[0]*y[1]-x[1]*y[0];
  const r:LatLng=[b[0]-a[0],b[1]-a[1]],v:LatLng=[e[0]-c[0],e[1]-c[1]],q:LatLng=[c[0]-a[0],c[1]-a[1]];
  const det=cross(r,v),t=cross(q,v)/det,u=cross(q,r)/det;
  if(Math.abs(det)>1e-18&&t>=0&&t<=1&&u>=0&&u<=1){const p:LatLng=[a[0]+r[0]*t,a[1]+r[1]*t];return {a:p,b:p,distance:0};}
  const candidates=[...([a,b].map(p=>{const h=nearestFairwaySegment([c,e],p);return {a:p,b:h.point,distance:h.distance};})),...([c,e].map(p=>{const h=nearestFairwaySegment([a,b],p);return {a:h.point,b:p,distance:h.distance};}))];
  return candidates.sort((x,y)=>x.distance-y.distance)[0];
}
/** User-approved automatic joining for new/default routes only. Saved splits
 * are not candidates on reload. One junction per route pair avoids tiny loops. */
export function connectNewFairways(draft:FairwayDraft,newKeys:Set<string>):FairwayDraft {
  if(!newKeys.size) return draft;
  let d=draft,n=0;
  let geometry=createFairwayGeometry(d);
  type Segment = {a:LatLng;b:LatLng;edge:number};
  const sampledRoutes=new Map<string,Segment[]>();
  const segments=(key:string)=>{
    let result=sampledRoutes.get(key);
    if(!result) {
      const nodes=d.network.routes[key].nodes;
      result=nodes.slice(1).flatMap((id,edge)=>{const p=geometry.edge(nodes[edge],id);return p.slice(1).map((q,k)=>({a:p[k],b:q,edge}));});
      sampledRoutes.set(key,result);
    }
    return result;
  };
  const uid=()=>{let id:string;do{id=`point:auto-join:${++n}`;}while(d.network.points[id]);return id;};
  const keys=Object.keys(d.network.routes).sort();
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const a=keys[i],b=keys[j];if(!newKeys.has(a)&&!newKeys.has(b))continue;
    const na=d.network.routes[a].nodes,nb=d.network.routes[b].nodes;
    if(na.some(id=>d.network.points[id]&&nb.includes(id)))continue;
    const ends=[na[0],na.at(-1)!,nb[0],nb.at(-1)!].map(id=>pointFor(d,id));
    let best:{a:LatLng;b:LatLng;distance:number;ea:number;eb:number}|null=null;
    const as=segments(a),bs=segments(b);
    for(const x of as)for(const y of bs){
      // Cheap bounding-box rejection before the exact closest-points test.
      const latMargin=FAIRWAY_SNAP_FT/364000,lngMargin=latMargin/Math.cos(x.a[0]*Math.PI/180);
      if(Math.max(x.a[0],x.b[0])+latMargin<Math.min(y.a[0],y.b[0])||Math.max(y.a[0],y.b[0])+latMargin<Math.min(x.a[0],x.b[0])||Math.max(x.a[1],x.b[1])+lngMargin<Math.min(y.a[1],y.b[1])||Math.max(y.a[1],y.b[1])+lngMargin<Math.min(x.a[1],x.b[1]))continue;
      const hit=closestSegments(x.a,x.b,y.a,y.b);
      if(hit.distance>FAIRWAY_SNAP_FT || (best&&hit.distance>=best.distance) || ends.some(p=>distanceFt(p,hit.a)<6||distanceFt(p,hit.b)<6))continue;
      best={...hit,ea:x.edge,eb:y.edge};
    }
    if(!best)continue;
    const p:LatLng=[(best.a[0]+best.b[0])/2,(best.a[1]+best.b[1])/2];
    const existing=(nodes:string[])=>nodes.find(id=>d.network.points[id]&&distanceFt(pointFor(d,id),p)<.1);
    const aid=existing(na)??uid(),bid=existing(nb)??uid();
    let network=d.network;
    if(!network.points[aid])network=insertFairwayPoint(network,a,best.ea,p,aid);
    if(!network.points[bid])network=insertFairwayPoint(network,b,best.eb,p,bid);
    network=joinFairwayPoint(network,b,bid,aid);
    if(!validateFairwayDraft({...d,network}).length) {
      d={...d,network};
      geometry=createFairwayGeometry(d);
      sampledRoutes.clear();
    }
  }
  return d;
}
