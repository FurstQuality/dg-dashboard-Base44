import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestAceReply, type AceTurn } from "../ace-provider.server";
import { connectorReadiness } from "../admin-operations";
import { deliverTransactionalEmail } from "../email-templates/delivery.server";
import { sendTemplateEmail } from "../email-templates/send-email";
import { TEMPLATES } from "../email-templates/registry";

const legacy = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@lovable.dev/email-js", () => ({
  sendLovableEmail: legacy.send,
  EmailAPIError: class extends Error {
    code = "recipient_suppressed";
  },
}));

const turns: AceTurn[] = [{ role: "user", content: "What is a hyzer?" }];
const mail = {
  to: "player@example.com",
  subject: "Event invitation",
  html: "<p>Join us</p>",
  text: "Join us",
  label: "event-invite",
  idempotencyKey: "event-invite-123",
  replyTo: "director@example.com",
};
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  for (const key of [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "LOVABLE_API_KEY",
    "LOVABLE_SEND_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
  ])
    vi.stubEnv(key, "");
  request = vi.fn().mockRejectedValue(new Error("Unexpected network call"));
  vi.stubGlobal("fetch", request);
  legacy.send.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function resend() {
  vi.stubEnv("RESEND_API_KEY", "test-resend-secret");
  vi.stubEnv("EMAIL_FROM", "DG Dashboard <mail@example.com>");
}

describe("direct Ace provider", () => {
  it("uses direct OpenAI with server credentials, bounded output and storage disabled", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    vi.stubEnv("OPENAI_MODEL", "gpt-4.1-mini");
    request.mockResolvedValue(
      Response.json({ choices: [{ message: { content: " A hyzer curves. " } }] }),
    );
    await expect(requestAceReply(turns)).resolves.toBe("A hyzer curves.");
    expect(request).toHaveBeenCalledTimes(1);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-openai-secret");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      model: "gpt-4.1-mini",
      messages: turns,
      stream: false,
      store: false,
      max_completion_tokens: 1200,
    });
  });
  it("keeps legacy installations working only when no direct key is configured", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    request.mockResolvedValue(Response.json({ choices: [{ message: { content: "Answer" } }] }));
    await requestAceReply(turns);
    expect(request.mock.calls[0][0]).toBe("https://ai.gateway.lovable.dev/v1/chat/completions");
    expect(JSON.parse(request.mock.calls[0][1].body).model).toBe("google/gemini-2.5-flash");
  });
  it("fails before contacting a provider when no key exists", async () => {
    await expect(requestAceReply(turns)).rejects.toThrow("not configured");
    expect(request).not.toHaveBeenCalled();
  });
  it.each([400, 401, 402, 403, 429, 500])(
    "sanitizes HTTP %i and never fails over or retries",
    async (status) => {
      vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
      vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
      request.mockResolvedValue(new Response("private-conversation-and-token", { status }));
      const error = await requestAceReply(turns).catch((e: Error) => e);
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).not.toContain("private-conversation-and-token");
      expect(request).toHaveBeenCalledTimes(1);
      expect(request.mock.calls[0][0]).toContain("api.openai.com");
    },
  );
  it.each([
    new DOMException("private message", "TimeoutError"),
    new Error("secret network detail"),
  ])("sanitizes network failures", async (cause) => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
    request.mockRejectedValue(cause);
    const error = await requestAceReply(turns).catch((e: Error) => e);
    expect(String(error)).not.toContain(cause.message);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([null, "", {}, "x".repeat(20_001)])(
    "rejects unusable provider answers",
    async (content) => {
      vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
      request.mockResolvedValue(Response.json({ choices: [{ message: { content } }] }));
      await expect(requestAceReply(turns)).rejects.toThrow("usable answer");
    },
  );
  it("rejects oversized history before sending any player data", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-secret");
    await expect(requestAceReply([{ role: "user", content: "x".repeat(180_001) }])).rejects.toThrow(
      "too long",
    );
    expect(request).not.toHaveBeenCalled();
  });
});

describe("direct transactional email", () => {
  it("preserves the rendered message, recipient, reply-to and retry identity", async () => {
    resend();
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    request.mockResolvedValue(Response.json({ id: "email-123" }));
    await expect(deliverTransactionalEmail(mail)).resolves.toEqual({ sent: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(legacy.send).not.toHaveBeenCalled();
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers["Idempotency-Key"]).toBe(mail.idempotencyKey);
    expect(init.headers.Authorization).toBe("Bearer test-resend-secret");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      from: "DG Dashboard <mail@example.com>",
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      reply_to: mail.replyTo,
    });
  });
  it("never reuses the legacy sender or falls back if the direct sender is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "test-resend-secret");
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    await expect(deliverTransactionalEmail(mail)).rejects.toThrow("EMAIL_FROM");
    expect(request).not.toHaveBeenCalled();
    expect(legacy.send).not.toHaveBeenCalled();
  });
  it("preserves the explicitly configured legacy delivery until migration", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    legacy.send.mockResolvedValue({});
    await expect(deliverTransactionalEmail(mail)).resolves.toEqual({ sent: true });
    expect(request).not.toHaveBeenCalled();
    expect(legacy.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: mail.to, idempotency_key: mail.idempotencyKey }),
      expect.any(Object),
    );
  });
  it("retains suppressed-recipient behavior for existing installations", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-legacy-secret");
    const { EmailAPIError } = await import("@lovable.dev/email-js");
    const error = Object.assign(new Error("suppressed"), { code: "recipient_suppressed" });
    Object.setPrototypeOf(error, EmailAPIError.prototype);
    legacy.send.mockRejectedValue(error);
    await expect(deliverTransactionalEmail(mail)).resolves.toEqual({
      sent: false,
      reason: "recipient_suppressed",
    });
  });
  it.each([401, 403, 409, 429, 500])(
    "does not leak email contents or retry HTTP %i",
    async (status) => {
      resend();
      request.mockResolvedValue(new Response("recipient-and-private-email", { status }));
      const error = await deliverTransactionalEmail(mail).catch((e: Error) => e);
      expect(String(error)).toContain(`HTTP ${status}`);
      expect(String(error)).not.toContain("recipient-and-private-email");
      expect(request).toHaveBeenCalledTimes(1);
      expect(legacy.send).not.toHaveBeenCalled();
    },
  );
  it("does not report success or switch provider after an ambiguous timeout", async () => {
    resend();
    request.mockRejectedValue(new DOMException("private-detail", "TimeoutError"));
    await expect(deliverTransactionalEmail(mail)).rejects.toThrow("reuse the same send identifier");
    expect(request).toHaveBeenCalledTimes(1);
    expect(legacy.send).not.toHaveBeenCalled();
  });
  it("requires provider acceptance before reporting sent", async () => {
    resend();
    request.mockResolvedValue(Response.json({}));
    await expect(deliverTransactionalEmail(mail)).rejects.toThrow("did not confirm acceptance");
  });
  it("renders a real invitation and keeps fixed template recipients authoritative", async () => {
    resend();
    request.mockResolvedValue(Response.json({ id: "email-123" }));
    const template = TEMPLATES["event-invite"];
    const originalTo = template.to;
    template.to = "fixed@example.com";
    try {
      await sendTemplateEmail("event-invite", "ignored@example.com", {
        idempotencyKey: "invitation-123",
        replyTo: "director@example.com",
        templateData: {
          inviter_name: "Director",
          event_title: "Sunday League",
          rsvp_url: "https://example.com/invite/example",
        },
      });
      const sent = JSON.parse(request.mock.calls[0][1].body);
      expect(sent.to).toEqual(["fixed@example.com"]);
      expect(sent.html).toContain("Sunday League");
      expect(sent.text).toContain("Sunday League");
      expect(sent.reply_to).toBe("director@example.com");
      expect(request.mock.calls[0][1].headers["Idempotency-Key"]).toBe("invitation-123");
    } finally {
      template.to = originalTo;
    }
  });
  it.each(["", "x".repeat(257), "header\ninjection"])(
    "rejects unsafe retry identifiers without sending",
    async (idempotencyKey) => {
      resend();
      await expect(deliverTransactionalEmail({ ...mail, idempotencyKey })).rejects.toThrow(
        "idempotency key",
      );
      expect(request).not.toHaveBeenCalled();
    },
  );
});

describe("provider status in Admin", () => {
  it("reports the direct keys to configure on a fresh installation", () => {
    const status = connectorReadiness({});
    expect(status.find((s) => s.id === "ai")).toMatchObject({
      mode: "OpenAI · Direct",
      missing: ["OPENAI_API_KEY"],
      configured: false,
    });
    expect(status.find((s) => s.id === "email")).toMatchObject({
      mode: "Resend · Direct",
      missing: ["RESEND_API_KEY", "EMAIL_FROM"],
      configured: false,
    });
  });
  it("identifies the actual legacy provider instead of claiming direct connectivity", () => {
    const status = connectorReadiness({ LOVABLE_API_KEY: "test-legacy-secret" });
    expect(status.find((s) => s.id === "ai")).toMatchObject({
      mode: "Lovable gateway · Legacy",
      configured: true,
    });
    expect(status.find((s) => s.id === "email")).toMatchObject({
      mode: "Lovable gateway · Legacy",
      configured: true,
    });
    expect(JSON.stringify(status)).not.toContain("test-legacy-secret");
  });
  it("shows direct configuration gaps even when a legacy key exists", () => {
    const status = connectorReadiness({
      OPENAI_API_KEY: "test-openai-secret",
      RESEND_API_KEY: "test-resend-secret",
      LOVABLE_API_KEY: "test-legacy-secret",
    });
    expect(status.find((s) => s.id === "ai")).toMatchObject({
      mode: "OpenAI · Direct",
      configured: true,
    });
    expect(status.find((s) => s.id === "email")).toMatchObject({
      mode: "Resend · Direct",
      missing: ["EMAIL_FROM"],
      configured: false,
    });
    expect(JSON.stringify(status)).not.toMatch(/test-(openai|resend|legacy)-secret/);
  });
});
