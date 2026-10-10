import { aceProvider } from "./service-providers";

export type AceTurn = { role: "system" | "user" | "assistant"; content: string };

/** Only these safe, locally generated messages may reach the chat history. */
export class AceProviderError extends Error {}

/** Server only. Callers remain responsible for authentication and AI allowance. */
export async function requestAceReply(messages: AceTurn[]): Promise<string> {
  const provider = aceProvider(process.env);
  const key = process.env[provider.key]?.trim();
  if (!key)
    throw new AceProviderError("Ace AI is not configured. Ask an admin to configure OpenAI.");
  // The UI limits new questions, but stored history can be longer. Bound both
  // request and response sizes independently of the provider's account limits.
  if (
    !messages.length ||
    messages.length > 50 ||
    messages.some(
      (m) => !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string",
    ) ||
    messages.reduce((size, m) => size + m.content.length, 0) > 180_000
  ) {
    throw new AceProviderError("This conversation is too long. Start a new chat with Ace.");
  }
  try {
    const response = await fetch(provider.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: false,
        ...(provider.id === "openai"
          ? { store: false, max_completion_tokens: 1200 }
          : { max_tokens: 1200 }),
      }),
    });
    if (!response.ok) {
      // Never include the provider response body: it may echo private input.
      if (response.status === 429)
        throw new AceProviderError(
          "Ace is busy or its provider quota is reached. Try again later.",
        );
      if ([401, 402, 403].includes(response.status))
        throw new AceProviderError(
          "Ace's provider needs attention. Ask an admin to check its credentials and billing.",
        );
      throw new AceProviderError("Ace couldn't answer just now. Try again in a moment.");
    }
    const json = await response.json();
    const reply: unknown = json?.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim() || reply.length > 20_000)
      throw new AceProviderError(
        "Ace didn't return a usable answer. Try rephrasing your question.",
      );
    return reply.trim();
  } catch (error) {
    if (error instanceof AceProviderError) throw error;
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
      throw new AceProviderError("Ace took too long to answer. Try again in a moment.");
    throw new AceProviderError("Ace couldn't connect to its provider. Try again in a moment.");
  }
}
