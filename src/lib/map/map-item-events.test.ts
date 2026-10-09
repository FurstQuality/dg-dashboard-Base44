import { describe, expect, it } from "vitest";
import { stopMapItemPropagation } from "./map-item-events";

describe("map item event propagation", () => {
  it.each(["mouseup", "touchend", "pointerup", "pointercancel", "touchcancel"])("lets %s reach the drag release listener", type => {
    const event = new Event(type);
    stopMapItemPropagation(event);
    expect(event.cancelBubble).toBe(false);
  });
  it("keeps selection clicks from placing another map item", () => {
    const event = new Event("click");
    stopMapItemPropagation(event);
    expect(event.cancelBubble).toBe(true);
  });
});
