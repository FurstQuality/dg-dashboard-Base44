import { afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ create: vi.fn(), handle: vi.fn() }));
vi.mock("@lovable.dev/email-js", () => ({ createAuthEmailHandler: sdk.create }));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

async function post(request: Request) {
  const { Route } = await import("../../routes/lovable/email/auth/webhook");
  const route = Route as unknown as { server: { handlers: { POST: (ctx: { request: Request }) => Response | Promise<Response> } } };
  return route.server.handlers.POST({ request });
}

describe("optional auth email integration", () => {
  it("allows route loading without an email key and returns unavailable for webhook requests", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    const response = await post(new Request("http://localhost/lovable/email/auth/webhook", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("delegates configured requests to the SDK without replacing its verification", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-key");
    const response = new Response("Unauthorized", { status: 401 });
    sdk.handle.mockResolvedValue(response);
    sdk.create.mockReturnValue(sdk.handle);
    const request = new Request("http://localhost/lovable/email/auth/webhook", { method: "POST" });
    expect(await post(request)).toBe(response);
    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "test-key" }));
    expect(sdk.handle).toHaveBeenCalledWith(request);
  });
});
