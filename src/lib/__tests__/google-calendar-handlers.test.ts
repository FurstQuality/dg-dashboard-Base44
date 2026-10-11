import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ request: vi.fn(), archive: vi.fn(), observe: vi.fn(), rows: [] as any[], origin: "https://dashboard.example" }));
vi.mock("../google-calendar.server", () => ({ directCalendarRequest: mock.request }));
vi.mock("../data-intel/snapshots.server", () => ({ recordSnapshot: mock.archive, recordObservation: mock.observe }));
vi.mock("../app-user-connections.server", () => ({ getConnectionKeyForUser: async () => "encrypted-test-credential" }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request(mock.origin, { headers: { origin: mock.origin } }) }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { let validate = (value: unknown) => value; return { middleware() { return this; }, validator(fn: typeof validate) { validate = fn; return this; }, handler(fn: (input: unknown) => unknown) { return (input: any) => fn({ ...input, data: validate(input.data) }); } }; } }));
import { syncGoogleCalendarPull, pushEventToGoogle, startGoogleCalendarConnect } from "../calendar-sync.functions";
const userId = "00000000-0000-4000-8000-000000000001";
function database() {
  return { from() {
    let mode = "read", value: any, filters: Record<string, unknown> = {};
    const execute = () => {
      const row = mock.rows.find(r => Object.entries(filters).every(([key, expected]) => r[key] === expected));
      if (mode === "insert") { const added = { id: "00000000-0000-4000-8000-000000000002", ...value }; mock.rows.push(added); return { data: added, error: null }; }
      if (mode === "update" && row) Object.assign(row, value);
      return { data: row ?? null, error: null };
    };
    const query: any = { select() { return this; }, eq(key: string, expected: unknown) { filters[key] = expected; return this; }, update(data: unknown) { mode = "update"; value = data; return this; }, insert(data: unknown) { mode = "insert"; value = data; return this; }, maybeSingle: async () => execute(), single: async () => execute(), then(resolve: any) { return Promise.resolve(execute()).then(resolve); } };
    return query;
  } };
}
beforeEach(() => { mock.request.mockReset(); mock.archive.mockReset().mockResolvedValue("snapshot"); mock.observe.mockReset(); mock.rows = []; vi.stubEnv("GOOGLE_CLIENT_ID", "direct-client"); });
afterEach(() => vi.unstubAllEnvs());
const pull = (context: any) => (syncGoogleCalendarPull as any)({ data: undefined, context });
describe("calendar sync handlers", () => {
  it("imports subsequent pages, stores provenance and preserves a registered event's status", async () => {
    mock.rows.push({ id: "existing", user_id: userId, google_event_id: "event-1", status: "registered" });
    mock.request.mockResolvedValueOnce(Response.json({ items: [{ id: "event-1", summary: "League night", start: { date: "2026-10-10" }, end: { date: "2026-10-11" } }], nextPageToken: "page-2" })).mockResolvedValueOnce(Response.json({ items: [{ id: "event-2", summary: "Tournament", start: { date: "2026-10-12" }, end: { date: "2026-10-15" } }, { id: "cancelled", status: "cancelled" }] }));
    expect(await pull({ supabase: database(), userId })).toEqual({ imported: 2 });
    expect(mock.request.mock.calls[1][1]).toContain("pageToken=page-2"); expect(mock.archive).toHaveBeenCalledTimes(2);
    expect(mock.rows[0]).toMatchObject({ status: "registered", starts_on: "2026-10-10", ends_on: "2026-10-10" });
    expect(mock.rows[1]).toMatchObject({ starts_on: "2026-10-12", ends_on: "2026-10-14" });
    expect(mock.observe).toHaveBeenCalledWith(expect.objectContaining({ entityId: "existing", field: "title", source: "google_calendar", snapshotId: "snapshot" }));
  });
  it("fails before any schedule writes if a later page cannot be archived", async () => {
    mock.request.mockResolvedValueOnce(Response.json({ items: [{ id: "event", start: { date: "2026-10-10" } }], nextPageToken: "page-2" })).mockResolvedValueOnce(Response.json({ items: [] }));
    mock.archive.mockResolvedValueOnce("snapshot").mockResolvedValueOnce(null);
    await expect(pull({ supabase: database(), userId })).rejects.toThrow("archived"); expect(mock.rows).toHaveLength(0);
  });
  it("only pushes the caller's event and gives a timed event a positive duration", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    mock.rows.push({ id, user_id: "other-user", starts_on: "2026-10-10" });
    await expect((pushEventToGoogle as any)({ data: { id }, context: { supabase: database(), userId } })).rejects.toThrow("not found"); expect(mock.request).not.toHaveBeenCalled();
    mock.rows[0] = { id, user_id: userId, title: "League night", starts_on: "2026-10-10", starts_at: "2026-10-10T18:00:00Z", all_day: false, google_event_id: null };
    mock.request.mockResolvedValueOnce(Response.json({ id: "google-created" }));
    await (pushEventToGoogle as any)({ data: { id }, context: { supabase: database(), userId } });
    const body = JSON.parse(mock.request.mock.calls[0][2].body);
    expect(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime)).toBe(3600_000); expect(mock.rows[0].google_event_id).toBe("google-created");
  });
  it("rejects a client-provided foreign popup origin", async () => {
    await expect((startGoogleCalendarConnect as any)({ data: "https://other.example", context: { userId } })).rejects.toThrow("must start from this app");
  });
  it("recovers a previous export by stable ID instead of creating a duplicate", async () => {
    const id = "00000000-0000-4000-8000-000000000002", exported = `dgd${id.replaceAll("-", "")}`;
    mock.rows.push({ id, user_id: userId, title: "League night", starts_on: "2026-10-10", all_day: true, google_event_id: null });
    mock.request.mockResolvedValueOnce(new Response("", { status: 409 })).mockResolvedValueOnce(Response.json({ id: exported, extendedProperties: { private: { dgd_event_id: id, dgd_user_id: userId } } })).mockResolvedValueOnce(Response.json({ id: exported }));
    expect(await (pushEventToGoogle as any)({ data: { id }, context: { supabase: database(), userId } })).toMatchObject({ ok: true, google_event_id: exported });
    const inserted = JSON.parse(mock.request.mock.calls[0][2].body);
    expect(inserted.id).toBe(exported); expect(mock.request.mock.calls[2][2].method).toBe("PATCH"); expect(mock.rows[0].google_event_id).toBe(exported);
  });
  it("does not overwrite a conflicting external event from another export", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    mock.rows.push({ id, user_id: userId, title: "League night", starts_on: "2026-10-10", all_day: true, google_event_id: null });
    mock.request.mockResolvedValueOnce(new Response("", { status: 409 })).mockResolvedValueOnce(Response.json({ id: "other-event", extendedProperties: { private: { dgd_event_id: "other" } } }));
    await expect((pushEventToGoogle as any)({ data: { id }, context: { supabase: database(), userId } })).rejects.toThrow("different export"); expect(mock.request).toHaveBeenCalledTimes(2); expect(mock.rows[0].google_event_id).toBe(null);
  });
  it("does not report an export without a Google event receipt as successful", async () => {
    const id = "00000000-0000-4000-8000-000000000002";
    mock.rows.push({ id, user_id: userId, title: "League night", starts_on: "2026-10-10", all_day: true, google_event_id: null });
    mock.request.mockResolvedValueOnce(Response.json({}));
    await expect((pushEventToGoogle as any)({ data: { id }, context: { supabase: database(), userId } })).rejects.toThrow("no event receipt"); expect(mock.rows[0].google_event_id).toBe(null);
  });
});
