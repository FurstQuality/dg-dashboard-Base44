/** Release events must reach Leaflet's document listeners so dragging ends. */
export function stopMapItemPropagation(event?: Event) {
  if (!event || ["mouseup", "touchend", "pointerup", "pointercancel", "touchcancel"].includes(event.type)) return;
  event.stopPropagation();
}
