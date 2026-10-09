import {describe, expect, it} from "vitest";
import {recordEdit, undoEdit, redoEdit, rebaseEditHistory, type EditHistory} from "./edit-history";
const history = (): EditHistory => ({past: [], future: [], last: null});
describe("explicit-save map edit history", () => {
  it("undoes a move immediately, without a debounce window", () => {
    const h = history(); recordEdit(h, "original basket"); recordEdit(h, "moved basket");
    expect(undoEdit(h)).toBe("original basket");
    expect(redoEdit(h)).toBe("moved basket");
  });
  it("keeps separate rapid edits and retains the entire editing session", () => {
    const h = history();
    for (let i = 0; i <= 150; i++) recordEdit(h, String(i));
    for (let i = 149; i >= 0; i--) expect(undoEdit(h)).toBe(String(i));
    expect(undoEdit(h)).toBeNull();
    for (let i = 1; i <= 150; i++) expect(redoEdit(h)).toBe(String(i));
  });
  it("starts a new branch after undo and ignores identical rerenders", () => {
    const h = history(); recordEdit(h, "A"); recordEdit(h, "B"); undoEdit(h);
    expect(recordEdit(h, "A")).toBe(false);
    expect(redoEdit(h)).toBe("B"); undoEdit(h); recordEdit(h, "C");
    expect(redoEdit(h)).toBeNull(); expect(undoEdit(h)).toBe("A");
  });
  it("applies saved identities to undo and redo without adding an edit", () => {
    const h = history(); recordEdit(h, "empty"); recordEdit(h, "temporary bench"); recordEdit(h, "temporary bench moved"); undoEdit(h);
    rebaseEditHistory(h, s => s.replace("temporary", "saved-id"));
    expect(redoEdit(h)).toBe("saved-id bench moved");
    expect(undoEdit(h)).toBe("saved-id bench"); expect(undoEdit(h)).toBe("empty");
  });
});
