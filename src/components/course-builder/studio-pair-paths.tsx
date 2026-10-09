import { Fragment, useMemo } from "react";
import { Polygon, Polyline, Tooltip, useMap } from "react-leaflet";
import { studioFairways, type StudioHole } from "@/lib/course-builder/studio-fairways";
import { fairwayEdges, pointFor } from "@/lib/course-builder/pairing-fairways";
import {createFairwayGeometry} from "@/lib/course-builder/fairway-curves";
import { fairwayPolygon } from "@/lib/course-builder/fairway";

export function StudioPairPaths({hole,active,pane}:{hole:StudioHole;active:boolean;pane:string}) {
  useMap();
  const data = useMemo(()=> {
    try { return {draft:studioFairways(hole),error:null}; }
    catch(error) { return {draft:null,error:(error as Error).message}; }
  },[hole]);
  if(!data.draft) return null; // Invalid stored paths must not be guessed or overwritten.
  const draft = data.draft;
  const geometry = createFairwayGeometry(draft);
  return <>{fairwayEdges(draft.network).map(edge=> {
    const points=geometry.edge(edge.a,edge.b);
    const colors=[...new Set(edge.routes.map(key=>draft.tees.find(t=>t.id===draft.network.routes[key].teeId)?.color ?? "#a855f7"))];
    return <Fragment key={`${edge.a}:${edge.b}`}><Polygon positions={fairwayPolygon(points,12,5)} pane={pane} interactive={false} pathOptions={{stroke:false,fillColor:"#e9e1cc",fillOpacity:1}} />{colors.map((color,index)=><Polyline key={color} positions={points} pathOptions={{color,weight:3,opacity:active ? .95 : .45,dashArray:`6 ${8*colors.length-6}`,dashOffset:String(index*8),lineCap:"round",lineJoin:"round"}}><Tooltip sticky>{edge.routes.length} fairway{edge.routes.length === 1 ? "" : "s"}</Tooltip></Polyline>)}</Fragment>;
  })}</>;
}
