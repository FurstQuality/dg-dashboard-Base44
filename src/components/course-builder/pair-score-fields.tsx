import { useEffect, useState } from "react";
import type { PairScoring } from "@/lib/course-builder/studio-fairways";

export function PairScoreFields({score,mappedDistance,label,onChange,main=false}: {
  score:PairScoring; mappedDistance:number; label:string; main?:boolean; onChange:(patch:Partial<PairScoring>)=>void;
}) {
  const [distance,setDistance]=useState(score.distanceOverride?.toString() ?? "");
  const [error,setError]=useState("");
  useEffect(()=>{setDistance(score.distanceOverride?.toString() ?? "");setError("");},[score.distanceOverride,label]);
  const commit=()=>{
    const value=distance.trim()==="" ? null : Number(distance);
    if(value!==null && (!Number.isInteger(value)||value<1||value>20000)){setError("Enter 1–20,000 feet, or clear to use the map.");return;}
    setError(""); if(value!==score.distanceOverride)onChange({distanceOverride:value});
  };
  return <div className="space-y-1">
    <div className="grid grid-cols-2 gap-2">
      <label className="text-xs">Par
        <select aria-label={`${label} par`} className="mt-1 block w-full rounded border bg-background p-2" value={score.par ?? ""} onChange={e=>onChange({par:e.target.value ? Number(e.target.value) : null})}>
          {!main && <option value="">Not set</option>}{[2,3,4,5,6,7].map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <label className="text-xs">Measured distance (ft)
        <input aria-label={`${label} measured distance`} type="number" min={1} max={20000} step={1} value={distance} placeholder={String(mappedDistance)} className="mt-1 block w-full rounded border bg-background p-2" onChange={e=>setDistance(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commit();}}}/>
      </label>
    </div>
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
      <span>Mapped fairway: {mappedDistance} ft · {score.distanceOverride==null ? "updates as you move points" : "measured distance is fixed"}</span>
      {score.distanceOverride!=null && <button type="button" className="shrink-0 text-primary underline" onClick={()=>{setDistance("");onChange({distanceOverride:null});}}>Use mapped distance</button>}
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
