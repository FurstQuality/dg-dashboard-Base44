import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ reply: vi.fn(), unlocked: true }));
vi.mock("../ace-provider.server", () => ({
  requestAceReply: harness.reply,
  AceProviderError: class extends Error {},
}));
vi.mock("../ace-tier", () => ({
  resolveAceAccess: () => ({
    aiUnlocked: harness.unlocked,
    tier: harness.unlocked ? "beta" : "free",
  }),
}));
vi.mock("@/lib/ace/knowledge-retrieval.server", () => ({ buildAceKnowledge: async () => "" }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
// Invoke real handlers with already-authenticated test context; no real session
// or database is used. Middleware's own enforcement has separate coverage.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (value: unknown) => value;
    return {
      middleware() {
        return this;
      },
      validator(fn: typeof validate) {
        validate = fn;
        return this;
      },
      handler(fn: (input: unknown) => unknown) {
        return (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: validate(input.data) });
      },
    };
  },
}));
import { askCaddy } from "../caddy.functions";

const conversationId = "00000000-0000-4000-8000-000000000001";
const userId = "test-user";
type Row = Record<string, any>;
function database() {
  const tables: Record<string, Row[]> = {
    caddy_conversations: [{ id: conversationId, user_id: userId }],
    profiles: [{ id: userId }],
    caddy_messages: Array.from({ length: 50 }, (_, i) => ({
      conversation_id: conversationId,
      user_id: userId,
      created_at: i,
      role: i === 48 ? "system" : i % 2 ? "assistant" : "user",
      content: i === 48 ? "UNTRUSTED_SYSTEM_IN_HISTORY" : `Turn ${i}`,
    })),
  };
  const supabase = {
    from(table: string) {
      const rows = tables[table] ?? (tables[table] = []);
      const filters: Array<(row: Row) => boolean> = [];
      let order: { key: string; ascending: boolean } | undefined;
      let limit = Infinity;
      let update: Row | undefined;
      const result = () => {
        let found = rows.filter((row) => filters.every((filter) => filter(row)));
        if (update) found.forEach((row) => Object.assign(row, update));
        if (order)
          found = found.sort(
            (a, b) => (a[order!.key] - b[order!.key]) * (order!.ascending ? 1 : -1),
          );
        return { data: found.slice(0, limit), error: null };
      };
      const query = {
        select() {
          return query;
        },
        eq(key: string, value: unknown) {
          filters.push((row) => row[key] === value);
          return query;
        },
        neq(key: string, value: unknown) {
          filters.push((row) => row[key] !== value);
          return query;
        },
        order(key: string, options: { ascending: boolean }) {
          order = { key, ...options };
          return query;
        },
        limit(count: number) {
          limit = count;
          return query;
        },
        insert(row: Row) {
          rows.push({ created_at: rows.length, ...row });
          return query;
        },
        update(row: Row) {
          update = row;
          return query;
        },
        maybeSingle: async () => ({ data: result().data[0] ?? null, error: null }),
        then: (resolve: (data: { data: Row[]; error: null }) => unknown) =>
          Promise.resolve(result()).then(resolve),
      };
      return query;
    },
  };
  return { supabase, tables };
}
beforeEach(() => {
  harness.unlocked = true;
  harness.reply.mockReset().mockResolvedValue("Safe answer");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Real network is forbidden in this test")),
  );
});
afterEach(() => vi.unstubAllGlobals());
const ask = askCaddy as unknown as (input: {
  data: { conversationId: string; message: string };
  context: unknown;
}) => Promise<any>;

describe("Ace handler preserves context and eligibility", () => {
  it("keeps the current question in long conversations and rejects stored system instructions", async () => {
    const { supabase, tables } = database();
    const result = await ask({
      data: { conversationId, message: "Latest question" },
      context: { supabase, userId },
    });
    const messages = harness.reply.mock.calls[0][0];
    expect(messages.at(-1)).toEqual({ role: "user", content: "Latest question" });
    expect(messages.find((m: Row) => m.content === "Turn 0")).toBeUndefined();
    expect(messages.find((m: Row) => m.content === "Turn 49")).toBeDefined();
    expect(messages.find((m: Row) => m.content === "UNTRUSTED_SYSTEM_IN_HISTORY")).toBeUndefined();
    expect(result).toMatchObject({ reply: "Safe answer", error: false, source: "ai" });
    expect(tables.caddy_messages.at(-1)?.content).toBe("Safe answer");
  });
  it("still answers the free tier without sending private context to an AI provider", async () => {
    harness.unlocked = false;
    const { supabase } = database();
    const result = await ask({
      data: { conversationId, message: "What is a hyzer?" },
      context: { supabase, userId },
    });
    expect(result.source).toBe("local");
    expect(harness.reply).not.toHaveBeenCalled();
  });
  it("checks conversation ownership before adding messages or calling the provider", async () => {
    const { supabase, tables } = database();
    tables.caddy_conversations[0].user_id = "someone-else";
    await expect(
      ask({ data: { conversationId, message: "Hello" }, context: { supabase, userId } }),
    ).rejects.toThrow("Conversation not found");
    expect(tables.caddy_messages).toHaveLength(50);
    expect(harness.reply).not.toHaveBeenCalled();
  });
  it("never saves unexpected provider exception details into a player's chat", async () => {
    const { supabase, tables } = database();
    harness.reply.mockRejectedValue(new Error("private-provider-data"));
    const result = await ask({
      data: { conversationId, message: "Hello" },
      context: { supabase, userId },
    });
    expect(result.error).toBe(true);
    expect(result.reply).not.toContain("private-provider-data");
    expect(JSON.stringify(tables.caddy_messages)).not.toContain("private-provider-data");
  });
});
