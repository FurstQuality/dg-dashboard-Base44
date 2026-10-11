import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectDirectCalendar } from "../calendar-popup";
const origin = "https://dashboard.example";
let popup: { closed: boolean; location: { href: string }; close: ReturnType<typeof vi.fn> };
let windowMock: EventTarget & { location: { origin: string }; open: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  popup = { closed: false, location: { href: "about:blank" }, close: vi.fn(() => { popup.closed = true; }) };
  windowMock = Object.assign(new EventTarget(), { location: { origin }, open: vi.fn(() => popup) });
  vi.stubGlobal("window", windowMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function deliver(source: unknown, messageOrigin: string, state = "test-state") {
  windowMock.dispatchEvent(Object.assign(new Event("message"), { source, origin: messageOrigin, data: { type: "dgd-google-calendar", code: "test-code", state } }));
}
const start = async () => ({ authorizationUrl: "https://accounts.google.com/oauth", state: "test-state", provider: "google" as const });
describe("calendar popup", () => {
  it("ignores wrong origins, windows and state, then exchanges only a verified callback", async () => {
    const complete = vi.fn().mockResolvedValue({ ok: true });
    const pending = connectDirectCalendar(start, complete); await Promise.resolve();
    deliver(popup, "https://other.example"); deliver({}, origin); deliver(popup, origin, "other-state");
    expect(complete).not.toHaveBeenCalled(); deliver(popup, origin); await pending;
    expect(complete).toHaveBeenCalledExactlyOnceWith({ code: "test-code", state: "test-state" }); expect(popup.close).toHaveBeenCalled();
  });
  it("opens the window synchronously before authorization starts", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof start>>) => void;
    const pending = connectDirectCalendar(() => new Promise(r => { resolve = r; }), async () => {});
    expect(windowMock.open).toHaveBeenCalled(); resolve(await start()); await Promise.resolve(); deliver(popup, origin); await pending;
  });
  it("fails promptly when popups are blocked", async () => {
    windowMock.open.mockReturnValue(null); const begin = vi.fn(start);
    await expect(connectDirectCalendar(begin, async () => {})).rejects.toThrow("Allow popups"); expect(begin).not.toHaveBeenCalled();
  });
  it("cleans up after cancellation and ignores later callbacks", async () => {
    const complete = vi.fn(); const pending = connectDirectCalendar(start, complete); const check = expect(pending).rejects.toThrow("cancelled");
    await Promise.resolve(); popup.closed = true; await vi.advanceTimersByTimeAsync(500); await check;
    deliver(popup, origin); expect(complete).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("closes an expired popup and removes its message listener", async () => {
    const complete = vi.fn(); const pending = connectDirectCalendar(start, complete); const check = expect(pending).rejects.toThrow("expired");
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(10 * 60_000); await check;
    deliver(popup, origin); expect(complete).not.toHaveBeenCalled(); expect(popup.close).toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
});
