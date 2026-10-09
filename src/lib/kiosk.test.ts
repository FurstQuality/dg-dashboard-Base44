import { describe, expect, it } from "vitest";
import {
  createPinSalt,
  hashPin,
  isPaidMethod,
  isValidPin,
  normalizeLookupTerm,
  verifyPin,
} from "./kiosk";

describe("kiosk PIN handling", () => {
  it("accepts only 4-digit PINs", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin(" 4321 ")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });

  it("hashes with a salt and verifies round-trip", async () => {
    const salt = createPinSalt();
    const hash = await hashPin("1357", salt);
    expect(hash).not.toContain("1357");
    expect(await verifyPin("1357", salt, hash)).toBe(true);
    expect(await verifyPin("1358", salt, hash)).toBe(false);
  });

  it("produces different hashes for different salts", async () => {
    const a = await hashPin("0000", createPinSalt());
    const b = await hashPin("0000", createPinSalt());
    expect(a).not.toBe(b);
  });
});

describe("kiosk helpers", () => {
  it("treats settle-later as unpaid", () => {
    expect(isPaidMethod("cash")).toBe(true);
    expect(isPaidMethod("card")).toBe(true);
    expect(isPaidMethod("online")).toBe(true);
    expect(isPaidMethod("owed")).toBe(false);
  });

  it("normalizes lookup terms without mangling emails", () => {
    expect(normalizeLookupTerm("  Casey   Jones ")).toBe("Casey Jones");
    expect(normalizeLookupTerm("  Player@Example.COM ")).toBe("player@example.com");
  });
});
