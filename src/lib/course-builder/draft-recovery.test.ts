import {describe,it,expect} from "vitest";
import {draftBelongsToLayout,assertSafeDraftRestore,checkpointDraft,layoutDraftKey} from "./draft-recovery";
import {assertExplicitPinRemoval} from "./save-safety";
const holes=[{id:"hole-1",number:1,extra_tees:[{tempId:"red"}],extra_baskets:[{tempId:"blue"}]}];
describe("layout recovery safety",()=>{
 it("does not match equal hole numbers from different layouts",()=>{expect(draftBelongsToLayout({holes:[{...holes[0],id:"other-hole"}],at:1},"layout",holes)).toBe(false);expect(draftBelongsToLayout({holes,at:1,layoutId:"other"},"layout",holes)).toBe(false);expect(layoutDraftKey("course","a")).not.toBe(layoutDraftKey("course","b"));});
 it("recovers a legacy draft only by saved hole identities",()=>{expect(draftBelongsToLayout({holes,at:1},"layout",holes)).toBe(true);expect(()=>assertSafeDraftRestore({holes,at:1},"layout",holes)).not.toThrow();});
 it("rejects an older draft that would remove tees, baskets, or holes",()=>{for(const draft of [[],[{...holes[0],extra_tees:[]}],[{...holes[0],extra_baskets:[]}]])expect(()=>assertSafeDraftRestore({holes:draft,at:1,layoutId:"layout"},"layout",holes)).toThrow();});
 it("allows recovering additional lost pins without erasing currently loaded pins",()=>{expect(()=>assertSafeDraftRestore({holes:[{...holes[0],extra_tees:[...holes[0].extra_tees,{tempId:"elite"}]}],at:1,layoutId:"layout"},"layout",holes)).not.toThrow();});
 it("keeps immutable first checkpoint and distinct recent history",()=>{const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v)}};checkpointDraft(storage,"key",{holes,at:1});checkpointDraft(storage,"key",{holes:[],at:2});expect(JSON.parse(values.get("key:first-checkpoint")!).holes).toEqual(holes);expect(JSON.parse(values.get("key:history")!)).toHaveLength(2);});
 it("blocks unexplained pin omissions but allows deliberate removal",()=>{expect(()=>assertExplicitPinRemoval(new Set(["red"]),new Set(),new Set())).toThrow("explicit removal");expect(()=>assertExplicitPinRemoval(new Set(["red"]),new Set(),new Set(["red"]))).not.toThrow();});
});
