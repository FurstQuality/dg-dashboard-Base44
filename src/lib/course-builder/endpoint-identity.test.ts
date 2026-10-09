import {describe, expect, it} from "vitest";
import {endpointRole, endpointName} from "./endpoint-identity";
import {teeInventory} from "./tee-inventory";
import {studioFairways, applyStudioFairways, type StudioHole} from "./studio-fairways";
describe("endpoint roles and identifying names", () => {
  it("keeps names and colors independent of main, alternate and drop-zone allocation", () => {
    const hole: StudioHole = {tee:[41,-87],basket:[41.001,-87],tee_name:"Elite",tee_color:"#2563eb",basket_name:"Short",flight_path:[],extra_tees:[{tempId:"alt",name:"Blues",color:"#2563eb",lat:41,lng:-87.001},{tempId:"dz",name:"Reds",color:"#ffffff",is_drop_zone:true,lat:41.0005,lng:-87}],extra_baskets:[{tempId:"other",name:"Elite",color:"#2563eb",lat:41.002,lng:-87}]};
    const draft = studioFairways(hole);
    const saved = applyStudioFairways(hole,draft);
    expect(Object.keys(draft.network.routes)).toHaveLength(6);
    expect(saved.tee_name).toBe("Elite");
    expect(saved.extra_tees.map(t=>[t.name,t.is_drop_zone])).toEqual([["Blues",undefined],["Reds",true]]);
    expect(endpointRole("tee","main-tee")).toBe("main");
    expect(endpointRole("tee","alt")).toBe("alternate");
    expect(endpointRole("tee","dz",true)).toBe("drop_zone");
    expect(endpointRole("basket","other")).toBe("alternate");
  });
  it("does not count a custom named Elite or Short tee as a Blue tee by color alone", () => {
    const rows=teeInventory([{tee:[41,-87],tee_name:"Elite",tee_color:"#2563eb",extra_tees:[{name:"Short",color:"#2563eb",lat:41,lng:-87},{name:"Blues",color:"#2563eb",lat:41,lng:-87}]}],[]);
    for(const name of ["Elite","Short","Blues"]) expect(rows.find(r=>r.name===name)?.mapped).toBe(1);
    expect(rows.find(r=>r.name==="Blue")?.mapped).toBe(0);
  });
  it("gives color-only endpoints a role label without dropping or confusing them", () => {
    expect(endpointName("tee","alt","",true)).toBe("Drop zone");
    expect(endpointName("tee","alt"," ")).toBe("Alternate tee");
    expect(endpointName("basket","other","")).toBe("Alternate basket");
    expect(endpointName("tee","alt","Tee 2")).toBe("Tee 2");
  });
});
