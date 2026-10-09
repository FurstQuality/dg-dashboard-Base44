import { describe, expect, it } from "vitest";
import {
  isConfirmedPlayerName,
  makeAliasMatcher,
  normalizeAlias,
  parseAliases,
  shouldRejectAmbiguousPlayerNames,
} from "../player-aliases";

describe("parseAliases", () => {
  it("splits a typed list and drops duplicates", () => {
    expect(parseAliases("Michael Furst, furst, Furst , furst93")).toEqual([
      "Michael Furst",
      "furst",
      "furst93",
    ]);
  });

  it("accepts an array and ignores blanks", () => {
    expect(parseAliases(["", "  ", "236190"])).toEqual(["236190"]);
  });
});

describe("normalizeAlias", () => {
  it("strips case and punctuation", () => {
    expect(normalizeAlias("Furst_93")).toBe("furst 93");
  });
});

describe("makeAliasMatcher", () => {
  const isMe = makeAliasMatcher(["michael furst", "furst", "furst93", "236190"]);

  it("matches the spellings on a UDisc card", () => {
    for (const name of ["Michael Furst", "Furst", "furst93", "FURST 93", "Furst (236190)"]) {
      expect(isMe(name)).toBe(true);
    }
  });

  it("leaves other players out", () => {
    for (const name of ["Par", "Adam Hammes", "Ricky Wysocki", "Mikey T"]) {
      expect(isMe(name)).toBe(false);
    }
  });

  it("matches a last name inside a full name", () => {
    expect(makeAliasMatcher(["furst"])("Michael Furst")).toBe(true);
  });

  it("matches a PDGA number on its own", () => {
    expect(makeAliasMatcher(["236190"])("236190")).toBe(true);
    expect(makeAliasMatcher(["236190"])("236191")).toBe(false);
  });

  it("accepts everyone when no names are given", () => {
    expect(makeAliasMatcher([])("anybody")).toBe(true);
  });
});

describe("isConfirmedPlayerName", () => {
  it("accepts every exact CSV identity the player selected", () => {
    const confirmed = ["Michael Furst", "Furst", "furst93", "236190"];

    for (const name of confirmed) expect(isConfirmedPlayerName(confirmed, name)).toBe(true);
  });

  it("does not turn a confirmed short name into a loose match", () => {
    expect(isConfirmedPlayerName(["Furst"], "Amanda Furst")).toBe(false);
  });
});

describe("shouldRejectAmbiguousPlayerNames", () => {
  it("allows several exact identities explicitly confirmed by the player", () => {
    expect(
      shouldRejectAmbiguousPlayerNames(
        ["Michael Furst", "Furst", "furst93", "236190"],
        ["Michael Furst", "Furst", "furst93", "236190"],
      ),
    ).toBe(false);
  });

  it("continues blocking multiple loose matches without confirmation", () => {
    expect(shouldRejectAmbiguousPlayerNames(["Chris", "Christina"], [])).toBe(true);
  });
});
