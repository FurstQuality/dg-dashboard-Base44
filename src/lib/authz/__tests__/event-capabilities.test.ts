import { describe, expect, it } from "vitest";
import { OWNER_ONLY_CAPABILITIES, STAFF_CAPABILITIES, isOwnerOnly } from "../event-capabilities";

describe("event capabilities", () => {
  it("owner-only and staff lists never overlap", () => {
    for (const c of STAFF_CAPABILITIES) expect(isOwnerOnly(c)).toBe(false);
    for (const c of OWNER_ONLY_CAPABILITIES) expect(isOwnerOnly(c)).toBe(true);
  });
});
