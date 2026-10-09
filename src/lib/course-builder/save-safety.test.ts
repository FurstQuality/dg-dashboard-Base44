import {describe, expect, it} from "vitest";
import {assertCompleteHoleSave, removedSavedPins} from "./save-safety";
const saved = Array.from({length:18}, (_,i) => ({id:`mapped-${i+1}`, number:i+1}));
describe("course save data-loss guards", () => {
  it("rejects 27 blank replacements for the original 18 mapped rows", () => {
    const blanks = Array.from({length:27},(_,i)=>({id:`blank-${i+1}`,number:i+1}));
    expect(()=>assertCompleteHoleSave(saved, blanks, new Set())).toThrow("Saved holes are missing");
  });
  it("compares identities even when both layouts have the same row count", () => {
    expect(()=>assertCompleteHoleSave(saved, saved.map(h=>({...h,id:`new-${h.id}`})),new Set())).toThrow();
  });
  it("accepts new holes without replacing existing rows, including retry with the same IDs", () => {
    const draft=[...saved,{id:"new-hole",number:19}];
    expect(()=>assertCompleteHoleSave(saved,draft,new Set())).not.toThrow();
    expect(()=>assertCompleteHoleSave(draft,draft,new Set())).not.toThrow();
  });
  it("only permits missing holes that were explicitly removed", () => {
    expect(()=>assertCompleteHoleSave(saved,saved.slice(1),new Set([saved[0].id]))).not.toThrow();
    expect(()=>assertCompleteHoleSave(saved,saved.slice(2),new Set([saved[0].id]))).toThrow();
  });
  it("blocks the interrupted negative-number state instead of renumbering it into 45 holes", () => {
    const interrupted=saved.map(h=>({...h,number:-1000000-h.number}));
    expect(()=>assertCompleteHoleSave(interrupted,saved,new Set())).toThrow("recovery");
  });
  it("rejects duplicate identities, duplicate numbers and missing identities", () => {
    for(const rows of [[saved[0],saved[0]], [{...saved[0],id:null}], [saved[0],{...saved[1],number:1}]]) {
      expect(()=>assertCompleteHoleSave([],rows,new Set())).toThrow();
    }
  });
  it("retains unknown/newer pins and only selects removed loaded IDs", () => {
    expect(removedSavedPins(new Set(["red","blue"]),new Set(["red","new-green"]))).toEqual(["blue"]);
  });
});
