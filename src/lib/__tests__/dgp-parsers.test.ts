import { describe, expect, it } from "vitest";
import {
  DGP_GROUP_CODES,
  dgpPageUrls,
  extractFrmTables,
  parseDistanceRange,
  parseFlightNumbers,
  parseGroupCode,
  parsePageUrl,
  parseSkillGroupPage,
  parseWeightRange,
  skillGroupCodeFor,
  splitBrandMold,
} from "@/lib/dgp-parsers";

describe("dgp group codes", () => {
  it("covers all 42 skill groups and 336 leaf pages", () => {
    expect(DGP_GROUP_CODES).toHaveLength(42);
    expect(dgpPageUrls()).toHaveLength(336);
  });

  it("maps a code to rating bands", () => {
    expect(parseGroupCode("d-5")).toEqual({
      udisc: { label: "150 – 199", min: 150, max: 199 },
      pdga: { label: "900 – 949", min: 900, max: 949 },
    });
    expect(parseGroupCode("h-9")).toBeNull();
  });

  it("reads class and style from a page url", () => {
    expect(parsePageUrl("https://discgolfprofessor.com/skill-group-a-1-mid-ranges-forehand/")).toEqual(
      { group_code: "a-1", disc_class: "midrange", throw_style: "forehand" },
    );
  });

  it("picks a group for a player's ratings", () => {
    expect(skillGroupCodeFor({ pdgaRating: 935, udiscRating: 210 })).toBe("e-5");
    expect(skillGroupCodeFor({ pdgaRating: null, udiscRating: null })).toBe("a-1");
    expect(skillGroupCodeFor({ pdgaRating: 1010, udiscRating: 320 })).toBe("g-6");
  });
});

describe("label parsers", () => {
  it("splits brand and mold", () => {
    expect(splitBrandMold("INNOVA CHAMPION DISCS-LEOPARD 3")).toEqual({
      brand: "Innova Champion Discs",
      mold: "Leopard 3",
    });
    expect(splitBrandMold("AXIOM DISCS-TIME-LAPSE")).toEqual({
      brand: "Axiom Discs",
      mold: "Time Lapse",
    });
  });

  it("parses weight and distance ranges", () => {
    expect(parseWeightRange("173G-175G")).toEqual([173, 175]);
    expect(parseWeightRange("180G+")).toEqual([180, null]);
    expect(parseDistanceRange("250FT-299FT")).toEqual([250, 299]);
    expect(parseDistanceRange("nothing")).toEqual([null, null]);
  });

  it("parses flight numbers", () => {
    expect(parseFlightNumbers("7/5/-2/1")).toEqual({ speed: 7, glide: 5, turn: -2, fade: 1 });
    expect(parseFlightNumbers("unknown")).toEqual({
      speed: null,
      glide: null,
      turn: null,
      fade: null,
    });
  });
});

const HTML = `<html><body><h5>FAIRWAY DRIVER BACKHAND HYZER LINE (SPEEDS 6-9.5)</h5>
<script>/*<![CDATA[*/
__FRMTABLES={"graphs":[
{"type":"pie","data":[["7.A What fairway driver do you throw on a backhand hyzer line? (Speeds 6-9.5)","Submissions"],["INNOVA CHAMPION DISCS-LEOPARD 3",3],["DISCRAFT-ATHENA",1]]},
{"type":"bar","data":[["7.B What weight is this disc?","Submissions",{"role":"style"}],["173G-175G",3,"#fe6672"]]},
{"type":"bar","data":[["7.C How far do you throw this disc?","Submissions"],["300FT-349FT",2]]},
{"type":"bar","data":[["7.D What are the flight numbers?","Submissions"],["7/5/-2/1",2]]}
]};
/*]]>*/</script></body></html>`;

describe("parseSkillGroupPage", () => {
  it("builds one profile with all four answer kinds", () => {
    const page = parseSkillGroupPage({
      url: "https://discgolfprofessor.com/skill-group-c-3-fairway-drivers-backhand/",
      html: HTML,
    });
    expect(page).not.toBeNull();
    expect(page!.group_code).toBe("c-3");
    expect(page!.profiles).toHaveLength(1);
    const profile = page!.profiles[0];
    expect(profile).toMatchObject({
      disc_class: "fairway_driver",
      throw_style: "backhand",
      shot_shape: "hyzer",
      speed_min: 6,
      speed_max: 9.5,
      submissions: 4,
    });
    expect(profile.answers.filter((a) => a.answer_kind === "disc")[0]).toMatchObject({
      brand: "Innova Champion Discs",
      mold: "Leopard 3",
      submissions: 3,
      rank: 1,
    });
    expect(profile.answers.find((a) => a.answer_kind === "distance")).toMatchObject({
      distance_min_ft: 300,
      distance_max_ft: 349,
    });
    expect(profile.answers.find((a) => a.answer_kind === "flight")).toMatchObject({
      speed: 7,
      fade: 1,
    });
  });

  it("returns null for pages with no embedded data block", () => {
    expect(extractFrmTables("<html></html>")).toBeNull();
    const page = parseSkillGroupPage({
      url: "https://discgolfprofessor.com/skill-group-c-3-putters-forehand/",
      html: "<html></html>",
    });
    expect(page?.profiles).toEqual([]);
  });
});
