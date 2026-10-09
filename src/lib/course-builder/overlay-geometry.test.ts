import {describe,it,expect} from 'vitest';
import {overlayPoint,overlayUV,transformOverlay,reviewOverlayCandidates,type OverlayAnchors} from './overlay-geometry';
const anchors:OverlayAnchors=[[41.465,-87.046],[41.465,-87.042],[41.461,-87.046]];
describe('overlay georeferencing',()=>{
 it('maps corners and inverts transformed positions',()=>{for(const a of [anchors,transformOverlay(anchors,1.3,37)])for(const [x,y] of [[0,0],[1,0],[0,1],[.3,.7]]){const uv=overlayUV(a,overlayPoint(a,x,y));expect(uv![0]).toBeCloseTo(x,8);expect(uv![1]).toBeCloseTo(y,8);}});
 it('preserves the center when resizing or rotating',()=>{const a=overlayPoint(anchors,.5,.5),b=overlayPoint(transformOverlay(anchors,.5,70),.5,.5);expect(a[0]).toBeCloseTo(b[0],9);expect(a[1]).toBeCloseTo(b[1],9);});
 it('rejects collapsed alignment and flags outside-property/unknown-hole imports',()=>{expect(overlayUV([anchors[0],anchors[0],anchors[0]],anchors[0])).toBeNull();const c={id:'t',kind:'tee' as const,hole:99,name:'Blue',color:'#2563eb',x:.5,y:.5,selected:true};expect(reviewOverlayCandidates([c],anchors,[anchors[0],anchors[1],anchors[2]],[1])[0].error).toBe('Choose an existing hole');expect(reviewOverlayCandidates([{...c,hole:1,x:.95,y:.95}],anchors,[anchors[0],anchors[1],anchors[2]],[1])[0].error).toBe('Outside property');});
});
