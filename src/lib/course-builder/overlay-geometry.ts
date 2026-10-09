import {distanceFt,pointInPolygon,type LatLng} from './geometry';
export type OverlayCandidate={id:string;kind:'tee'|'basket';hole:number;name:string;color:string;x:number;y:number;selected:boolean};
export type OverlayAnchors=[LatLng,LatLng,LatLng];
export function project(p:LatLng):LatLng {return [p[1]*Math.PI/180,Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,p[0]))*Math.PI/360))];}
export function unproject(p:LatLng):LatLng{return [(2*Math.atan(Math.exp(p[1]))-Math.PI/2)*180/Math.PI,p[0]*180/Math.PI];}
export function overlayPoint(anchors:OverlayAnchors,x:number,y:number):LatLng{
 const [a,b,c]=anchors.map(project);return unproject([a[0]+x*(b[0]-a[0])+y*(c[0]-a[0]),a[1]+x*(b[1]-a[1])+y*(c[1]-a[1])]);
}
export function overlayUV(anchors:OverlayAnchors,p:LatLng):[number,number]|null{
 const [a,b,c]=anchors.map(project),q=project(p),u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-a[0],c[1]-a[1]],d=u[0]*v[1]-u[1]*v[0];
 if(Math.abs(d)<1e-14)return null;
 return [((q[0]-a[0])*v[1]-(q[1]-a[1])*v[0])/d,(u[0]*(q[1]-a[1])-u[1]*(q[0]-a[0]))/d];
}
export function transformOverlay(anchors:OverlayAnchors,scale:number,degrees:number):OverlayAnchors{
 const center=project(overlayPoint(anchors,.5,.5)),r=degrees*Math.PI/180;
 return anchors.map(p=>{const q=project(p),x=(q[0]-center[0])*scale,y=(q[1]-center[1])*scale;return unproject([center[0]+x*Math.cos(r)-y*Math.sin(r),center[1]+x*Math.sin(r)+y*Math.cos(r)]);}) as OverlayAnchors;
}
export function reviewOverlayCandidates(candidates:OverlayCandidate[],anchors:OverlayAnchors,boundary:LatLng[],holes:number[]){
 return candidates.filter(c=>c.selected).map(c=>{const point=overlayPoint(anchors,c.x,c.y);return {...c,point,error:!Number.isFinite(c.x)||!Number.isFinite(c.y)||c.x<0||c.x>1||c.y<0||c.y>1?'Outside image':!holes.includes(c.hole)?'Choose an existing hole':!pointInPolygon(point,boundary)?'Outside property':null};});
}
export function sameOverlaySpot(a:LatLng,b:LatLng){return distanceFt(a,b)<3;}
